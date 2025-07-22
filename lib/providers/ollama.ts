import { ProviderEvent } from "./openai";
import ollama from "ollama";
import { randomUUID } from "crypto";
import type { ProviderOptions } from "./index";

const defaultModel = process.env.OLLAMA_MODEL || "llama3.2";
// Context window size for Ollama requests. Set via OLLAMA_NUM_CTX.
const num_ctx = parseInt(process.env.OLLAMA_NUM_CTX || "8192", 10);
const host = process.env.OLLAMA_HOST;

if (host) {
  try {
    (ollama as any).defaults = { ...(ollama as any).defaults, host };
  } catch {
    try {
      (ollama as any).config.host = host;
    } catch {
      // ignore if unable to set host
    }
  }
}

export async function* ollamaProvider(
  messages: any[],
  tools: any,
  options?: ProviderOptions
): AsyncGenerator<ProviderEvent> {
  const model = options?.model || defaultModel;

const converted = (messages || [])
  .filter((m: any) => m.role)
  .map((m: any) => {
    if (m.type === "function_call_output") {
      return {
        role: "tool",
        tool_call_id: m.call_id,
        content: m.output ?? "",
      };
    }

    return {
      role: m.role === "developer" ? "system" : m.role,
      content: Array.isArray(m.content)
        ? m.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join(" ")
        : String(m.content ?? ""),
    };
  });
  let finalText = "";

  let stream: any;
  try {
    const payload = {
      model,
      messages: converted,
      tools,
      stream: true,
      options: { num_ctx },
    } as const;
    console.log("ollama.chat payload", payload);
    stream = await ollama.chat(payload);
  } catch (error) {
    console.error("ollama.chat failed", error, "finalText length", 0);
    yield {
      event: "error",
      data: { message: (error as Error).message },
    } as ProviderEvent;
    return;
  }

  const seenCalls = new Set<string>();

  for await (const chunk of stream) {
    console.log(
      "Stream chunk:",
      JSON.stringify(chunk).slice(0, 80),
      "tool calls detected:",
      (chunk.message?.tool_calls || []).length > 0
    );
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
      if (finalText.trim()) {
        yield { event: "response.output_text.done", data: {} } as ProviderEvent;
        yield {
          event: "response.output_item.done",
          data: { item: { type: "message", role: "assistant", content: finalText } },
        } as ProviderEvent;
      } else if (seenCalls.size === 0) {
        const msg = "Ollama returned no content";
        console.error("No content returned", "finalText length", finalText.length);
        yield { event: "error", data: { message: msg } } as ProviderEvent;
      } else {
        yield { event: "response.output_text.done", data: {} } as ProviderEvent;
      }
    }
  }
}

