import prisma from "@/lib/prisma";
import { Prisma, ScrapeJobStatus } from "@/lib/generated/prisma";

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get("status"));

    const jobs = await prisma.scrapeJob.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return new Response(JSON.stringify(jobs), { status: 200 });
  } catch (error) {
    console.error("Error listing scrape jobs:", error);
    return new Response("Error listing jobs", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.script) {
      return new Response(JSON.stringify({ error: "script is required" }), {
        status: 400,
      });
    }

    const status = parseStatus(body.status ?? null) ?? ScrapeJobStatus.queued;
    const nextRunAt = parseDate(body.nextRunAt);

    const data: Prisma.ScrapeJobCreateInput = {
      script: body.script,
      args: body.args ?? {},
      status,
      logPath: body.logPath ?? null,
      nextRunAt,
    };

    const job = await prisma.scrapeJob.create({ data });
    return new Response(JSON.stringify(job), { status: 201 });
  } catch (error) {
    console.error("Error creating scrape job:", error);
    return new Response("Error creating job", { status: 500 });
  }
}
