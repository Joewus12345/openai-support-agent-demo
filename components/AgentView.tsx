"use client";
import React from "react";
import useConversationStore from "@/stores/useConversationStore";
import { Item } from "@/lib/assistant";
import ContextPanel from "./ContextPanel";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer";
import { Info } from "lucide-react";
import Chat from "./Chat";
import { Switch } from "./ui/switch";

export default function AgentView() {
  const {
    chatMessages,
    addConversationItem,
    addChatMessage,
    autoReply,
    setAutoReply,
    modelProvider,
    setModelProvider,
  } = useConversationStore();

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    const agentItem: Item = {
      type: "message",
      role: "agent",
      content: [{ type: "input_text", text: message.trim() }],
    };
    const agentMessage: any = {
      role: "assistant",
      content: message.trim(),
    };

    addConversationItem(agentMessage);
    addChatMessage(agentItem);
  };

  return (
    <div className="relative flex flex-1 min-h-0 bg-white rounded-lg p-4 gap-4">
      <div className="absolute top-4 left-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Auto reply</span>
          <Switch
            checked={autoReply}
            onCheckedChange={setAutoReply}
            mode="custom"
          />
        </div>
        <select
          className="text-xs border rounded p-1"
          value={modelProvider}
          onChange={(e) => setModelProvider(e.target.value)}
        >
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>
      <div className="w-full md:w-3/5">
        <Chat
          items={chatMessages}
          view="agent"
          onSendMessage={handleSendMessage}
        />
      </div>

      <div className="hidden md:block md:w-2/5">
        <ContextPanel className="h-full" />
      </div>
      <Drawer>
        <DrawerTrigger asChild>
          <button
            className="absolute top-4 right-4 md:hidden"
            aria-label="Open Context Panel"
          >
            <Info className="text-zinc-500" />
          </button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-sm">Case Context</DrawerTitle>
          </DrawerHeader>
          <div className="px-2 pb-10 flex flex-col h-[75vh]">
            <ContextPanel className="flex-1 overflow-y-auto h-[50vh]" />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
