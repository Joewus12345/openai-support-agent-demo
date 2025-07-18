import OpenAI from "openai";
import { MODEL } from "@/config/constants";
import type { ProviderOptions } from "./index";

export interface ProviderEvent {
  event: string;
  data: any;
}

export async function* openaiProvider(
  messages: any[],
  tools: any,
  _opts?: ProviderOptions
): AsyncGenerator<ProviderEvent> {
  void _opts;
  const openai = new OpenAI();
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
