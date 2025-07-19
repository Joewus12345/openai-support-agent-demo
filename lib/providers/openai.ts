import OpenAI from "openai";
import { MODEL } from "@/config/constants";
import type { ProviderOptions } from "./index";

/** Convert tools to the format expected by the Responses API. */
function flattenTools(tools: any[]): any[] {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (tool?.type === "function" && tool.function) {
      const { name, description, parameters, strict } = tool.function;
      const flattened: any = { type: "function", name, parameters };
      if (description) flattened.description = description;
      if (strict !== undefined) flattened.strict = strict;
      return flattened;
    }
    return tool;
  });
}


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
    tools: flattenTools(tools),
    stream: true,
    include: ["file_search_call.results"],
    parallel_tool_calls: false,
  });

  for await (const event of events) {
    yield { event: event.type, data: event } as ProviderEvent;
  }
}
