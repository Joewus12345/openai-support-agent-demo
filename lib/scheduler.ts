import prisma from "./prisma";
import { Prisma, ScrapeJobCadence, ScrapeJobStatus } from "./generated/prisma";

export function parseCadence(value: string | null): ScrapeJobCadence | undefined {
  if (!value) return undefined;
  return (Object.values(ScrapeJobCadence) as string[]).includes(value)
    ? (value as ScrapeJobCadence)
    : undefined;
}

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function calculateNextRun(
  cadence: ScrapeJobCadence,
  from: Date = new Date()
): Date | null {
  const start = startOfDay(from);

  switch (cadence) {
    case ScrapeJobCadence.daily: {
      start.setDate(start.getDate() + 1);
      return start;
    }
    case ScrapeJobCadence.weekly: {
      // Advance to the start of the next week (Sunday-based) at midnight.
      const daysUntilNextWeek = 7 - start.getDay() || 7;
      start.setDate(start.getDate() + daysUntilNextWeek);
      return start;
    }
    case ScrapeJobCadence.monthly: {
      // Advance to the first day of the next month at midnight.
      start.setMonth(start.getMonth() + 1, 1);
      return start;
    }
    default:
      return null;
  }
}

export async function enqueueScheduledJobs({
  cadence,
  now = new Date(),
}: {
  cadence?: ScrapeJobCadence;
  now?: Date;
}) {
  const where: Prisma.ScrapeJobWhereInput = {
    paused: false,
    status: { notIn: [ScrapeJobStatus.running, ScrapeJobStatus.canceled] },
    OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
  };

  if (cadence) {
    where.cadence = cadence;
  } else {
    where.cadence = { not: ScrapeJobCadence.manual };
  }

  const jobs = await prisma.scrapeJob.findMany({ where });

  if (jobs.length === 0) return [] as const;

  const updates = jobs.map((job) =>
    prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: ScrapeJobStatus.queued,
        startedAt: null,
        finishedAt: null,
      },
    })
  );

  return prisma.$transaction(updates);
}
