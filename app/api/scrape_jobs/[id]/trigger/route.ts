import prisma from "@/lib/prisma";
import { Prisma, ScrapeJobStatus } from "@/lib/generated/prisma";

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const nextRunAt = parseDate(body.nextRunAt);

    try {
      const job = await prisma.scrapeJob.update({
        where: { id },
        data: {
          status: ScrapeJobStatus.queued,
          startedAt: null,
          finishedAt: null,
          paused: false,
          nextRunAt,
          progress: 0,
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
    console.error("Error triggering scrape job:", error);
    return new Response("Error triggering job", { status: 500 });
  }
}
