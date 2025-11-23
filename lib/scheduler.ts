import prisma from "./prisma";
import { Prisma, ScrapeJobCadence, ScrapeJobStatus } from "./generated/prisma";

export function parseCadence(value: string | null): ScrapeJobCadence | undefined {
  if (!value) return undefined;
  return (Object.values(ScrapeJobCadence) as string[]).includes(value)
    ? (value as ScrapeJobCadence)
    : undefined;
}

export function calculateNextRun(
  cadence: ScrapeJobCadence,
  from: Date = new Date()
): Date | null {
  const next = new Date(from);

  switch (cadence) {
    case ScrapeJobCadence.daily:
      next.setDate(next.getDate() + 1);
      return next;
    case ScrapeJobCadence.weekly:
      next.setDate(next.getDate() + 7);
      return next;
    case ScrapeJobCadence.monthly:
      next.setMonth(next.getMonth() + 1);
      return next;
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
    status: { not: ScrapeJobStatus.running },
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
