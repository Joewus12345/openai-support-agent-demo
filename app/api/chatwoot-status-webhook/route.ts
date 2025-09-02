import { NextResponse } from "next/server";
import type {
  ChatwootEvent,
  Message,
  ConversationUpdatedPayload,
  ConversationStatusChangedPayload,
} from "@/types/chatwoot";
import { releaseAgent } from "@/lib/conversationResolution";
import { CONVO_LABELS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const incoming = await request.json();
    const payload: ChatwootEvent | { type?: string; [key: string]: any } =
      incoming.data ?? incoming;

    const event = "event" in payload ? payload.event : payload.type;
    const changedAttributes =
      "changed_attributes" in payload ? payload.changed_attributes : undefined;
    const message: Message | undefined =
      "message" in payload ? payload.message : undefined;
    console.info("chatwoot status webhook", {
      event,
      changed_attributes: changedAttributes,
    });

    const accountId =
      payload.account?.id ??
      payload.account_id ??
      message?.account?.id ??
      message?.account_id;
    const conversationId =
      payload.conversation?.id ??
      payload.conversation_id ??
      message?.conversation?.id ??
      message?.conversation_id;

    if (accountId === undefined || conversationId === undefined) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (event === "conversation_status_changed") {
      const { status, previous_status: previous } =
        payload as ConversationStatusChangedPayload;
      if (
        (status === "resolved" || status === "pending") &&
        status !== previous
      ) {
        try {
          await releaseAgent(accountId, conversationId, payload.conversation);
        } catch {
          return NextResponse.json(
            { error: "Agent availability update failed" },
            { status: 500 }
          );
        }
        return NextResponse.json({ status: "handled" });
      }
    } else if (event === "conversation_updated") {
      const { changed_attributes } =
        payload as ConversationUpdatedPayload;
      const changes = Object.assign({}, ...(changed_attributes ?? []));
      const status = changes?.status?.current_value;
      const labels = changes?.labels;
      if (
        status === "resolved" ||
        status === "pending" ||
        (Array.isArray(labels) && !labels.includes(CONVO_LABELS.assigned))
      ) {
        try {
          await releaseAgent(accountId, conversationId, payload.conversation);
        } catch {
          return NextResponse.json(
            { error: "Agent availability update failed" },
            { status: 500 }
          );
        }
        return NextResponse.json({ status: "handled" });
      }
    } else if (event === "message_created" && message) {
      const content = message.content;
      if (
        message.message_type === 2 &&
        typeof content === "string" &&
        content.startsWith("Conversation was marked")
      ) {
        console.info("chatwoot status webhook resolution message", {
          messageId: message.id,
          conversationId,
          content: message.content,
        });
        try {
          await releaseAgent(accountId, conversationId, payload.conversation);
        } catch {
          return NextResponse.json(
            { error: "Agent availability update failed" },
            { status: 500 }
          );
        }
        return NextResponse.json({ status: "handled" });
      }
    }

    return NextResponse.json({ status: "ignored" });
  } catch (error) {
    console.error("Chatwoot status webhook error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
