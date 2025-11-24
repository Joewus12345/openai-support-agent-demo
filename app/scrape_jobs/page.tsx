"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  CalendarClock,
  CalendarRange,
  Copy,
  Loader2,
  PlayCircle,
  Send,
} from "lucide-react";

import { ScrapeJobCadence, ScrapeJobStatus } from "@/lib/generated/prisma";

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
  createdAt: string;
};

type JobStats = {
  status: ScrapeJobStatus;
  durationSeconds: number | null;
  documentsIngested: number | null;
};

type SerializedJob = {
  job: ScrapeJob;
  log: string | null;
  stats: JobStats;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SCRIPT_PRESETS = [
  {
    key: "docs-sequential-v2",
    label: "Sequential sitemap",
    hint: "Best for stable sitemaps; walks URLs in order with predictable pacing.",
    defaultTarget: "https://automationghana.com/sitemap_index.xml",
  },
  {
    key: "docs-sequential-v1",
    label: "Sequential sitemap (v1)",
    hint: "Legacy sequential crawler tuned for sitemap-driven docs.",
    defaultTarget: "https://automationghana.com/sitemap_index.xml",
  },
  {
    key: "sitemap-parallel",
    label: "Parallel sitemap",
    hint: "Fan-out crawler that accelerates large sitemaps with concurrency controls.",
    defaultTarget: "https://automationghana.com/sitemap_index.xml",
  },
  {
    key: "woocommerce",
    label: "WooCommerce",
    hint: "Tailored product crawler that keeps variant and pricing metadata intact.",
    defaultTarget: "https://store.automationghana.com",
  },
  {
    key: "docs-fast-v1",
    label: "FAST docs (v1)",
    hint: "Legacy concurrent docs crawler optimized for speed.",
    defaultTarget: "https://automationghana.com/sitemap_index.xml",
  },
  {
    key: "recursive-v2",
    label: "Recursive",
    hint: "Discovers deep links from a root URL—good for docs without sitemaps.",
    defaultTarget: "https://automationghana.com",
  },
  {
    key: "llms-txt",
    label: "LLM text",
    hint: "Optimized for llms.txt / Markdown feeds with minimal boilerplate noise.",
    defaultTarget: "https://automationghana.com/llms.txt",
  },
];

const KNOWLEDGE_BASE_PATH = "public/knowledge_base";

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

function progressFromStatus(status: ScrapeJobStatus) {
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

function progressColor(status: ScrapeJobStatus) {
  if (status === ScrapeJobStatus.failed) return "bg-red-500";
  if (status === ScrapeJobStatus.completed) return "bg-emerald-500";
  return "bg-[#2B83F6]";
}

export default function ScrapeJobsPage() {
  const { data, error, isLoading, mutate } = useSWR<SerializedJob[]>(
    "/api/scrape_jobs?detailed=true",
    fetcher,
    { refreshInterval: 15000, revalidateOnFocus: false }
  );

  const [selectedPreset, setSelectedPreset] = useState(SCRIPT_PRESETS[0].key);
  const [targetUrl, setTargetUrl] = useState(SCRIPT_PRESETS[0].defaultTarget);
  const [creating, setCreating] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState<Record<string, string>>({});
  const [copiedTarget, setCopiedTarget] = useState(false);
  const [copiedLog, setCopiedLog] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const source = new EventSource("/api/scrape_jobs/updates");

    source.onmessage = () => {
      void mutate();
    };

    source.onerror = () => {
      setTimeout(() => void mutate(), 1000);
    };

    return () => {
      source.close();
    };
  }, [mutate]);

  const handlePresetChange = (key: string) => {
    setSelectedPreset(key);
    const preset = SCRIPT_PRESETS.find((p) => p.key === key);
    if (preset?.defaultTarget) {
      setTargetUrl(preset.defaultTarget);
    }
  };

  const createJob = async (cadence: ScrapeJobCadence) => {
    try {
      setCreating(cadence);
      const response = await fetch("/api/scrape_jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-verified": "true",
        },
        body: JSON.stringify({
          script: selectedPreset,
          args: targetUrl ? { targetUrl } : {},
          cadence,
          status: ScrapeJobStatus.queued,
        }),
      });

      if (!response.ok) {
        console.error("Failed to create job", await response.text());
      } else {
        await mutate();
      }
    } finally {
      setCreating(null);
    }
  };

  const enqueueManual = () => createJob(ScrapeJobCadence.manual);
  const scheduleDaily = () => createJob(ScrapeJobCadence.daily);
  const scheduleWeekly = () => createJob(ScrapeJobCadence.weekly);
  const scheduleMonthly = () => createJob(ScrapeJobCadence.monthly);

  const copyText = async (value: string, onCopied: () => void) => {
    try {
      await navigator.clipboard.writeText(value);
      onCopied();
    } catch {
      // ignore
    }
  };

  const sendToVectorStore = async (job: SerializedJob) => {
    setIngesting((state) => ({ ...state, [job.job.id]: "working" }));
    const snippet = (job.log || "").slice(0, 1200) ||
      `Scrape job ${job.job.id} completed with status ${job.job.status}.`;

    try {
      const res = await fetch("/api/scraper_ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdownBlobs: [
            {
              content: snippet,
              source: `${job.job.script}.log`,
              filename: `${job.job.id}.md`,
            },
          ],
          destinationFolder: "knowledge_base",
        }),
      });

      if (res.ok) {
        setIngesting((state) => ({ ...state, [job.job.id]: "done" }));
      } else {
        setIngesting((state) => ({ ...state, [job.job.id]: "error" }));
      }
    } catch (err) {
      console.error("Error sending to vector store", err);
      setIngesting((state) => ({ ...state, [job.job.id]: "error" }));
    }
  };

  const renderStatusPill = (status: ScrapeJobStatus) => {
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

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center pt-16 md:pt-24 px-4">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        <div className="flex flex-col gap-2 max-w-3xl">
          <div className="text-2xl font-bold">Scrape job control panel</div>
          <p className="text-sm text-zinc-500">
            Mirror the vector store setup flow: pick a crawler preset, send it now or schedule it, then ship logs to
            vector stores for embeddings in one click.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {SCRIPT_PRESETS.map((preset) => (
            <button
              key={preset.key}
              title={preset.hint}
              onClick={() => handlePresetChange(preset.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                selectedPreset === preset.key
                  ? "bg-[#2B83F6] text-white border-[#2B83F6]"
                  : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <Copy size={14} />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <PlayCircle size={18} className="text-[#2B83F6]" />
              Scrape now
            </div>
            <label className="flex flex-col gap-1 text-sm text-zinc-600">
              Target URL or domain
              <div className="flex gap-2">
                <input
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#2B83F6]"
                  placeholder="https://example.com/sitemap.xml"
                />
                <button
                  type="button"
                  onClick={() =>
                    copyText(targetUrl, () => {
                      setCopiedTarget(true);
                      setTimeout(() => setCopiedTarget(false), 1200);
                    })
                  }
                  className="shrink-0 px-3 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-700 hover:border-[#2B83F6]"
                  aria-label="Copy target URL"
                >
                  {copiedTarget ? "Copied" : "Copy"}
                </button>
              </div>
            </label>
            <button
              onClick={enqueueManual}
              disabled={creating !== null}
              className="flex items-center justify-center gap-2 bg-[#2B83F6] text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-[#2B83F6]/90 disabled:opacity-60"
            >
              {creating === ScrapeJobCadence.manual ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <PlayCircle size={16} />
              )}
              Run immediately
            </button>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CalendarRange size={18} className="text-[#2B83F6]" />
              Schedule daily/weekly/monthly
            </div>
            <p className="text-sm text-zinc-600">
              Keep high-value sources fresh by enrolling them in the scheduler. We will enqueue runs at the start of the next
              interval.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={scheduleDaily}
                disabled={creating !== null}
                className="flex items-center justify-center gap-2 border border-zinc-200 rounded-lg py-2 text-sm font-medium hover:border-[#2B83F6] disabled:opacity-60"
              >
                {creating === ScrapeJobCadence.daily ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <CalendarClock size={16} />
                )}
                Daily
              </button>
              <button
                onClick={scheduleWeekly}
                disabled={creating !== null}
                className="flex items-center justify-center gap-2 border border-zinc-200 rounded-lg py-2 text-sm font-medium hover:border-[#2B83F6] disabled:opacity-60"
              >
                {creating === ScrapeJobCadence.weekly ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <CalendarClock size={16} />
                )}
                Weekly
              </button>
              <button
                onClick={scheduleMonthly}
                disabled={creating !== null}
                className="flex items-center justify-center gap-2 border border-zinc-200 rounded-lg py-2 text-sm font-medium hover:border-[#2B83F6] disabled:opacity-60"
              >
                {creating === ScrapeJobCadence.monthly ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <CalendarClock size={16} />
                )}
                Monthly
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <div className="text-lg font-semibold">Past jobs</div>
            {isLoading && <Loader2 size={18} className="animate-spin text-zinc-400" />}
          </div>
          {error && (
            <div className="text-sm text-red-600">Failed to load jobs. Please refresh.</div>
          )}
          {!data && !isLoading && !error && (
            <div className="text-sm text-zinc-500">No jobs available yet.</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-2 pr-3">Script</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Cadence</th>
                  <th className="py-2 pr-3">Timing</th>
                  <th className="py-2 pr-3">Docs</th>
                  <th className="py-2 pr-3">Log snippet</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {(data || []).map((item: SerializedJob) => {
                  const logSnippet = (item.log || "").split("\n").find(Boolean) || "No log yet.";
                  const progress = progressFromStatus(item.job.status);
                  return (
                    <tr key={item.job.id} className="align-top">
                      <td className="py-3 pr-3">
                        <div className="font-medium text-zinc-800">
                          <Link href={`/scrape_jobs/${item.job.id}`} className="hover:underline text-[#2B83F6]">
                            {item.job.script}
                          </Link>
                        </div>
                        <div className="text-xs text-zinc-500">{formatDate(item.job.createdAt)}</div>
                      </td>
                      <td className="py-3 pr-3">{renderStatusPill(item.job.status)}</td>
                      <td className="py-3 pr-3 capitalize">{item.job.cadence}</td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2 text-xs text-zinc-600">
                          <span>{formatDuration(item.stats.durationSeconds)}</span>
                          <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                            <div
                              className={`h-2 ${progressColor(item.job.status)}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Started {formatDate(item.job.startedAt)} · Finished {formatDate(item.job.finishedAt)}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-xs text-zinc-700">
                        {item.stats.documentsIngested ?? "—"}
                      </td>
                  <td className="py-3 pr-3 w-64 max-w-xs">
                    <div
                      className={`text-xs rounded-md border px-2 py-1 ${
                        item.job.status === ScrapeJobStatus.failed
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                      title={item.log || ""}
                    >
                      {logSnippet.length > 140
                        ? `${logSnippet.slice(0, 140)}…`
                        : logSnippet}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-zinc-500 mt-1">
                      <span>Output: {KNOWLEDGE_BASE_PATH}</span>
                      <button
                        type="button"
                        className="text-[#2B83F6] hover:underline"
                        onClick={() =>
                          copyText(KNOWLEDGE_BASE_PATH, () => {
                            setCopiedLog((state) => ({ ...state, [item.job.id]: true }));
                            setTimeout(
                              () => setCopiedLog((state) => ({ ...state, [item.job.id]: false })),
                              1200
                            );
                          })
                        }
                        aria-label="Copy output path"
                      >
                        {copiedLog[item.job.id] ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => sendToVectorStore(item)}
                            disabled={ingesting[item.job.id] === "working"}
                            className="flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs font-medium hover:border-[#2B83F6] disabled:opacity-60"
                          >
                            {ingesting[item.job.id] === "working" ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Send size={14} />
                            )}
                            Send to vector stores
                          </button>
                        </div>
                        {ingesting[item.job.id] === "done" && (
                          <div className="text-[11px] text-emerald-600 mt-1">Ingestion triggered.</div>
                        )}
                        {ingesting[item.job.id] === "error" && (
                          <div className="text-[11px] text-red-600 mt-1">Failed to send; retry?</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
