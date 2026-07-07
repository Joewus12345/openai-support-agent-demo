"use client";

import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <AppPageShell>
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader className="space-y-2 text-center">
            <CardTitle>Sign in</CardTitle>
            <Skeleton className="mx-auto h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </AppPageShell>
  );
}
