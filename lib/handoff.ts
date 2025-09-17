import {
  assignConversation,
  toggleConversationStatus,
  sendBotMessage,
} from "@/lib/chatwootBot";
import { setAgentAvailability, updateConversation } from "@/lib/chatwoot";
import {
  getNumericId,
  storeAssistantMessage,
} from "@/lib/storeConversationMessage";

export async function handOff(
  accountId: number,
  conversationId: number,
  agentId: number,
  _role: "agent" | "administrator" = "agent"
): Promise<boolean> {
  void _role;
  try {
    await toggleConversationStatus(accountId, conversationId, "open");
    await assignConversation(accountId, conversationId, agentId);
    await setAgentAvailability(accountId, agentId, "busy");
    return true;
  } catch (err) {
    console.error("handoff error", err);
    try {
      await setAgentAvailability(accountId, agentId, "online");
    } catch (error) {
      console.error("rollback availability error", error);
    }
    try {
      await updateConversation(accountId, conversationId, {
        status: "pending",
        assignee_id: null,
      });
    } catch (error) {
      console.error("rollback conversation error", error);
    }
    try {
      const fallbackContent =
        "We're unable to connect you to a human agent right now. Please try again later.";
      const response = await sendBotMessage(
        accountId,
        conversationId,
        fallbackContent
      );
      const messageId =
        getNumericId((response as any)?.id) ??
        getNumericId((response as any)?.message_id) ??
        getNumericId((response as any)?.source_id);
      const inboxId =
        getNumericId((response as any)?.inbox_id) ??
        getNumericId((response as any)?.conversation?.inbox_id) ??
        getNumericId((response as any)?.inboxId);
      if (typeof messageId === "number" && typeof inboxId === "number") {
        await storeAssistantMessage({
          accountId,
          conversationId,
          inboxId,
          messageId,
          content:
            typeof (response as any)?.content === "string"
              ? (response as any).content
              : fallbackContent,
          createdAt:
            (response as any)?.created_at ?? (response as any)?.createdAt,
        });
      } else {
        console.warn("handoff fallback message missing identifiers", {
          hasMessageId: typeof messageId === "number",
          hasInboxId: typeof inboxId === "number",
          accountId,
          conversationId,
        });
      }
    } catch (error) {
      console.error("send fallback message error", error);
    }
    return false;
  }
}

export default handOff;
