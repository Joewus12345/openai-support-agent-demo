import prisma from "@/lib/prisma";
import { saveSessionMessages } from "@/lib/server/saveSessionMessages";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session_id: string }> }
) {
  try {
    const { session_id } = await params;
    const { messages = [] } = await request.json();

    if (Array.isArray(messages) && messages.length > 0) {
      await saveSessionMessages(session_id, messages);
    }

    await prisma.chatSession.update({
      where: { id: session_id },
      data: { endedAt: new Date() },
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Error ending session:", error);
    return new Response("Error ending session", { status: 500 });
  }
}
