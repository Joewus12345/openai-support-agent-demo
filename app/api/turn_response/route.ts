import { NextResponse } from "next/server";
import { runRelevanceGuardrail, runJailbreakGuardrail } from "@/lib/guardrails";
import { getProvider } from "@/lib/providers";
import { saveSessionMessages } from "@/lib/server/saveSessionMessages";

/**
 * Handle a single conversation turn and stream the model response.
 * When a `session_id` is provided, messages are persisted using
 * `saveSessionMessages` so they can be retrieved later.
 */
export async function POST(request: Request) {
  const start = Date.now();
  try {
    const {
      messages,
      tools,
      provider,
      model,
      session_id,
      identifier,
    } = await request.json();
    console.log("Received messages:", messages);

    const lastMessage =
      Array.isArray(messages) && messages.length > 0
        ? messages[messages.length - 1]
        : null;

    let userInput = "";
    let conversationInput = "";
    let relevance = { tripwireTriggered: false };
    let jailbreak = { tripwireTriggered: false };

    if (Array.isArray(messages)) {
      conversationInput = messages
        .filter((m) => m.role !== "developer")
        .map((m) =>
          Array.isArray(m.content)
            ? m.content.map((c: any) => c.text ?? "").join(" ")
            : String(m.content || "")
        )
        .join(" ");
    }

    if (lastMessage && lastMessage.role === "user") {
      const content = lastMessage.content;
      userInput = Array.isArray(content)
        ? content.map((c: any) => c.text ?? "").join(" ")
        : String(content || "");

      const relevanceInput = conversationInput || userInput;
      relevance = await runRelevanceGuardrail({ input: relevanceInput });
      console.log("Relevance guardrail result:", relevance);

      jailbreak = await runJailbreakGuardrail({ input: userInput });
      console.log("Jailbreak guardrail result:", jailbreak);
    }

    if (relevance.tripwireTriggered || jailbreak.tripwireTriggered) {
      console.log("Guardrail triggered", {
        relevanceTriggered: relevance.tripwireTriggered,
        jailbreakTriggered: jailbreak.tripwireTriggered,
      });
      return NextResponse.json(
        {
          guardrail: true,
          message: "Sorry, I can't help with that request.",
        },
        { status: 200 }
      );
    }

    const providerFn = getProvider(provider);
    const events = providerFn(messages, tools, { model });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let first = true;
          let assistantText = "";
          for await (const { event, data } of events) {
            if (first) {
              first = false;
              console.log("Model response latency:", Date.now() - start, "ms");
            }

            if (
              event === "response.output_text.delta" &&
              typeof data?.delta === "string"
            ) {
              assistantText += data.delta;
            }

            const payload = JSON.stringify({ event, data });
            controller.enqueue(`data: ${payload}\n\n`);
          }

          console.log("Total response time:", Date.now() - start, "ms");
          controller.close();

          if (session_id && lastMessage) {
            try {
              const assistantMessage = {
                role: "assistant",
                content: assistantText,
              } as any;
              const result = await saveSessionMessages(
                session_id,
                [lastMessage, assistantMessage],
                identifier
              );
              if (result && "error" in result) {
                console.error("Error saving session messages:", result.error);
              }
            } catch (err) {
              console.error("Error saving session messages:", err);
            }
          }
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
