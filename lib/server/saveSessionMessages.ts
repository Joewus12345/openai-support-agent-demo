import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { summarizeSession } from "@/lib/server/summarizeSession";
import { MAX_UNSUMMARIZED_MESSAGES } from "@/config/constants";

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
      select: {
        messages: true,
        summary: true,
        lastSummarizedIndex: true,
      },
    });
    if (!session) {
      return { error: "Session not found" };
    }

    const lastSummarizedIndex = (session as any)?.lastSummarizedIndex ?? 0;
    const existingMessages = Array.isArray(session.messages)
      ? (session.messages as any[]).slice(lastSummarizedIndex)
      : [];
    let summary = (session as any)?.summary ?? null;

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

    let updatedMessages = [...existingMessages, ...dedupedMessages];

    if (updatedMessages.length > MAX_UNSUMMARIZED_MESSAGES) {
      const overflow =
        updatedMessages.length - MAX_UNSUMMARIZED_MESSAGES;
      const messagesToSummarize = updatedMessages.slice(0, overflow);
      const summaryFragment = await summarizeSession({
        priorSummary: summary,
        newMessages: messagesToSummarize,
      });
      summary = [summary, summaryFragment].filter(Boolean).join("\n");
      updatedMessages = updatedMessages.slice(-MAX_UNSUMMARIZED_MESSAGES);
      await redis.set(
        `session:${session_id}:summary`,
        summary
      );
    }

    await prisma.chatSession.update({
      where: { id: session_id },
      data: {
        messages: updatedMessages,
        summary,
        lastSummarizedIndex: 0,
      },
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
