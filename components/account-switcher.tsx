"use client";

import { Building2, Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { authFetch } from "@/lib/client/authFetch";
import { useSessionStore } from "@/stores/useSessionStore";
import { useToastStore } from "@/stores/useToastStore";

export function AccountSwitcher() {
  const activeAccount = useSessionStore((state) => state.activeAccount);
  const accounts = useSessionStore((state) => state.accounts) ?? [];
  const addToast = useToastStore((state) => state.addToast);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  async function switchAccount(accountId: string) {
    if (accountId === activeAccount?.id || switchingTo) return;
    setSwitchingTo(accountId);
    try {
      const response = await authFetch("/api/auth/switch-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        addToast({ title: "Unable to switch account", description: payload?.error, variant: "error" });
        return;
      }
      const payload = (await response.json()) as { roles: string[]; account: { status: string } };
      const destination =
        payload.account.status !== "active"
          ? "/account-unavailable"
          : payload.roles.includes("admin")
            ? "/admin"
            : "/agent";
      window.location.assign(destination);
    } catch (error) {
      console.error("Failed to switch account", error);
      addToast({ title: "Unable to switch account", description: "Please try again.", variant: "error" });
    } finally {
      setSwitchingTo(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          aria-label={`Current account: ${activeAccount?.name || "No account selected"}`}
          className="min-h-12 border border-sidebar-border bg-sidebar-accent/40 data-[state=open]:bg-sidebar-accent"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-semibold">{activeAccount?.name || "Select account"}</span>
            <span className="block truncate text-xs capitalize text-muted-foreground">
              {activeAccount?.isPrimary ? "Primary · " : ""}
              {activeAccount?.status || "Unavailable"}
            </span>
          </span>
          {switchingTo ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ChevronsUpDown aria-hidden="true" className="size-4 text-muted-foreground" />
          )}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-64" align="start" side="right">
        <DropdownMenuLabel className="flex items-center justify-between gap-3">
          <span>Companies</span>
          <Badge variant="secondary">{accounts.length}</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            disabled={Boolean(switchingTo)}
            onSelect={() => switchAccount(account.id)}
            className="min-h-11 gap-3"
          >
            <span className="flex size-8 items-center justify-center rounded-md border bg-background">
              {activeAccount?.id === account.id ? (
                <Check aria-hidden="true" className="size-4 text-primary" />
              ) : (
                <Building2 aria-hidden="true" className="size-4 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{account.name}</span>
              <span className="block text-xs capitalize text-muted-foreground">{account.status}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
