import ollama from "ollama";
import type { ProviderOptions } from "./index";

const defaultModel = process.env.OLLAMA_MODEL || "llama3.2";
const num_ctx = parseInt(process.env.OLLAMA_NUM_CTX || "4096", 10);
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

export async function ollamaSimple(
  messages: any[],
  tools: any,
  options?: ProviderOptions
): Promise<string> {
  const model = options?.model || defaultModel;
  const converted = (messages || [])
    .filter((m: any) => m.role)
    .map((m: any) => ({
      role: m.role === "developer" ? "system" : m.role,
      content: Array.isArray(m.content)
        ? m.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join(" ")
        : String(m.content ?? ""),
    }));

  const payload = {
    model,
    messages: converted,
    tools,
    stream: true,
    options: { num_ctx },
  } as const;

  console.log("ollama.chat payload", payload);

  let stream: any;
  try {
    stream = await ollama.chat(payload);
  } catch (error) {
    console.error("ollama.chat failed", error);
    throw error;
  }

  let finalText = "";
  for await (const chunk of stream) {
    const content = chunk.message?.content ?? "";
    if (content) {
      finalText += content;
    }
  }

  return finalText;
}