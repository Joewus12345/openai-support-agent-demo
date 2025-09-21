import { MODEL } from "@/config/constants";
import { encodingForModel, getEncoding, TiktokenModel } from "js-tiktoken";

const OLLAMA_MODEL_PREFIX_TO_ENCODING: Record<string, string> = {
  llama: "cl100k_base",
  qwen: "cl100k_base",
  mistral: "cl100k_base",
  phi: "cl100k_base",
  gemma: "cl100k_base",
};

function mapModelToEncoding(modelName: string) {
  const lower = modelName.toLowerCase();
  for (const prefix of Object.keys(OLLAMA_MODEL_PREFIX_TO_ENCODING)) {
    if (lower.startsWith(prefix)) {
      return OLLAMA_MODEL_PREFIX_TO_ENCODING[prefix];
    }
  }
  return modelName;
}

export const TOKEN_THRESHOLD = 25_000;

export function estimateMessageTokens(
  messages: any[],
  modelName: TiktokenModel = MODEL as TiktokenModel
) {
  let encoding;
  const mapped = mapModelToEncoding(modelName);
  try {
    encoding = encodingForModel(mapped as TiktokenModel);
  } catch {
    const fallbackBase = mapped.startsWith("o") || mapped.includes("gpt-4o")
      ? "o200k_base"
      : "cl100k_base";
    try {
      encoding = encodingForModel(fallbackBase as TiktokenModel);
    } catch {
      encoding = getEncoding(fallbackBase);
    }
  }

  let total = 0;
  for (const msg of messages) {
    const content = (msg as any).content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part?.text === "string") {
          total += encoding.encode(part.text).length;
        }
      }
    } else if (typeof content === "string") {
      total += encoding.encode(content).length;
    }
  }
  return total;
}

export type { TiktokenModel };
