"use client";

import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InitVectorStoreLoading() {
  return (
    <AppPageShell>
      <div className="flex flex-col gap-6">
        <Card className="shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Initialize the Vector Store</CardTitle>
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <p className="text-base font-semibold">OpenAI Vector Store</p>
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <div className="space-y-2 rounded-md bg-muted/50 p-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <p className="text-base font-semibold">Local (Ollama) Vector Store</p>
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppPageShell>
  );
}
