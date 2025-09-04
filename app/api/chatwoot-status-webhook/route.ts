import { NextResponse } from "next/server";
import type {
  ChatwootEvent,
  Message,
  ConversationStatusChangedPayload,
  ConversationUpdatedPayload,
} from "@/types/chatwoot";
import { releaseAgent } from "@/lib/conversationResolution";
import { CONVO_LABELS } from "@/lib/constants";
import { extractIds } from "@/lib/extractIds";

export async function POST(request: Request) {
  try {
    const incoming = await request.json();
    const payload: ChatwootEvent | { type?: string; [key: string]: any } =
      incoming.data ?? incoming;

    const event = "event" in payload ? payload.event : payload.type;
    const message: Message | undefined =
      "message" in payload ? payload.message : undefined;

    const { accountId, conversationId } = extractIds(payload);

    if (!conversationId || !accountId) {
      console.warn("chatwoot webhook: missing IDs", payload);
      return NextResponse.json({ status: "ignored" }, { status: 400 });
    }

    if (event === "conversation_status_changed") {
      const { status, previous_status: previous } =
        payload as ConversationStatusChangedPayload;
      console.info("chatwoot status webhook status change", {
        event,
        conversationId,
        status,
        previous_status: previous,
      });
      if (previous === "open" && status !== "open") {
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
      console.info("chatwoot status webhook conversation update", {
        event,
        conversationId,
        changed_attributes: (payload as any).changed_attributes,
      });
      const changes = Object.assign(
        {},
        ...((payload as ConversationUpdatedPayload).changed_attributes || [])
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
