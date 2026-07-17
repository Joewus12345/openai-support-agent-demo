"use client";

import React from "react";
import { Info } from "lucide-react";

import Chat from "./Chat";
import ContextPanel from "./ContextPanel";
import HandoffStrategyToggle from "./HandoffStrategyToggle";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import type { Item } from "@/lib/assistant";
import useConversationStore from "@/stores/useConversationStore";

export default function AgentView() {
  const {
    chatMessages,
    addConversationItem,
    addChatMessage,
    addPendingMessage,
    autoReply,
    setAutoReply,
    modelProvider,
    setModelProvider,
    ollamaModel,
    setOllamaModel,
  } = useConversationStore();
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (modelProvider !== "ollama" && modelProvider !== "ollama-openai") return;
    const controller = new AbortController();
    const fetchModels = async () => {
      try {
        const response = await fetch("/api/ollama/models", { signal: controller.signal });
        const data = await response.json();
        setAvailableModels(
          Array.isArray(data?.models)
            ? data.models.map((model: { name?: string }) => model.name).filter(Boolean)
            : []
        );
      } catch (error) {
        if (!controller.signal.aborted) console.error("Failed to fetch models", error);
      }
    };
    void fetchModels();
    return () => controller.abort();
  }, [modelProvider]);

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;
    const agentItem: Item = {
      type: "message",
      role: "agent",
      content: [{ type: "input_text", text: message.trim() }],
    };
    const agentMessage: any = { role: "assistant", content: message.trim() };
    addConversationItem(agentMessage);
    addChatMessage(agentItem);
    addPendingMessage(agentMessage);
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 overflow-hidden rounded-lg bg-white p-3 sm:p-4">
      <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex min-h-9 items-center gap-2">
          <Switch
            id="agent-auto-reply"
            checked={autoReply}
            onCheckedChange={setAutoReply}
            mode="custom"
          />
          <label htmlFor="agent-auto-reply" className="text-xs font-medium text-muted-foreground">
            Auto Reply
          </label>
        </div>

        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:max-w-52">
          Model Provider
          <select
            name="model-provider"
            className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={modelProvider}
            onChange={(event) => setModelProvider(event.target.value)}
          >
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama</option>
            <option value="ollama-openai">Ollama (OpenAI Compatible)</option>
          </select>
        </label>

        {modelProvider === "ollama" || modelProvider === "ollama-openai" ? (
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:max-w-52">
            Ollama Model
            <select
              name="ollama-model"
              className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={ollamaModel}
              onChange={(event) => setOllamaModel(event.target.value)}
            >
              {availableModels.length ? (
                availableModels.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))
              ) : (
                <option value={ollamaModel}>{ollamaModel || "No models found"}</option>
              )}
            </select>
          </label>
        ) : null}

        <div className="min-w-0 sm:ml-auto">
          <HandoffStrategyToggle />
        </div>

        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline" size="sm" className="w-full gap-2 xl:hidden">
              <Info className="h-4 w-4" aria-hidden="true" />
              Open Customer Details
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85vh] overscroll-contain">
            <DrawerHeader className="text-left">
              <DrawerTitle>Case Context</DrawerTitle>
              <DrawerDescription>Customer details for the active conversation.</DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-8">
              <ContextPanel className="min-h-[55vh]" />
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
        <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
          <Chat items={chatMessages} view="agent" onSendMessage={handleSendMessage} />
        </div>
        <div className="hidden min-w-0 overflow-hidden rounded-lg border xl:block">
          <ContextPanel className="h-full" />
        </div>
      </div>
    </div>
  );
}
