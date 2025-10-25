import OpenAI from "openai";
import { MODEL } from "@/config/constants";
import type { ProviderOptions } from "./index";
import { deriveLimiterTokens, scheduleProviderCall } from "./limiter";

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
  opts?: ProviderOptions
): AsyncGenerator<ProviderEvent> {
  const openai = new OpenAI();
  const modelName = opts?.model || MODEL;
  const limiterTokens = opts?.limiterTokens ?? deriveLimiterTokens(messages, modelName);
  const events = await scheduleProviderCall("openai", limiterTokens, async () =>
    openai.responses.create({
      model: modelName,
      input: messages,
      tools: flattenTools(tools),
      stream: true,
      include: ["file_search_call.results"],
      parallel_tool_calls: false,
    })
  );

  for await (const event of events) {
    yield { event: event.type, data: event } as ProviderEvent;
  }
}
