import { summarizeText } from "@/lib/server/summarizeText";

export async function POST(request: Request) {
  try {
    const { text, maxTokens } = await request.json();
    if (typeof text !== "string") {
      return new Response("Invalid text", { status: 400 });
    }
    const summary = await summarizeText(text, maxTokens);
    return Response.json({ summary });
  } catch (error) {
    console.error("Error summarizing text:", error);
    return new Response("Failed to summarize text", { status: 500 });
  }
}
