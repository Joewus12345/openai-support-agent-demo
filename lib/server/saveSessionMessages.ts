import prisma from "@/lib/prisma";

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
    return { success: true };
  } catch (error) {
    console.error("Error saving session messages:", error);
    throw error;
  }
}
