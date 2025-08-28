import { NextResponse } from "next/server";
import type { ChatwootEvent, Message, Conversation } from "@/types/chatwoot";
import prisma from "@/lib/prisma";
import {
  getNextAgent,
  setActiveConversation,
  clearActiveConversation,
} from "@/lib/agentRotation";
import {
  sendBotMessage,
  assignConversation,
  toggleConversationStatus,
  getConversation,
  setConversationLabels,
} from "@/lib/chatwootBot";
import { CONVO_LABELS } from "@/lib/constants";
import { getProvider } from "@/lib/providers";
import { INBOX_MODE } from "@/config/inboxMode";
import { tools } from "@/lib/tools/tools";
import { toResponseMessage } from "@/lib/utils/toResponseMessage";
import {
  enqueueRequest,
  dequeueRequest,
  updateRequest,
} from "@/lib/handoffQueue";
import { handoffStrategy } from "@/config/handoffStrategy";

export async function POST(request: Request) {
  try {
    const incoming = (await request.json()) as any;
    const payload: ChatwootEvent = incoming.data ?? incoming;

    if (incoming.event === "conversation_status_changed") {
      const conversation: Conversation | undefined = payload.conversation;
      const accountId =
        payload.account?.id ?? (payload as any)?.account_id;
      const conversationId =
        conversation?.id ?? (payload as any)?.conversation_id;
      let status =
        (conversation as any)?.status ?? (payload as any)?.status;

      if (accountId === undefined || conversationId === undefined) {
        return NextResponse.json(
          { error: "Invalid payload" },
          { status: 400 }
        );
      }

      if (!status) {
        try {
          const convo = await getConversation(accountId, conversationId);
          status = convo?.status;
        } catch (err) {
          console.error("fetch conversation error", err);
        }
      }

      if (status !== "open") {
        if (status === "resolved") {
          try {
            await setConversationLabels(accountId, conversationId, []);
          } catch (err) {
            console.error("clear labels error", err);
          }
        }
        try {
          const assignment = await prisma.agentAssignment.findFirst({
            where: { activeConversationId: conversationId },
          });
          if (assignment?.agentId) {
            await clearActiveConversation(assignment.agentId);
          }

          const request = await dequeueRequest();
          if (request) {
            if (handoffStrategy.value === "confirm") {
              try {
                await sendBotMessage(
                  accountId,
                  request.conversationId,
                  "An agent is now available—reply within 2 minutes to connect."
                );
                await setConversationLabels(accountId, request.conversationId, [
                  CONVO_LABELS.awaiting,
                ]);
                setTimeout(async () => {
                  try {
                    const current = await prisma.handoffRequest.findUnique({
                      where: { conversationId: request.conversationId },
                    });
                    if (current?.status === "awaiting_confirmation") {
                      await updateRequest(request.conversationId, {
                        status: "expired",
                        agentId: null,
                      });
                      await setConversationLabels(accountId, request.conversationId, [
                        CONVO_LABELS.expired,
                      ]);
                    }
                  } catch (err) {
                    console.error("handoff confirmation timeout", err);
                  }
                }, 2 * 60 * 1000);
              } catch (err) {
                console.error("handoff confirmation message error", err);
              }
            } else {
              try {
                const nextConv = await getConversation(
                  accountId,
                  request.conversationId
                );
                const nextInboxId = nextConv?.inbox_id;
                if (nextInboxId !== undefined) {
                  const agent = await getNextAgent(nextInboxId);
                  if (agent) {
                    await toggleConversationStatus(
                      accountId,
                      request.conversationId,
                      "open"
                    );
                    await assignConversation(
                      accountId,
                      request.conversationId,
                      agent.id
                    );
                    await setActiveConversation(agent.id, request.conversationId);
                    await updateRequest(request.conversationId, {
                      status: "assigned",
                      agentId: agent.id,
                    });
                    await sendBotMessage(
                      accountId,
                      request.conversationId,
                      "A human agent will join shortly."
                    );
                    await setConversationLabels(accountId, request.conversationId, [
                      CONVO_LABELS.assigned,
                    ]);
                  }
                }
              } catch (err) {
                console.error("handoff queue processing error", err);
              }
            }
          }
        } catch (err) {
          console.error("conversation status change handling error", err);
        }
      }

      return NextResponse.json({ status: "handled" });
    }

    if (incoming.event !== "message_created") {
      return NextResponse.json({ status: "ignored" });
    }

    const message: Message | undefined = payload.message || (payload as Message);
    const messageType = message?.message_type || message?.type;
    if (messageType !== "incoming") {
      return NextResponse.json({ status: "ignored" });
    }

    const conversation: Conversation | undefined =
      message?.conversation || payload.conversation;
    const accountId =
      payload.account?.id ??
      message?.account?.id ??
      (message as any)?.account_id ??
      (payload as any)?.account_id;
    const conversationId =
      conversation?.id ??
      (message as any)?.conversation_id ??
      (payload as any)?.conversation_id;
    const inboxId =
      (conversation as any)?.inbox_id ??
      (message as any)?.inbox_id ??
      (payload as any)?.inbox_id;
    const content = message?.content;

    if (
      accountId === undefined ||
      conversationId === undefined ||
      inboxId === undefined ||
      !content
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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
          const agent = await getNextAgent(inboxId);
          if (agent) {
            await toggleConversationStatus(accountId, conversationId, "open");
            await assignConversation(accountId, conversationId, agent.id);
            await setActiveConversation(agent.id, conversationId);
            await updateRequest(conversationId, {
              status: "assigned",
              agentId: agent.id,
            });
            await sendBotMessage(
              accountId,
              conversationId,
              "A human agent will join shortly."
            );
            await setConversationLabels(accountId, conversationId, [
              CONVO_LABELS.assigned,
            ]);
            return NextResponse.json({ status: "handoff_confirmed" });
          }
        } catch (err) {
          console.error("handoff confirmation error", err);
        }
      } else {
        await updateRequest(conversationId, { status: "expired", agentId: null });
        await setConversationLabels(accountId, conversationId, [
          CONVO_LABELS.expired,
        ]);
      }
    }

    const triggerPattern = /\b(human|agent|representative)\b/i;
    if (triggerPattern.test(content)) {
      try {
        const agent = await getNextAgent(inboxId);
        if (agent) {
          await enqueueRequest(conversationId, "assigned", agent.id);
          await toggleConversationStatus(accountId, conversationId, "open");
          await assignConversation(accountId, conversationId, agent.id);
          await setActiveConversation(agent.id, conversationId);
          await sendBotMessage(
            accountId,
            conversationId,
            "A human agent will join shortly."
          );
          await setConversationLabels(accountId, conversationId, [
            CONVO_LABELS.assigned,
          ]);
        } else {
          await enqueueRequest(conversationId);
          await sendBotMessage(
            accountId,
            conversationId,
            "All human agents are currently busy. Please wait for the next available agent."
          );
          await setConversationLabels(accountId, conversationId, [
            CONVO_LABELS.waiting,
          ]);
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
      console.error("sendMessage error", err);
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

