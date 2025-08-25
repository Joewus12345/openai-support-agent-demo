const CHATWOOT_URL = (process.env.CHATWOOT_URL || "").replace(/\/$/, "");
const CHATWOOT_TOKEN = process.env.CHATWOOT_APP_TOKEN || "";

async function chatwootFetch(path: string, init: RequestInit = {}) {
  const url = `${CHATWOOT_URL}${path}`;
  const headers = {
    "api_access_token": CHATWOOT_TOKEN,
    ...(init.headers || {}),
  } as Record<string, string>;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    throw new Error(`Chatwoot request failed: ${res.status}`);
  }
  return res.json();
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
      body: JSON.stringify({ content, ...options }),
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

const chatwoot = { sendMessage, updateConversation, listAgents };
export default chatwoot;
