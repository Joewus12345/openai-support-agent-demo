import OpenAI from "openai";
import { MODEL } from "@/config/constants";
import type { ProviderOptions } from "./index";
import type { ProviderEvent } from "./openai";

/**
 * Provider that uses the OpenAI client against Ollama's
 * OpenAI compatible endpoint.
 */
export async function* ollamaOpenAIProvider(
  messages: any[],
  tools: any,
  _opts?: ProviderOptions
): AsyncGenerator<ProviderEvent> {
  void _opts;
  const openai = new OpenAI({
    baseURL: process.env.OLLAMA_OPENAI_BASE_URL || "http://localhost:11434/v1",
    apiKey: process.env.OLLAMA_OPENAI_API_KEY || "ollama",
  });

  const events = await openai.responses.create({
    model: MODEL,
    input: messages,
    tools,
    stream: true,
    include: ["file_search_call.results"],
    parallel_tool_calls: false,
  });

  for await (const event of events) {
    yield { event: event.type, data: event } as ProviderEvent;
  }
}
