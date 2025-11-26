import fs from "fs/promises";
import path from "path";

import prisma from "../../../lib/prisma";
import { ScrapeJob } from "../../../lib/generated/prisma";
import { BenchmarkEntry } from "@/lib/scrapeMetrics";
import { readIngestionResult, StoredIngestionResult } from "@/lib/ingestionResults";

const KNOWLEDGE_BASE_DIR = path.join(process.cwd(), "public", "knowledge_base");

export async function readJobLog(logPath: string | null | undefined) {
  if (!logPath) return null;
  try {
    const content = await fs.readFile(logPath, "utf8");
    return content;
  } catch (error) {
    console.warn("Unable to read scrape job log", { logPath, error });
    return null;
  }
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

  try {
    const entries = await fs.readdir(KNOWLEDGE_BASE_DIR);
    const artifacts: string[] = [];
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".md")) continue;
      const fullPath = path.join(KNOWLEDGE_BASE_DIR, entry);
      const stats = await fs.stat(fullPath);
      if (job.startedAt && stats.mtime < job.startedAt) continue;
      if (job.finishedAt && stats.mtime > job.finishedAt) continue;
      artifacts.push(path.relative(process.cwd(), fullPath));
    }
    return artifacts.sort();
  } catch (error) {
    console.warn("Unable to list scrape artifacts", { error });
    return [] as string[];
  }
}

export function ensureAuthenticated(request: Request) {
  const verifiedHeader = request.headers.get("x-session-verified");
  const telegramUser = request.headers.get("x-telegram-user-id");

  if (verifiedHeader === "true" || (telegramUser && telegramUser.trim().length > 0)) {
    return null;
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function serializeJob(jobId: string) {
  const job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const log = await readJobLog(job.logPath);
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
