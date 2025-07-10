import { openaiProvider } from "./openai";
import { ollamaProvider } from "./ollama";
import type { ProviderEvent } from "./openai";

export type ProviderFunction = (
  messages: any[],
  tools: any
) => AsyncGenerator<ProviderEvent>;

export function getProvider(name: string | undefined): ProviderFunction {
  switch (name) {
    case "ollama":
      return ollamaProvider;
    case "openai":
    default:
      return openaiProvider;
  }
}
