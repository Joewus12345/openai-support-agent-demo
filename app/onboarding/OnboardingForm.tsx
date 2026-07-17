"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";

const inputClassName =
  "mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20";

export default function OnboardingForm() {
  const [accountName, setAccountName] = useState("");
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/bootstrap-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          pin,
          accountName,
          telegramChatId: telegramChatId || null,
          secret,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Unable to create the first admin account.");
        return;
      }

      setSuccess("Admin account created. You can now sign in.");
      setAccountName("");
      setUserId("");
      setPin("");
      setSecret("");
      setTelegramChatId("");
    } catch (submitError) {
      console.error("Failed to bootstrap admin", submitError);
      setError("Unexpected error while creating the admin account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell.Root>
      <AuthShell.Brand
        eyebrow="Secure first-time setup"
        title="Create the primary support account."
        description="Initialize the platform owner and the first company workspace. This setup closes automatically once the first administrator exists."
        points={[
          "The primary account inherits server environment configuration",
          "Additional accounts use account-managed credentials",
          "Only administrators can grant administrative access",
        ]}
      />
      <AuthShell.Panel className="items-start py-8 lg:overflow-y-auto lg:py-10">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Platform bootstrap
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Initialize admin access
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use the bootstrap secret from the server environment to establish the owner account.
          </p>
        </div>

        <div className="mb-5 space-y-3" aria-live="polite">
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {success}{" "}
                <Link href="/login" className="font-semibold underline underline-offset-2">
                  Sign in
                </Link>
              </span>
            </p>
          ) : null}
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-800">
            Company name
            <input
              required
              name="companyName"
              autoComplete="organization"
              className={inputClassName}
              placeholder="e.g. TAGG Support"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Bootstrap secret
            <input
              required
              type="password"
              name="bootstrapSecret"
              autoComplete="off"
              className={inputClassName}
              placeholder="Server bootstrap secret"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-800">
              Admin user ID
              <input
                required
                name="userId"
                autoComplete="username"
                spellCheck={false}
                className={inputClassName}
                placeholder="Unique user ID"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Admin PIN
              <input
                required
                type="password"
                name="pin"
                autoComplete="new-password"
                className={inputClassName}
                placeholder="Secure PIN"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-800">
            Telegram chat ID <span className="font-normal text-slate-500">(optional)</span>
            <input
              name="telegramChatId"
              inputMode="numeric"
              autoComplete="off"
              className={inputClassName}
              placeholder="Telegram notification destination"
              value={telegramChatId}
              onChange={(event) => setTelegramChatId(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Creating admin account…" : "Create admin account"}
          </button>
        </form>
      </AuthShell.Panel>
    </AuthShell.Root>
  );
}
