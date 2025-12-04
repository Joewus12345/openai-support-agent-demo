import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import prisma from "../../../lib/prisma";
import { ScrapeJob } from "../../../lib/generated/prisma";
import { BenchmarkEntry } from "@/lib/scrapeMetrics";
import { readIngestionResult, StoredIngestionResult } from "@/lib/ingestionResults";

const KNOWLEDGE_BASE_DIR = path.join(process.cwd(), "public", "knowledge_base");
const JOB_LOG_ROOT = path.join(process.cwd(), "logs", "scrape_jobs");
const DEBUG_LOG_INTERVAL_MS = 5000;
let lastArtifactDebugLog = 0;

function shouldLogArtifactsVerbose() {
  if (process.env.SCRAPE_ARTIFACT_DEBUG !== "true") return false;
  const now = Date.now();
  if (now - lastArtifactDebugLog < DEBUG_LOG_INTERVAL_MS) {
    return false;
  }
  lastArtifactDebugLog = now;
  return true;
}

export async function readJobLog(logPath: string | null | undefined, opts?: { maxBytes?: number }) {
  if (!logPath) return null;
  try {
    const stat = await fs.stat(logPath);
    if (opts?.maxBytes && stat.size > opts.maxBytes) {
      const start = Math.max(0, stat.size - opts.maxBytes);
      const handle = await fs.open(logPath, "r");
      try {
        const buffer = Buffer.alloc(Math.min(opts.maxBytes, stat.size));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
        return buffer.subarray(0, bytesRead).toString("utf8");
      } finally {
        await handle.close();
      }
    }
    const content = await fs.readFile(logPath, "utf8");
    return content;
  } catch (error) {
    console.warn("Unable to read scrape job log", { logPath, error });
    return null;
  }
}

type LogRun = {
  id: string;
  path: string;
  startedAt: Date;
  size: number;
  content?: string | null;
};

export async function listJobLogRuns(
  jobId: string,
  options: {
    limit?: number;
    cursor?: string;
    includeContent?: boolean;
    start?: Date | null;
    end?: Date | null;
    before?: Date | null;
    after?: Date | null;
  } = {}
) {
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const logDir = path.join(JOB_LOG_ROOT, jobId);
  const legacyLogPath = path.join(JOB_LOG_ROOT, `${jobId}.log`);

  let entries: { path: string; startedAt: Date; size: number }[] = [];

  try {
    const files = await fs.readdir(logDir);
    const stats = await Promise.allSettled(
      files
        .filter((file) => file.endsWith(".log"))
        .map(async (file) => {
          const fullPath = path.join(logDir, file);
          const stat = await fs.stat(fullPath);
          return { path: fullPath, startedAt: stat.mtime, size: stat.size };
        })
    );

    entries = stats
      .filter((entry): entry is PromiseFulfilledResult<{ path: string; startedAt: Date; size: number }> =>
        entry.status === "fulfilled"
      )
      .map((entry) => entry.value);
  } catch {
    // directory might not exist yet
  }

  try {
    const stat = await fs.stat(legacyLogPath);
    entries.push({ path: legacyLogPath, startedAt: stat.mtime, size: stat.size });
  } catch {
    // ignore if missing
  }

  const filteredEntries = entries.filter((entry) => {
    const withinStart = options.start ? entry.startedAt >= options.start : true;
    const withinEnd = options.end ? entry.startedAt <= options.end : true;
    const withinBefore = options.before ? entry.startedAt <= options.before : true;
    const withinAfter = options.after ? entry.startedAt >= options.after : true;
    return withinStart && withinEnd && withinBefore && withinAfter;
  });

  const sorted = filteredEntries.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const cursorIndex = options.cursor
    ? sorted.findIndex((entry) => path.basename(entry.path) === options.cursor)
    : -1;

  const anchorIndex = (() => {
    if (cursorIndex > -1) return cursorIndex + 1;
    if (options.before) {
      const idx = sorted.findIndex((entry) => entry.startedAt <= options.before!);
      return idx === -1 ? sorted.length : idx;
    }
    if (options.after) {
      const idx = sorted.findIndex((entry) => entry.startedAt < options.after!);
      return Math.max(0, idx - 1);
    }
    return 0;
  })();

  const startIndex = Math.max(0, anchorIndex);
  const sliced = sorted.slice(startIndex, startIndex + limit);
  const nextCursor =
    sorted.length > startIndex + limit && sliced.length > 0
      ? path.basename(sliced[sliced.length - 1].path)
      : null;

  const logs: LogRun[] = await Promise.all(
    sliced.map(async (entry) => ({
      id: path.basename(entry.path),
      path: entry.path,
      startedAt: entry.startedAt,
      size: entry.size,
      content: options.includeContent ? await readJobLog(entry.path, { maxBytes: 20000 }) : undefined,
    }))
  );

  return { logs, nextCursor } as const;
}

function deriveDurationSeconds(job: ScrapeJob, benchmark: BenchmarkEntry | null) {
  if (typeof job.durationSeconds === "number") return job.durationSeconds;
  if (typeof benchmark?.duration_seconds === "number") return benchmark.duration_seconds;
  if (job.startedAt && job.finishedAt) {
    return (job.finishedAt.getTime() - job.startedAt.getTime()) / 1000;
  }
  return null;
}

function deriveDocumentsIngested(job: ScrapeJob, benchmark: BenchmarkEntry | null) {
  if (typeof job.documentsIngested === "number") return job.documentsIngested;
  if (typeof benchmark?.total_output_files === "number") return benchmark.total_output_files;
  if (typeof benchmark?.urls_processed === "number") return benchmark.urls_processed;
  return null;
}

function deriveProgress(job: ScrapeJob) {
  if (typeof (job as { progress?: unknown }).progress === "number") {
    const { progress } = job as { progress?: number };
    return Math.max(0, Math.min(100, Math.round(progress ?? 0)));
  }
  return null;
}

export function buildJobStats(job: ScrapeJob, benchmark: BenchmarkEntry | null = null) {
  return {
    status: job.status,
    durationSeconds: deriveDurationSeconds(job, benchmark),
    documentsIngested: deriveDocumentsIngested(job, benchmark),
    progress: deriveProgress(job),
  };
}

export async function listScrapeArtifacts(job: ScrapeJob) {
  if (!job.startedAt && !job.finishedAt) return [] as string[];

  // Set SCRAPE_ARTIFACT_DEBUG=true to log inclusion/skip decisions for artifacts.
  const debugArtifacts = process.env.SCRAPE_ARTIFACT_DEBUG === "true";
  const logVerbose = shouldLogArtifactsVerbose();

  try {
    const entries = await fs.readdir(KNOWLEDGE_BASE_DIR);
    const evaluations = await Promise.allSettled(
      entries.map(async (entry) => {
        const skipReasons: string[] = [];
        const includeReasons: string[] = [];
        const isMarkdown = entry.toLowerCase().endsWith(".md");
        if (!isMarkdown) {
          skipReasons.push("non-markdown file");
        }

        const fullPath = path.join(KNOWLEDGE_BASE_DIR, entry);
        const debugPayload: Record<string, unknown> = { path: fullPath };

        try {
          const stats = await fs.stat(fullPath);

          const createdAt = stats.birthtime ?? stats.mtime;
          const modifiedAt = stats.mtime;

          const createdInWindow =
            (!job.startedAt || createdAt >= job.startedAt) &&
            (!job.finishedAt || createdAt <= job.finishedAt);
          const modifiedInWindow =
            (!job.startedAt || modifiedAt >= job.startedAt) &&
            (!job.finishedAt || modifiedAt <= job.finishedAt);

          if (!createdInWindow) {
            if (job.startedAt && createdAt < job.startedAt) {
              skipReasons.push("created before job start");
            }
            if (job.finishedAt && createdAt > job.finishedAt) {
              skipReasons.push("created after job finish");
            }
          } else {
            includeReasons.push("creation within window");
          }

          if (!modifiedInWindow) {
            if (job.startedAt && modifiedAt < job.startedAt) {
              skipReasons.push("modified before job start");
            }
            if (job.finishedAt && modifiedAt > job.finishedAt) {
              skipReasons.push("modified after job finish");
            }
          } else {
            includeReasons.push("modified within window");
          }

          const shouldInclude = isMarkdown && (createdInWindow || modifiedInWindow);

          return {
            action: shouldInclude ? "include" : "skip", 
            artifactPath: shouldInclude ? path.relative(process.cwd(), fullPath) : null,
            debug: {
              ...debugPayload,
              createdAt,
              mtime: modifiedAt,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              includeReasons,
              skipReasons,
            },
          } as const;
        } catch (error) {
          return {
            action: "error" as const,
            artifactPath: null,
            debug: { ...debugPayload, error },
          };
        }
      })
    );

    const artifacts: string[] = [];
    const debugRecords: { action: string; payload: Record<string, unknown> }[] = [];

    for (const evaluation of evaluations) {
      if (evaluation.status === "fulfilled") {
        const value = evaluation.value;
        if (value.artifactPath) {
          artifacts.push(value.artifactPath);
        }
        if (debugArtifacts && logVerbose) {
          debugRecords.push({ action: value.action, payload: value.debug });
        }
      } else if (debugArtifacts && logVerbose) {
        debugRecords.push({ action: "error", payload: { reason: evaluation.reason } });
      }
    }

    if (debugArtifacts) {
      if (logVerbose) {
        for (const record of debugRecords) {
          const label =
            record.action === "include"
              ? "including"
              : record.action === "skip"
                ? "skipping"
                : "error";
          console.debug(`listScrapeArtifacts: ${label}` as const, record.payload);
        }
      } else {
        console.debug("listScrapeArtifacts: debug output suppressed to reduce log volume", {
          entries: entries.length,
        });
      }
    }

    return artifacts.sort();
  } catch (error) {
    console.warn("Unable to list scrape artifacts", { error });
    return [] as string[];
  }
}

const AUTH_COOKIE_NAME = "scrape_job_admin_session";

function parseCookies(header: string | null) {
  if (!header) return {} as Record<string, string>;
  return header.split(";").reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {} as Record<string, string>);
}

function expectedSessionSignature() {
  const token = process.env.SCRAPE_JOB_ADMIN_TOKEN;
  if (!token) return null;
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildAuthCookie() {
  const signature = expectedSessionSignature();
  if (!signature) return null;
  const secure = process.env.NODE_ENV === "production";
  const maxAgeSeconds = 60 * 60 * 12; // 12 hours
  return [
    `${AUTH_COOKIE_NAME}=${signature}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : null,
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function ensureAuthenticated(request: Request) {
  const signature = expectedSessionSignature();

  if (!signature) {
    console.warn("SCRAPE_JOB_ADMIN_TOKEN is not configured; rejecting request");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  const session = cookies[AUTH_COOKIE_NAME];

  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const expectedBuffer = Buffer.from(signature);
    const providedBuffer = Buffer.from(session);

    if (
      expectedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return null;
    }
  } catch (error) {
    console.warn("Failed to compare auth cookies", { error });
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function serializeJob(jobId: string, options: { includeLog?: boolean } = {}) {
  const job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const log = options.includeLog !== false ? await readJobLog(job.logPath, { maxBytes: 4000 }) : null;
  const artifacts = await listScrapeArtifacts(job);
  const ingestionResult = await readIngestionResult(job.id);

  return {
    job,
    log,
    stats: buildJobStats(job),
    artifacts,
    ingestionResult,
  };
}

export type SerializedScrapeJob = NonNullable<Awaited<ReturnType<typeof serializeJob>>>;
export type SerializedIngestionResult = StoredIngestionResult & { jobId: string };
