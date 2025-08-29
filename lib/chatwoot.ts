const CHATWOOT_URL = (process.env.CHATWOOT_URL || "").replace(/\/$/, "");
const CHATWOOT_TOKEN = process.env.CHATWOOT_APP_TOKEN || "";

async function chatwootFetch(path: string, init: RequestInit = {}) {
  const url = `${CHATWOOT_URL}${path}`;
  const headers = {
    "api_access_token": CHATWOOT_TOKEN,
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

export async function getConversation(
  accountId: number,
  conversationId: number
) {
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}`,
    { method: "GET" }
  );
}

export async function sendMessage(
  accountId: number,
  conversationId: number,
  content: string,
  options: Record<string, any> = {}
) {
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, message_type: "outgoing", ...options }),
    }
  );
}

export async function updateConversation(
  accountId: number,
  conversationId: number,
  body: Record<string, any>
) {
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function listAgents(accountId: number) {
  return chatwootFetch(`/api/v1/accounts/${accountId}/agents`, {
    method: "GET",
  });
}

const chatwoot = {
  getConversation,
  sendMessage,
  updateConversation,
  listAgents,
};
export default chatwoot;

