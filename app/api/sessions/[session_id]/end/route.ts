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
      await saveSessionMessages(session_id, messages);
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: session_id },
    });
    const sessionMessages = Array.isArray(session?.messages)
      ? (session!.messages as any[])
      : [];
    const summary = await summarizeSession(sessionMessages);

    await prisma.chatSession.update({
      where: { id: session_id },
      data: { endedAt: new Date(), summary },
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
