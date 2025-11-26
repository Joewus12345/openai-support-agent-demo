import { Prisma, ScrapeJobStatus } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { calculateNextRun } from "@/lib/scheduler";
import { ensureAuthenticated, serializeJob } from "../helpers";

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await serializeJob(id);
  if (!job) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(JSON.stringify(job), { status: 200 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = ensureAuthenticated(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const paused = parseBoolean(body.paused);
    const nextRunAt = parseDate(body.nextRunAt);

    const existing = await prisma.scrapeJob.findUnique({ where: { id } });
    if (!existing) {
      return new Response(JSON.stringify({ error: "Job not found" }), { status: 404 });
    }

    const data: Prisma.ScrapeJobUpdateInput = {};

    if (paused !== undefined) {
      data.paused = paused;
      if (!paused) {
        data.nextRunAt = nextRunAt ?? calculateNextRun(existing.cadence);
      } else if (nextRunAt !== undefined) {
        data.nextRunAt = nextRunAt;
      } else {
        data.nextRunAt = null;
      }
    } else if (nextRunAt !== undefined) {
      data.nextRunAt = nextRunAt;
    }

    if (Object.keys(data).length === 0) {
      return new Response(JSON.stringify({ error: "No fields to update" }), {
        status: 400,
      });
    }

    const job = await prisma.scrapeJob.update({ where: { id }, data });
    return new Response(JSON.stringify(job), { status: 200 });
  } catch (error) {
    console.error("Error updating scrape job:", error);
    return new Response("Error updating job", { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = ensureAuthenticated(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;

    const finishedAt = new Date();

    try {
      const job = await prisma.scrapeJob.update({
        where: { id },
        data: {
          status: ScrapeJobStatus.canceled,
          paused: false,
          finishedAt,
          nextRunAt: null,
          progress: 100,
        },
      });

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
    console.error("Error deleting scrape job:", error);
    return new Response("Error deleting job", { status: 500 });
  }
}
