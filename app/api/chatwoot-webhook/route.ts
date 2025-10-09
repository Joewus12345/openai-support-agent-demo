import { NextResponse } from "next/server";
import { parse } from "partial-json";
import type { ChatwootWebhookPayload, Conversation } from "@/types/chatwoot";
import prisma from "@/lib/prisma";
import {
  getNextAgent,
  setActiveConversation,
  type AgentAvailabilitySummary,
} from "@/lib/agentRotation";
import { sendBotMessage } from "@/lib/chatwootBot";
import redis from "@/lib/redis";
import { storeBotMessage } from "@/lib/storeBotMessage";
import handOff from "@/lib/handoff";
import {
  getConversation,
  getConversationMessages,
  getConversationLabels,
  setConversationLabels,
} from "@/lib/chatwoot";
import { CONVO_LABELS } from "@/lib/constants";
import { getProvider } from "@/lib/providers";
import { INBOX_MODE } from "@/config/inboxMode";
import { tools } from "@/lib/tools/tools";
import { toResponseMessage, type ResponseMessage } from "@/lib/utils/toResponseMessage";
import {
  enqueueRequest,
  updateRequest,
  updateQueuePositions,
  formatQueuePositionMessage,
  type QueuePositionUpdate,
} from "@/lib/handoffQueue";
import { handoffStrategy } from "@/config/handoffStrategy";
import { releaseAgent } from "@/lib/conversationResolution";
import { CHATWOOT_SYSTEM_PROMPT, MODEL } from "@/config/constants";
import {
  RELEVANCE_FOLLOW_UP_MESSAGE,
  RELEVANCE_REJECTION_MESSAGE,
} from "@/config/guardrailMessages";
import { getConversationKey } from "@/lib/getConversationKey";
import { getConversationHistory } from "@/lib/getConversationHistory";
import { getConversationSynopsis } from "@/lib/getConversationSynopsis";
import { getQuoteCandidates, type QuoteCandidate } from "@/lib/getQuoteCandidates";
import {
  runRelevanceGuardrail,
  runJailbreakGuardrail,
} from "@/lib/guardrails";
import {
  recordReleaseFailure,
  clearReleaseAttempts,
} from "@/lib/releaseAttempts";
import { notifyMessageIssue, notifyHandoffIssue } from "@/lib/friendlyErrors";
import { shouldQuoteInboundMessage } from "@/lib/quoteHeuristics";
import {
  estimateMessageTokens,
  TOKEN_THRESHOLD,
  type TiktokenModel,
} from "@/lib/utils/tokenCounter";

type HistoryTurn = { role: string; content: string };

const QUOTE_TRANSCRIPT_USER_LIMIT = 4;
const QUOTE_TRANSCRIPT_ASSISTANT_LIMIT = 2;
const MAX_DEVELOPER_QUOTE_LINES = 6;
const SYNOPSIS_HISTORY_LIMIT = 50;
const PROMPT_HISTORY_LIMIT = 20;

const BUSY_AGENT_MESSAGE =
  "All human agents are currently busy. Please wait for the next available agent.";
const OFFLINE_AGENT_MESSAGE =
  "No human agents are currently available. Please try again later.";

function getAgentUnavailableMessage(
  summary: AgentAvailabilitySummary
): string {
  if (summary.online > 0 || summary.busy > 0) {
    return BUSY_AGENT_MESSAGE;
  }
  return OFFLINE_AGENT_MESSAGE;
}

function extractResponseMessageText(message: any): string {
  if (!message) {
    return "";
  }
  const { content } = message as { content?: unknown };
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof (item as any)?.text === "string") return (item as any).text;
        return "";
      })
      .join(" ")
      .trim();
  }
  return "";
}

function formatQuoteTimestamp(date?: Date): string {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "unknown-date";
  }
  return date.toISOString().slice(0, 10);
}

function buildQuoteDeveloperPrompt(
  candidates: QuoteCandidate[]
): string | undefined {
  if (!Array.isArray(candidates) || !candidates.length) {
    return undefined;
  }
  const limited = candidates.slice(0, MAX_DEVELOPER_QUOTE_LINES);
  const lines = limited.map((entry) => {
    const snippet = entry.snippet.trim();
    const prefix = `${entry.sender}#${entry.messageId}`;
    const timestamp = formatQuoteTimestamp(entry.createdAt);
    return `${prefix} · ${timestamp} · ${snippet}`;
  });
  return `Quote candidates available for set_reply_reference (newest first):\n${lines.join("\n")}`;
}

function normalizeHistoryTurnFromMessage(message: any): HistoryTurn | undefined {
  if (!message) {
    return undefined;
  }

  const rawContent = (message as any)?.content;
  if (rawContent === undefined || rawContent === null) {
    return undefined;
  }

  const content =
    typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

  const senderRaw =
    (message as any)?.sender?.type ??
    (message as any)?.sender_type ??
    (message as any)?.sender?.role ??
    (message as any)?.sender_role ??
    (message as any)?.sender?.name ??
    (message as any)?.senderName ??
    undefined;

  const senderLower =
    typeof senderRaw === "string" ? senderRaw.toLowerCase() : undefined;
  const messageType = (message as any)?.message_type;

  let role: HistoryTurn["role"] = "user";
  if (senderLower && senderLower.includes("bot")) {
    role = "assistant";
  } else if (typeof messageType === "string") {
    role = messageType.toLowerCase() === "outgoing" ? "assistant" : "user";
  } else if (typeof messageType === "number") {
    role = messageType === 1 ? "assistant" : "user";
  }

  return { role, content };
}

function parseMessageId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractReferencedMessageId(message: any): number | undefined {
  const attributes = message?.content_attributes;
  if (!attributes || typeof attributes !== "object") {
    return undefined;
  }

  const candidateKeys = [
    "in_reply_to",
    "in_reply_to_id",
    "in_reply_to_message_id",
    "in_reply_to_source_id",
    "reply_to_id",
    "reply_to_message_id",
    "replied_to_message_id",
    "quoted_message",
    "quoted_message_id",
    "referenced_message_id",
    "reference_message_id",
  ];

  for (const key of candidateKeys) {
    const value = (attributes as Record<string, unknown>)[key];
    const direct = parseMessageId(value);
    if (direct !== undefined) {
      return direct;
    }
    if (value && typeof value === "object") {
      const nested =
        parseMessageId((value as Record<string, unknown>).id) ??
        parseMessageId((value as Record<string, unknown>).message_id) ??
        parseMessageId((value as Record<string, unknown>).messageId) ??
        parseMessageId((value as Record<string, unknown>).messageID);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  for (const value of Object.values(attributes as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      const nested =
        parseMessageId((value as Record<string, unknown>).id) ??
        parseMessageId((value as Record<string, unknown>).message_id) ??
        parseMessageId((value as Record<string, unknown>).messageId) ??
        parseMessageId((value as Record<string, unknown>).messageID);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
}

async function getReferencedHistoryTurn(
  conversationKey: string,
  messageId: number
): Promise<HistoryTurn | undefined> {
  if (!Number.isFinite(messageId)) {
    return undefined;
  }

  let stored:
    | { sender?: string | null; content?: unknown }
    | undefined;

  try {
    const redisClient = redis as unknown as {
      lrange?: (
        key: string,
        start: number,
        stop: number
      ) => Promise<string[] | null | undefined>;
    };
    if (typeof redisClient?.lrange === "function") {
      const entries = await redisClient.lrange(conversationKey, 0, -1);
      if (Array.isArray(entries)) {
        for (let i = entries.length - 1; i >= 0; i -= 1) {
          const entry = entries[i];
          if (!entry) {
            continue;
          }
          try {
            const parsed = JSON.parse(entry);
            if (Number(parsed?.messageId) === messageId) {
              stored = { sender: parsed?.sender, content: parsed?.content };
              break;
            }
          } catch {
            // ignore malformed entries
          }
        }
      }
    }
  } catch (err) {
    console.error("referenced message redis fetch error", err);
  }

  if (!stored) {
    try {
      const record = await prisma.conversationMessage.findUnique({
        where: { conversationKey_messageId: { conversationKey, messageId } },
      });
      if (record) {
        stored = { sender: record.sender, content: record.content };
      }
    } catch (err) {
      console.error("referenced message prisma fetch error", err);
    }
  }

  if (!stored?.content) {
    return undefined;
  }

  const role = stored.sender === "bot" ? "assistant" : "user";
  const content =
    typeof stored.content === "string"
      ? stored.content
      : JSON.stringify(stored.content);
  return { role, content };
}

export async function POST(request: Request) {
  try {
    const incoming = (await request.json()) as ChatwootWebhookPayload;
    if (incoming.event !== "message_created") {
      return NextResponse.json({ status: "ignored" });
    }
    const payload = "data" in incoming ? incoming.data : incoming;
    const message = (payload as any).message ?? payload;
    const conversationId =
      (message as any).conversation_id ??
      (message as any).conversation?.id ??
      (payload as any).id;
    const accountId =
      (message as any).account_id ??
      (message as any).account?.id ??
      (payload as any).account?.id;
    if (conversationId === undefined || accountId === undefined) {
      console.warn("chatwoot webhook missing ids", { accountId, conversationId });
      return NextResponse.json({ status: "ignored" });
    }
    const conversation: Conversation | undefined =
      (message as any)?.conversation ??
      (payload as any).conversation ??
      (incoming.event.startsWith("conversation_") ? (payload as any) : undefined);
    const inboxId =
      (message as any).inbox_id ?? conversation?.inbox_id;
    const conversationKey = getConversationKey(accountId, conversationId, inboxId);
    const content = message.content;
    const messageId = message.id;
    const sender =
      (message as any)?.sender?.type ??
      (message as any)?.sender_type ??
      (message as any)?.sender?.name ??
      "";

    const userInput =
      typeof content === "string"
        ? content
        : typeof content === "object"
          ? JSON.stringify(content)
          : String(content ?? "");
    const normalizedMessageId = parseMessageId(messageId);
    const referencedMessageId = extractReferencedMessageId(message);
    const normalizedReferencedReplyToId =
      typeof referencedMessageId === "number" &&
      Number.isFinite(referencedMessageId)
        ? referencedMessageId
        : undefined;
    const normalizedInboundReplyToId =
      typeof normalizedMessageId === "number" &&
      Number.isFinite(normalizedMessageId)
        ? normalizedMessageId
        : undefined;
    const normalizedDefaultReplyToId =
      normalizedReferencedReplyToId ?? normalizedInboundReplyToId;
    let referencedTurn: HistoryTurn | undefined;

    if (
      accountId !== undefined &&
      conversationId !== undefined &&
      typeof referencedMessageId === "number" &&
      referencedMessageId !== normalizedMessageId
    ) {
      referencedTurn = await getReferencedHistoryTurn(
        conversationKey,
        referencedMessageId
      );
      if (!referencedTurn) {
        try {
          const remoteMessagesResponse = await getConversationMessages(
            accountId,
            conversationId
          );
          const candidateLists = [
            (remoteMessagesResponse as any)?.payload,
            (remoteMessagesResponse as any)?.data,
            remoteMessagesResponse,
          ];
          let remoteMessages: any[] = [];
          for (const candidate of candidateLists) {
            if (Array.isArray(candidate)) {
              remoteMessages = candidate;
              break;
            }
          }
          const referencedMessage = remoteMessages.find((m: any) => {
            const id = parseMessageId(m?.id);
            const sourceId = parseMessageId((m as any)?.source_id);
            const idString =
              typeof (m as any)?.id === "string" ? (m as any).id.trim() : undefined;
            const sourceIdString =
              typeof (m as any)?.source_id === "string"
                ? (m as any).source_id.trim()
                : undefined;
            const referencedMessageIdString = String(referencedMessageId);
            return (
              (typeof id === "number" && id === referencedMessageId) ||
              (typeof sourceId === "number" && sourceId === referencedMessageId) ||
              (idString !== undefined && idString === referencedMessageIdString) ||
              (sourceIdString !== undefined &&
                sourceIdString === referencedMessageIdString)
            );
          });
          referencedTurn = normalizeHistoryTurnFromMessage(referencedMessage);
        } catch (err) {
          console.error("referenced message remote fetch error", err);
        }
      }
      if (!referencedTurn) {
        console.warn("referenced message not found", {
          accountId,
          conversationId,
          referencedMessageId,
        });
      }
    }

    const enrichedContent = referencedTurn
      ? `Customer referenced: "${referencedTurn.content}"\n\n${userInput}`
      : undefined;
    const storedContent = enrichedContent ?? userInput;

    if (
      messageId !== undefined &&
      conversationId !== undefined &&
      inboxId !== undefined &&
      content !== undefined
    ) {
      try {
        const createdAtRaw = (message as any)?.created_at;
        const createdAt = createdAtRaw
          ? new Date(
              typeof createdAtRaw === "number"
                ? createdAtRaw * 1000
                : createdAtRaw
            )
          : undefined;
        await prisma.conversationMessage.upsert({
          where: {
            conversationKey_messageId: {
              conversationKey,
              messageId,
            },
          },
          update: {},
          create: {
            messageId,
            conversationId,
            inboxId,
            conversationKey,
            sender,
            content: storedContent,
            createdAt,
          },
        });
        try {
            if (
              typeof (redis as any)?.exists === "function" &&
              typeof (redis as any)?.rpush === "function" &&
              typeof (redis as any)?.pipeline === "function"
            ) {
              const key = conversationKey;
              const keyExists = await redis.exists(key);
              if (!keyExists) {
                const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const recent = await prisma.conversationMessage.findMany({
                  where: {
                    conversationKey,
                    createdAt: { gte: since },
                  },
                  orderBy: { messageId: "asc" },
                });
                if (recent.length) {
                  const pipeline = redis.pipeline();
                  for (const m of recent) {
                    pipeline.rpush(key, JSON.stringify(m));
                  }
                  pipeline.expire(key, 86400);
                  await pipeline.exec();
                }
              } else {
                const pipeline = redis.pipeline();
                pipeline.rpush(
                  key,
                  JSON.stringify({
                    messageId,
                    conversationId,
                    inboxId,
                    conversationKey,
                    sender,
                    content: storedContent,
                    createdAt,
                  })
                );
                pipeline.expire(key, 86400);
                await pipeline.exec();
              }
            }
          } catch (err) {
            console.error("conversation redis log error", err);
          }
        } catch (err) {
          console.error("conversation message log error", err);
        }
      }
    if (
      message.message_type === 2 &&
      typeof content === "string" &&
      (content.startsWith("Conversation was marked resolved") ||
        content.startsWith("Conversation was marked as pending"))
    ) {
      console.info("resolution message", { messageId, conversationId, content });
      if (accountId === undefined || conversationId === undefined) {
        return NextResponse.json({ status: "ignored" });
      }
      let labels = Array.isArray((conversation as any)?.label_list)
        ? (conversation as any).label_list
        : undefined;
      if (!Array.isArray(labels)) {
        try {
          const current = await getConversationLabels(accountId, conversationId);
          labels = Array.isArray((current as any)?.payload)
            ? (current as any).payload
            : undefined;
        } catch (err) {
          console.error("resolution labels fetch error", err);
        }
      }
      const hasAssigned =
        Array.isArray(labels) && labels.includes(CONVO_LABELS.assigned);
      if (!hasAssigned) {
        console.info("resolution message skipping release", {
          conversationId,
          labels,
        });
        return NextResponse.json({ status: "handled" });
      }
      try {
        await releaseAgent(accountId, conversationId, conversation);
        clearReleaseAttempts(conversationId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Agent release failed";
        const { shouldRetry } = await recordReleaseFailure(
          conversationId,
          err
        );
        if (shouldRetry) {
          return NextResponse.json({ error: message }, { status: 500 });
        }
        return NextResponse.json(
          { status: "unreleased", error: message },
          { status: 200 }
        );
      }
      return NextResponse.json({ status: "handled" });
    }
    if (
      message?.message_type !== 0 &&
      message?.message_type !== "incoming"
    ) {
      return NextResponse.json({ status: "ignored" });
    }
    console.info("handoff", { accountId, conversationId, inboxId, content });
    if (
      accountId === undefined ||
      conversationId === undefined ||
      inboxId === undefined ||
      !content
    ) {
      console.error("chatwoot webhook missing ids", {
        accountId,
        conversationId,
        inboxId,
        hasContent: !!content,
      });
      return NextResponse.json({ status: "ignored" });
    }

    const mode = INBOX_MODE[inboxId] ?? "auto";

    const defaultReplyOverride =
      normalizedDefaultReplyToId !== undefined
        ? { inReplyTo: normalizedDefaultReplyToId }
        : undefined;

    const buildReplyOptions = (
      overrides?: { inReplyTo?: number | null; private?: boolean },
      preferredReplyToId: number | undefined = normalizedReferencedReplyToId
    ) => {
      const options: { private?: boolean; inReplyTo?: number } = {};

      const fallbackInReplyToId =
        typeof preferredReplyToId === "number" &&
        Number.isFinite(preferredReplyToId)
          ? preferredReplyToId
          : normalizedInboundReplyToId;

      const hasOverrides = overrides !== undefined;
      const hasPrivateProp =
        hasOverrides &&
        Object.prototype.hasOwnProperty.call(
          overrides as Record<string, unknown>,
          "private"
        );
      const privateOverride =
        hasPrivateProp && typeof overrides?.private === "boolean"
          ? overrides.private
          : undefined;
      options.private =
        privateOverride !== undefined ? privateOverride : mode !== "auto";

      const hasInReplyProp =
        hasOverrides &&
        Object.prototype.hasOwnProperty.call(
          overrides as Record<string, unknown>,
          "inReplyTo"
        );
      const overrideInReply = overrides?.inReplyTo;

      if (hasInReplyProp) {
        if (overrideInReply === null) {
          return options;
        }

        if (
          typeof overrideInReply === "number" &&
          Number.isFinite(overrideInReply)
        ) {
          options.inReplyTo = overrideInReply;
          return options;
        }

        if (
          overrideInReply === undefined &&
          fallbackInReplyToId !== undefined
        ) {
          options.inReplyTo = fallbackInReplyToId;
          return options;
        }
      }

      if (
        hasOverrides &&
        !hasInReplyProp &&
        fallbackInReplyToId !== undefined
      ) {
        options.inReplyTo = fallbackInReplyToId;
      } else if (!hasOverrides && fallbackInReplyToId !== undefined) {
        options.inReplyTo = fallbackInReplyToId;
      }

      return options;
    };

    const logAssistantResponse = async (
      response: unknown,
      fallbackContent: string
    ) => {
      const defaultInboxId =
        typeof inboxId === "number" && Number.isFinite(inboxId)
          ? inboxId
          : undefined;

      await storeBotMessage({
        accountId,
        conversationId,
        payload: response,
        fallbackContent,
        conversationKey: conversationKey ?? undefined,
        defaultInboxId,
      });
    };

    // Reuse conversation data from the payload when possible.
    // Only fetch from Chatwoot if we are missing critical fields like `status`.
    let status = conversation?.status;
    if (!status) {
      try {
        const convo = await getConversation(accountId, conversationId);
        status = convo?.status;
      } catch (err) {
        console.error("fetch conversation error", err);
        try {
          // Retry once more before falling back
          const retry = await getConversation(accountId, conversationId);
          status = retry?.status;
        } catch (retryErr) {
          console.error("retry fetch conversation error", retryErr);
          await notifyMessageIssue(
            accountId,
            conversationId,
            buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
          );
          return NextResponse.json(
            { status: "conversation_fetch_failed" },
            { status: 200 }
          );
        }
      }
    }

    if (status === "open") {
      return NextResponse.json({ status: "ignored" });
    }

    if (status !== "pending" && status !== "resolved") {
      return NextResponse.json({ status: "ignored" });
    }

    const existingRequest = await prisma.handoffRequest.findUnique({
      where: { conversationKey },
    });
    if (
      handoffStrategy.value === "confirm" &&
      existingRequest?.status === "awaiting_confirmation"
    ) {
      const confirmPattern = /\b(yes|y|sure|confirm|ok)\b/i;
      if (confirmPattern.test(content)) {
        try {
            const { agent } = await getNextAgent(accountId);
            if (agent) {
              const role =
                agent.role === "administrator" ? "administrator" : "agent";
              const success = await handOff(
                accountId,
                conversationId,
                agent.id,
                role
              );
              if (!success) {
                return NextResponse.json({ status: "handoff_failed" });
              }
              await setActiveConversation(agent.id, conversationId);
              console.info("handoff", "active set", agent.id);
            console.info("handoff", {
              step: "update-request",
              conversationId,
              agentId: agent.id,
            });
            try {
              await updateRequest(conversationKey, {
                status: "assigned",
                agentId: agent.id,
              });
              console.info("handoff", "request updated");
            } catch (err) {
              console.error("updateRequest error", err);
              try {
                await notifyHandoffIssue(
                  accountId,
                  conversationId,
                  buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
                );
              } catch (err2) {
                console.error("fallback notifyHandoffIssue error", err2);
              }
              return NextResponse.json({ status: "fallback" });
            }
            console.info("handoff", {
              step: "send-message",
              accountId,
              conversationId,
            });
            const botResponse = await sendBotMessage(
              accountId,
              conversationId,
              "A human agent will join shortly.",
              buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
            );
            await logAssistantResponse(
              botResponse,
              "A human agent will join shortly."
            );
            console.info("handoff", "message sent");
              let labels = [CONVO_LABELS.assigned];
              try {
                console.info("handoff", {
                  step: "get-labels",
                  accountId,
                  conversationId,
                });
                const current = await getConversationLabels(
                  accountId,
                  conversationId
                );
                console.info(
                  "handoff",
                  "labels fetched",
                  (current as any)?.payload
                );
                labels = Array.isArray((current as any)?.payload)
                  ? Array.from(
                      new Set(
                        [
                          ...(current as any).payload.filter(
                            (l: string) => l !== CONVO_LABELS.awaiting
                          ),
                          CONVO_LABELS.assigned,
                        ]
                      )
                    )
                  : [CONVO_LABELS.assigned];
              } catch (err) {
                console.error("handoff fetch labels error", err);
              }
              console.info("handoff", {
                step: "set-labels",
                accountId,
                conversationId,
              });
              try {
                await setConversationLabels(accountId, conversationId, labels);
                console.info("handoff", "labels set", labels);
              } catch (err) {
                console.error("handoff set labels error", err);
              }
              return NextResponse.json({ status: "handoff_confirmed" });
            }
          } catch (err) {
            console.error("handoff confirmation error", err);
          }
      } else {
        console.info("handoff", { step: "update-request", conversationId });
        try {
          await updateRequest(conversationKey, {
            status: "expired",
            agentId: null,
          });
          console.info("handoff", "request updated");
        } catch (err) {
          console.error("updateRequest error", err);
          try {
            await notifyHandoffIssue(
              accountId,
              conversationId,
              buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
            );
          } catch (err2) {
            console.error("fallback notifyHandoffIssue error", err2);
          }
          return NextResponse.json({ status: "fallback" });
        }
        let labels = [CONVO_LABELS.expired];
        try {
          console.info("handoff", { step: "get-labels", accountId, conversationId });
          const current = await getConversationLabels(accountId, conversationId);
          console.info(
            "handoff",
            "labels fetched",
            (current as any)?.payload
          );
          labels = Array.isArray((current as any)?.payload)
            ? Array.from(
                new Set(
                  [
                    ...(current as any).payload.filter(
                      (l: string) => l !== CONVO_LABELS.awaiting
                    ),
                    CONVO_LABELS.expired,
                  ]
                )
              )
            : [CONVO_LABELS.expired];
        } catch (err) {
          console.error("handoff fetch labels error", err);
        }
        console.info("handoff", { step: "set-labels", accountId, conversationId });
        try {
          await setConversationLabels(accountId, conversationId, labels);
          console.info("handoff", "labels set", labels);
        } catch (err) {
          console.error("handoff set labels error", err);
        }
      }
    }

    const triggerPattern = /\b(human|agent|representative)\b/i;
    if (triggerPattern.test(content)) {
      console.info("handoff", {
        step: "get-conversation",
        accountId,
        conversationId,
      });
      // Prefer conversation details from the webhook payload
      let currentConversation = conversation;
      if (!currentConversation || !currentConversation.id) {
        try {
          currentConversation = await getConversation(accountId, conversationId);
          console.info("handoff", "conversation fetched", currentConversation);
        } catch (err) {
          console.error("handoff", "conversation fetch error", err);
          await notifyMessageIssue(
            accountId,
            conversationId,
            buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
          );
          return NextResponse.json(
            { status: "conversation_fetch_failed" },
            { status: 200 }
          );
        }
      }
      if (!currentConversation) {
        console.error("handoff", "conversation not found");
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }

      try {
        const { agent, availabilitySummary } = await getNextAgent(accountId);
        if (agent) {
          console.info("handoff", {
            step: "enqueue",
            conversationId,
            agentId: agent.id,
          });
          try {
            if (typeof inboxId !== "number") {
              throw new Error("Missing inboxId for handoff request");
            }
            await enqueueRequest(
              accountId,
              conversationId,
              "assigned",
              agent.id,
              inboxId
            );
            console.info("handoff", "request enqueued", agent.id);
          } catch (err) {
            console.error("enqueueRequest error", err);
            try {
              await notifyHandoffIssue(
                accountId,
                conversationId,
                buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
              );
            } catch (err2) {
              console.error("fallback notifyHandoffIssue error", err2);
            }
            return NextResponse.json({ status: "fallback" });
          }
            const role =
              agent.role === "administrator" ? "administrator" : "agent";
            const success = await handOff(
              accountId,
              conversationId,
              agent.id,
              role
            );
            if (!success) {
              try {
                await updateRequest(conversationKey, {
                  status: "pending",
                  agentId: null,
                });
              } catch (err) {
                console.error("updateRequest error", err);
                try {
                  await notifyHandoffIssue(
                    accountId,
                    conversationId,
                    buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
                  );
                } catch (err2) {
                  console.error("fallback notifyHandoffIssue error", err2);
                }
                return NextResponse.json({ status: "fallback" });
              }
              return NextResponse.json({ status: "handoff_failed" });
            }
            await setActiveConversation(agent.id, conversationId);
            console.info("handoff", "active set", agent.id);
          console.info("handoff", {
            step: "send-message",
            accountId,
            conversationId,
          });
          const confirmationResponse = await sendBotMessage(
            accountId,
            conversationId,
            "A human agent will join shortly.",
            buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
          );
          await logAssistantResponse(
            confirmationResponse,
            "A human agent will join shortly."
          );
          console.info("handoff", "message sent");
            const labels = [CONVO_LABELS.assigned];
            console.info("handoff", {
              step: "set-labels",
              accountId,
              conversationId,
            });
            try {
              await setConversationLabels(accountId, conversationId, labels);
              console.info("handoff", "labels set", labels);
            } catch (err) {
              console.error("handoff set labels error", err);
            }
        } else {
          console.info("handoff", { step: "enqueue", conversationId });
          let queueUpdates: QueuePositionUpdate[] = [];
          try {
            if (typeof inboxId !== "number") {
              throw new Error("Missing inboxId for handoff request");
            }
            await enqueueRequest(
              accountId,
              conversationId,
              undefined,
              undefined,
              inboxId
            );
            console.info("handoff", "request enqueued");
          } catch (err) {
            console.error("enqueueRequest error", err);
            try {
              await notifyHandoffIssue(
                accountId,
                conversationId,
                buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
              );
            } catch (err2) {
              console.error("fallback notifyHandoffIssue error", err2);
            }
            return NextResponse.json({ status: "fallback" });
          }
          try {
            queueUpdates = await updateQueuePositions({ accountId });
          } catch (err) {
            console.error("updateQueuePositions error", err);
          }
            const labels = [CONVO_LABELS.waiting];
            console.info("handoff", {
              step: "set-labels",
              accountId,
              conversationId,
            });
            try {
              await setConversationLabels(accountId, conversationId, labels);
              console.info("handoff", "labels set", labels);
            } catch (err) {
              console.error("handoff set labels error", err);
            }
            console.info("handoff", {
              step: "send-message",
              accountId,
              conversationId,
            });
          const unavailableMessage = getAgentUnavailableMessage(availabilitySummary);
          let queueMessage = unavailableMessage;
          const pendingUpdate = queueUpdates.find(
            (update) => update.conversationId === conversationId
          );
          if (pendingUpdate) {
            queueMessage = formatQueuePositionMessage(
              unavailableMessage,
              pendingUpdate.position
            );
          }
          const botResponse = await sendBotMessage(
            accountId,
            conversationId,
            queueMessage,
            buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
          );
          await logAssistantResponse(botResponse, queueMessage);
          console.info("handoff", "message sent");
        }
      } catch (err) {
        console.error("agent escalation error", err);
      }
      return NextResponse.json({ status: "handoff" });
    }

    let fallbackSent = false;
    const sendFallback = async () => {
      if (fallbackSent) return;
      fallbackSent = true;
      try {
        await notifyMessageIssue(
          accountId,
          conversationId,
          buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
        );
      } catch (err) {
        console.error("fallback notifyMessageIssue error", err);
      }
    };

    let fullHistory: ResponseMessage[] = [];
    try {
      fullHistory = await getConversationHistory(
        conversationKey,
        SYNOPSIS_HISTORY_LIMIT
      );
    } catch (err) {
      console.error("conversation history error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
    }

    if (enrichedContent && Array.isArray(fullHistory)) {
      let updatedHistory = [...fullHistory];
      const hasEnrichedTurn = updatedHistory.some(
        (turn: any) =>
          turn?.role === "user" &&
          Array.isArray(turn?.content) &&
          turn.content.some((c: any) => c?.text === enrichedContent)
      );
      if (!hasEnrichedTurn) {
        let replaced = false;
        for (let i = updatedHistory.length - 1; i >= 0; i -= 1) {
          const turn = updatedHistory[i];
          if (
            turn?.role === "user" &&
            Array.isArray(turn?.content) &&
            turn.content.some((c: any) => c?.text === userInput)
          ) {
            updatedHistory[i] = toResponseMessage("user", enrichedContent);
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          updatedHistory = [
            ...updatedHistory,
            toResponseMessage("user", enrichedContent),
          ];
        }
      }
      fullHistory = updatedHistory as ResponseMessage[];
    }

    let promptHistory = Array.isArray(fullHistory)
      ? fullHistory.slice(-PROMPT_HISTORY_LIMIT)
      : [];

    try {
      const guardrailUserInput = enrichedContent ?? userInput;
      const baseHistoryTurns: HistoryTurn[] = promptHistory
        .filter((m: { role: string }) => m.role !== "developer")
        .map((m: { role: string; content: any[] }) => ({
          role: m.role,
          content: m.content.map((c: { text: any }) => c.text).join(" "),
        }));
      const historyTurns = referencedTurn
        ? [referencedTurn, ...baseHistoryTurns]
        : baseHistoryTurns;
      let recentTurns = historyTurns.slice(-6);
      if (
        referencedTurn &&
        !recentTurns.some(
          (turn) =>
            turn.role === referencedTurn.role &&
            turn.content === referencedTurn.content
        )
      ) {
        recentTurns =
          recentTurns.length >= 6
            ? [...recentTurns.slice(1), referencedTurn]
            : [...recentTurns, referencedTurn];
      }
      const relevanceInput = JSON.stringify([
        ...recentTurns,
        { role: "user", content: guardrailUserInput },
      ]);
      const relevance = await runRelevanceGuardrail({
        input: relevanceInput,
      });
      const jailbreak = await runJailbreakGuardrail({ input: guardrailUserInput });

      if (jailbreak.tripwireTriggered) {
        console.log("Guardrail triggered via Chatwoot: jailbreak", {
          guardrailUserInput,
          jailbreakOutput: jailbreak.outputInfo,
          relevanceOutput: relevance.outputInfo,
        });
        const guardrailResponse = await sendBotMessage(
          accountId,
          conversationId,
          RELEVANCE_REJECTION_MESSAGE,
          buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
        );
        await logAssistantResponse(guardrailResponse, RELEVANCE_REJECTION_MESSAGE);
        return NextResponse.json({ status: "guardrail" });
      }

      if (relevance.tripwireTriggered) {
        const lastAssistantMessage = Array.isArray(fullHistory)
          ? [...fullHistory].reverse().find((entry) => entry?.role === "assistant")
          : undefined;
        const previousAssistantText = extractResponseMessageText(
          lastAssistantMessage
        );
        const clarificationRequestedPreviously =
          previousAssistantText === RELEVANCE_FOLLOW_UP_MESSAGE;
        const outgoingMessage = clarificationRequestedPreviously
          ? RELEVANCE_REJECTION_MESSAGE
          : RELEVANCE_FOLLOW_UP_MESSAGE;
        console.log(
          clarificationRequestedPreviously
            ? "Guardrail rejection after clarification via Chatwoot"
            : "Guardrail follow-up requested via Chatwoot",
          {
            guardrailUserInput,
            relevanceOutput: relevance.outputInfo,
            conversationId,
          }
        );
        const guardrailResponse = await sendBotMessage(
          accountId,
          conversationId,
          outgoingMessage,
          buildReplyOptions(defaultReplyOverride, normalizedReferencedReplyToId)
        );
        await logAssistantResponse(guardrailResponse, outgoingMessage);
        return NextResponse.json({ status: "guardrail" });
      }
    } catch (err) {
      console.error("guardrail check error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
    }

    let quoteCandidates: QuoteCandidate[] = [];
    try {
      quoteCandidates = await getQuoteCandidates(conversationKey, {
        conversation,
        message: message as any,
        userLimit: QUOTE_TRANSCRIPT_USER_LIMIT,
        assistantLimit: QUOTE_TRANSCRIPT_ASSISTANT_LIMIT,
        maxCandidates: MAX_DEVELOPER_QUOTE_LINES,
      });
    } catch (err) {
      console.error("quote candidates error", err);
    }
    const developerPrompt = buildQuoteDeveloperPrompt(quoteCandidates);
    if (developerPrompt) {
      promptHistory = [
        toResponseMessage("developer", developerPrompt),
        ...promptHistory,
      ];
    }

    let conversationSynopsis: string | undefined;
    try {
      const synopsisMessageId =
        normalizedMessageId ??
        (typeof messageId === "number" || typeof messageId === "string"
          ? messageId
          : undefined);
      conversationSynopsis = await getConversationSynopsis(conversationKey, {
        latestMessageId: synopsisMessageId,
        history: fullHistory,
      });
    } catch (err) {
      console.error("conversation synopsis error", err);
    }

    let provider;
    try {
      provider = getProvider(undefined);
    } catch (err) {
      console.error("getProvider error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
    }

    let replyText = "";
    let pendingReplyReferenceId: string | undefined;
    let pendingReplyReferenceArgs = "";
    let replyReferenceOverride:
      | { inReplyTo?: number | null; private?: boolean }
      | undefined;
    try {
      const systemMessage = toResponseMessage("system", CHATWOOT_SYSTEM_PROMPT);
      const synopsisMessages = conversationSynopsis
        ? [toResponseMessage("developer", conversationSynopsis)]
        : [];
      const buildProviderMessages = (historyEntries: ResponseMessage[]) => [
        systemMessage,
        ...synopsisMessages,
        ...historyEntries,
      ];

      let trimmedHistory = [...promptHistory];
      let providerMessages = buildProviderMessages(trimmedHistory);
      let tokenEstimate = estimateMessageTokens(
        providerMessages,
        MODEL as TiktokenModel
      );

      const stickyDeveloperEntry =
        trimmedHistory.length && trimmedHistory[0]?.role === "developer"
          ? trimmedHistory[0]
          : undefined;

      while (trimmedHistory.length && tokenEstimate > TOKEN_THRESHOLD) {
        if (stickyDeveloperEntry) {
          if (trimmedHistory.length <= 1) {
            break;
          }
          trimmedHistory = [
            stickyDeveloperEntry,
            ...trimmedHistory.slice(2),
          ];
        } else {
          trimmedHistory = trimmedHistory.slice(1);
        }
        providerMessages = buildProviderMessages(trimmedHistory);
        tokenEstimate = estimateMessageTokens(
          providerMessages,
          MODEL as TiktokenModel
        );
      }

      promptHistory = trimmedHistory;

      const events = provider(providerMessages, tools, {});
      for await (const { event, data } of events) {
        if (
          event === "response.output_text.delta" &&
          typeof data?.delta === "string"
        ) {
          replyText += data.delta;
          continue;
        }

        if (event === "response.output_item.added") {
          const item = (data as any)?.item;
          const itemName = item?.name ?? item?.function?.name;
          if (
            item?.type === "function_call" &&
            itemName === "set_reply_reference"
          ) {
            const rawId =
              item?.call_id ??
              item?.id ??
              item?.tool_call_id ??
              item?.item_id ??
              item?.callId;
            pendingReplyReferenceId =
              typeof rawId === "string"
                ? rawId
                : typeof rawId === "number"
                  ? String(rawId)
                  : undefined;
            pendingReplyReferenceArgs =
              typeof item?.arguments === "string" ? item.arguments : "";
          }
          continue;
        }

        if (event === "response.function_call_arguments.delta") {
          const itemIdRaw =
            (data as any)?.item_id ??
            (data as any)?.id ??
            (data as any)?.call_id ??
            (data as any)?.tool_call_id;
          const normalizedId =
            typeof itemIdRaw === "string"
              ? itemIdRaw
              : typeof itemIdRaw === "number"
                ? String(itemIdRaw)
                : undefined;
          if (
            pendingReplyReferenceId &&
            normalizedId === pendingReplyReferenceId &&
            typeof (data as any)?.delta === "string"
          ) {
            pendingReplyReferenceArgs += (data as any).delta;
          }
          continue;
        }

        if (event === "response.function_call_arguments.done") {
          const itemIdRaw =
            (data as any)?.item_id ??
            (data as any)?.id ??
            (data as any)?.call_id ??
            (data as any)?.tool_call_id;
          const normalizedId =
            typeof itemIdRaw === "string"
              ? itemIdRaw
              : typeof itemIdRaw === "number"
                ? String(itemIdRaw)
                : undefined;
          if (pendingReplyReferenceId && normalizedId === pendingReplyReferenceId) {
            let finalArgs = "";
            if (typeof (data as any)?.arguments === "string") {
              finalArgs = (data as any).arguments;
            }
            if (!finalArgs) {
              finalArgs = pendingReplyReferenceArgs;
            }
            if (finalArgs) {
              try {
                const parsedArgs = parse(finalArgs) as any;
                const parsedUseQuotes =
                  typeof parsedArgs?.use_quotes === "boolean"
                    ? parsedArgs.use_quotes
                    : typeof parsedArgs?.useQuotes === "boolean"
                      ? parsedArgs.useQuotes
                      : undefined;
                const parsedMessageId = parseMessageId(
                  parsedArgs?.message_id ??
                    parsedArgs?.messageId ??
                    parsedArgs?.messageID
                );
                const parsedPrivate =
                  typeof parsedArgs?.private === "boolean"
                    ? parsedArgs.private
                    : typeof parsedArgs?.is_private === "boolean"
                      ? parsedArgs.is_private
                      : typeof parsedArgs?.send_private === "boolean"
                        ? parsedArgs.send_private
                        : undefined;

                const nextOverride: {
                  inReplyTo?: number | null;
                  private?: boolean;
                } = {};
                let hasOverride = false;

                if (parsedUseQuotes === false) {
                  nextOverride.inReplyTo = null;
                  hasOverride = true;
                } else if (typeof parsedMessageId === "number") {
                  nextOverride.inReplyTo = parsedMessageId;
                  hasOverride = true;
                } else if (parsedUseQuotes === true) {
                  nextOverride.inReplyTo = undefined;
                  hasOverride = true;
                }

                if (typeof parsedPrivate === "boolean") {
                  nextOverride.private = parsedPrivate;
                  hasOverride = true;
                }

                if (hasOverride) {
                  replyReferenceOverride = nextOverride;
                }
              } catch (err) {
                console.warn("set_reply_reference parse error", err);
              }
            }
            pendingReplyReferenceId = undefined;
            pendingReplyReferenceArgs = "";
          }
        }
      }
    } catch (err) {
      console.error("tool execution error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
    }

    const quoteHistoryTurns: HistoryTurn[] = Array.isArray(promptHistory)
      ? promptHistory
          .filter((m: { role: string }) => m.role !== "developer")
          .map((m: { role: string; content: any[] }) => ({
            role: m.role,
            content: m.content.map((c: { text: any }) => c.text).join(" "),
          }))
      : [];

    let finalReplyReference = replyReferenceOverride;
    const hasQuoteOverride =
      finalReplyReference !== undefined &&
      Object.prototype.hasOwnProperty.call(
        finalReplyReference as Record<string, unknown>,
        "inReplyTo"
      );
    if (!hasQuoteOverride) {
      const shouldQuote = shouldQuoteInboundMessage({
        messageText: userInput,
        referencedMessageId,
        referencedMessageContent: referencedTurn?.content,
        history: quoteHistoryTurns,
      });
      if (shouldQuote) {
        const fallbackQuoteId = (() => {
          const overrideInReply = defaultReplyOverride?.inReplyTo;
          if (
            typeof overrideInReply === "number" &&
            Number.isFinite(overrideInReply)
          ) {
            return overrideInReply;
          }
          if (
            typeof normalizedDefaultReplyToId === "number" &&
            Number.isFinite(normalizedDefaultReplyToId)
          ) {
            return normalizedDefaultReplyToId;
          }
          return undefined;
        })();
        const preferredQuoteId =
          typeof referencedMessageId === "number" &&
          Number.isFinite(referencedMessageId)
            ? referencedMessageId
            : fallbackQuoteId;
        if (typeof preferredQuoteId === "number") {
          finalReplyReference = {
            ...(finalReplyReference ?? {}),
            inReplyTo: preferredQuoteId,
          };
        }
      }
    }

    try {
      const finalResponse = await sendBotMessage(
        accountId,
        conversationId,
        replyText,
        buildReplyOptions(finalReplyReference, normalizedReferencedReplyToId)
      );
      await logAssistantResponse(finalResponse, replyText);
    } catch (err) {
      console.error("sendBotMessage error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
    }

    return NextResponse.json({
      accountId,
      conversationId,
      inboxId,
      content,
      mode,
    });
  } catch (error) {
    console.error("Chatwoot webhook error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

