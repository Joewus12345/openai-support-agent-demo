"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, Send } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { AgentRole } from "@/lib/generated/prisma";
import { defaultRouteForRoles } from "@/lib/auth/routes";
import { useSessionStore } from "@/stores/useSessionStore";
import type { SessionAccount } from "@/stores/useSessionStore";

const POLL_INTERVAL_MS = 2500;

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [chatConfigured, setChatConfigured] = useState<boolean | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const setSession = useSessionStore((state) => state.setSession);
  const sessionRoles = useSessionStore((state) => state.roles);
  const sessionVerified = useSessionStore((state) => state.verified);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const redirectTarget = useMemo(() => defaultRouteForRoles(sessionRoles), [sessionRoles]);

  useEffect(() => {
    if (sessionVerified && sessionRoles && redirectTarget && !pending) {
      router.replace(redirectTarget);
    }
  }, [pending, redirectTarget, router, sessionRoles, sessionVerified]);

  async function checkVerification() {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.status === 401) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        pollTimer.current = null;
        setPending(false);
        setStatusMessage(null);
        setError("Session expired. Please try logging in again.");
        return;
      }
      if (response.status === 429) {
        setError("Too many status checks. Please wait a moment.");
        return;
      }
      if (!response.ok) {
        setError("Unable to check verification status.");
        return;
      }

      const data = (await response.json()) as {
        verified: boolean;
        roles: AgentRole[] | string[];
        userId: string;
        platformAdmin: boolean;
        activeAccount: SessionAccount | null;
        accounts: SessionAccount[];
        csrf: string;
        expiresAt?: string;
      };
      const roles = Array.isArray(data.roles) ? (data.roles as (AgentRole | string)[]) : [];
      const normalizedRoles = roles.filter((role): role is AgentRole =>
        Object.values(AgentRole).includes(role as AgentRole)
      );

      setSession({
        userId: data.userId,
        roles: normalizedRoles,
        platformAdmin: data.platformAdmin,
        activeAccount: data.activeAccount,
        accounts: data.accounts,
        verified: data.verified,
        csrfToken: data.csrf,
        expiresAt: data.expiresAt,
      });

      if (data.verified) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        pollTimer.current = null;
        router.replace(defaultRouteForRoles(normalizedRoles));
      }
    } catch (pollError) {
      console.error("Failed to poll session", pollError);
      setError("Could not reach the server. Please retry shortly.");
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);
    setPending(false);
    setTelegramStatus(null);
    setChatConfigured(null);
    setSubmitting(true);
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, pin }),
      });

      if (response.status === 401) {
        setError("Invalid credentials. Please check your user ID and PIN.");
        return;
      }
      if (response.status === 429) {
        setError("Too many attempts. Please slow down and try again.");
        return;
      }
      if (response.status === 400) {
        setError("Please provide both a user ID and PIN.");
        return;
      }
      if (![200, 202].includes(response.status)) {
        setError("Login failed. Please try again.");
        return;
      }

      const data = (await response.json()) as {
        pending: boolean;
        chatConfigured: boolean;
        telegramDelivery?: { ok: boolean; reason?: string };
      };
      setPending(data.pending);
      setChatConfigured(data.chatConfigured);
      if (data.telegramDelivery && !data.telegramDelivery.ok) {
        setTelegramStatus(data.telegramDelivery.reason || "Unable to deliver the Telegram code.");
      } else if (data.chatConfigured) {
        setTelegramStatus("Telegram code sent. Please confirm to continue.");
      } else {
        setTelegramStatus("No Telegram chat is configured for this account.");
      }
      setStatusMessage(
        response.status === 202
          ? "Login started, but delivery is pending."
          : "Login started. Waiting for verification…"
      );

      if (data.pending) {
        void checkVerification();
        pollTimer.current = setInterval(checkVerification, POLL_INTERVAL_MS);
      }
    } catch (loginError) {
      console.error("Login error", loginError);
      setError("Unexpected error during login. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell.Root>
      <AuthShell.Brand
        title="One secure workspace for every support account."
        description="Sign in to manage conversations, knowledge, and account operations from a single tenant-aware support console."
        points={[
          "Account-specific credentials and configuration",
          "Role-based agent and administrator access",
          "Telegram verification before workspace access",
        ]}
      />
      <AuthShell.Panel>
        <div className="mb-7">
          <p className="text-sm font-semibold text-blue-700">Welcome back</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Sign in to your workspace
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Enter your agent credentials. You may be asked to confirm the login through Telegram.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="user-id" className="text-sm font-medium text-slate-800">User ID</label>
            <input
              id="user-id"
              name="userId"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20"
              placeholder="Enter your user ID"
              required
              autoComplete="username"
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="pin" className="text-sm font-medium text-slate-800">PIN</label>
            <input
              id="pin"
              name="pin"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20"
              placeholder="Enter your secure PIN"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting || pending}
          >
            {submitting || pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Signing in…" : pending ? "Waiting for verification…" : "Sign in securely"}
          </button>
        </form>

        <div className="mt-5 space-y-2" aria-live="polite">
          {statusMessage ? <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{statusMessage}</p> : null}
          {telegramStatus ? <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{telegramStatus}</p> : null}
          {chatConfigured === false ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Telegram chat is not configured for this account.</p> : null}
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </div>
      </AuthShell.Panel>
    </AuthShell.Root>
  );
}
