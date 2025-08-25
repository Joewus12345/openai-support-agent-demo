import { NextResponse } from "next/server";
import type { ChatwootEvent, Message, Conversation } from "@/types/chatwoot";

export async function POST(request: Request) {
  try {
    const incoming = (await request.json()) as any;
    const payload: ChatwootEvent = incoming.data ?? incoming;

    if (incoming.event !== "message_created") {
      return NextResponse.json({ status: "ignored" });
    }

    const message: Message | undefined = payload.message || (payload as Message);
    const messageType = message?.message_type || message?.type;
    if (messageType !== "incoming") {
      return NextResponse.json({ status: "ignored" });
    }

    const conversation: Conversation | undefined =
      message?.conversation || payload.conversation;
    const accountId =
      payload.account?.id ??
      message?.account?.id ??
      (message as any)?.account_id ??
      (payload as any)?.account_id;
    const conversationId =
      conversation?.id ??
      (message as any)?.conversation_id ??
      (payload as any)?.conversation_id;
    const inboxId =
      (conversation as any)?.inbox_id ??
      (message as any)?.inbox_id ??
      (payload as any)?.inbox_id;
    const content = message?.content;

    if (
      accountId === undefined ||
      conversationId === undefined ||
      inboxId === undefined ||
      !content
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    return NextResponse.json({
      accountId,
      conversationId,
      inboxId,
      content,
    });
  } catch (error) {
    console.error("Chatwoot webhook error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

