import OpenAI from "openai";
import cleanMarkdown from "../cleanMarkdown";

export async function summarizeSession(messages: any[]): Promise<string> {
  const openai = new OpenAI();
  const prompt =
    "Summarize the conversation in 3–5 bullet points, capturing the user's issue, actions taken, and pending follow-ups.";

  const filteredMessages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map(({ role, content }) => {
      const textContent = Array.isArray(content)
        ? content
            .map((part: any) =>
              typeof part === "string" ? part : part?.text ?? ""
            )
            .join(" ")
        : typeof content === "string"
        ? content
        : content?.text ?? String(content ?? "");
      return { role, content: textContent };
    });

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [...filteredMessages, { role: "user", content: prompt }],
  });

  const text = response.output_text ?? "";
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cleaned = lines
    .map((line) => line.replace(/^[-*•]\s*/, ""))
    .map((line) => `- ${cleanMarkdown(line).trim()}`);

  return cleaned.join("\n");
}

