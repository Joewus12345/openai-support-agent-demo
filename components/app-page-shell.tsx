"use client";

import * as React from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProtectedAppBoundary } from "@/components/auth/protected-app-boundary";

interface AppPageShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppPageShell({ children, className = "" }: AppPageShellProps) {
  return (
    <ProtectedAppBoundary>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <SiteHeader />
          <div className={`flex min-w-0 flex-1 flex-col p-3 sm:p-4 lg:p-6 ${className}`}>{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ProtectedAppBoundary>
  );
}

