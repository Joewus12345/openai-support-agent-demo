import prisma from "@/lib/prisma";
import {
  AgentAvailability,
  clearActiveConversation,
  setActiveConversation,
} from "@/lib/agentRotation";
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
import {
  dequeueRequest,
  dequeueNextPendingRequest,
  updateRequest,
  updateQueuePositions,
  formatQueuePositionMessage,
} from "@/lib/handoffQueue";
import { notifyHandoffIssue } from "@/lib/friendlyErrors";
import type { Conversation } from "@/types/chatwoot";
import { storeBotMessage } from "@/lib/storeBotMessage";

const BUSY_AGENT_MESSAGE =
  "All human agents are currently busy. Please wait for the next available agent.";

/**
 * Clear the active conversation for the freed agent and assign the next request in queue.
 * Throws an error if updating agent availability fails so callers can respond with 500.
 */
export async function releaseAgent(
  accountId: number,
  conversationId: number,
  conversation?: Conversation,
  assigneeId?: number,
  inboxIdOverride?: number
) {
  let freedAgentId: number | undefined = assigneeId ??
    (conversation as any)?.assignee_id;
  let inboxId: number | undefined =
    inboxIdOverride ?? (conversation as any)?.inbox_id;
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
    if (freedAgentId === undefined || inboxId === undefined) {
      try {
        const convo = await getConversation(accountId, conversationId);
        freedAgentId = (convo as any)?.assignee_id;
        if (inboxId === undefined) {
          inboxId = (convo as any)?.inbox_id;
        }
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
        freedAgentId = assignment?.agentId ?? freedAgentId;
        if (inboxId === undefined) {
          inboxId = assignment?.inboxId;
        }
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
      let availabilitySnapshot: AgentAvailability | null = null;
      try {
        availabilitySnapshot = await clearActiveConversation(freedAgentId);
      } catch (err) {
        console.error("clear active conversation error", err);
      }
      const availabilityToRestore = availabilitySnapshot ?? "online";
      if (availabilitySnapshot === null) {
        console.warn(
          "missing availability snapshot for freed agent; defaulting to online",
          {
            accountId,
            conversationId,
            freedAgentId,
          }
        );
      }
      try {
        const response = await setAgentAvailability(
          accountId,
          freedAgentId,
          availabilityToRestore
        );
        console.info("set agent availability restore response", response);
      } catch (err) {
        console.error("restore agent availability error", err);
        await setActiveConversation(
          freedAgentId,
          conversationId,
          availabilitySnapshot
        );
        throw new Error("Agent availability update failed");
      }

      let request: Awaited<ReturnType<typeof dequeueRequest>> | null = null;
      if (typeof inboxId === "number") {
        request = await dequeueRequest(accountId, inboxId);
      } else {
        console.warn(
          "releaseAgent missing inboxId for pending queue",
          accountId,
          conversationId
        );
      }
      if (!request) {
        request = await dequeueNextPendingRequest(accountId);
      }
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
        await setActiveConversation(
          freedAgentId,
          request.conversationId,
          availabilityToRestore
        );
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
        try {
          await updateRequest(request.conversationKey, {
            status: "assigned",
            agentId: freedAgentId,
          });
        } catch (err) {
          console.error("updateRequest error", err);
          try {
            await notifyHandoffIssue(accountId, request.conversationId);
          } catch (err2) {
            console.error("fallback notifyHandoffIssue error", err2);
          }
          outcome = "error";
          return;
        }
        const confirmationMessage = await sendBotMessage(
          accountId,
          request.conversationId,
          "A human agent will join shortly."
        );
        await storeBotMessage({
          accountId,
          conversationId: request.conversationId,
          payload: confirmationMessage,
          fallbackContent: "A human agent will join shortly.",
        });

        try {
          const queueUpdates = await updateQueuePositions({ accountId });
          for (const update of queueUpdates) {
            try {
              const queueMessage = formatQueuePositionMessage(
                BUSY_AGENT_MESSAGE,
                update.position
              );
              const queueResponse = await sendBotMessage(
                accountId,
                update.conversationId,
                queueMessage
              );
              await storeBotMessage({
                accountId,
                conversationId: update.conversationId,
                payload: queueResponse,
                fallbackContent: queueMessage,
              });
            } catch (err) {
              console.error("queue position notify error", err);
            }
          }
        } catch (err) {
          console.error("updateQueuePositions error", err);
        }
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

