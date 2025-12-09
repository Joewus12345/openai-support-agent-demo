"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSessionStore } from "@/stores/useSessionStore";

export default function AppHeader() {
  const router = useRouter();
  const userId = useSessionStore((state) => state.userId);
  const clearSession = useSessionStore((state) => state.clearSession);
  const [loggingOut, setLoggingOut] = useState(false);

  if (!userId) {
    return null;
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.warn("Logout request failed", error);
    } finally {
      clearSession();
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="w-full bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-700">Signed in as <span className="font-semibold">{userId}</span></div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-60"
        >
          {loggingOut ? "Signing out..." : "Logout"}
        </button>
      </div>
    </header>
  );
}
