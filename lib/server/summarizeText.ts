import OpenAI from "openai";
import crypto from "crypto";
import redis from "@/lib/redis";

/**
 * Summarize arbitrary text to roughly the given number of tokens.
 * Results are cached in Redis for 24 hours for reuse.
 *
 * Large inputs can cause hashing/summarization to be expensive, so the text is
 * truncated to a maximum of 100k characters before any processing.
 */
export async function summarizeText(text: string, maxTokens = 200): Promise<string> {
  const MAX_INPUT_CHARS = 100_000;
  const truncated = text.slice(0, MAX_INPUT_CHARS);

  const hash = crypto.createHash("sha256").update(truncated).digest("hex");
  const key = `summary:${hash}`;
  try {
    const cached = await redis.get(key);
    if (cached) return cached as string;
  } catch (err) {
    console.error("Redis get error:", err);
  }

  try {
    const openai = new OpenAI();
    const prompt = `Summarize the following text in about ${maxTokens} tokens:`;
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
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
      await redis.set(key, summary, "EX", 86400);
    } catch (err) {
      console.error("Redis set error:", err);
    }
    return summary;
  } catch (err) {
    console.error("summarizeText error:", err);
    return truncated;
  }
}
