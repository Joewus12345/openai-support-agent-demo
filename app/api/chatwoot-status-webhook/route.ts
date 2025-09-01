import { NextResponse } from "next/server";
import type { ChatwootEvent, Conversation, Message } from "@/types/chatwoot";
import { releaseAgent } from "@/lib/conversationResolution";

export async function POST(request: Request) {
  try {
    const incoming = (await request.json()) as any;
    const payload: ChatwootEvent = incoming.data ?? incoming;

    const event = incoming.event;
    const changedAttributes = (payload as any)?.changed_attributes;
    const message: Message | undefined = (payload as any)?.message;
    console.info("chatwoot status webhook", {
      event,
      changed_attributes: changedAttributes,
    });

    let shouldRelease = false;

    if (event === "conversation_updated") {
      const status = changedAttributes?.status?.current_value;
      if (status === "resolved" || status === "pending") {
        shouldRelease = true;
      } else {
        return NextResponse.json({ status: "ignored" });
      }
    } else if (event === "message_created") {
      const content = message?.content;
      if (
        (message as any)?.message_type === 2 &&
        typeof content === "string" &&
        (content.startsWith("Conversation was marked resolved") ||
          content.startsWith("Conversation was marked pending"))
      ) {
        const convoId =
          (message as any)?.conversation_id ??
          (payload as any)?.conversation_id;
        console.info("chatwoot status webhook resolution message", {
          messageId: message?.id,
          conversationId: convoId,
          content,
        });
        shouldRelease = true;
      } else {
        return NextResponse.json({ status: "ignored" });
      }
    } else {
      return NextResponse.json({ status: "ignored" });
    }

    const conversation: Conversation | undefined =
      payload.conversation || message?.conversation;
    const accountId =
      payload.account?.id ??
      (payload as any)?.account_id ??
      message?.account?.id ??
      (message as any)?.account_id;
    const conversationId =
      conversation?.id ??
      (payload as any)?.conversation_id ??
      (message as any)?.conversation_id;

    if (accountId === undefined || conversationId === undefined) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!shouldRelease) {
      return NextResponse.json({ status: "ignored" });
    }

    try {
      await releaseAgent(accountId, conversationId, conversation);
    } catch {
      return NextResponse.json(
        { error: "Agent availability update failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "handled" });
  } catch (error) {
    console.error("Chatwoot status webhook error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
