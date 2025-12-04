import fs from "fs/promises";
import path from "path";

import { ensureAuthenticated, listJobLogRuns } from "../../helpers";

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = searchParams.get("cursor") ?? undefined;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const before = searchParams.get("before");
  const after = searchParams.get("after");
  const contentStart = searchParams.get("contentStart");
  const contentLimit = searchParams.get("contentLimit");

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const beforeDate = before ? new Date(before) : null;
  const afterDate = after ? new Date(after) : null;

  try {
    const { logs, nextCursor } = await listJobLogRuns(id, {
      limit,
      cursor,
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
    });

    return new Response(
      JSON.stringify({
        logs: logs.map((log) => ({
          id: log.id,
          path: log.path,
          startedAt: log.startedAt.toISOString(),
          size: log.size,
          content: log.content ?? null,
          contentStart: log.contentStart ?? 0,
          contentEnd: log.contentEnd ?? 0,
          hasMoreBefore: Boolean(log.hasMoreBefore),
          hasMoreAfter: Boolean(log.hasMoreAfter),
        })),
        nextCursor,
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
  const unauthorized = ensureAuthenticated(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { logId?: string | null };
  const targetId = body.logId ?? null;

  try {
    const { logs } = await listJobLogRuns(id, { limit: 1, includeContent: false });
    const targetLog = targetId ? logs.find((log) => log.id === targetId) : logs[0];

    if (!targetLog) {
      return new Response(JSON.stringify({ error: "Log not found" }), { status: 404 });
    }

    const baseDir = path.join(process.cwd(), "logs", "scrape_jobs");
    const absolutePath = path.resolve(targetLog.path);
    if (!absolutePath.startsWith(baseDir)) {
      return new Response(JSON.stringify({ error: "Invalid log path" }), { status: 400 });
    }

    await fs.unlink(absolutePath).catch(() => {});

    return new Response(JSON.stringify({ deleted: targetLog.id }), { status: 200 });
  } catch (error) {
    console.error("Failed to delete job log", { error, jobId: id, logId: targetId });
    return new Response(JSON.stringify({ error: "Unable to delete log" }), { status: 500 });
  }
}
