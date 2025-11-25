import fs from "fs/promises";
import prisma from "../../../lib/prisma";
import { ScrapeJob } from "../../../lib/generated/prisma";
import { BenchmarkEntry } from "@/lib/scrapeMetrics";

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

export function buildJobStats(job: ScrapeJob, benchmark: BenchmarkEntry | null = null) {
  return {
    status: job.status,
    durationSeconds: deriveDurationSeconds(job, benchmark),
    documentsIngested: deriveDocumentsIngested(job, benchmark),
  };
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

  return {
    job,
    log,
    stats: buildJobStats(job),
  };
}

export type SerializedScrapeJob = NonNullable<Awaited<ReturnType<typeof serializeJob>>>;
