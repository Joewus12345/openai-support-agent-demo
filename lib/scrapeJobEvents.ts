import { EventEmitter } from "events";

import { ScrapeJobStatus } from "./generated/prisma";

type JobUpdatePayload = {
  jobId: string;
  status: ScrapeJobStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  logPath?: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __scrapeJobEmitter: EventEmitter | undefined;
}

const emitter = globalThis.__scrapeJobEmitter ?? new EventEmitter();
if (!globalThis.__scrapeJobEmitter) {
  globalThis.__scrapeJobEmitter = emitter;
}

emitter.setMaxListeners(100);

export function emitJobUpdate(update: JobUpdatePayload) {
  emitter.emit("job_update", update);
}

export function onJobUpdate(listener: (update: JobUpdatePayload) => void) {
  emitter.on("job_update", listener);
  return () => emitter.off("job_update", listener);
}

export type { JobUpdatePayload };
