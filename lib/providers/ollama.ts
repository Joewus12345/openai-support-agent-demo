import { ProviderEvent } from "./openai";

export async function* ollamaProvider(messages: any[], _tools: any): AsyncGenerator<ProviderEvent> {
  const converted = (messages || []).map((m: any) => ({
    role: m.role === "developer" ? "system" : m.role,
    content: Array.isArray(m.content)
      ? m.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join(" ")
      : String(m.content ?? ""),
  }));

  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama3", messages: converted, stream: true }),
  });

  if (!response.body) throw new Error("No response body from Ollama");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const data = JSON.parse(line);
      const content = data.message?.content ?? "";
      if (content) {
        finalText += content;
        yield { event: "response.output_text.delta", data: { delta: content } } as ProviderEvent;
      }
      if (data.done) {
        yield { event: "response.output_text.done", data: {} } as ProviderEvent;
        yield {
          event: "response.output_item.done",
          data: { item: { type: "message", role: "assistant", content: finalText } },
        } as ProviderEvent;
      }
    }
  }
}
