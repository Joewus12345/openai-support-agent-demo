import OpenAI from "openai";
import { randomUUID } from "crypto";
import type { ProviderOptions } from "./index";
import type { ProviderEvent } from "./openai";

const defaultModel = process.env.OLLAMA_MODEL || "llama3.2";

/**
 * Provider that uses the OpenAI client against Ollama's
 * OpenAI compatible endpoint.
 */
export async function* ollamaOpenAIProvider(
  messages: any[],
  tools: any,
  opts?: ProviderOptions
): AsyncGenerator<ProviderEvent> {
  const openai = new OpenAI({
    baseURL: process.env.OLLAMA_OPENAI_BASE_URL || "http://localhost:11434/v1",
    apiKey: process.env.OLLAMA_OPENAI_API_KEY || "ollama",
  });

  const model = opts?.model || defaultModel;

  const converted = (messages || [])
    .map((m: any) => {
      if (m.role) {
        const content = Array.isArray(m.content)
          ? m.content
              .map((c: any) => (typeof c === "string" ? c : c.text || ""))
              .join(" ")
          : String(m.content ?? "");
        return {
          role: m.role === "developer" ? "system" : m.role,
          content,
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

  let finalText = "";
  const calls = new Map<string, { name: string; args: string }>();

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: converted as any,
      tools,
      stream: true,
    });

    for await (const chunk of stream as any) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta || {};

      if (delta.content) {
        finalText += delta.content;
        yield {
          event: "response.output_text.delta",
          data: { delta: delta.content },
        } as ProviderEvent;
      }

      for (const call of delta.tool_calls || []) {
        const id = call.id || randomUUID();
        let state = calls.get(id);
        if (!state) {
          state = { name: call.function?.name ?? "", args: "" };
          calls.set(id, state);
          yield {
            event: "response.output_item.added",
            data: {
              item: {
                type: "function_call",
                id,
                name: state.name,
                call_id: id,
                arguments: "",
              },
            },
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

      if (choice?.finish_reason) {
        if (choice.finish_reason === "tool_calls") {
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
          yield { event: "response.output_text.done", data: {} } as ProviderEvent;
        } else if (choice.finish_reason === "stop") {
          yield { event: "response.output_text.done", data: {} } as ProviderEvent;
          if (finalText.trim()) {
            yield {
              event: "response.output_item.done",
              data: {
                item: { type: "message", role: "assistant", content: finalText },
              },
            } as ProviderEvent;
          } else if (calls.size === 0) {
            yield {
              event: "error",
              data: { message: "Assistant returned no content" },
            } as ProviderEvent;
          }
        }
      }
    }
  } catch (error) {
    yield { event: "error", data: { message: (error as Error).message } } as ProviderEvent;
  }
}
