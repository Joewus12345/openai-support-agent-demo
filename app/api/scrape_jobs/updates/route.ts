import { NextResponse } from "next/server";

import { onJobUpdate } from "@/lib/scrapeJobEvents";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const unsubscribe = onJobUpdate((update) => {
        send(update);
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
      }, 30000);

      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
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
