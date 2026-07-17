"use client";

import { AlertTriangle, Wrench } from "lucide-react";

import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessionStore } from "@/stores/useSessionStore";

export default function AccountUnavailablePage() {
  const account = useSessionStore((state) => state.activeAccount);
  const maintenance = account?.status === "maintenance";
  const Icon = maintenance ? Wrench : AlertTriangle;
  const message = maintenance
    ? account?.maintenanceMessage || "This workspace is temporarily unavailable while maintenance is completed."
    : account?.suspensionReason || "This workspace has been suspended by the platform administrator.";

  return (
    <AppPageShell>
      <div className="mx-auto flex w-full max-w-2xl flex-1 items-center py-8 sm:py-16">
        <Card className="w-full border-amber-200 shadow-sm">
          <CardHeader className="space-y-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Icon aria-hidden="true" className="size-5" />
            </div>
            <div className="space-y-1.5">
              <CardTitle>{maintenance ? "Workspace under maintenance" : "Workspace suspended"}</CardTitle>
              <CardDescription>
                {account?.name || "This account"} cannot open operational tools right now.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-foreground">{message}</p>
            <p className="text-sm text-muted-foreground">
              If you have access to another company, use the account switcher in the sidebar. Otherwise, contact your
              administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppPageShell>
  );
}
