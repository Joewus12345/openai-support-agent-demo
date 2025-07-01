"use client";
import React from "react";
import Chat from "./Chat";
import useConversationStore from "@/stores/useConversationStore";
import { Item, processMessages } from "@/lib/assistant";
import { checkRelevance, checkJailbreak } from "@/lib/guardrails";

export default function UserView() {
  const { chatMessages, addConversationItem, addChatMessage } =
    useConversationStore();

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    const userItem: Item = {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: message.trim() }],
    };

    addChatMessage(userItem);

    // Guardrails checks
    const relevance = await checkRelevance(message.trim());
    if (!relevance.isRelevant) {
      addChatMessage({
        type: "message",
        role: "agent",
        content: [
          {
            type: "output_text",
            text: relevance.reasoning,
          },
        ],
      });
      return;
    }

    const jailbreak = await checkJailbreak(message.trim());
    if (!jailbreak.isSafe) {
      addChatMessage({
        type: "message",
        role: "agent",
        content: [
          {
            type: "output_text",
            text: jailbreak.reasoning,
          },
        ],
      });
      return;
    }

    const userMessage: any = {
      role: "user",
      content: message.trim(),
    };

    try {
      addConversationItem(userMessage);
      await processMessages();
    } catch (error) {
      console.error("Error processing message:", error);
    }
  };

  return (
    <div className="flex-1 w-full bg-white rounded-lg p-4 overflow-hidden">
      <Chat
        items={chatMessages}
        view="user"
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
