"use client";
import React from "react";
import Chat from "./Chat";
import useConversationStore from "@/stores/useConversationStore";
import { Item, processMessages } from "@/lib/assistant";

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
    const userMessage: any = {
      role: "user",
      content: message.trim(),
    };

    try {
      addConversationItem(userMessage);
      addChatMessage(userItem);
      await processMessages();
    } catch (error) {
      console.error("Error processing message:", error);
    }
  };

  return (
    <div className="h-full w-full min-w-0 overflow-hidden rounded-lg bg-white p-2 sm:p-4">
      <Chat
        items={chatMessages}
        view="user"
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
