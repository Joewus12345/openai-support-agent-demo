"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSessionStore } from "@/stores/useSessionStore";

function SessionVerificationScreen({ redirecting }: { redirecting: boolean }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50 px-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex max-w-xs flex-col items-center text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Image
            src="/download%20(3).png"
            alt="TAGG"
            width={28}
            height={28}
            priority
          />
        </div>
        <div className="mt-5 h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {redirecting ? "Redirecting to sign in…" : "Verifying your secure session…"}
        </p>
      </div>
    </div>
  );
}

export function ProtectedAppBoundary({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const initialized = useSessionStore((state) => state.initialized);
  const verified = useSessionStore((state) => state.verified);

  useEffect(() => {
    if (initialized && !verified) router.replace("/login");
  }, [initialized, router, verified]);

  if (!initialized || !verified) {
    return <SessionVerificationScreen redirecting={initialized} />;
  }

  return children;
}
