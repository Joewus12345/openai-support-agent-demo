import prisma from "@/lib/prisma";
import redis from "@/lib/redis";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session_id: string }> }
) {
  try {
    const { session_id } = await params;
    const { messages, identifier } = await request.json();

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array required" }), {
        status: 400,
      });
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: session_id },
      include: { user: true },
    });
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
      });
    }

    const updatedMessages = [...(session.messages as any[] || []), ...messages];

    await prisma.chatSession.update({
      where: { id: session_id },
      data: { messages: updatedMessages },
    });

    // Build simple summary from last few messages
    const last = updatedMessages.slice(-5)
      .map((m: any) => (m.content || "")).join(" ");
    const summary = last.slice(0, 200);

    const key = identifier || session.user.email;
    if (key) {
      await redis.set(key, summary);
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
    });
  } catch (error) {
    console.error("Error saving session messages:", error);
    return new Response("Error saving session messages", { status: 500 });
  }
}
