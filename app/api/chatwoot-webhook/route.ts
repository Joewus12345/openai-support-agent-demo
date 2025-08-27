import { NextResponse } from "next/server";
import type { ChatwootEvent, Message, Conversation } from "@/types/chatwoot";
import { listAgents } from "@/lib/chatwoot";
import {
  sendBotMessage,
  assignConversation,
  toggleConversationStatus,
} from "@/lib/chatwootBot";
import { getProvider } from "@/lib/providers";
import { INBOX_MODE } from "@/config/inboxMode";
import { tools } from "@/lib/tools/tools";
import { toResponseMessage } from "@/lib/utils/toResponseMessage";

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

    const triggerPattern = /\b(human|agent|representative)\b/i;
    if (triggerPattern.test(content)) {
      try {
        const agents = await listAgents(accountId);
        const onlineAgent = agents.find(
          (a: any) => a.availability_status === "online"
        );
        if (onlineAgent) {
          await toggleConversationStatus(accountId, conversationId, "open");
          await assignConversation(accountId, conversationId, onlineAgent.id);
          await sendBotMessage(
            accountId,
            conversationId,
            "A human agent will join shortly."
          );
        } else {
          await sendBotMessage(
            accountId,
            conversationId,
            "No human agents are currently available."
          );
        }
      } catch (err) {
        console.error("agent escalation error", err);
      }
      return NextResponse.json({ status: "handoff" });
    }

    const mode = INBOX_MODE[inboxId] ?? "auto";

    try {
      let replyText = "";
      const events = getProvider(undefined)(
        [toResponseMessage("user", content)],
        tools,
        {}
      );
      for await (const { event, data } of events) {
        if (
          event === "response.output_text.delta" &&
          typeof data?.delta === "string"
        ) {
          replyText += data.delta;
        }
      }
      await sendBotMessage(accountId, conversationId, replyText, {
        private: mode !== "auto",
      });
    } catch (err) {
      console.error("sendMessage error", err);
    }

    return NextResponse.json({
      accountId,
      conversationId,
      inboxId,
      content,
      mode,
    });
  } catch (error) {
    console.error("Chatwoot webhook error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

