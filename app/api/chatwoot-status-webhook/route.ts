import { NextResponse } from "next/server";
import type { ChatwootEvent, Conversation } from "@/types/chatwoot";
import prisma from "@/lib/prisma";
import {
  getNextAgent,
  setActiveConversation,
  clearActiveConversation,
} from "@/lib/agentRotation";
import {
  getConversation,
  setConversationLabels,
  getConversationLabels,
  updateAgentAvailability,
  sendMessage,
  updateConversation,
} from "@/lib/chatwoot";
import { CONVO_LABELS } from "@/lib/constants";
import { dequeueRequest, updateRequest } from "@/lib/handoffQueue";
import { handoffStrategy } from "@/config/handoffStrategy";

export async function POST(request: Request) {
  try {
    const incoming = (await request.json()) as any;
    const payload: ChatwootEvent = incoming.data ?? incoming;

    if (incoming.event !== "conversation_status_changed") {
      return NextResponse.json({ status: "ignored" });
    }

    const conversation: Conversation | undefined = payload.conversation;
    const accountId =
      payload.account?.id ?? (payload as any)?.account_id;
    const conversationId =
      conversation?.id ?? (payload as any)?.conversation_id;
    let status = (conversation as any)?.status ?? (payload as any)?.status;

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

    if (status === "open") {
      return NextResponse.json({ status: "ignored" });
    }

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
        try {
          await updateAgentAvailability(assignment.agentId, "online");
        } catch (err) {
          console.error("set agent online error", err);
        }
      }

      const request = await dequeueRequest();
      if (request) {
        if (handoffStrategy.value === "confirm") {
          try {
            let labels = [CONVO_LABELS.awaiting];
            try {
              const current = await getConversationLabels(
                accountId,
                request.conversationId
              );
              labels = Array.isArray((current as any)?.payload)
                ? Array.from(
                    new Set([
                      ...(current as any).payload,
                      CONVO_LABELS.awaiting,
                    ])
                  )
                : [CONVO_LABELS.awaiting];
            } catch (err) {
              console.error("fetch awaiting label error", err);
            }
            try {
              await setConversationLabels(
                accountId,
                request.conversationId,
                labels
              );
            } catch (err) {
              console.error("set awaiting label error", err);
            }
            await sendMessage(
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
                        new Set([
                          ...(existing as any).payload.filter(
                            (l: string) => l !== CONVO_LABELS.awaiting
                          ),
                          CONVO_LABELS.expired,
                        ])
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
            const agent = await getNextAgent(accountId);
            if (agent) {
              try {
                await setConversationLabels(
                  accountId,
                  request.conversationId,
                  [CONVO_LABELS.assigned]
                );
              } catch (err) {
                console.error("set assigned label error", err);
              }
              await updateConversation(accountId, request.conversationId, {
                status: "open",
                assignee_id: agent.id,
              });
              await setActiveConversation(agent.id, request.conversationId);
              try {
                await updateAgentAvailability(agent.id, "busy");
              } catch (err) {
                console.error("set agent busy error", err);
              }
              await updateRequest(request.conversationId, {
                status: "assigned",
                agentId: agent.id,
              });
              await sendMessage(
                accountId,
                request.conversationId,
                "A human agent will join shortly."
              );
            }
          } catch (err) {
            console.error("handoff queue processing error", err);
          }
        }
      }
    } catch (err) {
      console.error("conversation status change handling error", err);
    }

    return NextResponse.json({ status: "handled" });
  } catch (error) {
    console.error("Chatwoot status webhook error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

