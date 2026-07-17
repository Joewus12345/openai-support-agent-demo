"use client";

import { BookOpenText, MessageCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AppPageShell } from "@/components/app-page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessionStore } from "@/stores/useSessionStore";

const workspaces = [
  {
    title: "Messaging workspace",
    description: "Respond to customers and continue active support conversations.",
    href: "/",
    icon: MessageCircle,
  },
  {
    title: "Knowledge base",
    description: "Find approved support material for accurate customer answers.",
    href: "/kb",
    icon: BookOpenText,
  },
];

export default function AgentDashboard() {
  const roles = useSessionStore((state) => state.roles);
  const activeAccount = useSessionStore((state) => state.activeAccount);
  const loading = roles === undefined || activeAccount === undefined;

  return (
    <AppPageShell>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-3 border-b pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Agent workspace</p>
            {roles?.includes("admin") ? <Badge variant="outline"><ShieldCheck aria-hidden="true" /> Administrator</Badge> : <Badge variant="secondary">Agent</Badge>}
          </div>
          <h1 className="break-words text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {loading ? "Loading workspace…" : activeAccount?.name || "Support workspace"}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Day-to-day customer support tools for this company. Account creation, credentials, and role changes stay in the administrator dashboard.
          </p>
        </header>

        <section aria-labelledby="agent-tools-heading" className="space-y-3">
          <h2 id="agent-tools-heading" className="text-base font-semibold">Your Tools</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {workspaces.map((workspace) => (
              <Link key={workspace.href} href={workspace.href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full shadow-none transition-colors group-hover:border-primary/40">
                  <CardHeader>
                    <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <workspace.icon aria-hidden="true" className="size-5" />
                    </span>
                    <CardTitle className="text-base">{workspace.title}</CardTitle>
                    <CardDescription className="leading-6">{workspace.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <Card className="border-dashed bg-muted/20 shadow-none">
          <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Access is scoped to {activeAccount?.name || "the selected company"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Use the company switcher to work in another assigned account.</p>
            </div>
            <Badge variant="outline" className="capitalize">{activeAccount?.status || "Loading"}</Badge>
          </CardContent>
        </Card>
      </div>
    </AppPageShell>
  );
}
