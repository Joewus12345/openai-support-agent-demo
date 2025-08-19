import "dotenv/config";
import prisma from "@/lib/prisma";
import { summarizeSession } from "@/lib/server/summarizeSession";
import { MAX_UNSUMMARIZED_MESSAGES } from "@/config/constants";

async function run() {
  const sessions = await prisma.chatSession.findMany();
  for (const s of sessions) {
    const messages = Array.isArray(s.messages) ? (s.messages as any[]) : [];
    const startIndex = (s as any)?.lastSummarizedIndex ?? 0;
    let summary = (s as any)?.summary ?? null;
    let unsummarized = messages.slice(startIndex);
    const limit =
      (s as any)?.unsummarizedLimit ?? MAX_UNSUMMARIZED_MESSAGES;
    if (startIndex > 0 || unsummarized.length > limit) {
      if (unsummarized.length > limit) {
        const toSummarize = unsummarized.slice(0, unsummarized.length - limit);
        if (toSummarize.length > 0) {
          const fragment = await summarizeSession({
            priorSummary: summary,
            newMessages: toSummarize,
          });
          summary = [summary, fragment].filter(Boolean).join("\n");
          unsummarized = unsummarized.slice(-limit);
        }
      }
      await prisma.chatSession.update({
        where: { id: s.id },
        data: { messages: unsummarized, summary, lastSummarizedIndex: 0 },
      });
    }
  }
}

run()
  .catch((err) => {
    console.error("Prune failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
