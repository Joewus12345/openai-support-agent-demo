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
import { notifyHandoffIssue } from "@/lib/friendlyErrors";
import type { Conversation } from "@/types/chatwoot";
import {
  getNumericId,
  storeAssistantMessage,
} from "@/lib/storeConversationMessage";

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
        const confirmationMessageId =
          getNumericId((confirmationMessage as any)?.id) ??
          getNumericId((confirmationMessage as any)?.message_id) ??
          getNumericId((confirmationMessage as any)?.source_id);
        const confirmationInboxId =
          getNumericId((confirmationMessage as any)?.inbox_id) ??
          getNumericId((confirmationMessage as any)?.conversation?.inbox_id) ??
          getNumericId((confirmationMessage as any)?.inboxId);
        if (
          typeof confirmationMessageId === "number" &&
          typeof confirmationInboxId === "number"
        ) {
          await storeAssistantMessage({
            accountId,
            conversationId: request.conversationId,
            inboxId: confirmationInboxId,
            messageId: confirmationMessageId,
            content:
              typeof (confirmationMessage as any)?.content === "string"
                ? (confirmationMessage as any).content
                : "A human agent will join shortly.",
            createdAt:
              (confirmationMessage as any)?.created_at ??
              (confirmationMessage as any)?.createdAt,
          });
        } else {
          console.warn("handoff confirmation missing identifiers", {
            hasMessageId: typeof confirmationMessageId === "number",
            hasInboxId: typeof confirmationInboxId === "number",
            accountId,
            conversationId: request.conversationId,
          });
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

