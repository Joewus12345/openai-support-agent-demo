import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { getConversationKey } from "@/lib/getConversationKey";

const CHATWOOT_URL = (process.env.CHATWOOT_URL || "").replace(/\/$/, "");
const CHATWOOT_BOT_TOKEN = process.env.CHATWOOT_BOT_TOKEN || "";

if (!CHATWOOT_URL) {
  console.warn(
    "CHATWOOT_URL is not set. Chatwoot integration will be disabled."
  );
}
if (!CHATWOOT_BOT_TOKEN) {
  console.warn(
    "CHATWOOT_BOT_TOKEN is not set. Bot messaging and labeling will not work."
  );
}

async function chatwootBotFetch(path: string, init: RequestInit = {}) {
  const url = `${CHATWOOT_URL}${path}`;
  const headers = {
    api_access_token: CHATWOOT_BOT_TOKEN,
    ...(init.headers || {}),
  } as Record<string, string>;
  const { method = "GET", body } = init;
  console.info("[chatwoot]", method, url, body);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    console.error("[chatwoot]", res.status, text);
    throw new Error(`Chatwoot request failed: ${res.status}`);
  }
  return JSON.parse(text || "{}");
}

export async function sendBotMessage(
  accountId: number,
  conversationId: number,
  content: string,
  options: Record<string, any> = {}
) {
  const res = await chatwootBotFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, message_type: "outgoing", ...options }),
    }
  );

  try {
    const inboxId = (res as any)?.inbox_id ?? (res as any)?.conversation?.inbox_id;
    if (res?.id !== undefined && inboxId !== undefined) {
      const conversationKey = getConversationKey(
        accountId,
        res.conversation_id ?? conversationId,
        inboxId
      );
      const createdAtRaw = (res as any)?.created_at;
      const createdAt = createdAtRaw
        ? new Date(
            typeof createdAtRaw === "number" ? createdAtRaw * 1000 : createdAtRaw
          )
        : undefined;
      await prisma.conversationMessage.create({
        data: {
          id: res.id,
          conversationId: res.conversation_id ?? conversationId,
          inboxId,
          conversationKey,
          sender: "bot",
          content,
          createdAt,
        },
      });
      try {
        if (
          typeof (redis as any)?.rpush === "function" &&
          typeof (redis as any)?.pipeline === "function"
        ) {
          const key = conversationKey;
          const pipeline = redis.pipeline();
          pipeline.rpush(
            key,
            JSON.stringify({
              id: res.id,
              conversationId: res.conversation_id ?? conversationId,
              inboxId,
              conversationKey,
              sender: "bot",
              content,
              createdAt,
            })
          );
          pipeline.expire(key, 86400);
          await pipeline.exec();
        }
      } catch (err) {
        console.error("bot message redis log error", err);
      }
    }
  } catch (err) {
    console.error("log bot message error", err);
  }

  return res;
}

export async function assignConversation(
  accountId: number,
  conversationId: number,
  assigneeId: number
) {
  return chatwootBotFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_id: assigneeId })
    }
  );
}

export async function toggleConversationStatus(
  accountId: number,
  conversationId: number,
  status: "open" | "resolved"
) {
  return chatwootBotFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    }
  );
}

const chatwootBot = {
  sendBotMessage,
  assignConversation,
  toggleConversationStatus,
};
export default chatwootBot;
