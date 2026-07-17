"use client";

import { createContext, useContext, type ReactNode } from "react";
import useSWR from "swr";

import type { ChartAreaPoint } from "@/components/chart-area-interactive";
import { authFetch } from "@/lib/client/authFetch";
import { useSessionStore } from "@/stores/useSessionStore";

export type DashboardOverview = {
  activity: ChartAreaPoint[];
  referenceDate: string;
  jobs: Array<{
    id: string;
    script: string;
    status: string;
    target: string;
    createdAt: string;
    finishedAt: string | null;
  }>;
  files: Array<{
    name: string;
    size: number;
    createdAt: string;
    modifiedAt: string;
    type: string;
  }>;
};

type DashboardDataContextValue = {
  state: {
    overview?: DashboardOverview;
    loading: boolean;
    error: Error | null;
  };
  actions: {
    refresh: () => Promise<DashboardOverview | undefined>;
  };
  meta: {
    accountId: string | null;
  };
};

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

async function fetcher(url: string) {
  const response = await authFetch(url, { headers: { Accept: "application/json" } });
  const payload = (await response.json().catch(() => null)) as DashboardOverview | { error?: string } | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error || "Unable to load dashboard data");
  }
  return payload as DashboardOverview;
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const accountId = useSessionStore((state) => state.activeAccount?.id ?? null);
  const result = useSWR<DashboardOverview>(
    accountId ? [`/api/dashboard/overview`, accountId] : null,
    ([url]: [string, string]) => fetcher(url),
    { keepPreviousData: false, revalidateOnFocus: false }
  );

  return (
    <DashboardDataContext.Provider
      value={{
        state: {
          overview: result.data,
          loading: !result.data && !result.error,
          error: result.error ?? null,
        },
        actions: { refresh: result.mutate },
        meta: { accountId },
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const value = useContext(DashboardDataContext);
  if (!value) throw new Error("useDashboardData must be used within DashboardDataProvider");
  return value;
}
