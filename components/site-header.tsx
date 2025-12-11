"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import SessionTimer from "./SessionTimer";
import { useSessionStore } from "@/stores/useSessionStore";

export function SiteHeader() {
  const { userId, verified, roles } = useSessionStore();

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-auto flex shrink-0 items-center gap-2 border-b bg-background/70 py-2 backdrop-blur transition-[width,height] ease-linear">
      <div className="flex w-full flex-wrap items-center gap-3 px-4 lg:gap-4 lg:px-6">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 hidden h-6 sm:inline-flex" />
          <div className="flex flex-col">
            <h1 className="text-base font-medium leading-tight">Support dashboard</h1>
            <p className="text-xs text-muted-foreground">Live assistant + human handoff workspace</p>
          </div>
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 text-xs sm:w-auto sm:flex-nowrap sm:justify-end">
          <SessionTimer />
          <Separator orientation="vertical" className="hidden h-4 sm:inline-flex" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={verified ? "default" : "outline"}>{verified ? "Verified" : "Awaiting verification"}</Badge>
            {userId && <Badge variant="secondary">{userId}</Badge>}
            {(roles ?? []).map((role) => (
              <Badge key={role} variant="outline" className="capitalize">
                {role}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
