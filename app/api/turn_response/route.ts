import { NextResponse } from "next/server";
import { runRelevanceGuardrail, runJailbreakGuardrail } from "@/lib/guardrails";
import { getProvider } from "@/lib/providers";
import { saveSessionMessages } from "@/lib/server/saveSessionMessages";
import { toResponseMessage } from "@/lib/utils/toResponseMessage";
import { randomUUID } from "crypto";
import {
  RELEVANCE_FOLLOW_UP_MESSAGE,
  RELEVANCE_REJECTION_MESSAGE,
} from "@/config/guardrailMessages";
import { requireSession } from "@/lib/server/auth";
import { resolveAccountRuntimeConfig } from "@/lib/server/accountConfig";
import { describeProviderError } from "@/lib/providers/providerErrors";

function extractMessageText(message: any): string {
  if (!message) {
    return "";
  }
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        return "";
      })
      .join(" ")
      .trim();
  }
  return "";
}

/**
 * Handle a single conversation turn and stream the model response.
 * When a `session_id` is provided, messages are persisted using
 * `saveSessionMessages` so they can be retrieved later.
 */
export async function POST(request: Request) {
  const start = Date.now();
  try {
    const bodyPromise = request.json();
    const authResult = await requireSession(request, { csrfProtected: true });
    if ("response" in authResult) return authResult.response;
    const accountId = authResult.session.account?.id;
    if (!accountId) {
      return NextResponse.json({ error: "No account selected" }, { status: 409 });
    }
    const [body, accountConfig] = await Promise.all([
      bodyPromise,
      resolveAccountRuntimeConfig(accountId),
    ]);
    const {
      messages,
      tools,
      provider,
      model,
      session_id,
    } = body;
    const guardrailConfig = provider
      ? { ...accountConfig, CHATWOOT_WEBHOOK_PROVIDER: provider }
      : accountConfig;
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
    let guardrailInput = "";
    let relevance: Awaited<ReturnType<typeof runRelevanceGuardrail>> = {
      tripwireTriggered: false,
      outputInfo: {},
    };
    let jailbreak: Awaited<ReturnType<typeof runJailbreakGuardrail>> = {
      tripwireTriggered: false,
      outputInfo: {},
    };

    if (Array.isArray(normalizedMessages)) {
      const relevant = normalizedMessages
        .filter((m) => m.role !== "developer")
        .map((m) => ({
          role: m.role,
          content: Array.isArray(m.content)
            ? m.content.map((c: any) => c.text ?? "").join(" ")
            : String(m.content || ""),
        }));
      let recent = relevant.slice(-6);
      if (lastMessage && lastMessage.role === "user") {
        const content = lastMessage.content;
        userInput = Array.isArray(content)
          ? content.map((c: any) => c.text ?? "").join(" ")
          : String(content || "");
        recent = [...recent, { role: "user", content: userInput }];
      }
      guardrailInput = JSON.stringify(recent);
    }

    relevance = await runRelevanceGuardrail({ input: guardrailInput, config: guardrailConfig });
    console.log("Relevance guardrail result:", relevance);

    jailbreak = await runJailbreakGuardrail({ input: userInput, config: guardrailConfig });
    console.log("Jailbreak guardrail result:", jailbreak);

    const lastMessageIndex = normalizedMessages.lastIndexOf(lastMessage);
    let previousAssistantText = "";
    if (
      typeof lastMessageIndex === "number" &&
      lastMessageIndex > 0 &&
      lastMessage?.role === "user"
    ) {
      for (let index = lastMessageIndex - 1; index >= 0; index -= 1) {
        const candidate = normalizedMessages[index];
        if (candidate?.role === "assistant") {
          previousAssistantText = extractMessageText(candidate);
          break;
        }
      }
    }

    if (jailbreak.tripwireTriggered) {
      console.log("Guardrail triggered: jailbreak", {
        userInput,
        jailbreakOutput: jailbreak.outputInfo,
        relevanceOutput: relevance.outputInfo,
      });
      return NextResponse.json(
        { guardrail: true, message: RELEVANCE_REJECTION_MESSAGE },
        { status: 200 }
      );
    }

    if (relevance.tripwireTriggered) {
      const clarificationRequestedPreviously =
        previousAssistantText === RELEVANCE_FOLLOW_UP_MESSAGE;

      if (!clarificationRequestedPreviously) {
        console.log("Guardrail follow-up requested", {
          userInput,
          guardrailInput,
          relevanceOutput: relevance.outputInfo,
        });
        return NextResponse.json(
          { guardrail: true, message: RELEVANCE_FOLLOW_UP_MESSAGE },
          { status: 200 }
        );
      }

      console.log("Guardrail rejection after clarification", {
        userInput,
        guardrailInput,
        relevanceOutput: relevance.outputInfo,
      });
      return NextResponse.json(
        { guardrail: true, message: RELEVANCE_REJECTION_MESSAGE },
        { status: 200 }
      );
    }

    const providerName = provider || accountConfig.CHATWOOT_WEBHOOK_PROVIDER;
    const providerFn = getProvider(providerName);
    const events = providerFn(normalizedMessages, tools, {
      model,
      config: accountConfig,
    });

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
                accountId,
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
          const failure = describeProviderError(
            error,
            providerName === "openai" ? "OpenAI" : providerName
          );
          console.error("Provider stream failed", {
            accountId,
            provider: providerName,
            code: failure.code,
            error: failure.technicalMessage,
          });
          controller.enqueue(
            `data: ${JSON.stringify({
              event: "error",
              data: { message: failure.message, code: failure.code },
            })}\n\n`
          );
          controller.close();
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
    const failure = describeProviderError(error, "OpenAI");
    console.error("Turn request failed", {
      code: failure.code,
      error: failure.technicalMessage,
    });
    return NextResponse.json(
      {
        error: failure.message,
        code: failure.code,
      },
      { status: failure.status }
    );
  }
}
