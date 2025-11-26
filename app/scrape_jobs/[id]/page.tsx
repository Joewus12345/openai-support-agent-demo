"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Copy, Loader2, Send } from "lucide-react";
import useSWR from "swr";

import { ScrapeJobCadence, ScrapeJobStatus } from "@/lib/generated/prisma";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const KNOWLEDGE_BASE_PATH = "public/knowledge_base";

type JobStats = {
  status: ScrapeJobStatus;
  durationSeconds: number | null;
  documentsIngested: number | null;
};

type ScrapeJob = {
  id: string;
  script: string;
  args: Record<string, unknown> | null;
  status: ScrapeJobStatus;
  cadence: ScrapeJobCadence;
  paused: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  logPath: string | null;
  nextRunAt: string | null;
  durationSeconds: number | null;
  documentsIngested: number | null;
  createdAt: string;
};

type SerializedJob = {
  job: ScrapeJob;
  log: string | null;
  stats: JobStats;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleString();
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 90) return `${seconds.toFixed(0)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

function progressFromStatus(status: ScrapeJobStatus, paused: boolean) {
  if (paused) return 0;
  switch (status) {
    case ScrapeJobStatus.completed:
      return 100;
    case ScrapeJobStatus.running:
      return 70;
    case ScrapeJobStatus.queued:
      return 25;
    case ScrapeJobStatus.failed:
      return 100;
    default:
      return 40;
  }
}

function progressColor(status: ScrapeJobStatus, paused: boolean) {
  if (paused) return "bg-zinc-300";
  if (status === ScrapeJobStatus.failed) return "bg-red-500";
  if (status === ScrapeJobStatus.completed) return "bg-emerald-500";
  return "bg-[#2B83F6]";
}

function formatArgs(args: Record<string, unknown> | null) {
  if (!args) return "—";
  const entries = Object.entries(args);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" | ");
}

export default function ScrapeJobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState(false);
  const [copiedLog, setCopiedLog] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showResume, setShowResume] = useState(false);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [actionState, setActionState] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const logContentRef = useRef<HTMLPreElement | null>(null);
  const userInteractedRef = useRef(false);

  const authHeaders = {
    "Content-Type": "application/json",
    "x-session-verified": "true",
  };

  useEffect(() => {
    let active = true;
    void params
      .then((resolved) => {
        if (active) setId(resolved.id);
      })
      .catch(() => {
        if (active) setId(null);
      });
    return () => {
      active = false;
    };
  }, [params]);

  const { data, error, isLoading, mutate } = useSWR<SerializedJob>(
    id ? `/api/scrape_jobs/${id}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const targetValue = useMemo(() => {
    const args = data?.job.args as Record<string, unknown> | undefined;
    if (!args) return "";
    return String(args.targetUrl ?? "");
  }, [data?.job.args]);

  const logSnippet = useMemo(() => {
    const firstLine = (data?.log || "").split("\n").find(Boolean) || "No log yet.";
    return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine;
  }, [data?.log]);

  const copy = async (value: string, setter: (flag: boolean) => void) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setter(true);
      setTimeout(() => setter(false), 1500);
    } catch {
      setter(false);
    }
  };

  useEffect(() => {
    if (!id) return undefined;
    const source = new EventSource("/api/scrape_jobs/updates");
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.jobId === id) {
          void mutate();
        }
      } catch {
        // ignore parse errors
      }
    };
    source.onerror = () => {
      setTimeout(() => void mutate(), 1000);
    };

    return () => source.close();
  }, [id, mutate]);

  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) return undefined;

    const markUserInteracted = () => {
      if (!autoScrollEnabled) return;
      userInteractedRef.current = true;
      setAutoScroll(false);
      setShowResume(true);
    };

    container.addEventListener("wheel", markUserInteracted, { passive: true });
    container.addEventListener("touchstart", markUserInteracted, {
      passive: true,
    });
    container.addEventListener("pointerdown", markUserInteracted);
    container.addEventListener("keydown", markUserInteracted);

    return () => {
      container.removeEventListener("wheel", markUserInteracted);
      container.removeEventListener("touchstart", markUserInteracted);
      container.removeEventListener("pointerdown", markUserInteracted);
      container.removeEventListener("keydown", markUserInteracted);
    };
  }, [autoScrollEnabled]);

  useEffect(() => {
    const container = logContainerRef.current;
    const bottomTolerance = 16;

    if (!container) return;

    const handleScroll = () => {
      if (!container || !autoScrollEnabled) return;
      const atBottom =
        container.scrollTop + container.clientHeight >=
        container.scrollHeight - bottomTolerance;

      if (!autoScroll && atBottom) {
        userInteractedRef.current = false;
        setShowResume(false);
        setAutoScroll(true);
        return;
      }

      if (userInteractedRef.current) {
        setAutoScroll(false);
        setShowResume(true);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => container.removeEventListener("scroll", handleScroll);
  }, [autoScroll, autoScrollEnabled]);

  useLayoutEffect(() => {
    if (!autoScrollEnabled || !autoScroll || userInteractedRef.current) return;
    const container = logContainerRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
  }, [data?.log, autoScroll, autoScrollEnabled]);

  useEffect(() => {
    if (!autoScrollEnabled || !autoScroll) return;
    const content = logContentRef.current;
    const container = logContainerRef.current;
    if (!content || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      if (!autoScrollEnabled || !autoScroll || userInteractedRef.current) return;
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      });
    });

    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, [autoScrollEnabled, autoScroll]);

  useEffect(() => {
    const container = logContainerRef.current;
    if (!autoScrollEnabled || !container) return;
    const bottomTolerance = 16;
    const atBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - bottomTolerance;

    if (atBottom) {
      userInteractedRef.current = false;
      setShowResume(false);
      setAutoScroll(true);
    } else {
      userInteractedRef.current = true;
      setAutoScroll(false);
      setShowResume(true);
    }
  }, [autoScrollEnabled]);

  const togglePauseJob = async () => {
    if (!data) return;
    const targetPaused = !data.job.paused;
    setActionState(targetPaused ? "pause" : "resume");
    try {
      const res = await fetch(`/api/scrape_jobs/${data.job.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ paused: targetPaused }),
      });

      if (res.ok) {
        await mutate();
      }
    } finally {
      setActionState(null);
    }
  };

  const requeueJob = async () => {
    if (!data) return;
    setActionState("requeue");
    try {
      const res = await fetch(`/api/scrape_jobs/${data.job.id}/trigger`, {
        method: "POST",
        headers: authHeaders,
      });

      if (res.ok) {
        await mutate();
      }
    } finally {
      setActionState(null);
    }
  };

  const cancelJob = async () => {
    if (!data) return;
    setActionState("cancel");
    try {
      const res = await fetch(`/api/scrape_jobs/${data.job.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      if (res.ok) {
        await mutate();
      }
    } finally {
      setActionState(null);
    }
  };

  const sendToVectorStore = async () => {
    if (!data) return;
    setIngesting("working");
    const snippet = (data.log || "").slice(0, 1200) ||
      `Scrape job ${data.job.id} completed with status ${data.job.status}.`;

    try {
      const res = await fetch("/api/scraper_ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdownBlobs: [
            {
              content: snippet,
              source: `${data.job.script}.log`,
              filename: `${data.job.id}.md`,
            },
          ],
          destinationFolder: "knowledge_base",
        }),
      });

      if (res.ok) {
        setIngesting("done");
      } else {
        setIngesting("error");
      }
    } catch (err) {
      console.error("Error sending to vector store", err);
      setIngesting("error");
    }
  };

  const renderStatusPill = (status: ScrapeJobStatus, paused: boolean) => {
    if (paused) {
      return (
        <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
          Paused · {status}
        </span>
      );
    }

    const colors: Record<ScrapeJobStatus, string> = {
      [ScrapeJobStatus.queued]: "bg-amber-50 text-amber-700 border border-amber-200",
      [ScrapeJobStatus.running]: "bg-blue-50 text-blue-700 border border-blue-200",
      [ScrapeJobStatus.completed]: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      [ScrapeJobStatus.failed]: "bg-red-50 text-red-700 border border-red-200",
    };

    return (
      <span className={`text-xs px-2 py-1 rounded-full ${colors[status]}`}>
        {status}
      </span>
    );
  };

  if (!id) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center text-sm text-zinc-600">
        Loading job…
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center text-sm text-zinc-600">
        Loading job…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center text-sm text-red-600">
        Failed to load job details.
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center pt-16 md:pt-24 px-4 pb-16 md:pb-24">
      <div className="w-full max-w-4xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-500">Job ID</div>
            <div className="text-lg font-semibold text-zinc-800">{data.job.id}</div>
            <div className="text-sm text-zinc-500">Script: {data.job.script}</div>
            <div className="mt-2 text-xs text-zinc-500">Output: {KNOWLEDGE_BASE_PATH}</div>
            <div className="text-[11px] text-zinc-400">{logSnippet}</div>
          </div>
          <Link href="/scrape_jobs" className="text-sm text-[#2B83F6] hover:underline">
            ← Back to jobs
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-sm flex flex-col gap-2">
            <div className="text-sm text-zinc-500">Status</div>
            <div className="flex items-center gap-2 text-lg font-semibold text-zinc-800">
              {data.job.status}
              {renderStatusPill(data.job.status, data.job.paused)}
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              Cadence: {data.job.cadence}
              <span className="text-[10px] text-zinc-400">Duration: {formatDuration(data.stats.durationSeconds)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className={`h-2 ${progressColor(data.job.status, data.job.paused)}`}
                  style={{ width: `${progressFromStatus(data.job.status, data.job.paused)}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500">
                {data.job.paused ? "Paused" : data.job.status === ScrapeJobStatus.completed ? "100%" : "In progress"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-2 text-xs text-zinc-500">
              <span>Args: {formatArgs(data.job.args)}</span>
              {targetValue ? (
                <button
                  type="button"
                  className="flex items-center gap-1 text-[#2B83F6] hover:underline"
                  onClick={() => copy(targetValue, setCopiedTarget)}
                >
                  <Copy size={14} />
                  {copiedTarget ? "Copied" : "Copy target"}
                </button>
              ) : null}
            </div>
            <div className="text-xs text-zinc-500">Started: {formatDate(data.job.startedAt)}</div>
            <div className="text-xs text-zinc-500">Finished: {formatDate(data.job.finishedAt)}</div>
            <div className="text-xs text-zinc-500">Next run: {formatDate(data.job.nextRunAt)}</div>
            <div className="text-xs text-zinc-500">Log path: {data.job.logPath ?? "—"}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-sm flex flex-col gap-2">
            <div className="text-sm text-zinc-500">Stats</div>
            <div className="text-xs text-zinc-600">Duration: {data.stats.durationSeconds ?? "—"}s</div>
            <div className="text-xs text-zinc-600">Docs ingested: {data.stats.documentsIngested ?? "—"}</div>
            <div className="text-xs text-zinc-600">Last update: {formatDate(data.job.createdAt)}</div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={sendToVectorStore}
                disabled={ingesting === "working"}
                className="flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs font-medium hover:border-[#2B83F6] disabled:opacity-60"
              >
                {ingesting === "working" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send to vector stores
              </button>
              <button
                onClick={togglePauseJob}
                disabled={Boolean(actionState)}
                className="flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs font-medium hover:border-[#2B83F6] disabled:opacity-60"
              >
                {actionState === "pause" || actionState === "resume" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : data.job.paused ? (
                  "Resume"
                ) : (
                  "Pause"
                )}
              </button>
              <button
                onClick={requeueJob}
                disabled={Boolean(actionState)}
                className="flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs font-medium hover:border-[#2B83F6] disabled:opacity-60"
              >
                {actionState === "requeue" ? <Loader2 size={14} className="animate-spin" /> : "Requeue"}
              </button>
              <button
                onClick={cancelJob}
                disabled={Boolean(actionState)}
                className="flex items-center gap-2 border border-red-200 rounded-lg px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300 disabled:opacity-60"
              >
                {actionState === "cancel" ? <Loader2 size={14} className="animate-spin" /> : "Cancel"}
              </button>
            </div>
            {ingesting === "done" && (
              <div className="text-[11px] text-emerald-600">Ingestion triggered.</div>
            )}
            {ingesting === "error" && (
              <div className="text-[11px] text-red-600">Failed to send; retry?</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-sm font-semibold text-zinc-800">Log output</div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-[#2B83F6] focus:ring-[#2B83F6]"
                  checked={autoScrollEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setAutoScrollEnabled(enabled);
                    if (!enabled) {
                      userInteractedRef.current = true;
                      setAutoScroll(false);
                      setShowResume(false);
                    }
                  }}
                  aria-label="Toggle auto-scroll"
                />
                Auto-scroll
              </label>
              {data.log ? (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-[#2B83F6] hover:underline"
                  onClick={() => copy(data.log ?? "", setCopiedLog)}
                >
                  <Copy size={14} />
                  {copiedLog ? "Copied" : "Copy log"}
                </button>
              ) : null}
            </div>
          </div>
          <div
            ref={logContainerRef}
            tabIndex={0}
            className="bg-zinc-50 border border-zinc-100 rounded-lg max-h-[500px] overflow-y-auto"
          >
            <pre ref={logContentRef} className="whitespace-pre-wrap text-xs p-3">
              {data.log ?? "No log available yet."}
            </pre>
            {autoScrollEnabled && !autoScroll && showResume ? (
              <div className="sticky bottom-0 w-full bg-gradient-to-t from-zinc-50 to-transparent px-3 pb-3 flex justify-end">
                <button
                  type="button"
                  className="text-xs text-white bg-[#2B83F6] hover:bg-[#1d6ccd] transition-colors px-3 py-1 rounded"
                  onClick={() => {
                    userInteractedRef.current = false;
                    setAutoScroll(true);
                    setShowResume(false);
                    const container = logContainerRef.current;
                    if (container) {
                      requestAnimationFrame(() => {
                        container.scrollTo({
                          top: container.scrollHeight,
                          behavior: "smooth",
                        });
                      });
                    }
                  }}
                >
                  Resume live logs
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
