"use client";

import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function FaqLoading() {
  return (
    <AppPageShell>
      <div className="space-y-6 p-4 md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Public FAQ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`faq-skeleton-${index}`}
                className="rounded-lg border p-3 shadow-sm"
              >
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-4 w-3/4" />
                <Skeleton className="mt-2 h-4 w-5/6" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppPageShell>
  );
}
