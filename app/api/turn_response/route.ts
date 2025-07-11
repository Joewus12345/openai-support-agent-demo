import { NextResponse } from "next/server";
import { runRelevanceGuardrail, runJailbreakGuardrail } from "@/lib/guardrails";
import { getProvider } from "@/lib/providers";

export async function POST(request: Request) {
  try {
    const { messages, tools, provider } = await request.json();
    console.log("Received messages:", messages);

    const lastMessage =
      Array.isArray(messages) && messages.length > 0
        ? messages[messages.length - 1]
        : null;

    let userInput = "";
    let relevance = { tripwireTriggered: false };
    let jailbreak = { tripwireTriggered: false };

    if (lastMessage && lastMessage.role === "user") {
      const content = lastMessage.content;
      userInput = Array.isArray(content)
        ? content.join(" ")
        : String(content || "");
      relevance = await runRelevanceGuardrail({ input: userInput });
      jailbreak = await runJailbreakGuardrail({ input: userInput });
    }

    if (relevance.tripwireTriggered || jailbreak.tripwireTriggered) {
      return NextResponse.json(
        {
          message: "Sorry, I can't help with that request.",
        },
        { status: 400 }
      );
    }

    const providerFn = getProvider(provider);
    const events = providerFn(messages, tools);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const { event, data } of events) {
            const payload = JSON.stringify({ event, data });
            controller.enqueue(`data: ${payload}\n\n`);
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
