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
  return chatwootBotFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, message_type: "outgoing", ...options }),
    }
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

export async function setConversationLabels(
  accountId: number,
  conversationId: number,
  labels: string[]
) {
  return chatwootBotFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels }),
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
  setConversationLabels,
  toggleConversationStatus,
};
export default chatwootBot;
