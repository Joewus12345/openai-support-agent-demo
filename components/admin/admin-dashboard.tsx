"use client";

import { Building2, KeyRound, ShieldCheck, UsersRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AccountsPanel } from "@/components/admin/accounts-panel";
import { AccountStatusBadge, AdminPanelSkeleton } from "@/components/admin/admin-shared";
import {
  AdminWorkspaceFrame,
  AdminWorkspaceProvider,
  useAdminWorkspace,
} from "@/components/admin/admin-workspace";
import { ConfigurationPanel } from "@/components/admin/configuration-panel";
import { MembersPanel } from "@/components/admin/members-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function AdminDashboardContent() {
  const { state, meta } = useAdminWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  if (state.loading) return <AdminPanelSkeleton />;
  if (state.error || !state.overview) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Admin workspace unavailable</AlertTitle>
        <AlertDescription>{state.error?.message || "No account is available for this session."}</AlertDescription>
      </Alert>
    );
  }

  const { account } = state.overview;
  const accountCount = state.accounts?.accounts.length ?? 1;
  const configurationCount = account._count.configurations;
  const fallbackTab = meta.platformAdmin ? "accounts" : "members";
  const allowedTabs = meta.platformAdmin ? ["accounts", "members", "configuration"] : ["members", "configuration"];
  const requestedTab = searchParams.get("tab");
  const selectedTab = requestedTab && allowedTabs.includes(requestedTab) ? requestedTab : fallbackTab;

  function selectTab(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <AdminWorkspaceFrame>
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Administration</p>
            {meta.platformAdmin ? <span className="text-xs text-muted-foreground">Platform owner</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-words text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{account.name}</h1>
            <AccountStatusBadge status={account.status} />
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage company access, account-scoped roles, and private integration credentials from one control plane.
          </p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{account.slug}</span>
          {account.isPrimary ? " · Environment managed" : " · BYOK managed"}
        </div>
      </header>

      <section aria-label="Account overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: meta.platformAdmin ? "Managed accounts" : "Current account",
            value: accountCount,
            icon: Building2,
          },
          { label: "Members", value: account._count.memberships, icon: UsersRound },
          { label: "Configured values", value: configurationCount, icon: KeyRound },
          { label: "Access model", value: "Scoped", icon: ShieldCheck },
        ].map((item) => (
          <Card key={item.label} className="shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon aria-hidden="true" className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Tabs value={selectedTab} onValueChange={selectTab} className="space-y-4">
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto p-1">
          {meta.platformAdmin ? (
            <TabsTrigger className="min-h-10" value="accounts">
              Companies
            </TabsTrigger>
          ) : null}
          <TabsTrigger className="min-h-10" value="members">
            Members
          </TabsTrigger>
          <TabsTrigger className="min-h-10" value="configuration">
            Environment
          </TabsTrigger>
        </TabsList>
        {meta.platformAdmin ? (
          <TabsContent value="accounts">
            <AccountsPanel />
          </TabsContent>
        ) : null}
        <TabsContent value="members">
          <MembersPanel />
        </TabsContent>
        <TabsContent value="configuration">
          <ConfigurationPanel />
        </TabsContent>
      </Tabs>
    </AdminWorkspaceFrame>
  );
}

export function AdminDashboard() {
  return (
    <AdminWorkspaceProvider>
      <Suspense fallback={<AdminPanelSkeleton />}>
        <AdminDashboardContent />
      </Suspense>
    </AdminWorkspaceProvider>
  );
}
