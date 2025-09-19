import { NextResponse } from "next/server";
import { parse } from "partial-json";
import type { ChatwootWebhookPayload, Conversation } from "@/types/chatwoot";
import prisma from "@/lib/prisma";
import { getNextAgent, setActiveConversation } from "@/lib/agentRotation";
import { sendBotMessage } from "@/lib/chatwootBot";
import redis from "@/lib/redis";
import {
  resolveBotMessageIdentifiers,
  storeBotMessage,
} from "@/lib/storeBotMessage";
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
import { toResponseMessage } from "@/lib/utils/toResponseMessage";
import { enqueueRequest, updateRequest } from "@/lib/handoffQueue";
import { handoffStrategy } from "@/config/handoffStrategy";
import { releaseAgent } from "@/lib/conversationResolution";
import { CHATWOOT_SYSTEM_PROMPT } from "@/config/constants";
import { getConversationKey } from "@/lib/getConversationKey";
import { getConversationHistory } from "@/lib/getConversationHistory";
import {
  getConversationTranscript,
  type ConversationTranscriptEntry,
} from "@/lib/getConversationTranscript";
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

type HistoryTurn = { role: string; content: string };

const QUOTE_TRANSCRIPT_USER_LIMIT = 4;
const QUOTE_TRANSCRIPT_ASSISTANT_LIMIT = 2;
const MAX_DEVELOPER_QUOTE_LINES = 6;

function formatQuoteTimestamp(date?: Date): string {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "unknown-date";
  }
  return date.toISOString().slice(0, 10);
}

function buildQuoteDeveloperPrompt(
  entries: ConversationTranscriptEntry[]
): string | undefined {
  if (!Array.isArray(entries) || !entries.length) {
    return undefined;
  }
  const eligible = entries.filter((entry) => {
    if (!entry?.quoteEligible) {
      return false;
    }
    if (typeof entry.messageId !== "number" || !Number.isFinite(entry.messageId)) {
      return false;
    }
    if (typeof entry.contentSnippet !== "string") {
      return false;
    }
    return entry.contentSnippet.trim().length > 0;
  });
  if (!eligible.length) {
    return undefined;
  }
  const limited = eligible.slice(0, MAX_DEVELOPER_QUOTE_LINES);
  const lines = limited.map((entry) => {
    const snippet = entry.contentSnippet.trim();
    const prefix = `${entry.sender}#${entry.messageId}`;
    const timestamp = formatQuoteTimestamp(entry.createdAt);
    return `${prefix} · ${timestamp} · ${snippet}`;
  });
  return `Quote candidates (newest first):\n${lines.join("\n")}`;
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
    const defaultReplyToId =
      typeof referencedMessageId === "number" &&
      Number.isFinite(referencedMessageId)
        ? referencedMessageId
        : typeof normalizedMessageId === "number" &&
            Number.isFinite(normalizedMessageId)
          ? normalizedMessageId
          : undefined;
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

    const buildReplyOptions = (
      overrides?: { quoteMessageId?: number | null; forcePrivate?: boolean }
    ) => {
      const options: { private?: boolean; inReplyTo?: number } = {};
      const forcePrivate = overrides?.forcePrivate;
      const quoteMessageId = overrides?.quoteMessageId;
      const privateValue =
        typeof forcePrivate === "boolean" ? forcePrivate : mode !== "auto";
      options.private = privateValue;

      const hasOverrides = overrides !== undefined;
      const hasQuoteProp =
        hasOverrides &&
        Object.prototype.hasOwnProperty.call(
          overrides as Record<string, unknown>,
          "quoteMessageId"
        );

      if (quoteMessageId === null) {
        return options;
      }

      if (
        typeof quoteMessageId === "number" &&
        Number.isFinite(quoteMessageId)
      ) {
        options.inReplyTo = quoteMessageId;
        return options;
      }

      if (
        hasOverrides &&
        !hasQuoteProp &&
        typeof defaultReplyToId === "number" &&
        Number.isFinite(defaultReplyToId)
      ) {
        options.inReplyTo = defaultReplyToId;
      }

      return options;
    };

    const logAssistantResponse = async (
      response: unknown,
      fallbackContent: string
    ) => {
      if (!response || typeof response !== "object") {
        console.warn("sendBotMessage response missing payload", {
          accountId,
          conversationId,
        });
        return;
      }

      const { messageId: directMessageId, sourceId, inboxId: responseInboxId } =
        resolveBotMessageIdentifiers(response);
      const resolvedMessageId =
        typeof directMessageId === "number"
          ? directMessageId
          : typeof sourceId === "number"
            ? sourceId
            : undefined;
      const fallbackInboxId =
        typeof inboxId === "number" ? inboxId : undefined;
      const resolvedInboxId =
        typeof responseInboxId === "number"
          ? responseInboxId
          : fallbackInboxId;

      if (
        typeof resolvedMessageId !== "number" ||
        typeof resolvedInboxId !== "number"
      ) {
        console.warn("sendBotMessage response missing identifiers", {
          hasMessageId: typeof directMessageId === "number",
          hasSourceId: typeof sourceId === "number",
          hasInboxId: typeof resolvedInboxId === "number",
          accountId,
          conversationId,
        });
        return;
      }

      const resolvedConversationKey =
        typeof inboxId === "number" && inboxId === resolvedInboxId
          ? conversationKey
          : undefined;

      await storeBotMessage({
        accountId,
        conversationId,
        messageId: resolvedMessageId,
        inboxId: resolvedInboxId,
        payload: response,
        sourceId,
        fallbackContent,
        conversationKey: resolvedConversationKey,
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
            buildReplyOptions({ quoteMessageId: defaultReplyToId })
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
            const agent = await getNextAgent(accountId);
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
                  buildReplyOptions({ quoteMessageId: defaultReplyToId })
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
              buildReplyOptions({ quoteMessageId: defaultReplyToId })
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
              buildReplyOptions({ quoteMessageId: defaultReplyToId })
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
            buildReplyOptions({ quoteMessageId: defaultReplyToId })
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
        const agent = await getNextAgent(accountId);
        if (agent) {
          console.info("handoff", {
            step: "enqueue",
            conversationId,
            agentId: agent.id,
          });
          try {
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
                buildReplyOptions({ quoteMessageId: defaultReplyToId })
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
                    buildReplyOptions({ quoteMessageId: defaultReplyToId })
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
            buildReplyOptions({ quoteMessageId: defaultReplyToId })
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
          try {
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
              buildReplyOptions({ quoteMessageId: defaultReplyToId })
            );
          } catch (err2) {
              console.error("fallback notifyHandoffIssue error", err2);
            }
            return NextResponse.json({ status: "fallback" });
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
          const botResponse = await sendBotMessage(
            accountId,
            conversationId,
            "All human agents are currently busy. Please wait for the next available agent.",
            buildReplyOptions({ quoteMessageId: defaultReplyToId })
          );
          await logAssistantResponse(
            botResponse,
            "All human agents are currently busy. Please wait for the next available agent."
          );
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
          buildReplyOptions({ quoteMessageId: defaultReplyToId })
        );
      } catch (err) {
        console.error("fallback notifyMessageIssue error", err);
      }
    };

    let history = [] as any;
    try {
      history = await getConversationHistory(conversationKey);
    } catch (err) {
      console.error("conversation history error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
    }

    if (enrichedContent && Array.isArray(history)) {
      let updatedHistory = [...history];
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
      history = updatedHistory;
    }

    try {
      const guardrailUserInput = enrichedContent ?? userInput;
      const baseHistoryTurns: HistoryTurn[] = history
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
      if (relevance.tripwireTriggered || jailbreak.tripwireTriggered) {
        const guardrailResponse = await sendBotMessage(
          accountId,
          conversationId,
          "I can't assist with that request.",
          buildReplyOptions({ quoteMessageId: defaultReplyToId })
        );
        await logAssistantResponse(
          guardrailResponse,
          "I can't assist with that request."
        );
        return NextResponse.json({ status: "guardrail" });
      }
    } catch (err) {
      console.error("guardrail check error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
    }

    let transcriptEntries: ConversationTranscriptEntry[] = [];
    try {
      transcriptEntries = await getConversationTranscript(conversationKey, {
        userLimit: QUOTE_TRANSCRIPT_USER_LIMIT,
        assistantLimit: QUOTE_TRANSCRIPT_ASSISTANT_LIMIT,
      });
    } catch (err) {
      console.error("conversation transcript error", err);
    }
    const developerPrompt = buildQuoteDeveloperPrompt(transcriptEntries);

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
      | { quoteMessageId?: number | null; forcePrivate?: boolean }
      | undefined;
    try {
      const providerMessages = [
        toResponseMessage("system", CHATWOOT_SYSTEM_PROMPT),
        ...(developerPrompt ? [toResponseMessage("developer", developerPrompt)] : []),
        ...history,
      ];
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
                if (parsedUseQuotes === false) {
                  replyReferenceOverride = { quoteMessageId: null };
                } else if (typeof parsedMessageId === "number") {
                  replyReferenceOverride = {
                    quoteMessageId: parsedMessageId,
                  };
                } else if (parsedUseQuotes === true) {
                  replyReferenceOverride = {};
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

    const quoteHistoryTurns: HistoryTurn[] = Array.isArray(history)
      ? history
          .filter((m: { role: string }) => m.role !== "developer")
          .map((m: { role: string; content: any[] }) => ({
            role: m.role,
            content: m.content.map((c: { text: any }) => c.text).join(" "),
          }))
      : [];

    let finalReplyReference = replyReferenceOverride;
    if (finalReplyReference === undefined) {
      const shouldQuote = shouldQuoteInboundMessage({
        messageText: userInput,
        referencedMessageId,
        referencedMessageContent: referencedTurn?.content,
        history: quoteHistoryTurns,
      });
      if (shouldQuote) {
        const preferredQuoteId =
          typeof referencedMessageId === "number" &&
          Number.isFinite(referencedMessageId)
            ? referencedMessageId
            : typeof defaultReplyToId === "number" &&
                Number.isFinite(defaultReplyToId)
              ? defaultReplyToId
              : undefined;
        if (typeof preferredQuoteId === "number") {
          finalReplyReference = { quoteMessageId: preferredQuoteId };
        }
      }
    }

    try {
      const finalResponse = await sendBotMessage(
        accountId,
        conversationId,
        replyText,
        buildReplyOptions(finalReplyReference)
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

