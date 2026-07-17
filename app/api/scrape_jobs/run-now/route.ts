import { enqueueScheduledJobs, parseCadence } from "@/lib/scheduler";
import { AgentRole } from "@/lib/generated/prisma";
import { requireScrapeSession } from "../helpers";

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

export async function POST(request: Request) {
  const authResult = await requireScrapeSession(request, {
    role: AgentRole.admin,
    csrf: true,
  });
  if ("response" in authResult) return authResult.response;
  try {
    const { searchParams } = new URL(request.url);
    const cadenceParam = parseCadence(searchParams.get("schedule"));
    const autoRunManualWithNextOverride = parseBoolean(
      searchParams.get("autoRunManualWithNext")
    );
    const includeManualCadenceOverride = parseBoolean(
      searchParams.get("includeManualCadence")
    );

    const autoRunManualWithNext =
      autoRunManualWithNextOverride ??
      process.env.AUTO_RUN_MANUAL_WITH_NEXT === "true";
    const includeManualCadence = includeManualCadenceOverride ?? false;

    const queued = await enqueueScheduledJobs({
      accountId: authResult.accountId,
      cadence: cadenceParam,
      autoRunManualWithNext,
      includeManualCadence,
    });

    return new Response(
      JSON.stringify({
        queued: queued.length,
        cadence: cadenceParam ?? "all",
        autoRunManualWithNext,
        includeManualCadence,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error enqueuing scheduled scrape jobs:", error);
    return new Response("Error enqueuing jobs", { status: 500 });
  }
}

export const dynamic = "force-dynamic";
