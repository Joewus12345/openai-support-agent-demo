import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import prisma from "./prisma";
import { calculateNextRun } from "./scheduler";
import { Prisma, ScrapeJob, ScrapeJobStatus } from "./generated/prisma";
import { emitJobUpdate } from "./scrapeJobEvents";

const PYTHON_BIN = process.env.SCRAPE_WORKER_PYTHON ?? process.env.PYTHON ?? "python";
const HARNESS_PATH = path.join(
  process.cwd(),
  "crawl4AI-agent-v2",
  "benchmarks",
  "run_all.py"
);
const LOG_DIR = path.join(process.cwd(), "logs", "scrape_jobs");

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

function normalizeArgs(args: unknown): string[] {
  if (Array.isArray(args)) {
    return args.map((value) => `${value}`);
  }

  if (args && typeof args === "object") {
    const entries = Object.entries(args as Record<string, unknown>);
    return entries.flatMap(([key, value]) => {
      if (value === undefined || value === null) return [`--${key}`];
      return [`--${key}`, `${value}`];
    });
  }

  if (typeof args === "string" || typeof args === "number" || typeof args === "boolean") {
    return [`${args}`];
  }

  return [];
}

async function updateJob(
  client: PrismaClientLike,
  id: string,
  data: Partial<Pick<ScrapeJob, "status" | "finishedAt" | "startedAt" | "logPath" | "nextRunAt">>
) {
  const job = await client.scrapeJob.update({
    where: { id },
    data,
  });

  emitJobUpdate({
    jobId: id,
    status: job.status,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    logPath: job.logPath,
  });

  return job;
}

async function markFailed(
  client: PrismaClientLike,
  job: ScrapeJob,
  message: string,
  logStream: fs.WriteStream | null
) {
  const finishedAt = new Date();
  logStream?.write(`[${finishedAt.toISOString()}] Job ${job.id} failed: ${message}\n`);
  logStream?.end();

  await updateJob(client, job.id, {
    status: ScrapeJobStatus.failed,
    finishedAt,
  });
}

export async function runScrapeJob(
  job: ScrapeJob,
  client: PrismaClientLike = prisma
): Promise<{ exitCode: number } | undefined> {
  await fs.promises.mkdir(LOG_DIR, { recursive: true });
  const logFilePath = job.logPath ?? path.join(LOG_DIR, `${job.id}.log`);
  const logStream = fs.createWriteStream(logFilePath, { flags: "a" });
  const startedAt = new Date();

  await updateJob(client, job.id, {
    status: ScrapeJobStatus.running,
    startedAt,
    finishedAt: null,
    logPath: logFilePath,
  });

  const args = [HARNESS_PATH, "--script", job.script, ...normalizeArgs(job.args)];
  logStream.write(`[${startedAt.toISOString()}] Starting job ${job.id} with script ${job.script}.\n`);

  let exitCode = -1;

  try {
    const child = spawn(PYTHON_BIN, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });

    const handleChunk = (chunk: Buffer) => {
      logStream.write(chunk);
      emitJobUpdate({
        jobId: job.id,
        status: ScrapeJobStatus.running,
        startedAt: startedAt.toISOString(),
        logPath: logFilePath,
      });
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    exitCode = await new Promise((resolve) => {
      child.on("close", (code) => resolve(code ?? -1));
      child.on("error", (err) => {
        logStream.write(`Worker failed to spawn: ${err.message}\n`);
        resolve(-1);
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await markFailed(client, job, message, logStream);
    return undefined;
  }

  const finishedAt = new Date();
  logStream.write(`[${finishedAt.toISOString()}] Job ${job.id} completed with code ${exitCode}.\n`);
  logStream.end();

  const status = exitCode === 0 ? ScrapeJobStatus.completed : ScrapeJobStatus.failed;
  await updateJob(client, job.id, {
    status,
    finishedAt,
    logPath: logFilePath,
    nextRunAt: calculateNextRun(job.cadence, finishedAt),
  });

  return { exitCode };
}

export async function triggerScrapeJob(jobId: string) {
  const job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  void runScrapeJob(job).catch((error) => {
    console.error(`Failed to run job ${jobId}:`, error);
  });

  return { jobId, logPath: job.logPath ?? path.join(LOG_DIR, `${job.id}.log`) };
}
