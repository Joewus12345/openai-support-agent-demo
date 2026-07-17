"use client";

import { createContext, useContext, type ReactNode } from "react";
import useSWR from "swr";

import { authFetch } from "@/lib/client/authFetch";
import { useSessionStore } from "@/stores/useSessionStore";

export type AdminAccount = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "maintenance";
  isPrimary: boolean;
  suspensionReason: string | null;
  maintenanceMessage: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { memberships: number; configurations: number };
};

export type AdminMember = {
  userId: string;
  role: "admin" | "agent";
  telegramChatId: string | null;
  platformAdmin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminConfigField = {
  key: string;
  label: string;
  description: string;
  group: "AI provider" | "Chatwoot" | "Ollama";
  kind: "text" | "secret" | "number" | "select" | "url";
  placeholder?: string;
  options?: { label: string; value: string }[];
  configured: boolean;
  source: "environment" | "account" | "unset";
  value?: string;
  updatedAt?: string;
};

type OverviewResponse = {
  account: AdminAccount;
  platformAdmin: boolean;
  currentUserId: string;
};
type AccountsResponse = { accounts: AdminAccount[] };
type MembersResponse = { members: AdminMember[] };
type ConfigurationResponse = {
  account: { id: string; name: string; slug: string; isPrimary: boolean };
  locked: boolean;
  fields: AdminConfigField[];
};

type WorkspaceMutator<Data> = () => Promise<Data | undefined>;

type AdminWorkspaceContextValue = {
  state: {
    overview?: OverviewResponse;
    accounts?: AccountsResponse;
    members?: MembersResponse;
    configuration?: ConfigurationResponse;
    loading: boolean;
    error: Error | null;
  };
  actions: {
    refreshOverview: WorkspaceMutator<OverviewResponse>;
    refreshAccounts: WorkspaceMutator<AccountsResponse>;
    refreshMembers: WorkspaceMutator<MembersResponse>;
    refreshConfiguration: WorkspaceMutator<ConfigurationResponse>;
    refreshAll: () => Promise<void>;
  };
  meta: {
    accountId: string | null;
    csrfReady: boolean;
    platformAdmin: boolean;
  };
};

const AdminWorkspaceContext = createContext<AdminWorkspaceContextValue | null>(null);

async function fetcher(url: string) {
  const response = await authFetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "Unable to load admin data");
  }
  return response.json();
}

export function AdminWorkspaceProvider({ children }: { children: ReactNode }) {
  const csrfToken = useSessionStore((session) => session.csrfToken);
  const activeAccount = useSessionStore((session) => session.activeAccount);
  const platformAdmin = useSessionStore((session) => Boolean(session.platformAdmin));
  const accountId = activeAccount?.id ?? null;
  const ready = Boolean(csrfToken && accountId);

  const overview = useSWR<OverviewResponse>(ready ? "/api/admin/overview" : null, fetcher);
  const accounts = useSWR<AccountsResponse>(ready && platformAdmin ? "/api/admin/accounts" : null, fetcher);
  const members = useSWR<MembersResponse>(
    ready ? `/api/admin/agents?accountId=${encodeURIComponent(accountId as string)}` : null,
    fetcher
  );
  const configuration = useSWR<ConfigurationResponse>(
    ready ? `/api/admin/configuration?accountId=${encodeURIComponent(accountId as string)}` : null,
    fetcher
  );

  const refreshAll = async () => {
    await Promise.all([
      overview.mutate(),
      platformAdmin ? accounts.mutate() : Promise.resolve(undefined),
      members.mutate(),
      configuration.mutate(),
    ]);
  };

  const error = overview.error || accounts.error || members.error || configuration.error || null;
  const loading =
    !ready ||
    (!overview.data && !overview.error) ||
    (!members.data && !members.error) ||
    (!configuration.data && !configuration.error) ||
    (platformAdmin && !accounts.data && !accounts.error);

  return (
    <AdminWorkspaceContext.Provider
      value={{
        state: {
          overview: overview.data,
          accounts: accounts.data,
          members: members.data,
          configuration: configuration.data,
          loading,
          error,
        },
        actions: {
          refreshOverview: overview.mutate,
          refreshAccounts: accounts.mutate,
          refreshMembers: members.mutate,
          refreshConfiguration: configuration.mutate,
          refreshAll,
        },
        meta: { accountId, csrfReady: Boolean(csrfToken), platformAdmin },
      }}
    >
      {children}
    </AdminWorkspaceContext.Provider>
  );
}

export function useAdminWorkspace() {
  const value = useContext(AdminWorkspaceContext);
  if (!value) throw new Error("useAdminWorkspace must be used within AdminWorkspaceProvider");
  return value;
}

export function AdminWorkspaceFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1440px] space-y-6">{children}</div>;
}
