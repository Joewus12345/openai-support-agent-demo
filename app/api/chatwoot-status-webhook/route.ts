import { NextResponse } from "next/server";
import type {
  ChatwootEvent,
  Message,
  ConversationStatusChangedPayload,
  ConversationUpdatedPayload,
} from "@/types/chatwoot";
import { releaseAgent } from "@/lib/conversationResolution";
import { CONVO_LABELS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const incoming = await request.json();
    // Merge Chatwoot's structured payload with any extra fields we might receive
    const payload = (incoming.data ?? incoming) as
      Partial<ChatwootEvent> & Record<string, any>;

    // Chatwoot may send either `event` or `type`; fall back accordingly
    const event = payload.event ?? payload.type;
    const message: Message | undefined = payload.message;

    const accountId: number | undefined =
      payload.account_id ??
      payload.account?.id ??
      payload.conversation?.account_id ??
      payload.meta?.assignee?.account_id ??
      payload.messages?.[0]?.account_id ??
      payload.message?.account_id ??
      payload.message?.account?.id ??
      payload.message?.conversation?.account_id ??
      payload.message?.conversation?.account?.id;

    const conversationId: number | undefined =
      payload.id ??
      payload.conversation?.id ??
      payload.messages?.[0]?.conversation_id ??
      payload.message?.conversation_id ??
      payload.message?.conversation?.id;

    if (accountId === undefined) {
      console.warn("chatwoot status webhook missing account ID", payload);
      return NextResponse.json({ status: "ignored" });
    }

    if (conversationId === undefined) {
      console.warn("chatwoot status webhook missing conversation ID", payload);
      return NextResponse.json({ status: "ignored" });
    }

    if (event === "conversation_status_changed") {
      const typedPayload = payload as ConversationStatusChangedPayload;
      const { status, previous_status: previous } = typedPayload;
      console.info("chatwoot status webhook status change", {
        event,
        conversationId,
        status,
        previous_status: previous,
      });
      if (previous === "open" && status !== "open") {
        try {
          await releaseAgent(
            accountId,
            conversationId,
            typedPayload.conversation
          );
        } catch {
          return NextResponse.json(
            { error: "Agent availability update failed" },
            { status: 500 }
          );
        }
        return NextResponse.json({ status: "handled" });
      }
    } else if (event === "conversation_updated") {
      const typedPayload = payload as ConversationUpdatedPayload;
      console.info("chatwoot status webhook conversation update", {
        event,
        conversationId,
        changed_attributes: typedPayload.changed_attributes,
      });
      const changes = Object.assign(
        {},
        ...(typedPayload.changed_attributes || [])
      );
      console.info("chatwoot status webhook changes", {
        event,
        conversationId,
        changes,
      });
      const statusCurrent = changes.status?.current_value as
        | string
        | undefined;
      const labelListChange =
        changes.label_list ?? changes.cached_label_list;
      const labelsCurrent = Array.isArray(labelListChange?.current_value)
        ? labelListChange?.current_value
        : undefined;
      const labelsPrevious = Array.isArray(labelListChange?.previous_value)
        ? labelListChange?.previous_value
        : undefined;
      if (
        statusCurrent === "resolved" ||
        statusCurrent === "pending" ||
        (Array.isArray(labelsCurrent) &&
          labelsPrevious?.includes(CONVO_LABELS.assigned) &&
          !labelsCurrent.includes(CONVO_LABELS.assigned))
      ) {
        try {
          await releaseAgent(
            accountId,
            conversationId,
            typedPayload.conversation
          );
        } catch {
          return NextResponse.json(
            { error: "Agent availability update failed" },
            { status: 500 }
          );
        }
        return NextResponse.json({ status: "handled" });
      }
    } else if (event === "message_created" && message) {
      console.info("chatwoot status webhook message", {
        event,
        conversationId,
        messageId: message.id,
        message_type: message.message_type,
      });
      const content = message.content;
      if (
        message.message_type === 2 &&
        typeof content === "string" &&
        content.startsWith("Conversation was marked")
      ) {
        console.info("chatwoot status webhook resolution message", {
          messageId: message.id,
          conversationId,
          content,
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
