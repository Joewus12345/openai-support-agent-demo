import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import prisma from "../lib/prisma";
import { calculateNextRun } from "../lib/scheduler";
import { Prisma, ScrapeJob, ScrapeJobStatus } from "../lib/generated/prisma";

const POLL_INTERVAL_MS = Number(process.env.SCRAPE_WORKER_INTERVAL_MS ?? 10000);
const ADVISORY_LOCK_ID = Number(process.env.SCRAPE_WORKER_LOCK_ID ?? "68001");
const LOCK_TRANSACTION_TIMEOUT_MS = Number(
  process.env.SCRAPE_WORKER_LOCK_TIMEOUT_MS ?? 15 * 60 * 1000
);
const PYTHON_BIN = process.env.SCRAPE_WORKER_PYTHON ?? process.env.PYTHON ?? "python";
const HARNESS_PATH = path.join(
  process.cwd(),
  "crawl4AI-agent-v2",
  "benchmarks",
  "run_all.py"
);
const LOG_DIR = path.join(process.cwd(), "logs", "scrape_jobs");

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

async function withAdvisoryLock<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T | undefined> {
  return prisma.$transaction(
    async (tx) => {
      const result = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) as acquired
      `;

      if (!result[0]?.acquired) {
        return undefined;
      }

      try {
        return await fn(tx);
      } finally {
        const unlockResult = await tx.$queryRaw<{ released: boolean }[]>`
          SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID}) as released
        `;

        if (!unlockResult[0]?.released) {
          console.warn(
            `Failed to release advisory lock ${ADVISORY_LOCK_ID}; lock may remain held.`
          );
        }
      }
    },
    { timeout: LOCK_TRANSACTION_TIMEOUT_MS }
  );
}

async function claimNextJob(
  client: Prisma.TransactionClient
): Promise<ScrapeJob | null> {
  return client.scrapeJob.findFirst({
    where: {
      status: ScrapeJobStatus.queued,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
  });
}

async function updateStatus(
  client: Prisma.TransactionClient,
  id: string,
  status: ScrapeJobStatus,
  data: Partial<Pick<ScrapeJob, "finishedAt" | "startedAt" | "logPath" | "nextRunAt">>
) {
  await client.scrapeJob.update({
    where: { id },
    data: {
      status,
      ...data,
    },
  });
}

async function runJob(client: Prisma.TransactionClient, job: ScrapeJob) {
  await fs.promises.mkdir(LOG_DIR, { recursive: true });
  const logFilePath = path.join(LOG_DIR, `${job.id}.log`);
  const logStream = fs.createWriteStream(logFilePath, { flags: "a" });
  const startedAt = new Date();

  await updateStatus(client, job.id, ScrapeJobStatus.running, {
    startedAt,
    finishedAt: null,
    logPath: logFilePath,
  });

  const args = [HARNESS_PATH, "--script", job.script, ...normalizeArgs(job.args)];
  logStream.write(
    `[${startedAt.toISOString()}] Starting job ${job.id} with script ${job.script}.\n`
  );
  const child = spawn(PYTHON_BIN, args, {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });

  child.stdout.on("data", (chunk) => logStream.write(chunk));
  child.stderr.on("data", (chunk) => logStream.write(chunk));

  const exitCode: number = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? -1));
    child.on("error", (err) => {
      logStream.write(`Worker failed to spawn: ${err.message}\n`);
      resolve(-1);
    });
  });

  const finishedAt = new Date();
  const status = exitCode === 0 ? ScrapeJobStatus.completed : ScrapeJobStatus.failed;
  logStream.write(
    `[${finishedAt.toISOString()}] Job ${job.id} completed with code ${exitCode}.\n`
  );
  logStream.end();

  await updateStatus(client, job.id, status, {
    finishedAt,
    logPath: logFilePath,
    nextRunAt: calculateNextRun(job.cadence, finishedAt),
  });
}

async function processQueue() {
  await withAdvisoryLock(async (tx) => {
    const job = await claimNextJob(tx);
    if (!job) return;

    try {
      await runJob(tx, job);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await updateStatus(tx, job.id, ScrapeJobStatus.failed, {
        finishedAt: new Date(),
      });
    }
  });
}

async function main() {
  await processQueue();
  setInterval(() => {
    void processQueue();
  }, POLL_INTERVAL_MS);
}

main().catch((error) => {
  console.error("Scrape worker crashed:", error);
  process.exit(1);
});
