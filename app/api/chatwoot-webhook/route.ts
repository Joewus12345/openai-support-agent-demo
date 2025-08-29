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
  setConversationLabels,
  getConversationLabels,
} from "@/lib/chatwootBot";
import { getConversation } from "@/lib/chatwoot";
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
        try {
          const current = await getConversationLabels(accountId, conversationId);
          const labels = Array.isArray((current as any)?.payload)
            ? (current as any).payload.filter(
                (l: string) => l !== CONVO_LABELS.assigned
              )
            : [];
          await setConversationLabels(accountId, conversationId, labels);
        } catch (err) {
          console.error("remove assigned label error", err);
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
              const current = await getConversationLabels(
                accountId,
                request.conversationId
              );
              const labels = Array.isArray((current as any)?.payload)
                ? Array.from(
                    new Set([
                      ...(current as any).payload,
                      CONVO_LABELS.awaiting,
                    ])
                  )
                : [CONVO_LABELS.awaiting];
              await setConversationLabels(
                accountId,
                request.conversationId,
                labels
              );
              await sendBotMessage(
                accountId,
                request.conversationId,
                "An agent is now available—reply within 2 minutes to connect."
              );
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
                    const existing = await getConversationLabels(
                      accountId,
                      request.conversationId
                    );
                    const labels = Array.isArray((existing as any)?.payload)
                      ? Array.from(
                          new Set(
                            [
                              ...(existing as any).payload.filter(
                                (l: string) => l !== CONVO_LABELS.awaiting
                              ),
                              CONVO_LABELS.expired,
                            ]
                          )
                        )
                      : [CONVO_LABELS.expired];
                    await setConversationLabels(
                      accountId,
                      request.conversationId,
                      labels
                    );
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
                    await setConversationLabels(accountId, request.conversationId, [
                      CONVO_LABELS.assigned,
                    ]);
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

    console.info("handoff", { accountId, conversationId, inboxId, content });

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
            console.info("handoff", { step: "toggle", accountId, conversationId });
            await toggleConversationStatus(accountId, conversationId, "open");
            console.info("handoff", "status toggled");
            console.info("handoff", {
              step: "assign",
              accountId,
              conversationId,
              agentId: agent.id,
            });
            await assignConversation(accountId, conversationId, agent.id);
            console.info("handoff", "conversation assigned", agent.id);
            console.info("handoff", {
              step: "set-active",
              agentId: agent.id,
              conversationId,
            });
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
            const labels = Array.isArray((current as any)?.payload)
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
            console.info("handoff", {
              step: "set-labels",
              accountId,
              conversationId,
            });
            await setConversationLabels(accountId, conversationId, labels);
            console.info("handoff", "labels set", labels);
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
        console.info("handoff", { step: "get-labels", accountId, conversationId });
        const current = await getConversationLabels(accountId, conversationId);
        console.info(
          "handoff",
          "labels fetched",
          (current as any)?.payload
        );
        const labels = Array.isArray((current as any)?.payload)
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
        console.info("handoff", { step: "set-labels", accountId, conversationId });
        await setConversationLabels(accountId, conversationId, labels);
        console.info("handoff", "labels set", labels);
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
        const agent = await getNextAgent(inboxId);
        if (agent) {
          console.info("handoff", {
            step: "enqueue",
            conversationId,
            agentId: agent.id,
          });
          await enqueueRequest(conversationId, "assigned", agent.id);
          console.info("handoff", "request enqueued", agent.id);
          console.info("handoff", { step: "toggle", accountId, conversationId });
          await toggleConversationStatus(accountId, conversationId, "open");
          console.info("handoff", "status toggled");
          console.info("handoff", {
            step: "assign",
            accountId,
            conversationId,
            agentId: agent.id,
          });
          await assignConversation(accountId, conversationId, agent.id);
          console.info("handoff", "conversation assigned", agent.id);
          console.info("handoff", {
            step: "set-active",
            agentId: agent.id,
            conversationId,
          });
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
          await setConversationLabels(accountId, conversationId, labels);
          console.info("handoff", "labels set", labels);
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
          await setConversationLabels(accountId, conversationId, labels);
          console.info("handoff", "labels set", labels);
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

