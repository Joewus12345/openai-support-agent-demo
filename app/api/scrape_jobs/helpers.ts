import fs from "fs/promises";
import path from "path";
import prisma from "../../../lib/prisma";
import { ScrapeJobStatus } from "../../../lib/generated/prisma";

const BENCHMARK_DIR = path.join(
  process.cwd(),
  "crawl4AI-agent",
  "crawl4AI-examples",
  "output",
  "benchmarks"
);

export async function readLatestBenchmark(script: string) {
  try {
    const entries = await fs.readdir(BENCHMARK_DIR);
    const candidates = entries
      .filter((name) => name.startsWith("benchmarks_") && name.endsWith(".json"))
      .map((name) => path.join(BENCHMARK_DIR, name));

    if (candidates.length === 0) return null;

    const withStats = await Promise.all(
      candidates.map(async (filePath) => {
        const stats = await fs.stat(filePath);
        return { filePath, mtimeMs: stats.mtimeMs };
      })
    );

    const latest = withStats.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    const raw = await fs.readFile(latest.filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return null;

    return (
      parsed.find(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry.script === script || entry.script_path?.includes(script))
      ) ?? null
    );
  } catch (error) {
    console.warn("Unable to read benchmark results for scrape job", error);
    return null;
  }
}

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

export function buildJobStats(jobStatus: ScrapeJobStatus, benchmark: any | null) {
  return {
    status: jobStatus,
    durationSeconds:
      typeof benchmark?.duration_seconds === "number"
        ? benchmark.duration_seconds
        : null,
    documentsIngested:
      typeof benchmark?.total_output_files === "number"
        ? benchmark.total_output_files
        : typeof benchmark?.urls_processed === "number"
          ? benchmark.urls_processed
          : null,
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

  const benchmark = await readLatestBenchmark(job.script);
  const log = await readJobLog(job.logPath);

  return {
    job,
    log,
    stats: buildJobStats(job.status, benchmark),
  };
}

export type SerializedScrapeJob = NonNullable<Awaited<ReturnType<typeof serializeJob>>>;
