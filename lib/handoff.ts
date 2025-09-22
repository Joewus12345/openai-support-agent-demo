import {
  assignConversation,
  toggleConversationStatus,
  sendBotMessage,
} from "@/lib/chatwootBot";
import { setAgentAvailability, updateConversation } from "@/lib/chatwoot";
import {
  resolveBotMessageIdentifiers,
  storeBotMessage,
} from "@/lib/storeBotMessage";

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
      if (!response || typeof response !== "object") {
        console.warn("handoff fallback message missing payload", {
          accountId,
          conversationId,
        });
        return false;
      }

      const { messageId: directMessageId, sourceId, inboxId } =
        resolveBotMessageIdentifiers(response);
      const resolvedMessageId =
        typeof directMessageId === "number"
          ? directMessageId
          : typeof sourceId === "number"
            ? sourceId
            : undefined;

      if (typeof resolvedMessageId === "number" && typeof inboxId === "number") {
        await storeBotMessage({
          accountId,
          conversationId,
          messageId: resolvedMessageId,
          inboxId,
          payload: response,
          sourceId,
          fallbackContent,
        });
      } else {
        console.warn("handoff fallback message missing identifiers", {
          hasMessageId: typeof directMessageId === "number",
          hasSourceId: typeof sourceId === "number",
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
