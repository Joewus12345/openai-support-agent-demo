import crypto from "crypto";
import redis from "@/lib/redis";
import { createOpenAIClient } from "@/lib/providers/openaiClient";

/**
 * Summarize arbitrary text to roughly the given number of tokens.
 *
 * Summaries are cached in Redis with a 24 hour TTL ("EX" 86400) to avoid
 * recomputation of identical inputs.
 *
 * To keep hashing and summarization cheap, we only operate on the first
 * 100k characters of the input. Anything beyond that point is ignored both when
 * generating the cache key and when creating the summary.
 */
export type SummarizeTextOptions = {
  config?: Record<string, string>;
  cacheNamespace?: string;
};

export async function summarizeText(
  text: string,
  maxTokens = 200,
  options: SummarizeTextOptions = {}
): Promise<string> {
  const MAX_INPUT_CHARS = 100_000; // process only this many characters
  // Cache summaries for 24 hours to keep them relatively fresh.
  const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h
  const truncated = text.slice(0, MAX_INPUT_CHARS);

  const hash = crypto.createHash("sha256").update(truncated).digest("hex");
  const key = options.cacheNamespace
    ? `summary:${options.cacheNamespace}:${hash}`
    : `summary:${hash}`;
  try {
    const cached = await redis.get(key);
    if (cached) return cached as string;
  } catch (err) {
    console.error("Redis get error:", err);
  }

  try {
    const selectedProvider = options.config?.CHATWOOT_WEBHOOK_PROVIDER
      ?.trim()
      .toLowerCase();
    const useOllama =
      selectedProvider === "ollama" || selectedProvider === "ollama-openai";
    const baseURL = useOllama
      ? options.config?.OLLAMA_OPENAI_BASE_URL ||
        (options.config?.OLLAMA_HOST
          ? `${options.config.OLLAMA_HOST.replace(/\/$/, "")}/v1`
          : undefined)
      : options.config?.OPENAI_BASE_URL;
    const apiKey = useOllama
      ? options.config?.OLLAMA_OPENAI_API_KEY || "ollama"
      : options.config?.OPENAI_API_KEY;
    if (options.config && (!apiKey || (useOllama && !baseURL))) {
      throw new Error("The account does not have a summarization provider configured");
    }
    const openai = createOpenAIClient({
      ...options.config,
      ...(apiKey ? { OPENAI_API_KEY: apiKey } : {}),
      ...(baseURL ? { OPENAI_BASE_URL: baseURL } : {}),
    });
    const model = useOllama
      ? options.config?.OLLAMA_MODEL || "llama3.2"
      : options.config?.OPENAI_MODEL || "gpt-4o-mini";
    const prompt = `Summarize the following text in about ${maxTokens} tokens:`;
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: `${prompt}\n\n${truncated}` }],
        },
      ],
      max_output_tokens: maxTokens,
    });

    const summary = response.output_text ?? "";
    try {
      await redis.set(key, summary, "EX", CACHE_TTL_SECONDS);
    } catch (err) {
      console.error("Redis set error:", err);
    }
    return summary;
  } catch (err) {
    console.error("summarizeText error:", err);
    return truncated;
  }
}
