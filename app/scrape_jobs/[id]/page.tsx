"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Copy,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Send,
  ChevronDown,
  ExternalLink,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import useSWR from "swr";

import { ScrapeJobCadence, ScrapeJobStatus } from "@/lib/generated/prisma";
import type { StoredIngestionResult } from "@/lib/ingestionResults";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const KNOWLEDGE_BASE_PATH = "public/knowledge_base";

type JobStats = {
  status: ScrapeJobStatus;
  durationSeconds: number | null;
  documentsIngested: number | null;
  progress: number | null;
};

type ScrapeJob = {
  id: string;
  script: string;
  args: Record<string, unknown> | null;
  status: ScrapeJobStatus;
  cadence: ScrapeJobCadence;
  paused: boolean;
  progress?: number;
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
  artifacts: string[];
  ingestionResult?: (StoredIngestionResult & { jobId: string }) | null;
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

function formatTimestamp(value: number | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function deriveProgress(job: ScrapeJob) {
  if (typeof job.progress === "number") {
    return Math.max(0, Math.min(100, Math.round(job.progress)));
  }
  if (job.paused) return 0;
  if (job.status === ScrapeJobStatus.completed || job.status === ScrapeJobStatus.failed) return 100;
  if (job.status === ScrapeJobStatus.canceled) return 100;
  if (job.status === ScrapeJobStatus.running) return 70;
  if (job.status === ScrapeJobStatus.queued) return 25;
  return 40;
}

function progressColor(status: ScrapeJobStatus, paused: boolean) {
  if (paused) return "bg-zinc-300";
  if (status === ScrapeJobStatus.canceled) return "bg-zinc-400";
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
  const [runFeedback, setRunFeedback] = useState<string | null>(null);
  const [openActivity, setOpenActivity] = useState(false);
  const [copiedVectorIds, setCopiedVectorIds] = useState<Record<string, boolean>>({});
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const logContentRef = useRef<HTMLPreElement | null>(null);
  const userInteractedRef = useRef(false);

  const authHeaders = {
    "Content-Type": "application/json",
    "x-session-verified": "true",
  };

  const copy = async (value: string, onCopied?: (flag: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(value);
      onCopied?.(true);
      setTimeout(() => onCopied?.(false), 1200);
    } catch {
      onCopied?.(false);
    }
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

  const runJobNow = async () => {
    if (!data) return;
    setActionState("run-now");
    setRunFeedback(null);
    try {
      const res = await fetch(`/api/scrape_jobs/${data.job.id}/clone`, {
        method: "POST",
        headers: authHeaders,
      });

      if (res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { job?: { id?: string } }
          | null;
        setRunFeedback(
          payload?.job?.id
            ? `New run created from this job (ID: ${payload.job.id})`
            : "New run created from this job"
        );
        await mutate();
      } else {
        setRunFeedback("Failed to queue run now.");
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

  const deleteJob = async () => {
    if (!data) return;
    const confirmDelete = window.confirm(
      "Delete this job and its artifacts permanently? This cannot be undone."
    );
    if (!confirmDelete) return;

    setActionState("delete");
    try {
      const res = await fetch(`/api/scrape_jobs/${data.job.id}/hard`, {
        method: "DELETE",
        headers: authHeaders,
      });

      if (res.ok) {
        await mutate();
        window.location.href = "/scrape_jobs";
      }
    } finally {
      setActionState(null);
    }
  };

  const sendToVectorStore = async () => {
    if (!data) return;
    setIngesting("working");
    const artifactPaths = data.artifacts || [];

    if (artifactPaths.length === 0) {
      setRunFeedback("No scraped artifacts were found for this run.");
      setIngesting("error");
      return;
    }

    try {
      const res = await fetch("/api/scraper_ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: data.job.id,
          artifactPaths,
          destinationFolder: "knowledge_base",
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (res.ok) {
        setIngesting("done");
        const docs = (result.ingestedDocuments as string[]) || artifactPaths;
        setRunFeedback(
          typeof result.message === "string"
            ? result.message
            : `Ingestion triggered for ${docs.length} document(s).`
        );
        await mutate();
      } else {
        setIngesting("error");
        const error = typeof result?.error === "string" ? result.error : "Failed to start ingestion.";
        setRunFeedback(error);
      }
    } catch (err) {
      console.error("Error sending to vector store", err);
      setIngesting("error");
      setRunFeedback("Unexpected error while sending to vector store.");
    }
  };

  const renderStatusPill = (status: ScrapeJobStatus, paused: boolean) => {
    const labels: Partial<Record<ScrapeJobStatus, string>> = {
      [ScrapeJobStatus.queued]: "Queued",
      [ScrapeJobStatus.running]: "Running",
      [ScrapeJobStatus.completed]: "Completed",
      [ScrapeJobStatus.failed]: "Failed",
      [ScrapeJobStatus.canceled]: "Canceled",
    };

    const label = paused ? `Paused — ${labels[status] ?? status}` : labels[status] ?? status;

    const colors: Partial<Record<ScrapeJobStatus, string>> = {
      [ScrapeJobStatus.queued]: "bg-amber-50 text-amber-700 border border-amber-200",
      [ScrapeJobStatus.running]: "bg-blue-50 text-blue-700 border border-blue-200",
      [ScrapeJobStatus.completed]: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      [ScrapeJobStatus.failed]: "bg-red-50 text-red-700 border border-red-200",
      [ScrapeJobStatus.canceled]: "bg-zinc-100 text-zinc-700 border border-zinc-200",
    };

    const baseColor = paused ? "bg-amber-50 text-amber-700 border border-amber-200" : colors[status];

    return (
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
          baseColor ?? "bg-zinc-100 text-zinc-700 border border-zinc-200"
        }`}
      >
        {label}
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

  const progressValue = deriveProgress(data.job);

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center pt-10 md:pt-14 px-4 pb-16 md:pb-20">
      <div className="w-full max-w-4xl flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
          <div className="flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Scrape job</div>
            <div className="text-2xl font-semibold text-zinc-900">{data.job.script}</div>
            <div className="text-sm text-zinc-500">Job ID: {data.job.id}</div>
            <div className="text-xs text-zinc-500">Output: {KNOWLEDGE_BASE_PATH}</div>
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
                    style={{ width: `${progressValue}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 tabular-nums">{progressValue}%</span>
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
                  <PlayCircle size={14} />
                ) : (
                  <PauseCircle size={14} />
                )}
                {data.job.paused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={runJobNow}
                disabled={Boolean(actionState)}
                className="flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs font-medium hover:border-[#2B83F6] disabled:opacity-60"
              >
                {actionState === "run-now" ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Run now
              </button>
              <button
                onClick={requeueJob}
                disabled={Boolean(actionState)}
                className="flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs font-medium hover:border-[#2B83F6] disabled:opacity-60"
              >
                {actionState === "requeue" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Requeue
              </button>
              <button
                onClick={cancelJob}
                disabled={Boolean(actionState)}
                className="flex items-center gap-2 border border-red-200 rounded-lg px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300 disabled:opacity-60"
              >
                {actionState === "cancel" ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Cancel
              </button>
              <button
                onClick={deleteJob}
                disabled={Boolean(actionState)}
                className="flex items-center gap-2 border border-red-200 rounded-lg px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300 disabled:opacity-60"
              >
                {actionState === "delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
            {ingesting === "done" && (
              <div className="text-[11px] text-emerald-600">
                {runFeedback || "Ingestion triggered."}
              </div>
            )}
            {ingesting === "error" && (
              <div className="text-[11px] text-red-600">Failed to send; retry?</div>
            )}
          {runFeedback && (
            <div className="text-[11px] text-zinc-600">{runFeedback}</div>
          )}
        </div>
      </div>

      {data.ingestionResult && (
        <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setOpenActivity((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-left hover:border-zinc-300"
          >
            <div className="flex items-center gap-2">
              <ChevronDown
                size={14}
                className={`transition-transform ${openActivity ? "rotate-180" : "rotate-0"}`}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-zinc-800">Ingestion activity</span>
                <span
                  className={`text-[11px] ${
                    data.ingestionResult.status === "success"
                      ? "text-emerald-700"
                      : data.ingestionResult.status === "skipped"
                        ? "text-amber-700"
                        : "text-red-600"
                  }`}
                >
                  {data.ingestionResult.status.toUpperCase()} — {data.ingestionResult.message}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-zinc-500 text-right">
              <div>{formatTimestamp(data.ingestionResult.timestamp)}</div>
              <div>
                {(data.ingestionResult.uploadedFiles?.length ?? 0)} uploaded · {data.ingestionResult.changedFiles.length} changed · {data.ingestionResult.unchangedFiles.length} unchanged
              </div>
            </div>
          </button>

          {openActivity && (
            <div className="mt-3 space-y-3 text-[11px] text-zinc-700">
              <div>{data.ingestionResult.message}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="font-semibold text-zinc-800">Changed files</div>
                  {data.ingestionResult.changedFiles.length === 0 ? (
                    <div className="text-zinc-500">None</div>
                  ) : (
                    <ul className="list-disc pl-4">
                      {data.ingestionResult.changedFiles.map((file) => (
                        <li key={file}>{file}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-zinc-800">Unchanged files</div>
                  {data.ingestionResult.unchangedFiles.length === 0 ? (
                    <div className="text-zinc-500">None</div>
                  ) : (
                    <ul className="list-disc pl-4">
                      {data.ingestionResult.unchangedFiles.map((file) => (
                        <li key={file}>{file}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {data.ingestionResult.uploadedFiles?.length ? (
                <div className="text-[11px] text-zinc-700">
                  <div className="font-semibold text-zinc-800">Vector store uploads</div>
                  <div className="text-[10px] text-zinc-500 mb-1">
                    {data.ingestionResult.vectorStoreId ? (
                      <a
                        href={`https://platform.openai.com/storage/vector-stores/${data.ingestionResult.vectorStoreId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink size={12} />
                        Open vector store
                      </a>
                    ) : (
                      "Vector store ID not available"
                    )}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {data.ingestionResult.uploadedFiles.map((file) => (
                      <li key={`${file.filePath}-${file.vectorStoreFileId}`} className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
                        <div className="text-[11px] font-semibold text-zinc-800">{file.filePath}</div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                          <span>OpenAI file: {file.fileId ?? "—"}</span>
                          {file.fileId && (
                            <button
                              type="button"
                              className="text-blue-600 hover:underline"
                              onClick={() =>
                                copy(file.fileId!, () => {
                                  setCopiedVectorIds((state) => ({
                                    ...state,
                                    [file.fileId as string]: true,
                                  }));
                                  setTimeout(
                                    () =>
                                      setCopiedVectorIds((state) => ({
                                        ...state,
                                        [file.fileId as string]: false,
                                      })),
                                    1200
                                  );
                                })
                              }
                            >
                              {copiedVectorIds[file.fileId] ? "Copied" : "Copy"}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                          <span>Vector store file: {file.vectorStoreFileId ?? "—"}</span>
                          {file.vectorStoreFileId && (
                            <button
                              type="button"
                              className="text-blue-600 hover:underline"
                              onClick={() =>
                                copy(file.vectorStoreFileId!, () => {
                                  setCopiedVectorIds((state) => ({
                                    ...state,
                                    [file.vectorStoreFileId as string]: true,
                                  }));
                                  setTimeout(
                                    () =>
                                      setCopiedVectorIds((state) => ({
                                        ...state,
                                        [file.vectorStoreFileId as string]: false,
                                      })),
                                    1200
                                  );
                                })
                              }
                            >
                              {copiedVectorIds[file.vectorStoreFileId] ? "Copied" : "Copy"}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {data.ingestionResult.deletedVectorStoreFiles &&
                Object.keys(data.ingestionResult.deletedVectorStoreFiles).length > 0 && (
                  <div className="text-[11px] text-zinc-700">
                    <div className="font-semibold text-zinc-800">Replaced vector store files</div>
                    <ul className="list-disc pl-4">
                      {Object.entries(data.ingestionResult.deletedVectorStoreFiles).map(([filePath, vectorId]) => (
                        <li key={filePath} className="flex items-center gap-2">
                          <span>{filePath}</span>
                          <span className="text-zinc-500">({vectorId})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {data.ingestionResult.ingestionLogs &&
                (data.ingestionResult.ingestionLogs.stdout || data.ingestionResult.ingestionLogs.stderr) && (
                  <div className="text-[11px] text-zinc-700">
                    <div className="font-semibold text-zinc-800">Ingestion logs</div>
                    {data.ingestionResult.ingestionLogs.stdout && (
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-900 p-2 text-[10px] text-zinc-100">
                        {data.ingestionResult.ingestionLogs.stdout}
                      </pre>
                    )}
                    {data.ingestionResult.ingestionLogs.stderr && (
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-red-900/80 p-2 text-[10px] text-red-50">
                        {data.ingestionResult.ingestionLogs.stderr}
                      </pre>
                    )}
                  </div>
                )}
            </div>
          )}
        </div>
      )}

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
