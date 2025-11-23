import { enqueueScheduledJobs, parseCadence } from "@/lib/scheduler";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cadenceParam = parseCadence(searchParams.get("schedule"));

    const queued = await enqueueScheduledJobs({ cadence: cadenceParam });

    return new Response(
      JSON.stringify({
        queued: queued.length,
        cadence: cadenceParam ?? "all",
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error enqueuing scheduled scrape jobs:", error);
    return new Response("Error enqueuing jobs", { status: 500 });
  }
}

export const dynamic = "force-dynamic";
