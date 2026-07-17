"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

import SessionTimer from "@/components/SessionTimer";
import { AppSidebar } from "@/components/app-sidebar";
import { ProtectedAppBoundary } from "@/components/auth/protected-app-boundary";
import {
  DashboardDataProvider,
  useDashboardData,
} from "@/components/dashboard/dashboard-data-provider";
import type { DashboardFileRow, DashboardJobRow } from "@/components/dashboard-data-table";
import {
  ActivityChartSkeleton,
  OperationalTableSkeleton,
  WorkspacePanelSkeleton,
} from "@/components/loading/dashboard-content-skeletons";
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
import type { ChatMessage } from "@/lib/assistant";
import useConversationStore from "@/stores/useConversationStore";
import { useSessionStore } from "@/stores/useSessionStore";

const UserView = dynamic(() => import("@/components/UserView"), {
  ssr: false,
  loading: WorkspacePanelSkeleton,
});
const AgentView = dynamic(() => import("@/components/AgentView"), {
  ssr: false,
  loading: WorkspacePanelSkeleton,
});
const ChartAreaInteractive = dynamic(
  () => import("@/components/chart-area-interactive").then((module) => module.ChartAreaInteractive),
  { ssr: false, loading: ActivityChartSkeleton }
);
const DashboardDataTable = dynamic(
  () => import("@/components/dashboard-data-table").then((module) => module.DashboardDataTable),
  { loading: OperationalTableSkeleton }
);

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateValue(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dateTimeFormatter.format(parsed);
}

function RecentMessages() {
  const chatMessages = useConversationStore((state) => state.chatMessages);
  const pendingMessages = useConversationStore((state) => state.pendingMessages);

  const rows = useMemo(
    () =>
      [...chatMessages]
        .filter((item): item is ChatMessage => item.type === "message")
        .slice(-6)
        .reverse()
        .map((item, index) => {
          const content = Array.isArray(item.content)
            ? item.content.find((entry: { text?: string }) => entry.text)?.text ?? ""
            : "";
          return {
            id: `${item.role}-${index}`,
            role: item.role,
            summary: content || "No text content",
          };
        }),
    [chatMessages]
  );

  return (
    <Card className="h-full shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-pretty">Conversation Activity</CardTitle>
            <CardDescription className="mt-1">
              Latest customer and assistant exchanges.
            </CardDescription>
          </div>
          <Badge variant="outline" className="tabular-nums">
            {pendingMessages.length} pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-28">Role</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {row.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-0 text-sm text-muted-foreground">
                      <span className="line-clamp-2 break-words">{row.summary}</span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="py-10 text-center text-sm text-muted-foreground">
                    Conversation messages will appear here when the workspace becomes active.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ConversationWorkspace() {
  const [activeView, setActiveView] = useState<"customer" | "agent">("customer");

  return (
    <Card className="overflow-hidden shadow-sm [overflow-anchor:none]">
      <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-pretty">Live Handoff Workspace</CardTitle>
          <CardDescription>
            Move between customer and agent views without losing conversation state.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <SessionTimer />
          <span aria-hidden="true">•</span>
          <span>Real-time state is shared across both views.</span>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        <Tabs
          value={activeView}
          onValueChange={(value) => setActiveView(value as "customer" | "agent")}
          className="min-w-0 space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-[22rem]">
            <TabsTrigger value="customer">Customer View</TabsTrigger>
            <TabsTrigger value="agent">Agent View</TabsTrigger>
          </TabsList>
          <div className="min-h-[38rem] min-w-0 overflow-hidden rounded-lg bg-muted/20 sm:min-h-[42rem]">
            <TabsContent value="customer" className="m-0 h-full min-w-0 p-2 sm:p-3">
              <UserView />
            </TabsContent>
            <TabsContent value="agent" className="m-0 h-full min-w-0 p-2 sm:p-3">
              <AgentView />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function DashboardContent() {
  const { chatMessages, pendingMessages, autoReply, modelProvider } = useConversationStore();
  const { roles, userId, verified, expiresAt, activeAccount } = useSessionStore();
  const { state } = useDashboardData();

  const jobs: DashboardJobRow[] = useMemo(
    () =>
      (state.overview?.jobs ?? []).map((job) => ({
        ...job,
        createdAt: formatDateValue(job.createdAt),
        finishedAt: formatDateValue(job.finishedAt),
      })),
    [state.overview?.jobs]
  );
  const files: DashboardFileRow[] = useMemo(
    () =>
      (state.overview?.files ?? []).map((file) => ({
        ...file,
        modifiedAt: formatDateValue(file.modifiedAt),
      })),
    [state.overview?.files]
  );

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
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <SiteHeader />
        <main id="main-content" className="flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-5 lg:px-6 lg:py-7">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-primary">Operations Center</p>
                <h1 className="text-2xl font-semibold tracking-tight text-pretty sm:text-3xl">
                  {activeAccount?.name ?? "Account"} Dashboard
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
                  Monitor conversations, account-private knowledge, and handoff activity from one workspace.
                </p>
              </div>
              {activeAccount ? (
                <Badge variant="outline" className="w-fit capitalize">
                  {activeAccount.status}
                </Badge>
              ) : null}
            </header>

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

            {state.error ? (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {state.error.message}
              </div>
            ) : null}

            <section aria-label="Activity overview" className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,1fr)]">
              {state.loading ? (
                <ActivityChartSkeleton />
              ) : (
                <ChartAreaInteractive
                  data={state.overview?.activity ?? []}
                  referenceDate={state.overview?.referenceDate}
                  title="User & Content Activity"
                  description="Daily scrape jobs and account knowledge updates"
                  defaultRange="30d"
                />
              )}
              <RecentMessages />
            </section>

            <section aria-label="Live handoff workspace">
              <ConversationWorkspace />
            </section>

            <section aria-label="Operational overview">
              <DashboardDataTable
                jobs={jobs}
                files={files}
                loadingJobs={state.loading}
                loadingFiles={state.loading}
              />
            </section>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function Page() {
  return (
    <ProtectedAppBoundary>
      <DashboardDataProvider>
        <DashboardContent />
      </DashboardDataProvider>
    </ProtectedAppBoundary>
  );
}
