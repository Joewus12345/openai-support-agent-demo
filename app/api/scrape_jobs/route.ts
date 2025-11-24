import { calculateNextRun, parseCadence } from "@/lib/scheduler";
import prisma from "@/lib/prisma";
import {
  Prisma,
  ScrapeJobCadence,
  ScrapeJobStatus,
} from "@/lib/generated/prisma";
import { ensureAuthenticated, serializeJob } from "./helpers";
import { triggerScrapeJob } from "@/lib/scrapeRunner";

function parseStatus(value: string | null): ScrapeJobStatus | undefined {
  if (!value) return undefined;
  return (Object.values(ScrapeJobStatus) as string[]).includes(value)
    ? (value as ScrapeJobStatus)
    : undefined;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get("status"));
    const includeDetails = searchParams.get("detailed") === "true";

    const jobs = await prisma.scrapeJob.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
    });

    if (includeDetails) {
      const detailed = await Promise.all(jobs.map((job) => serializeJob(job.id)));
      const filtered = detailed.filter(Boolean);
      return new Response(JSON.stringify(filtered), { status: 200 });
    }

    return new Response(JSON.stringify(jobs), { status: 200 });
  } catch (error) {
    console.error("Error listing scrape jobs:", error);
    return new Response("Error listing jobs", { status: 500 });
  }
}

export async function POST(request: Request) {
  const unauthorized = ensureAuthenticated(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.script) {
      return new Response(JSON.stringify({ error: "script is required" }), {
        status: 400,
      });
    }

    const status = parseStatus(body.status ?? null) ?? ScrapeJobStatus.queued;
    const cadence = parseCadence(body.cadence) ?? ScrapeJobCadence.manual;
    const paused = parseBoolean(body.paused) ?? false;
    const nextRunAt = parseDate(body.nextRunAt) ?? calculateNextRun(cadence);

    const data: Prisma.ScrapeJobCreateInput = {
      script: body.script,
      args: body.args ?? {},
      status,
      logPath: body.logPath ?? null,
      cadence,
      paused,
      nextRunAt,
    };

    const job = await prisma.scrapeJob.create({ data });

    void triggerScrapeJob(job.id);

    return new Response(
      JSON.stringify({
        job,
        ticket: job.id,
      }),
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating scrape job:", error);
    return new Response("Error creating job", { status: 500 });
  }
}
