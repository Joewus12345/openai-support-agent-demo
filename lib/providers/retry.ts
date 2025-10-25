import { ProviderType } from "./limiter";

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

const DEFAULT_MAX_RETRIES = Math.max(
  0,
  parseInteger(process.env.CHATWOOT_PROVIDER_MAX_RETRIES, 2)
);
const DEFAULT_BASE_DELAY_MS = Math.max(
  0,
  parseInteger(process.env.CHATWOOT_PROVIDER_RETRY_BASE_MS, 500)
);
const DEFAULT_MAX_DELAY_MS = Math.max(
  DEFAULT_BASE_DELAY_MS || 0,
  parseInteger(process.env.CHATWOOT_PROVIDER_RETRY_MAX_MS, 10_000)
);

const RETRY_AFTER_HEADER = "retry-after";

function isMapLike(value: unknown): value is Map<string, unknown> {
  return !!value && typeof (value as Map<string, unknown>).get === "function";
}

function extractHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (isMapLike(headers)) {
    const direct = headers.get(name);
    if (typeof direct === "string") return direct;
    if (typeof direct === "number") return String(direct);
    const fallback = headers.get(name.toLowerCase());
    if (typeof fallback === "string") return fallback;
    if (typeof fallback === "number") return String(fallback);
    return undefined;
  }
  if (typeof (headers as any).get === "function") {
    const direct = (headers as any).get(name);
    if (typeof direct === "string") return direct;
    if (typeof direct === "number") return String(direct);
    const fallback = (headers as any).get(name.toLowerCase?.() ?? name);
    if (typeof fallback === "string") return fallback;
    if (typeof fallback === "number") return String(fallback);
  }
  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        if (Array.isArray(value)) {
          const first = value[0];
          if (typeof first === "string") return first;
          if (typeof first === "number") return String(first);
        }
        if (typeof value === "string") return value;
        if (typeof value === "number") return String(value);
      }
    }
  }
  return undefined;
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.floor(numeric * 1000));
  }
  const parsedDate = Number(new Date(trimmed));
  if (Number.isFinite(parsedDate)) {
    const delta = parsedDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return undefined;
}

function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const candidate = error as Record<string, unknown>;
  const statusCandidates = [
    candidate.status,
    candidate.statusCode,
    (candidate.response as any)?.status,
    (candidate.response as any)?.statusCode,
    (candidate.response as any)?.status_code,
  ];
  for (const value of statusCandidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function extractRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as Record<string, unknown>;
  const response = candidate.response as Record<string, unknown> | undefined;
  const headerSources = [candidate.headers, response?.headers];
  for (const headers of headerSources) {
    const value = extractHeader(headers, RETRY_AFTER_HEADER);
    const parsed = parseRetryAfter(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  if (status === 429) return true;
  return status >= 500 && status < 600;
}

const sleep = (ms: number) =>
  ms > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

export interface RetryOptions {
  provider?: ProviderType | string;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (details: RetryAttemptDetails) => void;
  sleepFn?: (ms: number) => Promise<void>;
}

export interface RetryAttemptDetails {
  attempt: number;
  delayMs: number;
  status?: number;
  retryAfterMs?: number;
  error: unknown;
  provider?: string;
}

export class ProviderRetryError extends Error {
  readonly provider?: string;
  readonly status?: number;
  readonly attempts: number;
  readonly retriesExhausted: boolean;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      provider?: string;
      status?: number;
      attempts: number;
      retriesExhausted: boolean;
      retryable: boolean;
      cause?: unknown;
    }
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ProviderRetryError";
    this.provider = options.provider;
    this.status = options.status;
    this.attempts = options.attempts;
    this.retriesExhausted = options.retriesExhausted;
    this.retryable = options.retryable;
  }
}

export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<{ result: T; attempts: number }> {
  const provider = options.provider;
  const maxRetries = Math.max(
    0,
    Number.isFinite(options.maxRetries)
      ? Math.floor(options.maxRetries as number)
      : DEFAULT_MAX_RETRIES
  );
  const baseDelayMs = Math.max(
    0,
    Number.isFinite(options.baseDelayMs)
      ? Math.floor(options.baseDelayMs as number)
      : DEFAULT_BASE_DELAY_MS
  );
  const maxDelayMs = Math.max(
    baseDelayMs,
    Number.isFinite(options.maxDelayMs)
      ? Math.floor(options.maxDelayMs as number)
      : DEFAULT_MAX_DELAY_MS
  );
  const sleepFn = options.sleepFn ?? sleep;

  let attempt = 0;
  while (true) {
    try {
      const result = await operation(attempt);
      return { result, attempts: attempt + 1 };
    } catch (error) {
      const status = extractStatus(error);
      const retryable = isRetryableStatus(status);
      const attemptsCompleted = attempt + 1;

      if (!retryable) {
        throw error;
      }

      if (attempt >= maxRetries) {
        throw new ProviderRetryError(
          `Provider request exhausted retries${
            provider ? ` (${provider})` : ""
          } after ${attemptsCompleted} attempt${attemptsCompleted === 1 ? "" : "s"}`,
          {
            provider,
            status,
            attempts: attemptsCompleted,
            retriesExhausted: true,
            retryable: true,
            cause: error,
          }
        );
      }

      const retryAfterMs = extractRetryAfterMs(error);
      const exponentialDelay = Math.min(
        maxDelayMs,
        Math.max(baseDelayMs, baseDelayMs * Math.pow(2, attempt))
      );
      const delayMs = retryAfterMs !== undefined ? retryAfterMs : exponentialDelay;
      const nextAttempt = attempt + 1;

      options.onRetry?.({
        attempt: nextAttempt,
        delayMs,
        retryAfterMs,
        status,
        error,
        provider: provider ? String(provider) : undefined,
      });

      await sleepFn(delayMs);
      attempt = nextAttempt;
    }
  }
}
