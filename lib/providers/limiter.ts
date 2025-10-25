import { estimateMessageTokens, type TiktokenModel } from "@/lib/utils/tokenCounter";

export type ProviderType = "openai" | "ollama" | "ollama-openai";

export interface LimiterTokens {
  input?: number;
  output?: number;
}

export interface ProviderLimiterConfig {
  concurrency: number;
  tokensPerInterval: number;
  intervalMs: number;
  maxTokens?: number;
}

interface QueueTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  tokens: number;
}

const PROVIDERS: ProviderType[] = ["openai", "ollama", "ollama-openai"];

const DEFAULT_INTERVAL_MS = 60_000;

function parseEnvNumber(name: string | undefined, fallback: number): number {
  if (!name) return fallback;
  const raw = process.env[name];
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function buildDefaultConfig(): Record<ProviderType, ProviderLimiterConfig> {
  const make = (
    provider: ProviderType,
    defaults: { concurrency: number; tokens: number; interval: number }
  ): ProviderLimiterConfig => {
    const upper = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const concurrency = parseEnvNumber(
      `CHATWOOT_${upper}_CONCURRENCY`,
      defaults.concurrency
    );
    const tokensPerInterval = parseEnvNumber(
      `CHATWOOT_${upper}_TOKENS_PER_INTERVAL`,
      defaults.tokens
    );
    const intervalMs = parseEnvNumber(
      `CHATWOOT_${upper}_TOKENS_INTERVAL_MS`,
      defaults.interval
    );
    const maxTokens = parseEnvNumber(
      `CHATWOOT_${upper}_MAX_TOKENS`,
      tokensPerInterval
    );
    return {
      concurrency,
      tokensPerInterval,
      intervalMs,
      maxTokens,
    };
  };

  return {
    openai: make("openai", { concurrency: 3, tokens: 300_000, interval: DEFAULT_INTERVAL_MS }),
    ollama: make("ollama", { concurrency: 2, tokens: 120_000, interval: DEFAULT_INTERVAL_MS }),
    "ollama-openai": make("ollama-openai", {
      concurrency: 2,
      tokens: 200_000,
      interval: DEFAULT_INTERVAL_MS,
    }),
  };
}

class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefill: number;
  private readonly unlimited: boolean;

  constructor(tokensPerInterval: number, intervalMs: number, maxTokens?: number) {
    if (!Number.isFinite(tokensPerInterval) || tokensPerInterval <= 0) {
      this.unlimited = true;
      this.tokens = Number.POSITIVE_INFINITY;
      this.capacity = Number.POSITIVE_INFINITY;
      this.refillPerMs = 0;
      this.lastRefill = Date.now();
      return;
    }

    const safeInterval = intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;
    this.unlimited = false;
    this.capacity = Number.isFinite(maxTokens) && maxTokens! > 0 ? (maxTokens as number) : tokensPerInterval;
    this.tokens = this.capacity;
    this.refillPerMs = tokensPerInterval / safeInterval;
    this.lastRefill = Date.now();
  }

  private refill(now = Date.now()) {
    if (this.unlimited) return;
    if (now <= this.lastRefill) {
      this.lastRefill = now;
      return;
    }
    const delta = now - this.lastRefill;
    this.lastRefill = now;
    this.tokens = Math.min(this.capacity, this.tokens + delta * this.refillPerMs);
  }

  tryRemove(amount: number, now = Date.now()): boolean {
    if (this.unlimited || amount <= 0) {
      return true;
    }
    const normalized = Math.min(amount, this.capacity);
    this.refill(now);
    if (this.tokens >= normalized) {
      this.tokens -= normalized;
      return true;
    }
    return false;
  }

  timeUntilAvailable(amount: number, now = Date.now()): number {
    if (this.unlimited || amount <= 0) {
      return 0;
    }
    const normalized = Math.min(amount, this.capacity);
    this.refill(now);
    if (this.tokens >= normalized) {
      return 0;
    }
    if (this.refillPerMs <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    const deficit = normalized - this.tokens;
    return Math.ceil(deficit / this.refillPerMs);
  }
}

interface ProviderState {
  config: ProviderLimiterConfig;
  queue: QueueTask<any>[];
  running: number;
  bucket: TokenBucket;
  timer?: ReturnType<typeof setTimeout>;
  timerDelay?: number;
}

let config: Record<ProviderType, ProviderLimiterConfig> = buildDefaultConfig();

const state: Record<ProviderType, ProviderState> = {
  openai: createState("openai"),
  ollama: createState("ollama"),
  "ollama-openai": createState("ollama-openai"),
};

function createState(provider: ProviderType): ProviderState {
  const conf = config[provider];
  return {
    config: conf,
    queue: [],
    running: 0,
    bucket: new TokenBucket(conf.tokensPerInterval, conf.intervalMs, conf.maxTokens),
  };
}

function normalizeConcurrency(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(1, Math.floor(value));
}

function computeTokenCost(tokens?: LimiterTokens): number {
  if (!tokens) return 0;
  const input = Number.isFinite(tokens.input) ? Math.max(tokens.input ?? 0, 0) : 0;
  const output = Number.isFinite(tokens.output) ? Math.max(tokens.output ?? 0, 0) : 0;
  const total = input + output;
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(1, Math.ceil(total));
}

function scheduleTimer(provider: ProviderType, delay: number) {
  const providerState = state[provider];
  if (!Number.isFinite(delay) || delay <= 0) {
    queueMicrotask(() => processQueue(provider));
    return;
  }
  if (providerState.timer && providerState.timerDelay && providerState.timerDelay <= delay) {
    return;
  }
  if (providerState.timer) {
    clearTimeout(providerState.timer);
  }
  providerState.timerDelay = delay;
  providerState.timer = setTimeout(() => {
    providerState.timer = undefined;
    providerState.timerDelay = undefined;
    processQueue(provider);
  }, delay);
}

function processQueue(provider: ProviderType) {
  const providerState = state[provider];
  const concurrency = normalizeConcurrency(providerState.config.concurrency);

  while (
    providerState.queue.length > 0 &&
    providerState.running < concurrency
  ) {
    const job = providerState.queue[0];
    if (providerState.bucket.tryRemove(job.tokens)) {
      providerState.queue.shift();
      startTask(provider, job);
      continue;
    }
    const wait = providerState.bucket.timeUntilAvailable(job.tokens);
    scheduleTimer(provider, wait);
    break;
  }
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return !!value && typeof (value as any)[Symbol.asyncIterator] === "function";
}

function startTask<T>(provider: ProviderType, job: QueueTask<T>) {
  const providerState = state[provider];
  providerState.running += 1;

  const finalize = () => {
    providerState.running = Math.max(0, providerState.running - 1);
    processQueue(provider);
  };

  (async () => {
    try {
      const result = await job.fn();
      if (isAsyncIterable(result)) {
        job.resolve(wrapAsyncIterable(result, finalize));
      } else {
        finalize();
        job.resolve(result);
      }
    } catch (error) {
      finalize();
      job.reject(error);
    }
  })().catch((error) => {
    finalize();
    job.reject(error);
  });
}

function wrapAsyncIterable<T>(iterable: AsyncIterable<T>, onFinally: () => void): AsyncIterable<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  let finished = false;

  const finalizeOnce = async () => {
    if (finished) return;
    finished = true;
    try {
      if (typeof iterator.return === "function") {
        await iterator.return();
      }
    } catch {
      // ignore
    }
    onFinally();
  };

  return {
    async *[Symbol.asyncIterator]() {
      try {
        while (true) {
          const { value, done } = await iterator.next();
          if (done) break;
          yield value;
        }
      } catch (error) {
        if (typeof iterator.throw === "function") {
          try {
            await iterator.throw(error);
          } catch {
            // ignore
          }
        }
        throw error;
      } finally {
        await finalizeOnce();
      }
    },
  };
}

function enqueueTask<T>(provider: ProviderType, task: QueueTask<T>) {
  const providerState = state[provider];
  providerState.queue.push(task);
  processQueue(provider);
}

export function scheduleProviderCall<T>(
  provider: ProviderType,
  tokens: LimiterTokens | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tokenCost = computeTokenCost(tokens);
    enqueueTask(provider, { fn, resolve, reject, tokens: tokenCost });
  });
}

export function deriveLimiterTokens(
  messages: any[],
  model?: string | undefined,
  additionalOutputTokens = 0
): LimiterTokens {
  const modelName = (model ?? "") as TiktokenModel;
  const inputTokens = estimateMessageTokens(messages, modelName);
  return {
    input: inputTokens,
    output: Math.max(0, Math.ceil(additionalOutputTokens)),
  };
}

export function setLimiterConfigForTesting(
  overrides: Partial<Record<ProviderType, Partial<ProviderLimiterConfig>>>
) {
  for (const provider of PROVIDERS) {
    const override = overrides[provider];
    if (!override) continue;
    const current = config[provider];
    config[provider] = {
      concurrency: override.concurrency ?? current.concurrency,
      tokensPerInterval: override.tokensPerInterval ?? current.tokensPerInterval,
      intervalMs: override.intervalMs ?? current.intervalMs,
      maxTokens: override.maxTokens ?? current.maxTokens,
    };
    state[provider].config = config[provider];
    state[provider].bucket = new TokenBucket(
      config[provider].tokensPerInterval,
      config[provider].intervalMs,
      config[provider].maxTokens
    );
  }
  for (const provider of PROVIDERS) {
    processQueue(provider);
  }
}

export function resetLimiterForTesting() {
  for (const provider of PROVIDERS) {
    const providerState = state[provider];
    if (providerState.timer) {
      clearTimeout(providerState.timer);
      providerState.timer = undefined;
      providerState.timerDelay = undefined;
    }
    providerState.queue = [];
    providerState.running = 0;
  }
  config = buildDefaultConfig();
  for (const provider of PROVIDERS) {
    state[provider].config = config[provider];
    state[provider].bucket = new TokenBucket(
      config[provider].tokensPerInterval,
      config[provider].intervalMs,
      config[provider].maxTokens
    );
  }
}
