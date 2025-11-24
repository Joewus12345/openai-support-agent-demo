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
const KNOWLEDGE_BASE_DIR = path.join(process.cwd(), "public", "knowledge_base");
const SCRAPE_TIMEOUT_MS = (() => {
  const raw = process.env.SCRAPE_TIMEOUT_MS;
  const parsed = raw === undefined ? 2 * 60 * 60 * 1000 : Number(raw);
  return Number.isFinite(parsed) ? parsed : 2 * 60 * 60 * 1000;
})();
const SCRAPE_SKIP_DEP_CHECK = process.env.SCRAPE_SKIP_DEP_CHECK === "true";
const SCRAPE_AUTO_INSTALL_DEPS =
  process.env.SCRAPE_AUTO_INSTALL_DEPS !== "false";
const LOG_DIR = path.join(process.cwd(), "logs", "scrape_jobs");

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

async function installDependencies(
  pythonBin: string,
  env: NodeJS.ProcessEnv,
  logStream: fs.WriteStream
) {
  const requirementsPath = path.join(
    process.cwd(),
    "crawl4AI-agent-v2",
    "requirements.txt"
  );

  logStream.write(
    `[${new Date().toISOString()}] crawl4ai missing; attempting pip install from ${requirementsPath}.\n`
  );

  const installProc = spawn(
    pythonBin,
    ["-m", "pip", "install", "--user", "-r", requirementsPath],
    { env, cwd: process.cwd(), stdio: "pipe" }
  );

  const chunks: Buffer[] = [];
  return new Promise<{ ok: boolean; message?: string }>((resolve) => {
    installProc.stdout?.on("data", (chunk) => chunks.push(chunk));
    installProc.stderr?.on("data", (chunk) => chunks.push(chunk));

    installProc.on("error", (err) => {
      resolve({ ok: false, message: err.message });
    });

    installProc.on("close", (code) => {
      const output = Buffer.concat(chunks).toString();
      logStream.write(output);

      if (code === 0) {
        logStream.write(
          `[${new Date().toISOString()}] pip install completed successfully.\n`
        );
        resolve({ ok: true });
      } else {
        resolve({
          ok: false,
          message: `pip install exited with code ${code}. See above for output.`,
        });
      }
    });
  });
}

async function runDependencyCheck(pythonBin: string, logStream: fs.WriteStream) {
  const env = {
    ...process.env,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
  };

  const interpreterProbe = spawn(
    pythonBin,
    [
      "-c",
      [
        "import json, sys",
        "print(json.dumps({",
        "  'executable': sys.executable,",
        "  'version': sys.version,",
        "  'sys_path': sys.path,",
        "}, indent=2))",
      ].join("\n"),
    ],
    { env, cwd: process.cwd(), stdio: "pipe" }
  );

  const interpreterChunks: Buffer[] = [];
  interpreterProbe.stdout?.on("data", (chunk) => interpreterChunks.push(chunk));
  interpreterProbe.stderr?.on("data", (chunk) => interpreterChunks.push(chunk));

  const interpreterReady = new Promise<void>((resolve) => {
    interpreterProbe.on("close", (code) => {
      const output = interpreterChunks.length
        ? Buffer.concat(interpreterChunks).toString()
        : "(no interpreter details)";
      logStream.write(`Interpreter probe via ${pythonBin} (exit ${code ?? -1}):\n${output}\n`);
      resolve();
    });
  });

  if (SCRAPE_SKIP_DEP_CHECK) {
    logStream.write(
      "Skipping crawl4ai dependency check because SCRAPE_SKIP_DEP_CHECK=true (trusted interpreter).\n"
    );
    await interpreterReady;
    return { ok: true } as const;
  }

  const importProbe = spawn(pythonBin, ["-c", "import crawl4ai"], {
    env,
    cwd: process.cwd(),
    stdio: "pipe",
  });

  const chunks: Buffer[] = [];
  return new Promise<{ ok: boolean; message?: string }>((resolve) => {
    importProbe.stdout?.on("data", (chunk) => chunks.push(chunk));
    importProbe.stderr?.on("data", (chunk) => chunks.push(chunk));

    importProbe.on("error", (err) => {
      resolve({ ok: false, message: err.message });
    });

    importProbe.on("close", async (code) => {
      await interpreterReady;

      if (code === 0) {
        resolve({ ok: true });
        return;
      }

      const pipProbe = spawn(pythonBin, ["-m", "pip", "show", "crawl4ai"], {
        env,
        cwd: process.cwd(),
        stdio: "pipe",
      });
      const pipChunks: Buffer[] = [];

      pipProbe.stdout?.on("data", (chunk) => pipChunks.push(chunk));
      pipProbe.stderr?.on("data", (chunk) => pipChunks.push(chunk));

      pipProbe.on("close", async (pipCode) => {
        const baseMessage = chunks.length ? Buffer.concat(chunks).toString() : "import failed";
        const pipMessage = pipChunks.length ? Buffer.concat(pipChunks).toString() : "pip show returned no output";

        logStream.write(`crawl4ai import probe failed (exit ${code}). Output: ${baseMessage}\n`);
        logStream.write(`pip show crawl4ai (exit ${pipCode ?? -1}): ${pipMessage}\n`);

        if (pipCode !== 0 && SCRAPE_AUTO_INSTALL_DEPS) {
          const installResult = await installDependencies(pythonBin, env, logStream);
          if (!installResult.ok) {
            resolve({ ok: false, message: installResult.message });
            return;
          }

          const retry = spawn(pythonBin, ["-c", "import crawl4ai"], {
            env,
            cwd: process.cwd(),
            stdio: "ignore",
          });

          retry.on("close", (retryCode) => {
            if (retryCode === 0) {
              resolve({ ok: true });
            } else {
              resolve({
                ok: false,
                message:
                  "crawl4ai is still unavailable after auto-install. Check interpreter configuration.",
              });
            }
          });

          return;
        }

        resolve({ ok: false, message: `${baseMessage}\n${pipMessage}` });
      });
    });
  });
}

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
  await fs.promises.mkdir(KNOWLEDGE_BASE_DIR, { recursive: true }).catch(() => {});
  const logFilePath = job.logPath ?? path.join(LOG_DIR, `${job.id}.log`);
  const logStream = fs.createWriteStream(logFilePath, { flags: "a" });
  const startedAt = new Date();

  await updateJob(client, job.id, {
    status: ScrapeJobStatus.running,
    startedAt,
    finishedAt: null,
    logPath: logFilePath,
  });

  const args = ["-u", HARNESS_PATH, "--script", job.script, ...normalizeArgs(job.args)];
  logStream.write(`[${startedAt.toISOString()}] Starting job ${job.id} with script ${job.script}.\n`);
  logStream.write(`Using python: ${PYTHON_BIN}\n`);
  if (PYTHON_RESOLUTION.notes.length) {
    PYTHON_RESOLUTION.notes.forEach((note) => logStream.write(`PYTHON_RESOLUTION: ${note}\n`));
  }
  logStream.write(`Knowledge base output directory: ${KNOWLEDGE_BASE_DIR}\n`);
  logStream.write(`Timeout (ms): ${SCRAPE_TIMEOUT_MS}\n`);

  const depCheck = await runDependencyCheck(PYTHON_BIN, logStream);
  if (!depCheck.ok) {
    await markFailed(
      client,
      job,
      depCheck.message ?? "crawl4ai dependency check failed. Install crawl4ai in the selected interpreter.",
      logStream
    );
    return { exitCode: 1 };
  }

  let exitCode = -1;
  let missingCrawlDependency = false;

  try {
    const child = spawn(PYTHON_BIN, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
      },
    });

    let lastOutputAt = Date.now();
    let timeoutId: NodeJS.Timeout | null = null;
    const resetTimeout = () => {
      if (!Number.isFinite(SCRAPE_TIMEOUT_MS)) return;
      const remaining = SCRAPE_TIMEOUT_MS - (Date.now() - lastOutputAt);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        logStream.write(
          `[${new Date().toISOString()}] Timeout exceeded (${SCRAPE_TIMEOUT_MS} ms since last output). Terminating job ${job.id}.\n`
        );
        child.kill("SIGKILL");
      }, Math.max(1, remaining));
    };

    const heartbeat = setInterval(() => {
      logStream.write(`[${new Date().toISOString()}] heartbeat: job ${job.id} still running...\n`);
      emitJobUpdate({
        jobId: job.id,
        status: ScrapeJobStatus.running,
        startedAt: startedAt.toISOString(),
        logPath: logFilePath,
      });
    }, 60_000);

    const activityProbe = setInterval(() => {
      logStream.write(
        `[${new Date().toISOString()}] activity probe: last output ${(Date.now() - lastOutputAt) / 1000}s ago.\n`
      );
      resetTimeout();
    }, 30 * 60 * 1000);

    const handleChunk = (chunk: Buffer) => {
      lastOutputAt = Date.now();
      resetTimeout();
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

    resetTimeout();

    exitCode = await new Promise((resolve) => {
      child.on("close", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        clearInterval(heartbeat);
        clearInterval(activityProbe);
        resolve(code ?? -1);
      });
      child.on("error", (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        clearInterval(heartbeat);
        clearInterval(activityProbe);
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
