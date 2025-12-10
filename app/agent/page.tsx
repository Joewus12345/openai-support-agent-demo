"use client";

import Link from "next/link";
import { MessageCircle, ShieldX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { authFetch } from "@/lib/client/authFetch";
import { defaultRouteForRoles } from "@/lib/auth/routes";
import type { AgentRole } from "@/lib/generated/prisma";
import { useSessionStore } from "@/stores/useSessionStore";
import { useToastStore } from "@/stores/useToastStore";

interface AgentAccountRow {
  userId: string;
  roles: AgentRole[];
  telegramChatId: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AgentDashboard() {
  const roles = useSessionStore((state) => state.roles);
  const csrfToken = useSessionStore((state) => state.csrfToken);
  const addToast = useToastStore((state) => state.addToast);
  const [agents, setAgents] = useState<AgentAccountRow[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  const defaultRedirect = useMemo(() => defaultRouteForRoles(roles), [roles]);
  const isAgent = roles?.includes("agent");
  const isAdmin = roles?.includes("admin");

  useEffect(() => {
    if (!isAdmin || !csrfToken) return;

    async function loadAgents() {
      setLoadingAgents(true);
      try {
        const response = await authFetch("/api/admin/agents", { headers: { "Content-Type": "application/json" } });
        if (!response.ok) {
          addToast({ title: "Unable to load agents", variant: "error" });
          return;
        }
        const data = (await response.json()) as { agents: AgentAccountRow[] };
        setAgents(data.agents);
      } catch (error) {
        console.error("Failed to load agents", error);
        addToast({ title: "Failed to load agents", description: "Try refreshing", variant: "error" });
      } finally {
        setLoadingAgents(false);
      }
    }

    loadAgents();
  }, [addToast, csrfToken, isAdmin]);

  const handleDelete = async (userId: string) => {
    if (!isAdmin || !csrfToken) return;
    const confirmed = window.confirm(`Delete agent ${userId}? This action cannot be undone.`);
    if (!confirmed) return;
    try {
      const response = await authFetch(`/api/admin/agents/${userId}`, { method: "DELETE" });
      if (!response.ok) {
        addToast({ title: "Unable to delete agent", variant: "error" });
        return;
      }
      setAgents((prev) => prev.filter((agent) => agent.userId !== userId));
      addToast({ title: "Agent removed", variant: "success" });
    } catch (error) {
      console.error("Failed to delete agent", error);
      addToast({ title: "Failed to delete agent", description: "Please try again", variant: "error" });
    }
  };

  if (!roles) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">Checking your access…</p>
      </div>
    );
  }

  if (!isAgent && !isAdmin) {
    return (
      <div className="p-6">
        <p className="text-red-700 bg-red-50 p-4 rounded">
          You do not have permission to view this page. Return to {" "}
          <Link className="underline" href={defaultRedirect}>
            {defaultRedirect}
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Agent Dashboard</h1>
        <p className="text-sm text-gray-600">
          Quick access to the messaging workspace and, if you are an admin, controls to manage fellow agents.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-400"
        >
          <div className="rounded-full bg-blue-100 p-3 text-blue-700">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-gray-900">Messaging workspace</p>
            <p className="text-gray-600">Chat with users and triage customer questions.</p>
          </div>
        </Link>
      </div>

      {isAdmin ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Agent roster</h2>
            {loadingAgents && <span className="text-sm text-gray-500">Loading…</span>}
          </div>
          <p className="text-sm text-gray-600">
            As an admin you can remove accounts that should no longer have access.
          </p>
          <div className="mt-3 space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.userId}
                className="flex flex-col gap-2 rounded border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-900">{agent.userId}</p>
                  <p className="text-xs text-gray-600">
                    Roles: {agent.roles.join(", ")} · Updated {new Date(agent.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(agent.userId)}
                  className="w-full rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 sm:w-auto"
                >
                  Delete
                </button>
              </div>
            ))}
            {!loadingAgents && agents.length === 0 && (
              <p className="text-sm text-gray-600">No agents found yet.</p>
            )}
          </div>
        </section>
      ) : (
        <div className="flex items-center gap-2 rounded border border-amber-100 bg-amber-50 p-4 text-amber-800">
          <ShieldX className="h-5 w-5" />
          <p className="text-sm">
            Agent management is limited to admins. Contact an administrator if an account should be removed.
          </p>
        </div>
      )}
    </div>
  );
}
