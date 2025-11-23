import { parseCadence } from "@/lib/scheduler";
import prisma from "@/lib/prisma";
import { Prisma, ScrapeJobStatus } from "@/lib/generated/prisma";

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseStatus(value: unknown): ScrapeJobStatus | undefined {
  if (typeof value !== "string") return undefined;
  return (Object.values(ScrapeJobStatus) as string[]).includes(value)
    ? (value as ScrapeJobStatus)
    : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await prisma.scrapeJob.findUnique({ where: { id } });
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(job), { status: 200 });
  } catch (error) {
    console.error("Error fetching scrape job:", error);
    return new Response("Error fetching job", { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "No data provided" }), {
        status: 400,
      });
    }

    const data: Prisma.ScrapeJobUpdateInput = {};
    if (body.script) data.script = body.script;
    if (body.args !== undefined) data.args = body.args;
    const cadence = parseCadence(body.cadence);
    if (cadence) data.cadence = cadence;
    const paused = parseBoolean(body.paused);
    if (paused !== undefined) data.paused = paused;

    const status = parseStatus(body.status);
    if (status) data.status = status;

    if (body.logPath !== undefined) data.logPath = body.logPath;

    if (body.startedAt !== undefined) data.startedAt = parseDate(body.startedAt);
    if (body.finishedAt !== undefined) data.finishedAt = parseDate(body.finishedAt);
    if (body.nextRunAt !== undefined) data.nextRunAt = parseDate(body.nextRunAt);

    try {
      const job = await prisma.scrapeJob.update({ where: { id }, data });
      return new Response(JSON.stringify(job), { status: 200 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Error updating scrape job:", error);
    return new Response("Error updating job", { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    try {
      await prisma.scrapeJob.delete({ where: { id } });
      return new Response(null, { status: 204 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Error deleting scrape job:", error);
    return new Response("Error deleting job", { status: 500 });
  }
}
