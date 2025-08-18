import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { saveSessionMessages } from "@/lib/server/saveSessionMessages";
import { summarizeSession } from "@/lib/server/summarizeSession";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session_id: string }> }
) {
  try {
    const { session_id } = await params;
    const { messages = [], identifier } = await request.json();

    if (Array.isArray(messages) && messages.length > 0) {
      const result = await saveSessionMessages(session_id, messages);
      if (result && "error" in result) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
        });
      }
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: session_id },
    });
    const sessionMessages = Array.isArray(session?.messages)
      ? (session!.messages as any[])
      : [];
    const startIndex = (session as any)?.summaryIndex ?? 0;
    const newMessages = sessionMessages.slice(startIndex);
    const summary = await summarizeSession({
      priorSummary: (session as any)?.summary ?? null,
      newMessages,
    });

    await redis.set(`session:${session_id}:summary`, summary);

    await prisma.chatSession.update({
      where: { id: session_id },
      data: {
        endedAt: new Date(),
        summary,
        summaryIndex: sessionMessages.length,
      },
    });

    if (identifier) {
      await redis.set(identifier, summary);
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
    });
  } catch (error) {
    console.error("Error ending session:", error);
    return new Response("Error ending session", { status: 500 });
  }
}
