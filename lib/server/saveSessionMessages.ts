import prisma from "@/lib/prisma";
import redis from "@/lib/redis";

// Cached session messages no longer have an expiry and are retained
// until the associated session is cleaned up.

export async function saveSessionMessages(
  session_id: string,
  messages: any[]
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

    const existingMessages = Array.isArray(session.messages)
      ? (session.messages as any[])
      : [];

    const existingIds = new Set(
      existingMessages.map((m: any) => m.id).filter(Boolean)
    );

    const dedupedMessages: any[] = [];
    let lastMessage = existingMessages[existingMessages.length - 1];
    let duplicateDetected = false;

    for (const msg of messages) {
      if (msg.id && existingIds.has(msg.id)) {
        duplicateDetected = true;
        continue;
      }
      if (
        lastMessage &&
        msg.role === lastMessage.role &&
        JSON.stringify(msg.content) === JSON.stringify(lastMessage.content)
      ) {
        duplicateDetected = true;
        continue;
      }
      dedupedMessages.push(msg);
      lastMessage = msg;
      if (msg.id) {
        existingIds.add(msg.id);
      }
    }

    const updatedMessages = [...existingMessages, ...dedupedMessages];

    await prisma.chatSession.update({
      where: { id: session_id },
      data: { messages: updatedMessages },
    });

    await redis.set(
      `session:${session_id}:messages`,
      JSON.stringify(updatedMessages)
    );

    if (duplicateDetected) {
      return { error: "Duplicate messages detected" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error saving session messages:", error);
    throw error;
  }
}
