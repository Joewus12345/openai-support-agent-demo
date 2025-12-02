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
  autoRunManualWithNext = process.env.AUTO_RUN_MANUAL_WITH_NEXT === "true",
}: {
  cadence?: ScrapeJobCadence;
  now?: Date;
  autoRunManualWithNext?: boolean;
}) {
  const baseFilters: Prisma.ScrapeJobWhereInput = {
    paused: false,
    status: { notIn: [ScrapeJobStatus.running, ScrapeJobStatus.canceled] },
  };

  if (cadence === ScrapeJobCadence.manual && !autoRunManualWithNext) {
    return [] as const;
  }

  const branches: Prisma.ScrapeJobWhereInput[] = [];

  if (cadence) {
    branches.push({
      ...baseFilters,
      cadence,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    });
  } else {
    branches.push({
      ...baseFilters,
      cadence: { not: ScrapeJobCadence.manual },
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    });

    if (autoRunManualWithNext) {
      branches.push({
        ...baseFilters,
        cadence: ScrapeJobCadence.manual,
        nextRunAt: { not: null, lte: now },
      });
    }
  }

  const jobs = await prisma.scrapeJob.findMany({ where: { OR: branches } });

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
