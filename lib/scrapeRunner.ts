import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import prisma from "./prisma";
import { calculateNextRun } from "./scheduler";
import { Prisma, ScrapeJob, ScrapeJobStatus } from "./generated/prisma";
import { emitJobUpdate } from "./scrapeJobEvents";

type PythonResolution = {
  bin: string;
  notes: string[];
};

function looksLikeActivationScript(candidate: string) {
  const lower = path.basename(candidate).toLowerCase();
  return lower.startsWith("activate") || lower === "activate.ps1" || lower === "activate.bat";
}

function resolvePythonBin(): PythonResolution {
  const notes: string[] = [];
  const candidates: Array<{ value: string | undefined; source: string }> = [
    { value: process.env.SCRAPE_WORKER_PYTHON, source: "SCRAPE_WORKER_PYTHON" },
    { value: process.env.PYTHON, source: "PYTHON" },
    { value: "python", source: "default" },
  ];

  for (const { value, source } of candidates) {
    if (!value) {
      notes.push(`${source} not set; skipping`);
      continue;
    }

    if (looksLikeActivationScript(value)) {
      notes.push(
        `${source} points to an activation script (${value}). Set it to the Python interpreter (e.g., ".venv-c4ai-v1/Script(s)/python.exe" or ".venv-c4ai-v1/bin/python").`
      );
      continue;
    }

    try {
      const stat = fs.statSync(value);
      if (stat.isDirectory()) {
        notes.push(`${source} points to a directory (${value}); expected the python executable.`);
        continue;
      }

      return { bin: value, notes };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${error}`;
      notes.push(`${source} candidate ${value} is not usable: ${message}`);
    }
  }

  return { bin: "python", notes };
}

const PYTHON_RESOLUTION = resolvePythonBin();
const PYTHON_BIN = PYTHON_RESOLUTION.bin;

if (PYTHON_RESOLUTION.notes.length) {
  console.info(
    `[scrapeRunner] Using python candidate "${PYTHON_BIN}". Notes: ${PYTHON_RESOLUTION.notes.join(" | ")}`
  );
} else {
  console.info(`[scrapeRunner] Using python candidate "${PYTHON_BIN}".`);
}
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
    const obj = args as Record<string, unknown>;
    const entries = Object.entries(obj);
    return entries.flatMap(([key, value]) => {
      if (key === "url" || key === "targetUrl") {
        return value === undefined || value === null
          ? ["--target-url"]
          : ["--target-url", `${value}`];
      }

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
  logStream.write(`Using python: ${PYTHON_BIN}\n`);
  if (PYTHON_RESOLUTION.notes.length) {
    PYTHON_RESOLUTION.notes.forEach((note) => logStream.write(`PYTHON_RESOLUTION: ${note}\n`));
  }

  let exitCode = -1;
  let missingCrawlDependency = false;

  try {
    const child = spawn(PYTHON_BIN, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });

    const handleChunk = (chunk: Buffer) => {
      logStream.write(chunk);
      const text = chunk.toString();
      if (
        text.toLowerCase().includes("crawl4ai is not available") ||
        text.toLowerCase().includes("no module named 'crawl4ai'")
      ) {
        missingCrawlDependency = true;
      }
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

  if (missingCrawlDependency && exitCode === 0) {
    exitCode = 1;
    logStream.write(
      "crawl4ai dependency missing in the selected interpreter. Install it in this environment and rerun.\n"
    );
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
