import cron from "node-cron";

import { enqueueScheduledJobs } from "@/lib/scheduler";
import { ScrapeJobCadence } from "@/lib/generated/prisma";

const TIMEZONE = process.env.SCHEDULER_TIMEZONE;

async function runCadence(cadence: ScrapeJobCadence) {
  try {
    const queued = await enqueueScheduledJobs({ cadence });
    if (queued.length > 0) {
      console.log(`Queued ${queued.length} ${cadence} scrape job(s).`);
    }
  } catch (error) {
    console.error(`Failed to enqueue ${cadence} scrape jobs:`, error);
  }
}

function scheduleCadence(cronExpression: string, cadence: ScrapeJobCadence) {
  cron.schedule(
    cronExpression,
    () => {
      void runCadence(cadence);
    },
    { timezone: TIMEZONE ?? undefined }
  );
}

async function main() {
  // Catch up once on startup.
  await runCadence(ScrapeJobCadence.daily);
  await runCadence(ScrapeJobCadence.weekly);
  await runCadence(ScrapeJobCadence.monthly);

  scheduleCadence("0 0 * * *", ScrapeJobCadence.daily); // Midnight daily
  scheduleCadence("0 0 * * 0", ScrapeJobCadence.weekly); // Midnight Sunday
  scheduleCadence("0 0 1 * *", ScrapeJobCadence.monthly); // Midnight on the 1st
}

main().catch((error) => {
  console.error("Scheduler worker crashed:", error);
  process.exit(1);
});
