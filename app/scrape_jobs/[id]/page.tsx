"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Copy } from "lucide-react";
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
  const [autoScroll, setAutoScroll] = useState(true);
  const [showResume, setShowResume] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const logContentRef = useRef<HTMLPreElement | null>(null);
  const userInteractedRef = useRef(false);

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
  }, []);

  useEffect(() => {
    const container = logContainerRef.current;
    const bottomTolerance = 16;

    if (!container) return;

    const handleScroll = () => {
      if (!container) return;
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
  }, [autoScroll]);

  useLayoutEffect(() => {
    if (!autoScroll || userInteractedRef.current) return;
    const container = logContainerRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
  }, [data?.log, autoScroll]);

  useEffect(() => {
    if (!autoScroll) return;
    const content = logContentRef.current;
    const container = logContainerRef.current;
    if (!content || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      if (!autoScroll || userInteractedRef.current) return;
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      });
    });

    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, [autoScroll]);

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
          </div>
          <Link href="/scrape_jobs" className="text-sm text-[#2B83F6] hover:underline">
            ← Back to jobs
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-sm flex flex-col gap-2">
            <div className="text-sm text-zinc-500">Status</div>
            <div className="text-lg font-semibold text-zinc-800">{data.job.status}</div>
            <div className="text-xs text-zinc-500">Cadence: {data.job.cadence}</div>
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
            <div className="text-xs text-zinc-500">Output path: {KNOWLEDGE_BASE_PATH}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-sm flex flex-col gap-2">
            <div className="text-sm text-zinc-500">Stats</div>
            <div className="text-xs text-zinc-600">Duration: {data.stats.durationSeconds ?? "—"}s</div>
            <div className="text-xs text-zinc-600">Docs ingested: {data.stats.documentsIngested ?? "—"}</div>
            <div className="text-xs text-zinc-600">Log path: {data.job.logPath ?? "—"}</div>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-zinc-800">Log output</div>
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
          <div
            ref={logContainerRef}
            tabIndex={0}
            className="bg-zinc-50 border border-zinc-100 rounded-lg max-h-[500px] overflow-y-auto"
          >
            <pre ref={logContentRef} className="whitespace-pre-wrap text-xs p-3">
              {data.log ?? "No log available yet."}
            </pre>
            {!autoScroll && showResume ? (
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
