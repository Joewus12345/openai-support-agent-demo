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
};

let queueEnabled = true;

const pendingJobs: PendingJob[] = [];
let activeJob: PendingJob | undefined;
let nextJobId = 1;
const idleResolvers: Array<() => void> = [];

function resolveIdle() {
  if (!activeJob && pendingJobs.length === 0) {
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

function processQueue() {
  if (activeJob || pendingJobs.length === 0) {
    resolveIdle();
    return;
  }

  const job = pendingJobs.shift();
  if (!job) {
    resolveIdle();
    return;
  }
  activeJob = job;

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
      activeJob = undefined;
      processQueue();
    }
  })().catch((error) => {
    console.error("chatwoot webhook job unhandled error", error);
    activeJob = undefined;
    processQueue();
  });
}

export function enqueueChatwootJob<T>(
  run: () => Promise<T>,
  metadata?: JobMetadata
): { id: number; done: Promise<T> } {
  const id = nextJobId++;

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

  pendingJobs.push({ id, run, resolve, reject, metadata });
  queueMicrotask(processQueue);

  return { id, done: monitoredPromise };
}

export function waitForChatwootQueueIdle(): Promise<void> {
  if (!activeJob && pendingJobs.length === 0) {
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
  activeJob = undefined;
  resolveIdle();
}
