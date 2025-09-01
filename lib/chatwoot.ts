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

export async function listAgents(
  accountId: number,
  availability?: string
) {
  const query = availability ? `?availability_status=${availability}` : "";
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/agents${query}`,
    {
      method: "GET",
    }
  );
}

export async function getAgent(accountId: number, agentId: number) {
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/agents/${agentId}`,
    { method: "GET" }
  );
}

export async function updateAgentAvailability(
  accountId: number,
  agentId: number,
  availability_status: "online" | "busy" | "offline",
  role: "agent" | "administrator" = "agent"
) {
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/agents/${agentId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, availability_status }),
    }
  );
}

export async function getConversationLabels(
  accountId: number,
  conversationId: number
) {
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
    { method: "GET" }
  );
}

export async function setConversationLabels(
  accountId: number,
  conversationId: number,
  labels: string[]
) {
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels }),
    }
  );
}

const chatwoot = {
  getConversation,
  updateConversation,
  listAgents,
  getAgent,
  updateAgentAvailability,
  getConversationLabels,
  setConversationLabels,
};
export default chatwoot;

