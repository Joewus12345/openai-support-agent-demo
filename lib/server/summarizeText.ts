import OpenAI from "openai";
import crypto from "crypto";
import redis from "@/lib/redis";

/**
 * Summarize arbitrary text to roughly the given number of tokens.
 * Results are cached in Redis for reuse.
 */
export async function summarizeText(text: string, maxTokens = 200): Promise<string> {
  const hash = crypto.createHash("sha256").update(text).digest("hex");
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
          content: [{ type: "input_text", text: `${prompt}\n\n${text}` }],
        },
      ],
      max_output_tokens: maxTokens,
    });

    const summary = response.output_text ?? "";
    try {
      await redis.set(key, summary);
    } catch (err) {
      console.error("Redis set error:", err);
    }
    return summary;
  } catch (err) {
    console.error("summarizeText error:", err);
    const maxChars = maxTokens * 4;
    return text.slice(0, maxChars);
  }
}
