import { NextResponse } from "next/server";
import type {
  ChatwootEvent,
  Conversation,
  Message,
  ConversationUpdatedPayload,
  ConversationStatusChangedPayload,
} from "@/types/chatwoot";
import { releaseAgent } from "@/lib/conversationResolution";
import { CONVO_LABELS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const incoming = await request.json();
    const payload: ChatwootEvent = incoming.data ?? incoming;

    const event = payload.event ?? payload.type;
    const changedAttributes =
      "changed_attributes" in payload ? payload.changed_attributes : undefined;
    const message: Message | undefined =
      "message" in payload ? payload.message : undefined;
    console.info("chatwoot status webhook", {
      event,
      changed_attributes: changedAttributes,
    });

    let shouldRelease = false;

    if (event === "conversation_status_changed") {
      const { status, previous_status: previous } =
        payload as ConversationStatusChangedPayload;
      if (
        (status === "resolved" || status === "pending") &&
        status !== previous
      ) {
        shouldRelease = true;
      }
    } else if (event === "conversation_updated") {
      const { changed_attributes } =
        payload as ConversationUpdatedPayload;
      const changes = Object.assign({}, ...(changed_attributes ?? []));
      const status = changes?.status?.current_value;
      const labels = changes?.labels;
      if (status === "resolved" || status === "pending") {
        shouldRelease = true;
      } else if (
        Array.isArray(labels) &&
        !labels.includes(CONVO_LABELS.assigned)
      ) {
        shouldRelease = true;
      }
    } else if (event === "message_created" && message) {
      const content = message.content;
      if (
        message.message_type === 2 &&
        typeof content === "string" &&
        content.startsWith("Conversation was marked")
      ) {
        shouldRelease = true;
      }
    }

    const conversation: Conversation | undefined =
      payload.conversation || message?.conversation;
    const accountId =
      payload.account?.id ??
      payload.account_id ??
      message?.account?.id ??
      message?.account_id;
    const conversationId =
      conversation?.id ??
      payload.conversation_id ??
      message?.conversation_id;

    if (accountId === undefined || conversationId === undefined) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!shouldRelease) {
      return NextResponse.json({ status: "ignored" });
    }

    if (event === "message_created" && message) {
      console.info("chatwoot status webhook resolution message", {
        messageId: message.id,
        conversationId,
        content: message.content,
      });
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
