import { sendBotMessage } from "@/lib/chatwootBot";
import type { SendBotMessageOptions } from "@/lib/chatwootBot";
import {
  getNumericId,
  storeAssistantMessage,
} from "@/lib/storeConversationMessage";

// Text shown to users when the assistant cannot send a regular message
// response. Exported for tests to assert route-specific fallbacks.
export const MESSAGE_FALLBACK_TEXT =
  "⚠️ We hit a temporary snag. Please try again in a bit!";

// Text shown to users when the assistant cannot complete a handoff.
// Currently the message is the same as MESSAGE_FALLBACK_TEXT but is
// exported separately to allow route-specific assertions.
export const HANDOFF_FALLBACK_TEXT =
  "⚠️ We hit a temporary snag. Please try again in a bit!";

export async function notifyMessageIssue(
  accountId: number,
  conversationId: number,
  options?: SendBotMessageOptions
) {
  const response = await sendBotMessage(
    accountId,
    conversationId,
    MESSAGE_FALLBACK_TEXT,
    options
  );
  await logAssistantFallback(
    accountId,
    conversationId,
    MESSAGE_FALLBACK_TEXT,
    response
  );
  return response;
}

export async function notifyHandoffIssue(
  accountId: number,
  conversationId: number,
  options?: SendBotMessageOptions
) {
  const response = await sendBotMessage(
    accountId,
    conversationId,
    HANDOFF_FALLBACK_TEXT,
    options
  );
  await logAssistantFallback(
    accountId,
    conversationId,
    HANDOFF_FALLBACK_TEXT,
    response
  );
  return response;
}

async function logAssistantFallback(
  accountId: number,
  conversationId: number,
  fallbackContent: string,
  response: unknown
) {
  if (!response || typeof response !== "object") {
    console.warn("fallback sendBotMessage response missing payload", {
      accountId,
      conversationId,
    });
    return;
  }

  const messageId =
    getNumericId((response as any)?.id) ??
    getNumericId((response as any)?.message_id) ??
    getNumericId((response as any)?.source_id);
  const inboxId =
    getNumericId((response as any)?.inbox_id) ??
    getNumericId((response as any)?.conversation?.inbox_id) ??
    getNumericId((response as any)?.inboxId);

  if (typeof messageId !== "number" || typeof inboxId !== "number") {
    console.warn("fallback sendBotMessage missing identifiers", {
      hasMessageId: typeof messageId === "number",
      hasInboxId: typeof inboxId === "number",
      accountId,
      conversationId,
    });
    return;
  }

  await storeAssistantMessage({
    accountId,
    conversationId,
    inboxId,
    messageId,
    content:
      typeof (response as any)?.content === "string"
        ? (response as any).content
        : fallbackContent,
    createdAt: (response as any)?.created_at ?? (response as any)?.createdAt,
  });
}

