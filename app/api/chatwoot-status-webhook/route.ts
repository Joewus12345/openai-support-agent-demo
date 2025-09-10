import { NextResponse } from "next/server";
import type {
  ChatwootEvent,
  ConversationStatusChangedPayload,
  ConversationUpdatedPayload,
} from "@/types/chatwoot";
import { releaseAgent } from "@/lib/conversationResolution";
import { CONVO_LABELS } from "@/lib/constants";
import { setAgentAvailability } from "@/lib/chatwoot";
import { setActiveConversation } from "@/lib/agentRotation";
import {
  recordReleaseFailure,
  clearReleaseAttempts,
} from "@/lib/releaseAttempts";

export async function POST(request: Request) {
  try {
    const incoming = await request.json();
    // Merge Chatwoot's structured payload with any extra fields we might receive
    const payload = (incoming.data ?? incoming) as
      Partial<ChatwootEvent> & Record<string, any>;

    // Chatwoot may send either `event` or `type`; fall back accordingly
    const event = payload.event ?? payload.type;

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
          clearReleaseAttempts(conversationId);
        } catch (err) {
          console.error("Agent availability update failed", err);
          const message =
            err instanceof Error ? err.message : "Agent release failed";
          const { shouldRetry } = await recordReleaseFailure(
            conversationId,
            err
          );
          if (shouldRetry) {
            return NextResponse.json({ error: message }, { status: 500 });
          }
          return NextResponse.json(
            { status: "unreleased", error: message },
            { status: 200 }
          );
        }
        return NextResponse.json({ status: "handled" });
      }
      if (status === "open") {
        const changes = (payload as any)?.changes ?? {};
        const agentId =
          payload.assignee_id ??
          (changes.assignee_id?.current_value as number | undefined) ??
          payload.meta?.assignee?.id ??
          (typedPayload.conversation as any)?.assignee_id;
        if (agentId !== undefined) {
          try {
            await setActiveConversation(agentId, conversationId);
            await setAgentAvailability(accountId, agentId, "busy");
          } catch (err) {
            console.error("set agent busy error", err);
          }
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
      const statusPrevious = changes.status?.previous_value as
        | string
        | undefined;
      const labelListChange =
        changes.label_list ?? changes.cached_label_list;
      let labelsCurrent = Array.isArray(labelListChange?.current_value)
        ? labelListChange?.current_value
        : undefined;
      const labelsPrevious = Array.isArray(labelListChange?.previous_value)
        ? labelListChange?.previous_value
        : undefined;
      if (!labelListChange) {
        const labelSource = payload.label_list ?? payload.cached_label_list;
        if (Array.isArray(labelSource)) {
          labelsCurrent = labelSource;
        } else if (typeof labelSource === "string") {
          labelsCurrent = labelSource
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean);
        }
      }
      const assigneeId =
        payload.assignee_id ??
        (changes.assignee_id?.current_value as number | undefined) ??
        payload.meta?.assignee?.id ??
        (typedPayload.conversation as any)?.assignee_id;
      const hasAssignedLabel =
        Array.isArray(labelsCurrent) &&
        labelsCurrent.includes(CONVO_LABELS.assigned);
      console.info("chatwoot status webhook resolved fields", {
        event,
        conversationId,
        assigneeId,
        labels_current: labelsCurrent,
        labels_previous: labelsPrevious,
        status_current: statusCurrent,
        status_previous: statusPrevious,
      });
      const shouldRelease =
        (statusCurrent === "pending" || statusCurrent === "resolved") &&
        statusPrevious === "open" &&
        hasAssignedLabel;
      if (shouldRelease) {
        console.info("chatwoot status webhook releasing agent", {
          event,
          conversationId,
          assigneeId,
          labels_current: labelsCurrent,
          labels_previous: labelsPrevious,
          status_current: statusCurrent,
          status_previous: statusPrevious,
        });
        try {
          await releaseAgent(
            accountId,
            conversationId,
            typedPayload.conversation
          );
          clearReleaseAttempts(conversationId);
        } catch (err) {
          console.error("Agent availability update failed", err);
          const message =
            err instanceof Error ? err.message : "Agent release failed";
          const { shouldRetry } = await recordReleaseFailure(
            conversationId,
            err
          );
          if (shouldRetry) {
            return NextResponse.json({ error: message }, { status: 500 });
          }
          return NextResponse.json(
            { status: "unreleased", error: message },
            { status: 200 }
          );
        }
      } else {
        console.info("chatwoot status webhook skipping release", {
          event,
          conversationId,
          assigneeId,
          labels_current: labelsCurrent,
          labels_previous: labelsPrevious,
          status_current: statusCurrent,
          status_previous: statusPrevious,
        });
      }
      return NextResponse.json({ status: "handled" });
    }

    return NextResponse.json({ status: "ignored" });
  } catch (error) {
    console.error("Chatwoot status webhook error", error);
    return NextResponse.json({ status: "error" });
  }
}
