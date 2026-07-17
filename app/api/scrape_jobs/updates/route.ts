import { NextResponse } from "next/server";

import { onJobUpdate } from "@/lib/scrapeJobEvents";
import { requireScrapeSession } from "../helpers";
import { AgentRole } from "@/lib/generated/prisma";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  const authResult = await requireScrapeSession(request, { role: AgentRole.agent });
  if ("response" in authResult) return authResult.response;
  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: () => void = () => {};

      const abortHandler = () => {
        cleanup?.();
      };

      cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", abortHandler);
      };

      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          cleanup?.();
        }
      };

      unsubscribe = onJobUpdate((update) => {
        if (update.accountId === authResult.accountId) send(update);
      });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
        } catch {
          cleanup?.();
        }
      }, 30000);

      request.signal.addEventListener("abort", abortHandler);

      return cleanup;
    },

    cancel() {
      cleanup?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
