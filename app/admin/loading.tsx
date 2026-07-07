"use client";

import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <AppPageShell>
      <div className="space-y-6 p-4 md:p-6">
        <div className="space-y-1">
          <p className="text-2xl font-semibold">Admin console</p>
          <p className="text-sm text-muted-foreground">
            Manage agent accounts, permissions, and messaging access.
          </p>
        </div>
        <Card className="shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Agent accounts</CardTitle>
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-32" />
            <div className="overflow-hidden rounded-lg border">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`admin-row-${index}`}
                  className="grid grid-cols-4 gap-3 border-b px-4 py-3 text-sm last:border-0"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppPageShell>
  );
}
