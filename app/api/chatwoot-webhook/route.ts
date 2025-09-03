import { NextResponse } from "next/server";
import type {
  ChatwootWebhookPayload,
  MessageCreatedPayload,
  Conversation,
} from "@/types/chatwoot";
import prisma from "@/lib/prisma";
import { getNextAgent, setActiveConversation } from "@/lib/agentRotation";
import { sendBotMessage } from "@/lib/chatwootBot";
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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChatwootWebhookPayload;
    const event = payload.event;
    const data = "data" in payload ? payload.data : payload;
    const { message } = data as MessageCreatedPayload;
    const conversation: Conversation | undefined =
      message?.conversation ??
      (data as any).conversation ??
      (event.startsWith("conversation_") ? (data as any) : undefined);
    if (!conversation) {
      console.info("chatwoot webhook", { event });
    }
    if (event !== "message_created" || !conversation) {
      return NextResponse.json({ status: "ignored" });
    }
    if (!message) {
      return NextResponse.json({ status: "ignored" });
    }
    const accountId =
      conversation.account?.id ?? conversation.account_id;
    const conversationId = conversation.id;
    const inboxId = conversation.inbox_id;
    const content = message.content;
    const messageId = message.id;

    if (
      message.message_type === 2 &&
      typeof content === "string" &&
      (content.startsWith("Conversation was marked resolved") ||
        content.startsWith("Conversation was marked as pending"))
    ) {
      console.info("resolution message", { messageId, conversationId, content });
      if (accountId === undefined || conversationId === undefined) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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
      where: { conversationId },
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
            await updateRequest(conversationId, {
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
        await updateRequest(conversationId, {
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
          await enqueueRequest(conversationId, "assigned", agent.id);
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
              await updateRequest(conversationId, {
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
          await enqueueRequest(conversationId);
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

    try {
      let replyText = "";
      const events = getProvider(undefined)(
        [toResponseMessage("user", content)],
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
    } catch (err) {
      console.error("sendBotMessage error", err);
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

