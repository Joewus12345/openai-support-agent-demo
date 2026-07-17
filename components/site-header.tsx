"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import SessionTimer from "./SessionTimer";
import { useSessionStore } from "@/stores/useSessionStore";

export function SiteHeader() {
  const { userId, verified, roles, activeAccount } = useSessionStore();

  return (
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center border-b bg-background/90 backdrop-blur transition-[width,height] ease-linear">
      <div className="flex w-full min-w-0 items-center gap-2 px-3 py-2 sm:px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium leading-tight sm:text-base">
              {activeAccount?.name || "Support Dashboard"}
            </h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">Support operations</p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
          <span className="hidden sm:inline-flex"><SessionTimer /></span>
          <Separator
            orientation="vertical"
            className="hidden h-4 sm:inline-flex"
          />
          <div className="flex items-center gap-1.5">
            <Badge variant={verified ? "default" : "outline"} className="hidden sm:inline-flex">
              {verified ? "Verified" : "Awaiting verification"}
            </Badge>
            {userId ? <Badge variant="secondary" className="max-w-28 truncate">{userId}</Badge> : null}
            {roles?.includes("admin") ? <Badge variant="outline" className="hidden capitalize md:inline-flex">Admin</Badge> : null}
          </div>
        </div>
      </div>
    </header>
  );
}
