import { sendBotMessage } from "@/lib/chatwootBot";

export const TEMPORARY_ISSUE_MESSAGE =
  "We hit a temporary snag. Please try again in a bit!";

export async function notifyTemporaryIssue(
  accountId: number,
  conversationId: number,
  options?: { private?: boolean }
) {
  return sendBotMessage(accountId, conversationId, TEMPORARY_ISSUE_MESSAGE, options);
}
