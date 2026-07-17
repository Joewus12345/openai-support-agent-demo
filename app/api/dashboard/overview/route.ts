import { ensureKnowledgeDocumentsIndexed } from "@/lib/server/accountStorage";
import { requireTenantSession } from "@/lib/server/tenantSession";
import prisma from "@/lib/prisma";

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function subtractUtcMonthsClamped(date: Date, months: number) {
  const targetMonthIndex = date.getUTCMonth() - months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(date.getUTCDate(), lastDay))
  );
}

export async function GET(request: Request) {
  const authResult = await requireTenantSession(request);
  if ("response" in authResult) return authResult.response;

  const account = {
    id: authResult.accountId,
    isPrimary: Boolean(authResult.session.account?.isPrimary),
  };
  await ensureKnowledgeDocumentsIndexed(account, "knowledge_base");

  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = subtractUtcMonthsClamped(end, 3);

  const [activityJobs, activityDocuments, recentJobs, recentDocuments] = await Promise.all([
    prisma.scrapeJob.findMany({
      where: { accountId: account.id, createdAt: { gte: start } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.knowledgeDocument.findMany({
      where: {
        accountId: account.id,
        kind: "knowledge_base",
        sourceModifiedAt: { gte: start },
      },
      select: { sourceModifiedAt: true },
      orderBy: { sourceModifiedAt: "asc" },
    }),
    prisma.scrapeJob.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.knowledgeDocument.findMany({
      where: { accountId: account.id, kind: "knowledge_base" },
      orderBy: [{ sourceModifiedAt: "desc" }, { name: "asc" }],
      take: 10,
    }),
  ]);

  const jobCounts = new Map<string, number>();
  for (const job of activityJobs) {
    const key = utcDateKey(job.createdAt);
    jobCounts.set(key, (jobCounts.get(key) ?? 0) + 1);
  }
  const documentCounts = new Map<string, number>();
  for (const document of activityDocuments) {
    const key = utcDateKey(document.sourceModifiedAt);
    documentCounts.set(key, (documentCounts.get(key) ?? 0) + 1);
  }

  const activity = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = utcDateKey(cursor);
    activity.push({
      date: key,
      jobs: jobCounts.get(key) ?? 0,
      updates: documentCounts.get(key) ?? 0,
    });
  }

  return Response.json({
    activity,
    referenceDate: utcDateKey(end),
    jobs: recentJobs.map((job) => ({
      id: job.id,
      script: job.script,
      status: job.status,
      target:
        job.args && typeof job.args === "object" && !Array.isArray(job.args)
          ? String(
              (job.args as Record<string, unknown>).url ??
                (job.args as Record<string, unknown>).targetUrl ??
                ""
            )
          : "",
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString() ?? null,
    })),
    files: recentDocuments.map((document) => ({
      name: document.name,
      size: document.byteSize,
      createdAt: document.sourceCreatedAt.toISOString(),
      modifiedAt: document.sourceModifiedAt.toISOString(),
      type: document.name.split(".").pop()?.toLowerCase() || "md",
    })),
  });
}
