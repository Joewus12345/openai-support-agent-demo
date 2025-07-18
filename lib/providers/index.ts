import { openaiProvider } from "./openai";
import { ollamaSimple } from "./ollama";
import type { ProviderEvent } from "./openai";

export interface ProviderOptions {
  model?: string;
}

export type ProviderFunction = (
  messages: any[],
  tools: any,
  options?: ProviderOptions
) => AsyncGenerator<ProviderEvent> | Promise<string>;

export function getProvider(name: string | undefined): ProviderFunction {
  switch (name) {
    case "ollama":
      return ollamaSimple as ProviderFunction;
    case "openai":
    default:
      return openaiProvider;
  }
}