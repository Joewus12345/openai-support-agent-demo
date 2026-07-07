"use client";

import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ScrapeJobsLoading() {
  return (
    <AppPageShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-2xl font-semibold">Scrape Job Control Panel</p>
          <p className="text-sm text-muted-foreground">
            Set up scrape presets, send jobs immediately, or manage their history.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Card className="shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">Create or schedule a job</CardTitle>
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={`preset-${index}`} className="h-10 w-28" />
                ))}
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
                <div className="grid gap-3 md:grid-cols-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-10 w-28" />
                  <Skeleton className="h-10 w-28" />
                  <Skeleton className="h-10 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">Past Jobs History</CardTitle>
              <Skeleton className="h-4 w-44" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2 rounded-lg border">
                {[...Array(5)].map((_, index) => (
                  <div
                    key={`history-row-${index}`}
                    className="grid grid-cols-2 gap-3 border-b px-3 py-3 text-sm last:border-0 md:grid-cols-4"
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
                <Skeleton className="h-4 w-32" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-20" />
                  <Skeleton className="h-9 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppPageShell>
  );
}
