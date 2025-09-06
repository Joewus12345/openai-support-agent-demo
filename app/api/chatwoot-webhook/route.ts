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
        await prisma.conversationMessage.create({
          data: {
            id: messageId,
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
            const exists = await redis.exists(key);
            if (!exists) {
              const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
              const recent = await prisma.conversationMessage.findMany({
                where: {
                  conversationKey,
                  createdAt: { gte: since },
                },
                orderBy: { createdAt: "asc" },
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
                  id: messageId,
                  conversationId,
                  inboxId,
                  conversationKey,
                  sender,
                  content:
                    typeof content === "string" ? content : JSON.stringify(content),
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
      try {
        await releaseAgent(accountId, conversationId, conversation);
      } catch {
        return NextResponse.json(
          { error: "Agent availability update failed" },
          { status: 500 }
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

    let status = conversation?.status;
    if (!status) {
      try {
        const convo = await getConversation(accountId, conversationId);
        status = convo?.status;
      } catch (err) {
        console.error("fetch conversation error", err);
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
            await updateRequest(conversationKey, {
              status: "assigned",
              agentId: agent.id,
            });
            console.info("handoff", "request updated");
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
        await updateRequest(conversationKey, {
          status: "expired",
          agentId: null,
        });
        console.info("handoff", "request updated");
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
      let currentConversation;
      try {
        currentConversation = await getConversation(accountId, conversationId);
        console.info("handoff", "conversation fetched", currentConversation);
      } catch (err) {
        console.error("handoff", "conversation fetch error", err);
        return NextResponse.json(
          { error: "Failed to fetch conversation for escalation" },
          { status: 500 }
        );
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
          await enqueueRequest(
            accountId,
            conversationId,
            "assigned",
            agent.id,
            inboxId
          );
          console.info("handoff", "request enqueued", agent.id);
            const role =
              agent.role === "administrator" ? "administrator" : "agent";
            const success = await handOff(
              accountId,
              conversationId,
              agent.id,
              role
            );
            if (!success) {
              await updateRequest(conversationKey, {
                status: "pending",
                agentId: null,
              });
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
          await enqueueRequest(accountId, conversationId, undefined, undefined, inboxId);
          console.info("handoff", "request enqueued");
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

    let replySent = false;
    try {
      let replyText = "";
      const history = await getConversationHistory(conversationKey);
      const events = getProvider(undefined)(
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
      await sendBotMessage(accountId, conversationId, replyText, {
        private: mode !== "auto",
      });
      replySent = true;
    } catch (err) {
      console.error("sendBotMessage error", err);
    }

    if (!replySent) {
      return NextResponse.json(
        { error: "Failed to send reply" },
        { status: 500 }
      );
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

