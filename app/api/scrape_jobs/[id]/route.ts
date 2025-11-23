import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { ScrapeJobStatus } from "@/lib/generated/prisma";
import {
  buildJobStats,
  ensureAuthenticated,
  readJobLog,
  readLatestBenchmark,
  serializeJob,
} from "../helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await serializeJob(id);

    if (!result) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching scrape job:", error);
    return NextResponse.json({ error: "Error fetching job" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = ensureAuthenticated(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const job = await prisma.scrapeJob.update({
      where: { id },
      data: {
        status: ScrapeJobStatus.queued,
        startedAt: null,
        finishedAt: null,
      },
    });

    const benchmark = await readLatestBenchmark(job.script);
    const log = await readJobLog(job.logPath);

    return NextResponse.json({
      job,
      log,
      stats: buildJobStats(job.status, benchmark),
    });
  } catch (error) {
    console.error("Error enqueuing scrape job:", error);
    return NextResponse.json({ error: "Error enqueuing job" }, { status: 500 });
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
    const job = await prisma.scrapeJob.update({
      where: { id },
      data: {
        status: ScrapeJobStatus.failed,
        paused: true,
        finishedAt: new Date(),
      },
    });

    const benchmark = await readLatestBenchmark(job.script);
    const log = await readJobLog(job.logPath);

    return NextResponse.json({
      job,
      log,
      stats: buildJobStats(job.status, benchmark),
    });
  } catch (error) {
    console.error("Error cancelling scrape job:", error);
    return NextResponse.json({ error: "Error cancelling job" }, { status: 500 });
  }
}
