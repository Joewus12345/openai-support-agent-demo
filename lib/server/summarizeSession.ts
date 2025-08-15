import OpenAI from "openai";
import cleanMarkdown from "../cleanMarkdown";

export async function summarizeSession(messages: any[]): Promise<string> {
  const openai = new OpenAI();
  const prompt =
    "Summarize the conversation in 3–5 bullet points, capturing the user's issue, actions taken, and pending follow-ups.";

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      ...(Array.isArray(messages) ? messages : []),
      { role: "user", content: prompt },
    ],
  });

  const text = response.output_text ?? "";
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cleaned = lines
    .map((line) => line.replace(/^[-*•]\s*/, ""))
    .map((line) => `- ${cleanMarkdown(line).trim()}`);

  return cleaned.join("\n");
}

