import { assignConversation, toggleConversationStatus, sendBotMessage } from "@/lib/chatwootBot";
import { updateAgentAvailability } from "@/lib/chatwoot";

export async function handOff(
  accountId: number,
  conversationId: number,
  agentId: number,
  role: "agent" | "administrator" = "agent"
): Promise<boolean> {
  try {
    await toggleConversationStatus(accountId, conversationId, "open");
    await assignConversation(accountId, conversationId, agentId);
    await updateAgentAvailability(accountId, agentId, "busy", role);
    return true;
  } catch (err) {
    console.error("handoff error", err);
    try {
      await updateAgentAvailability(accountId, agentId, "online", role);
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
