import { NextResponse } from "next/server";
import type { ChatwootEvent, Conversation } from "@/types/chatwoot";
import prisma from "@/lib/prisma";
import { setActiveConversation, clearActiveConversation } from "@/lib/agentRotation";
import {
  getConversation,
  getConversationLabels,
  updateAgentAvailability,
  updateConversation,
  setConversationLabels,
} from "@/lib/chatwoot";
import { sendBotMessage } from "@/lib/chatwootBot";
import { CONVO_LABELS } from "@/lib/constants";
import { dequeueRequest, updateRequest } from "@/lib/handoffQueue";

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
      const reserved = Object.values(CONVO_LABELS) as string[];
      const labels = Array.isArray((current as any)?.payload)
        ? (current as any).payload.filter(
            (l: string) => !reserved.includes(l)
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
      const freedAgentId = assignment?.agentId;
      if (freedAgentId) {
        await clearActiveConversation(freedAgentId);
        try {
          const response = await updateAgentAvailability(
            accountId,
            freedAgentId,
            "online"
          );
          console.info("set agent online response", response);
        } catch (err) {
          console.error("set agent online error", err);
          await setActiveConversation(freedAgentId, conversationId);
        }

        const request = await dequeueRequest();
        if (request) {
          try {
            await setConversationLabels(accountId, request.conversationId, [
              CONVO_LABELS.assigned,
            ]);
          } catch (err) {
            console.error("set assigned label error", err);
          }
          await updateConversation(accountId, request.conversationId, {
            status: "open",
            assignee_id: freedAgentId,
          });
          await setActiveConversation(freedAgentId, request.conversationId);
          try {
            const response = await updateAgentAvailability(
              accountId,
              freedAgentId,
              "busy"
            );
            console.info("set agent busy response", response);
          } catch (err) {
            console.error("set agent busy error", err);
            await clearActiveConversation(freedAgentId);
          }
          await updateRequest(request.conversationId, {
            status: "assigned",
            agentId: freedAgentId,
          });
          await sendBotMessage(
            accountId,
            request.conversationId,
            "A human agent will join shortly."
          );
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

