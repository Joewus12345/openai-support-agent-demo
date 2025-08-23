import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { INBOX_MODE } from "@/config/inboxMode";
import type {
  ChatwootEvent,
  Conversation,
  Message,
} from "@/types/chatwoot";

const CHATWOOT_URL = process.env.CHATWOOT_URL;
const CHATWOOT_APP_TOKEN = process.env.CHATWOOT_APP_TOKEN;

/**
 * Handle Chatwoot webhook payloads and generate automated replies.
 * Expects CHATWOOT_URL and CHATWOOT_APP_TOKEN env vars.
 */
export async function POST(request: Request) {
  try {
    const incomingEvent = (await request.json()) as any;
    const payload: ChatwootEvent = incomingEvent.data ?? incomingEvent;
    const inboxId: number | undefined =
      incomingEvent.data?.conversation?.inbox_id;
    const mode =
      inboxId !== undefined ? INBOX_MODE[inboxId] ?? "suggest" : "suggest";

    const message: Message = payload.message || (payload as Message);
    const messageType = message.message_type || message.type;
    if (messageType && messageType !== "incoming") {
      return NextResponse.json({ status: "ignored" });
    }

    const content = message.content;
    const conversation: Conversation =
      message.conversation || payload.conversation!;
    const account =
      message.account || payload.account || conversation?.account;

    if (!content || !conversation || !account) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: content }],
      },
    ];

    const providerFn = getProvider(process.env.LLM_PROVIDER);
    const events = providerFn(messages, undefined, {
      model: process.env.OPENAI_MODEL,
    });

    let assistantText = "";
    for await (const { event, data } of events) {
      if (event === "response.output_text.delta" && typeof data?.delta === "string") {
        assistantText += data.delta;
      }
    }

    if (!CHATWOOT_URL || !CHATWOOT_APP_TOKEN) {
      console.error("CHATWOOT_URL or CHATWOOT_APP_TOKEN not set");
      return NextResponse.json(
        { error: "Chatwoot not configured" },
        { status: 500 }
      );
    }

    const accountId = account.id || account.account_id;
    const conversationId = conversation.id;

    const chatwootRes = await fetch(
      `${CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_access_token: CHATWOOT_APP_TOKEN,
        },
        body: JSON.stringify(
          mode === "auto"
            ? { content: assistantText }
            : { content: assistantText, private: true }
        ),
      }
    );

    if (!chatwootRes.ok) {
      const text = await chatwootRes.text();
      console.error("Failed to post Chatwoot reply", chatwootRes.status, text);
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Chatwoot webhook error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

