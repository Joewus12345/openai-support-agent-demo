import { MODEL } from "@/config/constants";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { relevance_guardrail, jailbreak_guardrail } from "@/lib/guardrails";

export async function POST(request: Request) {
  try {
    const { messages, tools } = await request.json();
    console.log("Received messages:", messages);

    const openai = new OpenAI();

    const events = await openai.responses.create({
      model: MODEL,
      input: messages,
      tools,
      guardrails: [relevance_guardrail, jailbreak_guardrail],
      stream: true,
      include: ["file_search_call.results"],
      parallel_tool_calls: false,
    });

    const iterator = events[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.value && (first.value as any).tripwire_triggered) {
      return NextResponse.json(
        {
          message: "Sorry, I can't help with that request.",
        },
        { status: 400 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (!first.done) {
            const data = JSON.stringify({ event: first.value.type, data: first.value });
            controller.enqueue(`data: ${data}\n\n`);
          }
          for await (const event of iterator) {
            const data = JSON.stringify({ event: event.type, data: event });
            controller.enqueue(`data: ${data}\n\n`);
          }
          controller.close();
        } catch (error) {
          console.error("Error in streaming loop:", error);
          controller.error(error);
        }
      },
    });

    // Return the ReadableStream as SSE
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in POST handler:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
