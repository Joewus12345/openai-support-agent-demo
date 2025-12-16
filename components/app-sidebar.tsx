"use client";

import * as React from "react";
import {
  BotIcon,
  FileQuestionIcon,
  LayoutDashboardIcon,
  ListIcon,
  NetworkIcon,
  // LogOutIcon,
  ShieldCheckIcon,
  SettingsIcon,
  UserRoundSearchIcon,
  UsersIcon,
} from "lucide-react";

import { IconSearch, IconHelp } from "@tabler/icons-react";

import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
// import { useLogout } from "@/lib/client/useLogout";
import { useSessionStore } from "@/stores/useSessionStore";
import Link from "next/link";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { userId, roles, verified } = useSessionStore();
  // const { logout, loggingOut } = useLogout();

  const navMain = React.useMemo(
    () => [
      { title: "Dashboard", url: "/", icon: LayoutDashboardIcon },
      { title: "Scrape jobs", url: "/scrape_jobs", icon: ListIcon },
      { title: "Knowledge base", url: "/kb", icon: UserRoundSearchIcon },
      { title: "Initialization", url: "/init_vs", icon: NetworkIcon },
      { title: "Agent", url: "/agent", icon: UsersIcon },
      { title: "Admin", url: "/admin", icon: ShieldCheckIcon },
    ],
    []
  );

  const documents = React.useMemo(
    () => [
      { name: "FAQs", url: "/", icon: FileQuestionIcon },
      { name: "Agent handbook", url: "/", icon: BotIcon },
      { name: "Support surface", url: "/", icon: LayoutDashboardIcon },
    ],
    []
  );

  const secondary = React.useMemo(
    () => [
      { title: "Settings", url: "/", icon: SettingsIcon },
      { title: "Get Help", url: "/", icon: IconHelp },
      { title: "Search", url: "/", icon: IconSearch },
    ],
    []
  );

  const user = {
    name: userId ?? "Guest",
    email: verified ? "Session verified" : "Awaiting verification",
    avatar: "/openai_logo.svg",
    roles: roles ?? [],
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      {/* <div className="flex min-h-0 flex-1 flex-col"> */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/">
                <LayoutDashboardIcon className="h-5 w-5" />
                <span className="text-base font-semibold">Support Ops</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* <SidebarMenuItem>
            <SidebarMenuButton
              className="justify-between text-sm"
              onClick={logout}
              disabled={loggingOut}
            >
              <span>{loggingOut ? "Signing out" : "Log out"}</span>
              <LogOutIcon className="h-4 w-4" />
            </SidebarMenuButton>
          </SidebarMenuItem> */}
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex-1 overflow-y-auto pb-4">
        <NavMain items={navMain} />
        <NavDocuments items={documents} />
        <NavSecondary items={secondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="sticky bottom-0 border-t border-sidebar-border bg-sidebar pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2">
        <NavUser user={user} />
      </SidebarFooter>
      {/* </div> */}
    </Sidebar>
  );
}
