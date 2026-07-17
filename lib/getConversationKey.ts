import { getAccountRuntimeContext } from "@/lib/accountRuntime";

export function getConversationKey(
  accountId: number,
  conversationId: number,
  inboxId?: number
) {
  const runtimeAccountId = getAccountRuntimeContext()?.accountId;
  const parts = runtimeAccountId
    ? ["tenant", runtimeAccountId, "chatwoot", accountId.toString()]
    : ["chatwoot", accountId.toString()];
  if (inboxId !== undefined) {
    parts.push(inboxId.toString());
  }
  parts.push(conversationId.toString());
  return parts.join(":");
}
