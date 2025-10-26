import redis from "@/lib/redis";
import type { ChatwootWebhookPayload } from "@/types/chatwoot";

type JobMetadata = {
  accountId?: number | string;
  conversationId?: number | string;
  payload?: ChatwootWebhookPayload;
};

type PendingJob<T = unknown> = {
  id: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  metadata?: JobMetadata;
  storageHandle?: string;
  conversationKey?: string;
};

type EnqueueOptions = {
  id?: number;
  storageHandle?: string;
  persist?: boolean;
};

let queueEnabled = true;

const pendingJobs: PendingJob[] = [];
const activeJobs = new Set<PendingJob>();
const activeConversations = new Map<string, number>();
let nextJobId = 1;
const idleResolvers: Array<() => void> = [];

function parseConcurrency(raw: string | undefined): number {
  if (!raw) {
    return 1;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
}

const defaultConcurrency = parseConcurrency(
  process.env.CHATWOOT_QUEUE_CONCURRENCY
);
let queueConcurrency = defaultConcurrency;

const REDIS_QUEUE_KEY = "chatwoot:webhook:jobs";
let durableQueueEnabled =
  process.env.CHATWOOT_QUEUE_USE_REDIS === "true" &&
  typeof (redis as any)?.rpush === "function" &&
  typeof (redis as any)?.lrange === "function";

let jobRunner:
  | ((metadata: JobMetadata) => Promise<unknown>)
  | undefined;
let hydrating = false;
const hydratedHandles = new Set<string>();

async function persistJob(storageHandle: string) {
  if (!durableQueueEnabled) {
    return;
  }
  try {
    await (redis as any)?.rpush?.(REDIS_QUEUE_KEY, storageHandle);
  } catch (error) {
    console.error("chatwoot webhook job persistence failure", error);
  }
}

async function removePersistedJob(storageHandle?: string) {
  if (!durableQueueEnabled || !storageHandle) {
    return;
  }
  try {
    await (redis as any)?.lrem?.(REDIS_QUEUE_KEY, 1, storageHandle);
  } catch (error) {
    console.error("chatwoot webhook job cleanup failure", error);
  } finally {
    hydratedHandles.delete(storageHandle);
  }
}

async function hydrateDurableJobs() {
  if (!durableQueueEnabled || hydrating || !jobRunner) {
    return;
  }
  hydrating = true;
  try {
    const entries: string[] =
      (await (redis as any)?.lrange?.(REDIS_QUEUE_KEY, 0, -1)) ?? [];
    for (const entry of entries) {
      if (hydratedHandles.has(entry)) {
        continue;
      }
      let parsed: { id?: number; metadata?: JobMetadata } | undefined;
      try {
        parsed = JSON.parse(entry) as {
          id?: number;
          metadata?: JobMetadata;
        };
      } catch (error) {
        console.error("chatwoot webhook job hydration parse failure", error);
        continue;
      }
      if (!parsed?.metadata || typeof parsed.id !== "number") {
        continue;
      }
      hydratedHandles.add(entry);
      enqueueChatwootJob(
        () => jobRunner(parsed!.metadata!),
        parsed.metadata,
        {
          id: parsed.id,
          storageHandle: entry,
          persist: false,
        }
      );
    }
  } catch (error) {
    console.error("chatwoot webhook job hydration failure", error);
  } finally {
    hydrating = false;
  }
}

function resolveIdle() {
  if (activeJobs.size === 0 && pendingJobs.length === 0) {
    while (idleResolvers.length) {
      const resolve = idleResolvers.shift();
      try {
        resolve?.();
      } catch {
        // ignore resolver errors
      }
    }
  }
}

function getConversationKey(metadata?: JobMetadata): string | undefined {
  const conversationId = metadata?.conversationId;
  if (conversationId === undefined || conversationId === null) {
    return undefined;
  }
  return String(conversationId);
}

function canStartMoreJobs(): boolean {
  return queueConcurrency <= 0 || activeJobs.size < queueConcurrency;
}

function startJob(job: PendingJob) {
  const conversationKey = job.conversationKey;
  if (conversationKey) {
    const activeCount = activeConversations.get(conversationKey) ?? 0;
    activeConversations.set(conversationKey, activeCount + 1);
  }
  activeJobs.add(job);

  (async () => {
    try {
      const result = await job.run();
      job.resolve(result);
    } catch (error) {
      console.error("chatwoot webhook job failure", {
        jobId: job.id,
        metadata: job.metadata,
        error,
      });
      job.reject(error);
    } finally {
      await removePersistedJob(job.storageHandle);
      if (job.conversationKey) {
        const remaining = (activeConversations.get(job.conversationKey) ?? 1) - 1;
        if (remaining > 0) {
          activeConversations.set(job.conversationKey, remaining);
        } else {
          activeConversations.delete(job.conversationKey);
        }
      }
      activeJobs.delete(job);
      processQueue();
    }
  })().catch((error) => {
    console.error("chatwoot webhook job unhandled error", error);
    if (job.conversationKey) {
      const remaining = (activeConversations.get(job.conversationKey) ?? 1) - 1;
      if (remaining > 0) {
        activeConversations.set(job.conversationKey, remaining);
      } else {
        activeConversations.delete(job.conversationKey);
      }
    }
    activeJobs.delete(job);
    processQueue();
  });
}

function processQueue() {
  if (pendingJobs.length === 0) {
    resolveIdle();
    return;
  }

  let startedJob = false;
  while (pendingJobs.length > 0 && canStartMoreJobs()) {
    const nextIndex = pendingJobs.findIndex((job) => {
      if (job.conversationKey && activeConversations.has(job.conversationKey)) {
        return false;
      }
      return true;
    });
    if (nextIndex === -1) {
      break;
    }
    const [job] = pendingJobs.splice(nextIndex, 1);
    if (!job) {
      break;
    }
    startJob(job);
    startedJob = true;
  }

  if (!startedJob) {
    resolveIdle();
  }
}

export function enqueueChatwootJob<T>(
  run: () => Promise<T>,
  metadata?: JobMetadata,
  options: EnqueueOptions = {}
): { id: number; done: Promise<T> } {
  const id = typeof options.id === "number" ? options.id : nextJobId++;
  if (id >= nextJobId) {
    nextJobId = id + 1;
  }

  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const basePromise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const monitoredPromise = basePromise.catch((error) => {
    // Ensure consumers can still observe the rejection after logging.
    throw error;
  });

  const job: PendingJob = {
    id,
    run,
    resolve,
    reject,
    metadata,
    storageHandle: options.storageHandle,
    conversationKey: getConversationKey(metadata),
  };

  const shouldPersist =
    durableQueueEnabled && options.persist !== false && metadata?.payload;
  if (shouldPersist) {
    try {
      job.storageHandle = JSON.stringify({ id, metadata });
      void persistJob(job.storageHandle);
    } catch (error) {
      console.error("chatwoot webhook job serialization failure", error);
    }
  }

  pendingJobs.push(job);
  queueMicrotask(processQueue);

  return { id, done: monitoredPromise };
}

export function waitForChatwootQueueIdle(): Promise<void> {
  if (activeJobs.size === 0 && pendingJobs.length === 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    idleResolvers.push(resolve);
  });
}

export function isChatwootQueueEnabled(): boolean {
  return queueEnabled;
}

export function setChatwootQueueEnabledForTesting(enabled: boolean) {
  queueEnabled = enabled;
}

export function resetChatwootQueueForTesting() {
  pendingJobs.splice(0, pendingJobs.length);
  activeJobs.clear();
  activeConversations.clear();
  hydrating = false;
  hydratedHandles.clear();
  nextJobId = 1;
  queueConcurrency = defaultConcurrency;
  resolveIdle();
}

export function setChatwootJobRunner(
  runner: (metadata: JobMetadata) => Promise<unknown>
) {
  jobRunner = runner;
  if (durableQueueEnabled) {
    queueMicrotask(() => {
      void hydrateDurableJobs();
    });
  }
}

export function isChatwootQueuePersistenceEnabled(): boolean {
  return durableQueueEnabled;
}

export function setChatwootQueuePersistenceEnabledForTesting(enabled: boolean) {
  durableQueueEnabled = enabled;
  if (!enabled) {
    hydratedHandles.clear();
  } else {
    queueMicrotask(() => {
      void hydrateDurableJobs();
    });
  }
}

export async function hydrateChatwootQueueFromStorageForTesting() {
  await hydrateDurableJobs();
}

export function getChatwootQueueConcurrency(): number {
  return queueConcurrency;
}

export function setChatwootQueueConcurrencyForTesting(limit: number) {
  if (Number.isFinite(limit) && limit >= 1) {
    queueConcurrency = Math.floor(limit);
  } else {
    queueConcurrency = defaultConcurrency;
  }
  queueMicrotask(processQueue);
}

export function getChatwootJobRunnerForTesting() {
  return jobRunner;
}
