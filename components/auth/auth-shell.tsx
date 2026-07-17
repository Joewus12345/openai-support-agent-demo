import Image from "next/image";
import type { ReactNode } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";

function Root({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.12),_transparent_34%),linear-gradient(to_bottom_right,#f8fafc,#eef2ff)] px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.05fr_0.95fr]">
        {children}
      </div>
    </div>
  );
}

function Brand({
  eyebrow = "TAGG Support Operations",
  title,
  description,
  points,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  points: string[];
}) {
  return (
    <section className="relative overflow-hidden bg-[#0b2f6b] px-6 py-7 text-white sm:px-10 sm:py-10 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-red-500/15 blur-3xl" />

      <div className="relative">
        <div className="inline-flex rounded-xl bg-white p-2.5 shadow-lg shadow-blue-950/20">
          <Image
            src="/tagg_ghana_automation.jpg"
            alt="The Automation Ghana Group"
            width={1200}
            height={630}
            priority
            className="h-auto w-44 rounded-md object-contain sm:w-52"
          />
        </div>
      </div>

      <div className="relative mt-8 max-w-xl lg:mt-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-lg text-pretty text-sm leading-6 text-blue-100 sm:text-base">
          {description}
        </p>
        <ul className="mt-6 hidden space-y-3 text-sm text-blue-50 sm:block">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-8 hidden items-center gap-2 text-xs text-blue-200 lg:flex">
        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
        Account-scoped access with secure session verification
      </div>
    </section>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 items-center px-5 py-8 sm:px-10 lg:px-12", className)}>
      <div className="mx-auto w-full max-w-md">{children}</div>
    </section>
  );
}

export const AuthShell = { Root, Brand, Panel };
