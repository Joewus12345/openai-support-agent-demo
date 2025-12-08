"use client";

import { useEffect } from "react";

import { useSessionStore } from "@/stores/useSessionStore";

export default function SessionInitializer() {
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          clearSession();
          return;
        }
        const data = (await response.json()) as {
          userId: string;
          roles: string[];
          verified: boolean;
          csrf: string;
          expiresAt?: string;
        };
        if (!cancelled) {
          setSession({
            userId: data.userId,
            roles: data.roles,
            verified: data.verified,
            csrfToken: data.csrf,
            expiresAt: data.expiresAt,
          });
        }
      } catch (error) {
        console.warn("Failed to hydrate session", error);
        if (!cancelled) clearSession();
      }
    }

    hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [clearSession, setSession]);

  return null;
}
