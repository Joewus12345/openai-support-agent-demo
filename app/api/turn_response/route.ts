import { NextResponse } from "next/server";
import { runRelevanceGuardrail, runJailbreakGuardrail } from "@/lib/guardrails";
import { getProvider } from "@/lib/providers";
import { saveSessionMessages } from "@/lib/server/saveSessionMessages";
import { toResponseMessage } from "@/lib/utils/toResponseMessage";
import { randomUUID } from "crypto";

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
    } = await request.json();
    console.log("Received messages:", messages);

    const normalizedMessages = Array.isArray(messages)
      ? messages.map((m: any) => {
          if (m?.type === "message") {
            return m.role === "user" && typeof m.content === "string"
              ? toResponseMessage(m.role, m.content)
              : { role: m.role, content: m.content };
          }
          return m;
        })
      : [];

    const lastMessage =
      normalizedMessages.length > 0
        ? normalizedMessages[normalizedMessages.length - 1]
        : null;

    let userInput = "";
    let conversationInput = "";
    let relevance = { tripwireTriggered: false };
    let jailbreak = { tripwireTriggered: false };

    if (Array.isArray(normalizedMessages)) {
      conversationInput = normalizedMessages
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
    }

    relevance = await runRelevanceGuardrail({ input: conversationInput });
    console.log("Relevance guardrail result:", relevance);

    jailbreak = await runJailbreakGuardrail({ input: userInput });
    console.log("Jailbreak guardrail result:", jailbreak);

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
    const events = providerFn(normalizedMessages, tools, { model });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let first = true;
          let assistantText = "";
          const functionCalls: {
            id: string;
            name: string;
            arguments: string;
          }[] = [];
          const callMap = new Map<string, {
            id: string;
            name: string;
            arguments: string;
          }>();
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

            if (event === "response.output_item.added" && data?.item?.type === "function_call") {
              const id = randomUUID();
              const call = {
                id,
                name: data.item.name || "",
                arguments: "",
              };
              functionCalls.push(call);
              callMap.set(data.item.id, call);
            }

            if (event.startsWith("response.function_call")) {
              const itemId = data?.item_id || data?.id;
              let call = itemId ? callMap.get(itemId) : undefined;
              if (!call) {
                const id = randomUUID();
                call = { id, name: "", arguments: "" };
                functionCalls.push(call);
                if (itemId) callMap.set(itemId, call);
              }

              if (
                event.endsWith("name.delta") &&
                typeof data?.delta === "string"
              ) {
                call.name += data.delta;
              } else if (
                event.endsWith("name.done") &&
                typeof data?.name === "string"
              ) {
                call.name = data.name;
              } else if (
                event.endsWith("arguments.delta") &&
                typeof data?.delta === "string"
              ) {
                call.arguments += data.delta;
              } else if (
                event.endsWith("arguments.done") &&
                typeof data?.arguments === "string"
              ) {
                call.arguments = data.arguments;
              }
            }

            if (event === "response.output_item.done" && data?.item?.type === "function_call") {
              const itemId = data.item.id;
              let call = callMap.get(itemId);
              if (!call) {
                const id = randomUUID();
                call = {
                  id,
                  name: data.item.name || "",
                  arguments: data.item.arguments || "",
                };
                functionCalls.push(call);
                callMap.set(itemId, call);
              } else {
                call.name = data.item.name || call.name;
                call.arguments = data.item.arguments || call.arguments;
              }
            }

            const payload = JSON.stringify({ event, data });
            controller.enqueue(`data: ${payload}\n\n`);
          }

          console.log("Total response time:", Date.now() - start, "ms");
          controller.close();

          if (session_id && lastMessage) {
            try {
              const assistantMessage: any = {
                role: "assistant",
                content: [{ type: "output_text", text: assistantText }],
              };
              if (functionCalls.length > 0) {
                assistantMessage.tool_calls = functionCalls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: {
                    name: c.name,
                    arguments: c.arguments,
                  },
                }));
              }
              const result = await saveSessionMessages(
                session_id,
                [lastMessage, assistantMessage]
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
