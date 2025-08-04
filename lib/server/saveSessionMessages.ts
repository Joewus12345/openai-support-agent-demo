import prisma from "@/lib/prisma";
import redis from "@/lib/redis";

export async function saveSessionMessages(
  session_id: string,
  messages: any[],
  identifier?: string
) {
  if (!Array.isArray(messages)) {
    return { error: "Messages must be an array" };
  }
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: session_id },
      include: { user: true },
    });
    if (!session) {
      return { error: "Session not found" };
    }

    const updatedMessages = [
      ...((session.messages as any[]) || []),
      ...messages,
    ];

    await prisma.chatSession.update({
      where: { id: session_id },
      data: { messages: updatedMessages },
    });
    const last = updatedMessages
      .slice(-Math.min(updatedMessages.length, 5))
      .map((m: any) => m.content || "")
      .join(" ");
    const summary = last.slice(0, 200);

    const key = identifier || session.user.email;
    if (key) {
      await redis.set(key, summary);
    }

    return { success: true, summary };
  } catch (error) {
    console.error("Error saving session messages:", error);
    throw error;
  }
}
