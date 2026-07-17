"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminAccount } from "@/components/admin/admin-workspace";

export function AccountStatusBadge({ status }: { status: AdminAccount["status"] }) {
  if (status === "active") {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Active</Badge>;
  }
  if (status === "maintenance") {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-800">Maintenance</Badge>;
  }
  return <Badge variant="destructive">Suspended</Badge>;
}

export function AdminPanelSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6" aria-label="Loading admin workspace" aria-busy="true">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <div className="flex gap-3"><Skeleton className="h-9 w-52" /><Skeleton className="h-6 w-20 rounded-full" /></div>
          <Skeleton className="h-4 w-[32rem] max-w-full" />
        </div>
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={`admin-stat-${index}`} className="h-24 rounded-xl" />)}
      </div>
      <div className="space-y-4">
        <div className="flex gap-2"><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-32" /></div>
        <div className="rounded-xl border p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between"><div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-4 w-72 max-w-full" /></div><Skeleton className="h-10 w-36" /></div>
          <div className="mt-5 space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={`admin-row-${index}`} className="h-12 w-full rounded-md" />)}</div>
        </div>
      </div>
    </div>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed px-5 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
