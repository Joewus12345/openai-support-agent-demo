import { openaiProvider } from "./openai";
import { ollamaProvider } from "./ollama";
import type { ProviderEvent } from "./openai";

export interface ProviderOptions {
  model?: string;
}

export type ProviderFunction = (
  messages: any[],
  tools: any,
  options?: ProviderOptions
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