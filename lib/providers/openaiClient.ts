import OpenAI from "openai";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function getOpenAIRequestTimeout(config?: Record<string, string>) {
  return boundedInteger(
    config?.OPENAI_REQUEST_TIMEOUT_MS ?? process.env.OPENAI_REQUEST_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    10_000,
    600_000
  );
}

export function createOpenAIClient(config?: Record<string, string>) {
  return new OpenAI({
    apiKey: config?.OPENAI_API_KEY,
    baseURL: config?.OPENAI_BASE_URL || undefined,
    timeout: getOpenAIRequestTimeout(config),
    maxRetries: boundedInteger(
      config?.OPENAI_MAX_RETRIES ?? process.env.OPENAI_MAX_RETRIES,
      DEFAULT_MAX_RETRIES,
      0,
      5
    ),
  });
}
