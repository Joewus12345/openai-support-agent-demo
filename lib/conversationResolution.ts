import prisma from "@/lib/prisma";
import { clearActiveConversation, setActiveConversation } from "@/lib/agentRotation";
import {
  getConversation,
  getConversationLabels,
  setAgentAvailability,
  updateConversation,
  setConversationLabels,
} from "@/lib/chatwoot";
import { sendBotMessage } from "@/lib/chatwootBot";
import { CONVO_LABELS } from "@/lib/constants";
import { dequeueRequest, updateRequest } from "@/lib/handoffQueue";
import type { Conversation } from "@/types/chatwoot";

/**
 * Clear the active conversation for the freed agent and assign the next request in queue.
 * Throws an error if updating agent availability fails so callers can respond with 500.
 */
export async function releaseAgent(
  accountId: number,
  conversationId: number,
  conversation?: Conversation
) {
  try {
    const current = await getConversationLabels(accountId, conversationId);
    const reserved = Object.values(CONVO_LABELS) as string[];
    const labels = Array.isArray((current as any)?.payload)
      ? (current as any).payload.filter((l: string) => !reserved.includes(l))
      : [];
    await setConversationLabels(accountId, conversationId, labels);
  } catch (err) {
    console.error("remove assigned label error", err);
  }

  try {
    let freedAgentId = (conversation as any)?.assignee_id;
    if (freedAgentId === undefined) {
      try {
        const convo = await getConversation(accountId, conversationId);
        freedAgentId = (convo as any)?.assignee_id;
      } catch (err) {
        console.error("fetch assignee error", err);
      }
    }
    if (freedAgentId === undefined) {
      const assignment = await prisma.agentAssignment.findFirst({
        where: { activeConversationId: conversationId },
      });
      freedAgentId = assignment?.agentId;
    }

    if (freedAgentId) {
      await clearActiveConversation(freedAgentId);
      try {
        const response = await setAgentAvailability(
          accountId,
          freedAgentId,
          "online"
        );
        console.info("set agent online response", response);
      } catch (err) {
        console.error("set agent online error", err);
        await setActiveConversation(freedAgentId, conversationId);
        throw new Error("Agent availability update failed");
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
          const response = await setAgentAvailability(
            accountId,
            freedAgentId,
            "busy"
          );
          console.info("set agent busy response", response);
        } catch (err) {
          console.error("set agent busy error", err);
          await clearActiveConversation(freedAgentId);
          throw new Error("Agent availability update failed");
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
    throw err;
  }
}

