import prisma from "@/lib/prisma";
import { clearActiveConversation, setActiveConversation } from "@/lib/agentRotation";
import {
  getConversation,
  getConversationLabels,
  setAgentAvailability,
  setConversationLabels,
} from "@/lib/chatwoot";
import {
  sendBotMessage,
  toggleConversationStatus,
  assignConversation,
} from "@/lib/chatwootBot";
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
  let freedAgentId: number | undefined;
  let outcome = "no-agent";
  let resolveError: unknown;
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
    freedAgentId = (conversation as any)?.assignee_id;
    if (freedAgentId === undefined) {
      try {
        const convo = await getConversation(accountId, conversationId);
        freedAgentId = (convo as any)?.assignee_id;
      } catch (err) {
        console.error("fetch assignee error", err);
        resolveError = err;
      }
    }
    if (freedAgentId === undefined) {
      try {
        const assignment = await prisma.agentAssignment.findFirst({
          where: { activeConversationId: conversationId },
        });
        freedAgentId = assignment?.agentId;
      } catch (err) {
        console.error("lookup assignment error", err);
        resolveError = err;
      }
    }
    if (freedAgentId === undefined) {
      const error = new Error(
        `Unable to resolve freed agent for conversation ${conversationId}`
      );
      (error as any).conversationId = conversationId;
      if (resolveError) {
        (error as any).cause = resolveError;
        error.message += `: ${
          resolveError instanceof Error
            ? resolveError.message
            : String(resolveError)
        }`;
      }
      throw error;
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
        await toggleConversationStatus(
          accountId,
          request.conversationId,
          "open"
        );
        await assignConversation(
          accountId,
          request.conversationId,
          freedAgentId
        );
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
        await updateRequest(request.conversationKey, {
          status: "assigned",
          agentId: freedAgentId,
        });
        await sendBotMessage(
          accountId,
          request.conversationId,
          "A human agent will join shortly."
        );
        outcome = "assigned";
      } else {
        outcome = "released";
      }
    }
  } catch (err) {
    console.error("conversation status change handling error", err);
    outcome = "error";
    throw err;
  } finally {
    console.info("releaseAgent", {
      agentId: freedAgentId,
      conversationId,
      outcome,
    });
  }
}

