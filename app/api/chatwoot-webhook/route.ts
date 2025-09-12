import { NextResponse } from "next/server";
import type { ChatwootWebhookPayload, Conversation } from "@/types/chatwoot";
import prisma from "@/lib/prisma";
import { getNextAgent, setActiveConversation } from "@/lib/agentRotation";
import { sendBotMessage } from "@/lib/chatwootBot";
import redis from "@/lib/redis";
import handOff from "@/lib/handoff";
import {
  getConversation,
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
  runRelevanceGuardrail,
  runJailbreakGuardrail,
} from "@/lib/guardrails";
import {
  recordReleaseFailure,
  clearReleaseAttempts,
} from "@/lib/releaseAttempts";
import { notifyMessageIssue, notifyHandoffIssue } from "@/lib/friendlyErrors";

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
            content:
              typeof content === "string"
                ? content
                : JSON.stringify(content),
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
                    content:
                      typeof content === "string"
                        ? content
                        : JSON.stringify(content),
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
          await notifyMessageIssue(accountId, conversationId);
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
                await notifyHandoffIssue(accountId, conversationId);
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
            await sendBotMessage(
              accountId,
              conversationId,
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
            await notifyHandoffIssue(accountId, conversationId);
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
          await notifyMessageIssue(accountId, conversationId);
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
              await notifyHandoffIssue(accountId, conversationId);
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
                  await notifyHandoffIssue(accountId, conversationId);
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
          await sendBotMessage(
            accountId,
            conversationId,
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
              await notifyHandoffIssue(accountId, conversationId);
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
          await sendBotMessage(
            accountId,
            conversationId,
            "All human agents are currently busy. Please wait for the next available agent."
          );
          console.info("handoff", "message sent");
        }
      } catch (err) {
        console.error("agent escalation error", err);
      }
      return NextResponse.json({ status: "handoff" });
    }

    const mode = INBOX_MODE[inboxId] ?? "auto";

    let fallbackSent = false;
    const sendFallback = async () => {
      if (fallbackSent) return;
      fallbackSent = true;
      try {
        await notifyMessageIssue(accountId, conversationId, {
          private: mode !== "auto",
        });
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

    try {
      const conversationInput = history
        .filter((m: { role: string; }) => m.role !== "developer")
        .map((m: { content: any[]; }) => m.content.map((c: { text: any; }) => c.text).join(" "))
        .join(" ");
      const userInput =
        typeof content === "string"
          ? content
          : typeof content === "object"
            ? JSON.stringify(content)
            : String(content ?? "");
      const relevance = await runRelevanceGuardrail({
        input: conversationInput,
      });
      const jailbreak = await runJailbreakGuardrail({ input: userInput });
      if (relevance.tripwireTriggered || jailbreak.tripwireTriggered) {
        await sendBotMessage(
          accountId,
          conversationId,
          "I can't assist with that request.",
          { private: mode !== "auto" }
        );
        return NextResponse.json({ status: "guardrail" });
      }
    } catch (err) {
      console.error("guardrail check error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
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
    try {
      const events = provider(
        [toResponseMessage("system", CHATWOOT_SYSTEM_PROMPT), ...history],
        tools,
        {}
      );
      for await (const { event, data } of events) {
        if (
          event === "response.output_text.delta" &&
          typeof data?.delta === "string"
        ) {
          replyText += data.delta;
        }
      }
    } catch (err) {
      console.error("tool execution error", err);
      await sendFallback();
      return NextResponse.json({ status: "fallback" });
    }

    try {
      await sendBotMessage(accountId, conversationId, replyText, {
        private: mode !== "auto",
      });
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

