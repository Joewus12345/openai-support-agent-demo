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

export function convertMessages(messages: any[]) {
  return (messages || [])
    .map((m: any) => {
      if (m.role) {
        return {
          role: m.role === "developer" ? "system" : m.role,
          content: Array.isArray(m.content)
            ? m.content
                .map((c: any) => (typeof c === "string" ? c : c.text || ""))
                .join(" ")
            : String(m.content ?? ""),
        };
      }
      if (m.type === "function_call_output") {
        return {
          role: "tool",
          tool_call_id: m.call_id,
          content: m.output ?? "",
        };
      }
      return undefined;
    })
    .filter(Boolean);
}

export function serializeToolCallArgs(args: any): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

export async function* ollamaProvider(
  messages: any[],
  tools: any,
  options?: ProviderOptions
): AsyncGenerator<ProviderEvent> {
  const model = options?.model || defaultModel;

const converted = convertMessages(messages);
  let finalText = "";

  let stream: any;
  try {
    const payload = {
      model,
      messages: converted,
      tools,
      stream: true,
      options: { num_ctx },
    } as any;
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

  const calls = new Map<string, { name?: string; args: string }>();

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
      let state = calls.get(id);
      if (!state) {
        state = { name: call.function?.name, args: "" };
        calls.set(id, state);
        yield {
          event: "response.output_item.added",
          data: { item: { type: "function_call", id, name: state.name, call_id: id, arguments: "" } },
        } as ProviderEvent;
      }

      if (call.function?.arguments) {
        state.args += call.function.arguments;
        yield {
          event: "response.function_call_arguments.delta",
          data: { item_id: id, delta: call.function.arguments },
        } as ProviderEvent;
      }
    }

    if (chunk.done) {
      for (const [id, state] of calls.entries()) {
        yield {
          event: "response.function_call_arguments.done",
          data: { item_id: id, arguments: state.args },
        } as ProviderEvent;
        yield {
          event: "response.output_item.done",
          data: {
            item: {
              type: "function_call",
              id,
              name: state.name,
              call_id: id,
              arguments: state.args,
            },
          },
        } as ProviderEvent;
      }

      if (finalText.trim()) {
        yield { event: "response.output_text.done", data: {} } as ProviderEvent;
        yield {
          event: "response.output_item.done",
          data: {
            item: { type: "message", role: "assistant", content: finalText },
          },
        } as ProviderEvent;
      } else if (calls.size === 0) {
        const msg = "Ollama returned no content";
        console.error("No content returned", "finalText length", finalText.length);
        yield { event: "error", data: { message: msg } } as ProviderEvent;
      } else {
        yield { event: "response.output_text.done", data: {} } as ProviderEvent;
      }
    }
  }
}

