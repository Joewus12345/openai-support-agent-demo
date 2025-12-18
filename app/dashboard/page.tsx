"use client";

import { useEffect, useMemo, useState } from "react";

import AgentView from "@/components/AgentView";
import SessionTimer from "@/components/SessionTimer";
import UserView from "@/components/UserView";
import { AppSidebar } from "@/components/app-sidebar";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import useConversationStore from "@/stores/useConversationStore";
import { useSessionStore } from "@/stores/useSessionStore";
import type { ChatMessage } from "@/lib/assistant";
import {
  DashboardDataTable,
  type DashboardFileRow,
  type DashboardJobRow,
} from "@/components/dashboard-data-table";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";

function formatDateValue(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

function getDateKey(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function RecentMessages() {
  const chatMessages = useConversationStore((state) => state.chatMessages);
  const pendingMessages = useConversationStore(
    (state) => state.pendingMessages
  );

  const rows = useMemo(() => {
    return [...chatMessages]
      .filter((item): item is ChatMessage => item.type === "message")
      .slice(-6)
      .reverse()
      .map((item, idx) => {
        const content = Array.isArray(item.content)
          ? item.content.find((entry: any) => entry.text)?.text ?? ""
          : "";
        return {
          id: idx,
          role: item.role,
          summary: content || "(no text content)",
        };
      });
  }, [chatMessages]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Conversation activity</CardTitle>
        <CardDescription>
          Latest exchanges between the customer and the support assistant.
          Pending messages: {pendingMessages.length}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Role</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.role}-${row.id}`}>
                <TableCell className="font-medium">
                  <Badge variant="outline" className="capitalize">
                    {row.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.summary}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ConversationWorkspace({
  activeView,
  onChange,
}: {
  activeView: string;
  onChange: (value: string) => void;
}) {
  return (
    <Card className="@container/card">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <CardTitle>Live handoff workspace</CardTitle>
          <CardDescription className="text-sm">
            Swap between the customer and agent views without losing context.
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <SessionTimer />
          <Separator orientation="vertical" className="h-5" />
          <span>Real-time state is shared across both panels.</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeView} onValueChange={onChange} className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-3 rounded-md border px-3 py-2 text-xs md:hidden">
              <span
                className={`font-semibold ${
                  activeView === "customer"
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Customer View
              </span>
              <Switch
                checked={activeView === "agent"}
                onCheckedChange={(checked) =>
                  onChange(checked ? "agent" : "customer")
                }
              />
              <span
                className={`font-semibold ${
                  activeView === "agent"
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Agent View
              </span>
            </div>
            <TabsList className="hidden w-full grid-cols-2 md:grid">
              <TabsTrigger value="customer">Customer View</TabsTrigger>
              <TabsTrigger value="agent">Agent View</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="customer" className="space-y-4">
            <UserView />
          </TabsContent>
          <TabsContent value="agent" className="space-y-4">
            <AgentView />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function Page() {
  const { chatMessages, pendingMessages, autoReply, modelProvider } =
    useConversationStore();
  const { roles, userId, verified, expiresAt } = useSessionStore();
  const [activeView, setActiveView] = useState("customer");
  const [jobRows, setJobRows] = useState<(DashboardJobRow & { createdAtRaw: string | null; finishedAtRaw: string | null })[]>([]);
  const [fileRows, setFileRows] = useState<(DashboardFileRow & { modifiedAtRaw: string | null })[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(true);

  useEffect(() => {
    const loadJobs = async () => {
      try {
        setLoadingJobs(true);
        const response = await fetch("/api/scrape_jobs?limit=20");
        const payload = await response.json();
        const jobsArray = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.jobs)
          ? payload.jobs
          : [];

        const normalized = jobsArray.slice(0, 10).map((entry: any, index: number) => {
          const job = entry?.job ?? entry ?? {};
          const args = job.args as Record<string, unknown> | undefined;
          const target = (args?.url as string | undefined) ?? (args?.targetUrl as string | undefined) ?? "";
          const createdAtRaw = (job.createdAt as string | undefined) ?? (job.startedAt as string | undefined) ?? null;
          const finishedAtRaw = (job.finishedAt as string | undefined) ?? null;

          return {
            id: job.id ?? `job-${index}`,
            script: job.script ?? "Unknown script",
            status: String(job.status ?? "unknown"),
            target,
            createdAt: formatDateValue(createdAtRaw),
            finishedAt: formatDateValue(finishedAtRaw),
            createdAtRaw,
            finishedAtRaw,
          };
        });

        setJobRows(normalized);
      } catch (error) {
        console.error("Failed to load dashboard jobs", error);
        setJobRows([]);
      } finally {
        setLoadingJobs(false);
      }
    };

    const loadFiles = async () => {
      try {
        setLoadingFiles(true);
        const response = await fetch("/api/list_files?folder=knowledge_base");
        const payload = await response.json();
        const files = (payload?.files as DashboardFileRow[]) ?? [];
        const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 10);
        setFileRows(
          sorted.map((file) => {
            const modifiedAtRaw = file.modifiedAt ?? null;
            return {
              ...file,
              modifiedAt: formatDateValue(modifiedAtRaw),
              modifiedAtRaw,
            };
          })
        );
      } catch (error) {
        console.error("Failed to load dashboard knowledge base files", error);
        setFileRows([]);
      } finally {
        setLoadingFiles(false);
      }
    };

    void loadJobs();
    void loadFiles();
  }, []);

  const chartData = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 14 }).map((_, idx) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (13 - idx));
      return date;
    });

    const jobCounts = jobRows.reduce<Record<string, number>>((acc, job) => {
      const dateKey = getDateKey(job.createdAtRaw);
      if (dateKey) acc[dateKey] = (acc[dateKey] ?? 0) + 1;
      return acc;
    }, {});

    const kbCounts = fileRows.reduce<Record<string, number>>((acc, file) => {
      const key = getDateKey(file.modifiedAtRaw);
      if (key) acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return days.map((date) => {
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        jobs: jobCounts[key] ?? 0,
        updates: kbCounts[key] ?? 0,
      };
    });
  }, [jobRows, fileRows]);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <SectionCards
                stats={{
                  roles,
                  userId,
                  verified,
                  expiresAt,
                  messageCount: chatMessages.length,
                  pendingMessages: pendingMessages.length,
                  autoReply,
                  modelProvider,
                }}
              />
              <div className="px-4 lg:px-6">
                <ConversationWorkspace
                  activeView={activeView}
                  onChange={setActiveView}
                />
              </div>
              <div className="px-4 lg:px-6">
                <RecentMessages />
              </div>
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive
                  data={chartData}
                  title="User and content activity"
                  description="Daily scrape completions and knowledge base updates"
                  defaultRange="30d"
                />
              </div>
              <div className="px-4 lg:px-6">
                <DashboardDataTable
                  jobs={jobRows}
                  files={fileRows}
                  loadingJobs={loadingJobs}
                  loadingFiles={loadingFiles}
                />
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
