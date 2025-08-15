import OpenAI from "openai";
import cleanMarkdown from "../cleanMarkdown";

type SummaryMessage = {
  type: "message";
  role: "user" | "assistant";
  content: [{ type: "input_text"; text: string }];
};

export async function summarizeSession(messages: any[]): Promise<string> {
  const openai = new OpenAI();
  const prompt =
    "Summarize the conversation in 3–5 bullet points, capturing the user's issue/questions asked, actions taken, and pending follow-ups.";

  const filteredMessages: SummaryMessage[] = (Array.isArray(messages) ? messages : [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: any } =>
        m && (m.role === "user" || m.role === "assistant"),
    )
    .map(({ role, content }): SummaryMessage => {
      const textContent = Array.isArray(content)
        ? content.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join(" ")
        : typeof content === "string"
          ? content
          : content?.text ?? String(content ?? "");
      return {
        type: "message",
        role,
        content: [{ type: "input_text", text: textContent }],
      };
    });

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      ...filteredMessages,
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: prompt }],
      },
    ],
  });

  const text = response.output_text ?? "";
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cleaned = lines
    .map((line) => line.replace(/^[-*•]\s*/, ""))
    .map((line) => `- ${cleanMarkdown(line).trim()}`);

  return cleaned.join("\n");
}

