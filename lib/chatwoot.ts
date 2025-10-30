const CHATWOOT_URL = (process.env.CHATWOOT_URL || "").replace(/\/$/, "");
const CHATWOOT_TOKEN = process.env.CHATWOOT_APP_TOKEN || "";
const CHATWOOT_TIMEOUT_MS = Number(process.env.CHATWOOT_TIMEOUT_MS || 15000);

import type { AgentAvailability } from "./agentRotation";

type AgentRecord = {
  id?: number | string;
  availability_status?: AgentAvailability | string | null;
  [key: string]: any;
};

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

export async function getConversationMessages(
  accountId: number,
  conversationId: number
) {
  return chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
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

function extractAgents(value: unknown, seen = new Set<object>()): AgentRecord[] {
  if (Array.isArray(value)) {
    return value as AgentRecord[];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  if (seen.has(value as object)) {
    return [];
  }
  seen.add(value as object);
  const container = value as Record<string, unknown>;
  const candidateKeys = ["data", "payload", "agents", "result", "meta"];
  for (const key of candidateKeys) {
    if (key in container) {
      const nested = extractAgents(container[key], seen);
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  return [];
}

function normalizeAgentsResponse(value: unknown): AgentRecord[] {
  const agents = extractAgents(value);
  return agents.filter((agent) => agent && typeof agent === "object");
}

export async function listAgents(
  accountId: number,
  availability?: AgentAvailability
) {
  const query = availability ? `?availability_status=${availability}` : "";
  const response = await chatwootFetch(
    `/api/v1/accounts/${accountId}/agents${query}`,
    {
      method: "GET",
    }
  );
  return normalizeAgentsResponse(response);
}

export async function getAgent(accountId: number, agentId: number) {
  const coerceId = (value: unknown) =>
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;

  const findAgent = (records: AgentRecord[]) =>
    records.find((agent) => coerceId(agent.id) === agentId) ?? null;

  try {
    const agents = await listAgents(accountId);
    const match = findAgent(agents);
    if (match) {
      return match;
    }
  } catch (err) {
    console.error("[chatwoot] listAgents error", err);
    throw err;
  }

  const availabilities: AgentAvailability[] = [
    "online",
    "busy",
    "offline",
  ];

  for (const availability of availabilities) {
    try {
      const agents = await listAgents(accountId, availability);
      const match = findAgent(agents);
      if (match) {
        return match;
      }
    } catch (err) {
      console.warn(
        "[chatwoot] listAgents availability lookup failed",
        availability,
        err
      );
    }
  }

  return null;
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
  getConversationMessages,
  updateConversation,
  listAgents,
  getAgent,
  setAgentAvailability,
  getConversationLabels,
  setConversationLabels,
};
export default chatwoot;

