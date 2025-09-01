import {
  assignConversation,
  toggleConversationStatus,
  sendBotMessage,
} from "@/lib/chatwootBot";
import { updateAgentAvailability } from "@/lib/chatwoot";
import { getAgentToken } from "@/config/agentTokens";

export async function handOff(
  accountId: number,
  conversationId: number,
  agentId: number,
  _role: "agent" | "administrator" = "agent"
): Promise<boolean> {
  void _role;
  const agentToken = getAgentToken(agentId);
  if (!agentToken) {
    console.error("Agent token not found", agentId);
    try {
      await sendBotMessage(
        accountId,
        conversationId,
        "We're unable to connect you to a human agent right now. Please try again later."
      );
    } catch (error) {
      console.error("send fallback message error", error);
    }
    return false;
  }
  try {
    await toggleConversationStatus(accountId, conversationId, "open");
    await assignConversation(accountId, conversationId, agentId);
    await updateAgentAvailability(agentToken, "busy");
    return true;
  } catch (err) {
    console.error("handoff error", err);
    try {
      await updateAgentAvailability(agentToken, "online");
    } catch (error) {
      console.error("rollback availability error", error);
    }
    try {
      await sendBotMessage(
        accountId,
        conversationId,
        "We're unable to connect you to a human agent right now. Please try again later."
      );
    } catch (error) {
      console.error("send fallback message error", error);
    }
    return false;
  }
}

export default handOff;
