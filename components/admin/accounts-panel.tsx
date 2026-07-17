"use client";

import { Building2, ExternalLink, LoaderCircle, Plus, SlidersHorizontal } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AccountStatusBadge, AdminEmptyState } from "@/components/admin/admin-shared";
import { useAdminWorkspace, type AdminAccount } from "@/components/admin/admin-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/client/authFetch";
import { useSessionStore } from "@/stores/useSessionStore";
import { useToastStore } from "@/stores/useToastStore";

type LifecycleStatus = AdminAccount["status"];

function errorMessage(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export function AccountsPanel() {
  const { state, actions } = useAdminWorkspace();
  const activeAccountId = useSessionStore((session) => session.activeAccount?.id);
  const addToast = useToastStore((toast) => toast.addToast);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lifecycleAccount, setLifecycleAccount] = useState<AdminAccount | null>(null);
  const [lifecycleStatus, setLifecycleStatus] = useState<LifecycleStatus>("active");
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const accounts = state.accounts?.accounts ?? [];

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await authFetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.get("name"),
          slug: values.get("slug") || undefined,
          adminUserId: values.get("adminUserId"),
          adminPin: values.get("adminPin") || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "Unable to create company"));
      form.reset();
      setCreateOpen(false);
      await actions.refreshAccounts();
      addToast({ title: "Company created", description: "The initial administrator can now sign in.", variant: "success" });
    } catch (error) {
      addToast({
        title: "Unable to create company",
        description: error instanceof Error ? error.message : "Check the account details and try again.",
        variant: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  function openLifecycle(account: AdminAccount) {
    setLifecycleStatus(account.status);
    setLifecycleAccount(account);
  }

  async function updateLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lifecycleAccount) return;
    setSavingLifecycle(true);
    const values = new FormData(event.currentTarget);
    const note = String(values.get("note") || "").trim() || null;
    try {
      const response = await authFetch(`/api/admin/accounts/${lifecycleAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: lifecycleStatus,
          suspensionReason: lifecycleStatus === "suspended" ? note : null,
          maintenanceMessage: lifecycleStatus === "maintenance" ? note : null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "Unable to update company"));
      setLifecycleAccount(null);
      await Promise.all([actions.refreshAccounts(), actions.refreshOverview()]);
      addToast({ title: "Account status updated", variant: "success" });
    } catch (error) {
      addToast({
        title: "Status update failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setSavingLifecycle(false);
    }
  }

  async function openAccount(account: AdminAccount) {
    if (account.id === activeAccountId || switchingAccount) return;
    setSwitchingAccount(account.id);
    try {
      const response = await authFetch("/api/auth/switch-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      if (!response.ok) throw new Error("Unable to open this company");
      window.location.assign("/admin");
    } catch (error) {
      addToast({
        title: "Account switch failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
      setSwitchingAccount(null);
    }
  }

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Companies</CardTitle>
          <CardDescription>Create tenant accounts and manually control their operational status.</CardDescription>
        </div>
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          New Company
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {accounts.length === 0 ? (
          <div className="p-6">
            <AdminEmptyState title="No companies yet" description="Create the first managed tenant account." />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Configuration</TableHead>
                    <TableHead className="pr-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-lg border bg-muted/40">
                            <Building2 aria-hidden="true" className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block max-w-64 truncate font-medium">{account.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {account.slug}{account.isPrimary ? " · Primary" : ""}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell><AccountStatusBadge status={account.status} /></TableCell>
                      <TableCell className="tabular-nums">{account._count.memberships}</TableCell>
                      <TableCell className="tabular-nums">{account._count.configurations}</TableCell>
                      <TableCell className="pr-6">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={account.id === activeAccountId || Boolean(switchingAccount)}
                            onClick={() => openAccount(account)}
                          >
                            {switchingAccount === account.id ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ExternalLink aria-hidden="true" />}
                            {account.id === activeAccountId ? "Current" : "Open"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={account.isPrimary}
                            title={account.isPrimary ? "The primary account must remain active" : undefined}
                            onClick={() => openLifecycle(account)}
                          >
                            <SlidersHorizontal aria-hidden="true" /> Status
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y md:hidden">
              {accounts.map((account) => (
                <article key={account.id} className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                      <Building2 aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium">{account.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">{account.slug}</p>
                    </div>
                    <AccountStatusBadge status={account.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Members</dt><dd className="mt-1 font-medium">{account._count.memberships}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Config values</dt><dd className="mt-1 font-medium">{account._count.configurations}</dd></div>
                  </dl>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="min-h-11"
                      variant="outline"
                      disabled={account.id === activeAccountId || Boolean(switchingAccount)}
                      onClick={() => openAccount(account)}
                    >
                      {switchingAccount === account.id ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ExternalLink aria-hidden="true" />}
                      {account.id === activeAccountId ? "Current" : "Open"}
                    </Button>
                    <Button
                      className="min-h-11"
                      variant="outline"
                      disabled={account.isPrimary}
                      title={account.isPrimary ? "The primary account must remain active" : undefined}
                      onClick={() => openLifecycle(account)}
                    >
                      <SlidersHorizontal aria-hidden="true" /> Status
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-xl">
          <form onSubmit={createAccount}>
            <DialogHeader>
                <DialogTitle>Create a Company Account</DialogTitle>
              <DialogDescription>
                The new tenant starts active and uses its own BYOK configuration. No automated billing is attached.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-6 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="company-name">Company name</Label>
                <Input id="company-name" name="name" autoComplete="organization" className="min-h-11" required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="company-slug">Account slug <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="company-slug" name="slug" autoComplete="off" spellCheck={false} className="min-h-11" pattern="[a-z0-9-]+" placeholder="e.g. acme-support…" />
                <p className="text-xs leading-5 text-muted-foreground">Used as a stable internal identifier. Generated from the name when blank.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-id">Initial admin user ID</Label>
                <Input id="admin-user-id" name="adminUserId" autoComplete="username" spellCheck={false} className="min-h-11" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-pin">Temporary PIN</Label>
                <Input id="admin-pin" name="adminPin" type="password" autoComplete="new-password" className="min-h-11" minLength={4} />
                <p className="text-xs leading-5 text-muted-foreground">Required for a new user. Existing users keep their current sign-in PIN.</p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="min-h-11" disabled={creating}>
                {creating ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
                {creating ? "Creating…" : "Create Company"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lifecycleAccount)} onOpenChange={(open) => !open && setLifecycleAccount(null)}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
          <form key={lifecycleAccount?.id} onSubmit={updateLifecycle}>
            <DialogHeader>
              <DialogTitle>Control Account Status</DialogTitle>
              <DialogDescription>
                {lifecycleAccount?.name}. Suspended and maintenance accounts are blocked from operational pages.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-6">
              <div className="space-y-2">
                <Label htmlFor="account-status">Status</Label>
                <Select value={lifecycleStatus} onValueChange={(value: LifecycleStatus) => setLifecycleStatus(value)}>
                  <SelectTrigger id="account-status" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {lifecycleStatus === "active" ? null : (
                <div className="space-y-2">
                  <Label htmlFor="lifecycle-note">
                    {lifecycleStatus === "suspended" ? "Suspension reason" : "Maintenance message"}
                  </Label>
                  <textarea
                    key={lifecycleStatus}
                    id="lifecycle-note"
                    name="note"
                    maxLength={500}
                    rows={4}
                    defaultValue={
                      lifecycleStatus === "suspended"
                        ? lifecycleAccount?.suspensionReason || ""
                        : lifecycleAccount?.maintenanceMessage || ""
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    autoComplete="off"
                    placeholder="e.g. Maintenance ends at 18:00 UTC…"
                  />
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setLifecycleAccount(null)}>Cancel</Button>
              <Button type="submit" className="min-h-11" disabled={savingLifecycle}>
                {savingLifecycle ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
                {savingLifecycle ? "Saving…" : "Save Status"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
