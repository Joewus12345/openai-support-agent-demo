const CHATWOOT_URL = (process.env.CHATWOOT_URL || "").replace(/\/$/, "");
const CHATWOOT_BOT_TOKEN = process.env.CHATWOOT_BOT_TOKEN || "";

async function chatwootBotFetch(path: string, init: RequestInit = {}) {
  const url = `${CHATWOOT_URL}${path}`;
  const headers = {
    api_access_token: CHATWOOT_BOT_TOKEN,
    ...(init.headers || {}),
  } as Record<string, string>;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    throw new Error(`Chatwoot bot request failed: ${res.status}`);
  }
  return res.json();
}

export async function sendBotMessage(
  accountId: number,
  conversationId: number,
  content: string,
  options: Record<string, any> = {}
) {
  return chatwootBotFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, message_type: "outgoing", ...options }),
    }
  );
}

export async function getConversation(
  accountId: number,
  conversationId: number
) {
  return chatwootBotFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}`,
    { method: "GET" }
  );
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
  status: string
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
  getConversation,
  assignConversation,
  toggleConversationStatus
};
export default chatwootBot;
