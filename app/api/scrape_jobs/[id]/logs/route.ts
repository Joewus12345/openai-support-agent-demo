import fs from "fs/promises";
import path from "path";

import { requireScrapeSession } from "../../helpers";
import { AgentRole } from "@/lib/generated/prisma";
import { listJobLogRuns } from "../../helpers";
import prisma from "@/lib/prisma";
import {
  getAccountScrapeLogRoot,
  getLegacyScrapeLogRoot,
  toStorageKey,
} from "@/lib/server/accountStorage";

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireScrapeSession(request, { role: AgentRole.agent });
  if ("response" in authResult) return authResult.response;
  const { id } = await params;
  const job = await prisma.scrapeJob.findUnique({
    where: { accountId_id: { accountId: authResult.accountId, id } },
    select: { id: true },
  });
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  const { searchParams } = new URL(request.url);
  const loadAll = searchParams.get("all") === "true";
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = searchParams.get("cursor") ?? undefined;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const before = searchParams.get("before");
  const after = searchParams.get("after");
  const contentStart = searchParams.get("contentStart");
  const contentLimit = searchParams.get("contentLimit");
  const contentRanges = searchParams.get("contentRanges");

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const beforeDate = before ? new Date(before) : null;
  const afterDate = after ? new Date(after) : null;

  const parsedRanges = (() => {
    if (!contentRanges) return undefined;
    try {
      const decoded = JSON.parse(contentRanges) as Record<
        string,
        { offset?: number | null; direction?: "before" | "after" | null; limit?: number | null }
      >;

      return Object.fromEntries(
        Object.entries(decoded)
          .filter((entry): entry is [string, { offset?: number | null; direction?: "before" | "after" | null; limit?: number | null }] => {
            const [, value] = entry;
            return value && typeof value === "object";
          })
          .map(([key, value]) => [
            key,
            {
              offset:
                typeof value.offset === "number" && Number.isFinite(value.offset)
                  ? value.offset
                  : null,
              direction: value.direction === "before" || value.direction === "after" ? value.direction : null,
              limit:
                typeof value.limit === "number" && Number.isFinite(value.limit)
                  ? Math.max(1000, Math.min(50000, value.limit))
                  : null,
            },
          ]),
      );
    } catch {
      return undefined;
    }
  })();

  try {
    const { logs, nextCursor, exhaustive } = await listJobLogRuns(authResult.accountId, id, {
      limit,
      cursor,
      fetchAll: loadAll,
      maxRuns: loadAll ? 120 : null,
      includeContent: true,
      start: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
      end: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
      before: beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null,
      after: afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null,
      contentStart:
        contentStart && Number.isFinite(Number(contentStart)) ? Math.max(0, Number(contentStart)) : null,
      contentLimit:
        contentLimit && Number.isFinite(Number(contentLimit))
          ? Math.max(1000, Math.min(50000, Number(contentLimit)))
          : null,
      contentByLogId: parsedRanges,
      includeLegacy: Boolean(authResult.session.account?.isPrimary),
    });

    return new Response(
      JSON.stringify({
        logs: logs.map((log) => ({
          id: log.id,
          path: toStorageKey(log.path),
          startedAt: log.startedAt.toISOString(),
          size: log.size,
          content: log.content ?? null,
          contentStart: log.contentStart ?? 0,
          contentEnd: log.contentEnd ?? 0,
          hasMoreBefore: Boolean(log.hasMoreBefore),
          hasMoreAfter: Boolean(log.hasMoreAfter),
          fullyLoaded: Boolean(log.fullyLoaded),
        })),
        nextCursor,
        exhaustive,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to list job logs", { error, jobId: id });
    return new Response(JSON.stringify({ error: "Unable to load logs" }), { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireScrapeSession(request, {
    role: AgentRole.admin,
    csrf: true,
  });
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { logId?: string | null };
  const targetId = body.logId ?? null;

  try {
    const job = await prisma.scrapeJob.findUnique({
      where: { accountId_id: { accountId: authResult.accountId, id } },
      select: { id: true },
    });
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
    const { logs } = await listJobLogRuns(authResult.accountId, id, {
      fetchAll: true,
      maxRuns: 120,
      includeContent: false,
      includeLegacy: Boolean(authResult.session.account?.isPrimary),
    });
    const targetLog = targetId ? logs.find((log) => log.id === targetId) : logs[0];

    if (!targetLog) {
      return new Response(JSON.stringify({ error: "Log not found" }), { status: 404 });
    }

    const absolutePath = path.resolve(targetLog.path);
    const allowedRoots = [
      getAccountScrapeLogRoot(authResult.accountId),
      ...(authResult.session.account?.isPrimary ? [getLegacyScrapeLogRoot()] : []),
    ];
    const isAllowed = allowedRoots.some((root) => {
      const relative = path.relative(path.resolve(root), absolutePath);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Invalid log path" }), { status: 400 });
    }

    await fs.unlink(absolutePath).catch(() => {});
    await prisma.scrapeJobLog.deleteMany({
      where: {
        accountId: authResult.accountId,
        jobId: id,
        storageKey: toStorageKey(absolutePath),
      },
    });

    return new Response(JSON.stringify({ deleted: targetLog.id }), { status: 200 });
  } catch (error) {
    console.error("Failed to delete job log", { error, jobId: id, logId: targetId });
    return new Response(JSON.stringify({ error: "Unable to delete log" }), { status: 500 });
  }
}
