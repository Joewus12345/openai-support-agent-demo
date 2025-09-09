const CHATWOOT_URL = (process.env.CHATWOOT_URL || "").replace(/\/$/, "");
const CHATWOOT_TOKEN = process.env.CHATWOOT_APP_TOKEN || "";
const CHATWOOT_TIMEOUT_MS = Number(process.env.CHATWOOT_TIMEOUT_MS || 15000);

async function chatwootFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number; maxAttempts?: number } = {}
) {
  const url = `${CHATWOOT_URL}${path}`;
  const headers = {
    "api_access_token": CHATWOOT_TOKEN,
    ...(init.headers || {}),
  } as Record<string, string>;
  const {
    method = "GET",
    body,
    timeoutMs = CHATWOOT_TIMEOUT_MS,
    maxAttempts = 3,
    ...rest
  } = init as RequestInit & { timeoutMs?: number; maxAttempts?: number };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.info("[chatwoot]", method, url, body);
      const res = await fetch(url, {
        ...rest,
        method,
        body,
        headers,
        signal: controller.signal,
      });
      const text = await res.text();

      if (!res.ok) {
        console.error("[chatwoot]", res.status, text);
        if (res.status >= 500 && attempt < maxAttempts) {
          const backoff = 500 * 2 ** (attempt - 1);
          console.warn(`[chatwoot] retrying in ${backoff}ms`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new Error(`Chatwoot request failed: ${res.status} ${text}`);
      }

      return JSON.parse(text || "{}");
    } catch (err) {
      if (attempt >= maxAttempts) {
        const msg = err instanceof Error ? err.message : String(err);
        const finalErr = new Error(
          `Chatwoot request failed after ${attempt} attempts: ${method} ${url} - ${msg}`
        );
        (finalErr as any).cause = err;
        throw finalErr;
      }
      const backoff = 500 * 2 ** (attempt - 1);
      console.warn(`[chatwoot] attempt ${attempt} failed, retrying in ${backoff}ms`, err);
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      clearTimeout(timer);
    }
  }

  // Should be unreachable
  throw new Error(`Chatwoot request failed: ${method} ${url}`);
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
  availability?: "online" | "busy" | "offline"
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

export async function setAgentAvailability(
  accountId: number,
  agentId: number,
  availability: "online" | "busy" | "offline"
) {
  const path = `/api/v1/accounts/${accountId}/agents/${agentId}`;
  try {
    return await chatwootFetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availability }),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) {
      const url = `${CHATWOOT_URL}${path}`;
      console.error("[chatwoot] setAgentAvailability 404", {
        url,
        body: { availability },
      });
      console.error(
        "[chatwoot] ensure Chatwoot version supports PATCH /api/v1/accounts/{accountId}/agents/{agentId}"
      );
    }
    throw err;
  }
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
  setAgentAvailability,
  getConversationLabels,
  setConversationLabels,
};
export default chatwoot;

