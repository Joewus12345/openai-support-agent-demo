import { ProviderEvent } from "./openai";
import ollama from "ollama";
import { randomUUID } from "crypto";
import { search_files } from "@/config/functions";

export async function* ollamaProvider(messages: any[], tools: any): AsyncGenerator<ProviderEvent> {
  const converted = (messages || []).map((m: any) => ({
    role: m.role === "developer" ? "system" : m.role,
    content: Array.isArray(m.content)
      ? m.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join(" ")
      : String(m.content ?? ""),
  }));

  const lastUser = [...(messages || [])].reverse().find((m: any) => m.role === "user");
  if (lastUser) {
    const q = Array.isArray(lastUser.content)
      ? lastUser.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join(" ")
      : String(lastUser.content ?? "");
    try {
      const results = await search_files({ query: q });
      if (results && !(results as any).error) {
        const searchResults = results.data || results.results || [];
        const snippets = searchResults
          .map((r: any) => r.text)
          .filter(Boolean)
          .slice(0, 3)
          .join("\n---\n");
        if (snippets) {
          converted.push({
            role: "system",
            content: `Relevant knowledge base excerpts:\n${snippets}`,
          });
          const id = randomUUID();
          yield {
            event: "response.file_search_call.completed",
            data: { item_id: id, results: searchResults },
          } as ProviderEvent;
          yield {
            event: "response.output_item.done",
            data: { item: { type: "file_search_call", id, results: searchResults } },
          } as ProviderEvent;
        }
      }
    } catch (err) {
      console.error("search_files failed", err);
    }
  }

  const stream = await ollama.chat({
    model: "llama3",
    messages: converted,
    tools,
    stream: true,
  });

  let finalText = "";
  const seenCalls = new Set<string>();

  for await (const chunk of stream) {
    const content = chunk.message?.content ?? "";
    if (content) {
      finalText += content;
      yield { event: "response.output_text.delta", data: { delta: content } } as ProviderEvent;
    }

    const toolCalls = chunk.message?.tool_calls || [];
    for (const call of toolCalls) {
      const id = (call as any).id ?? randomUUID();
      if (seenCalls.has(id)) continue;
      seenCalls.add(id);
      const args = JSON.stringify(call.function?.arguments ?? {});
      yield {
        event: "response.output_item.added",
        data: { item: { type: "function_call", id, name: call.function?.name, call_id: id, arguments: "" } },
      } as ProviderEvent;
      if (args) {
        yield { event: "response.function_call_arguments.delta", data: { item_id: id, delta: args } } as ProviderEvent;
        yield { event: "response.function_call_arguments.done", data: { item_id: id, arguments: args } } as ProviderEvent;
      }
      yield {
        event: "response.output_item.done",
        data: { item: { type: "function_call", id, name: call.function?.name, call_id: id, arguments: args } },
      } as ProviderEvent;
    }

    if (chunk.done) {
      yield { event: "response.output_text.done", data: {} } as ProviderEvent;
      yield {
        event: "response.output_item.done",
        data: { item: { type: "message", role: "assistant", content: finalText } },
      } as ProviderEvent;
    }
  }
}

