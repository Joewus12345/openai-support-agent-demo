"use client";

import { CheckCircle2, KeyRound, LoaderCircle, LockKeyhole, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useAdminWorkspace, type AdminConfigField } from "@/components/admin/admin-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client/authFetch";
import { useToastStore } from "@/stores/useToastStore";

const GROUPS: AdminConfigField["group"][] = ["AI provider", "Chatwoot", "Ollama"];

function FieldStatus({ field, clearing }: { field: AdminConfigField; clearing: boolean }) {
  if (clearing) return <Badge variant="destructive">Will clear</Badge>;
  if (!field.configured) return <Badge variant="outline">Not configured</Badge>;
  return (
    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
      <CheckCircle2 aria-hidden="true" />
      {field.source === "environment" ? "Server environment" : "Account override"}
    </Badge>
  );
}

function EnvironmentManagedField({ field }: { field: AdminConfigField }) {
  return (
    <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">{field.label}</h3>
          {field.kind === "secret" ? <LockKeyhole aria-label="Secret value" className="size-3.5 text-muted-foreground" /> : null}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{field.description}</p>
        {field.value ? <code className="mt-2 block break-all rounded bg-muted px-2 py-1 text-xs">{field.value}</code> : null}
      </div>
      <FieldStatus field={field} clearing={false} />
    </div>
  );
}

export function ConfigurationPanel() {
  const { state, actions, meta } = useAdminWorkspace();
  const addToast = useToastStore((toast) => toast.addToast);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [clearedSecrets, setClearedSecrets] = useState<Set<string>>(() => new Set());
  const configuration = state.configuration;

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  if (!configuration || !meta.accountId) return null;

  const fieldsByGroup = new Map(
    GROUPS.map((group) => [group, configuration.fields.filter((field) => field.group === group)])
  );
  const resetKey = configuration.fields.map((field) => `${field.key}:${field.updatedAt || field.source}`).join("|");

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration || !meta.accountId) return;
    setSaving(true);
    const data = new FormData(event.currentTarget);
    const values: Record<string, string | null> = {};
    for (const field of configuration.fields) {
      const rawValue = String(data.get(field.key) || "").trim();
      if (field.kind === "secret") {
        if (rawValue) values[field.key] = rawValue;
        else if (clearedSecrets.has(field.key)) values[field.key] = null;
      } else {
        values[field.key] = rawValue || null;
      }
    }

    try {
      const response = await authFetch("/api/admin/configuration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: meta.accountId, values }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Unable to save configuration");
      setClearedSecrets(new Set());
      setDirty(false);
      await Promise.all([actions.refreshConfiguration(), actions.refreshOverview(), actions.refreshAccounts()]);
      addToast({ title: "Configuration saved", description: "New requests will use this account’s values.", variant: "success" });
    } catch (error) {
      addToast({
        title: "Configuration not saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  function markSecretForRemoval(key: string) {
    setDirty(true);
    setClearedSecrets((current) => new Set(current).add(key));
  }

  function undoSecretRemoval(key: string) {
    setDirty(true);
    setClearedSecrets((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Environment & Integrations</CardTitle>
            <CardDescription>
              {configuration.locked
                ? "The first account reads these values from the server environment."
                : "This company uses an encrypted account-level configuration and never inherits the first account’s secrets."}
            </CardDescription>
          </div>
          <Badge variant={configuration.locked ? "secondary" : "outline"} className="min-h-7">
            {configuration.locked ? <LockKeyhole aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
            {configuration.locked ? "Environment managed" : "BYOK managed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        <Alert>
          <ShieldCheck aria-hidden="true" className="absolute left-4 top-4 size-4 text-primary" />
          <AlertTitle className="pl-6">Secrets stay server-side</AlertTitle>
          <AlertDescription className="pl-6">
            Secret values are encrypted with AES-256-GCM, are never returned by the API, and are shown here only as configured or unset.
          </AlertDescription>
        </Alert>

        {!configuration.locked ? (
          <Alert>
            <AlertTitle>Tenant Webhook Route</AlertTitle>
            <AlertDescription>
              Send message events to{" "}
              <code translate="no" className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                /api/chatwoot-webhook?tenant={configuration.account.slug}
              </code>
              {" "}and status events to{" "}
              <code translate="no" className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                /api/chatwoot-status-webhook?tenant={configuration.account.slug}
              </code>
              . Provide the webhook secret in the <code translate="no">x-chatwoot-webhook-secret</code> header.
            </AlertDescription>
          </Alert>
        ) : null}

        {configuration.locked ? (
          <div className="space-y-8">
            {GROUPS.map((group) => (
              <section key={group} aria-labelledby={`environment-${group.replace(/\s/g, "-")}`} className="space-y-3">
                <div>
                  <h2 id={`environment-${group.replace(/\s/g, "-")}`} className="text-base font-semibold">{group}</h2>
                  <p className="text-sm text-muted-foreground">Read-only values supplied to the primary account at deployment.</p>
                </div>
                <div className="space-y-3">
                  {(fieldsByGroup.get(group) ?? []).map((field) => <EnvironmentManagedField key={field.key} field={field} />)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <form key={resetKey} onSubmit={saveConfiguration} onChange={() => setDirty(true)} className="space-y-8">
            {GROUPS.map((group) => (
              <fieldset key={group} className="space-y-3">
                <legend className="text-base font-semibold">{group}</legend>
                <p className="text-sm text-muted-foreground">Account-specific values for {configuration.account.name}.</p>
                <div className="space-y-3 pt-1">
                  {(fieldsByGroup.get(group) ?? []).map((field) => {
                    const clearing = clearedSecrets.has(field.key);
                    const inputId = `config-${field.key.toLowerCase().replace(/_/g, "-")}`;
                    return (
                      <div key={field.key} className="rounded-xl border p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <Label htmlFor={inputId}>{field.label}</Label>
                            <p id={`${inputId}-description`} className="text-sm leading-6 text-muted-foreground">{field.description}</p>
                          </div>
                          <FieldStatus field={field} clearing={clearing} />
                        </div>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                          {field.kind === "select" ? (
                            <select
                              id={inputId}
                              name={field.key}
                              defaultValue={field.value || ""}
                              aria-describedby={`${inputId}-description`}
                              autoComplete="off"
                              className="min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                            >
                              <option value="">Not configured</option>
                              {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          ) : (
                            <Input
                              id={inputId}
                              name={field.key}
                              type={field.kind === "secret" ? "password" : field.kind === "number" ? "number" : field.kind === "url" ? "url" : "text"}
                              inputMode={field.kind === "number" ? "numeric" : undefined}
                              autoComplete={field.kind === "secret" ? "new-password" : "off"}
                              spellCheck={false}
                              defaultValue={field.kind === "secret" ? "" : field.value || ""}
                              placeholder={field.kind === "secret" && field.configured ? "Configured ••••••••" : field.placeholder}
                              aria-describedby={`${inputId}-description`}
                              className="min-h-11"
                            />
                          )}
                          {field.kind === "secret" && field.configured ? (
                            clearing ? (
                              <Button type="button" variant="outline" className="min-h-11" onClick={() => undoSecretRemoval(field.key)}>
                                <RotateCcw aria-hidden="true" /> Undo
                              </Button>
                            ) : (
                              <Button type="button" variant="outline" className="min-h-11 text-destructive" onClick={() => markSecretForRemoval(field.key)}>
                                <Trash2 aria-hidden="true" /> Clear
                              </Button>
                            )
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <div className="sticky bottom-3 flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">Blank non-secret fields are removed. Blank secret fields remain unchanged unless cleared.</p>
              <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={saving}>
                {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}{saving ? "Saving…" : "Save Configuration"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
