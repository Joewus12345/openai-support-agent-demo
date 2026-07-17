"use client";

import { LoaderCircle, MoreHorizontal, Plus, Shield, Trash2, UserRoundCog, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AdminEmptyState } from "@/components/admin/admin-shared";
import { useAdminWorkspace, type AdminMember } from "@/components/admin/admin-workspace";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/client/authFetch";
import { useToastStore } from "@/stores/useToastStore";

type MemberRole = AdminMember["role"];
const memberDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function MemberRoleBadge({ member }: { member: AdminMember }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={member.role === "admin" ? "default" : "secondary"} className="capitalize">
        {member.role === "admin" ? <Shield aria-hidden="true" /> : null}
        {member.role}
      </Badge>
      {member.platformAdmin ? <Badge variant="outline">Platform owner</Badge> : null}
    </div>
  );
}

function getError(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export function MembersPanel() {
  const { state, actions, meta } = useAdminWorkspace();
  const addToast = useToastStore((toast) => toast.addToast);
  const members = state.members?.members ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState<MemberRole>("agent");
  const [editingMember, setEditingMember] = useState<AdminMember | null>(null);
  const [editRole, setEditRole] = useState<MemberRole>("agent");
  const [savingMember, setSavingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState<AdminMember | null>(null);
  const [removing, setRemoving] = useState(false);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meta.accountId) return;
    setAdding(true);
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await authFetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: meta.accountId,
          userId: values.get("userId"),
          pin: values.get("pin") || undefined,
          role: newRole,
          telegramChatId: values.get("telegramChatId") || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getError(payload, "Unable to add member"));
      form.reset();
      setNewRole("agent");
      setAddOpen(false);
      await Promise.all([actions.refreshMembers(), actions.refreshOverview()]);
      addToast({ title: "Member added", description: "Their role applies only to this company.", variant: "success" });
    } catch (error) {
      addToast({
        title: "Unable to add member",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setAdding(false);
    }
  }

  function openEdit(member: AdminMember) {
    setEditRole(member.role);
    setEditingMember(member);
  }

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMember || !meta.accountId) return;
    setSavingMember(true);
    const values = new FormData(event.currentTarget);
    try {
      const response = await authFetch(`/api/admin/agents/${encodeURIComponent(editingMember.userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: meta.accountId,
          role: editRole,
          pin: values.get("pin") || undefined,
          telegramChatId: values.get("telegramChatId") || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getError(payload, "Unable to update member"));
      setEditingMember(null);
      await actions.refreshMembers();
      addToast({ title: "Member updated", variant: "success" });
    } catch (error) {
      addToast({
        title: "Unable to update member",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setSavingMember(false);
    }
  }

  async function removeMember() {
    if (!removingMember || !meta.accountId) return;
    setRemoving(true);
    try {
      const response = await authFetch(
        `/api/admin/agents/${encodeURIComponent(removingMember.userId)}?accountId=${encodeURIComponent(meta.accountId)}`,
        { method: "DELETE" }
      );
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(getError(payload, "Unable to remove member"));
      setRemovingMember(null);
      await Promise.all([actions.refreshMembers(), actions.refreshOverview()]);
      addToast({ title: "Member removed", description: "Their identity and audit history were retained.", variant: "success" });
    } catch (error) {
      addToast({
        title: "Unable to remove member",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setRemoving(false);
    }
  }

  const MemberActions = ({ member }: { member: AdminMember }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Manage ${member.userId}`}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="min-h-10" onSelect={() => openEdit(member)}>
          <UserRoundCog aria-hidden="true" /> Edit Access
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 text-destructive focus:text-destructive" onSelect={() => setRemovingMember(member)}>
          <Trash2 aria-hidden="true" /> Remove from Company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Members</CardTitle>
          <CardDescription>Roles are scoped to this company. Administrators can grant or remove admin access.</CardDescription>
        </div>
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => setAddOpen(true)}>
          <Plus aria-hidden="true" /> Add Member
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {members.length === 0 ? (
          <div className="p-6"><AdminEmptyState title="No members" description="Add an administrator or agent to this company." /></div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Telegram</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="pr-6 text-right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell className="pl-6 font-medium">{member.userId}</TableCell>
                      <TableCell><MemberRoleBadge member={member} /></TableCell>
                      <TableCell className="text-muted-foreground">{member.telegramChatId || "Not connected"}</TableCell>
                      <TableCell className="text-muted-foreground">{memberDateFormatter.format(new Date(member.createdAt))}</TableCell>
                      <TableCell className="pr-6 text-right"><MemberActions member={member} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">
              {members.map((member) => (
                <article key={member.userId} className="flex items-start gap-3 p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UsersRound aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <h3 className="truncate font-medium">{member.userId}</h3>
                    <MemberRoleBadge member={member} />
                    <p className="text-xs text-muted-foreground">
                      {member.telegramChatId ? "Telegram connected" : "Telegram not connected"}
                    </p>
                  </div>
                  <MemberActions member={member} />
                </article>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <form onSubmit={addMember}>
            <DialogHeader>
              <DialogTitle>Add a Member</DialogTitle>
              <DialogDescription>Assign an existing identity or create a new user with a temporary PIN.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-6">
              <div className="space-y-2">
                <Label htmlFor="member-user-id">User ID</Label>
                <Input id="member-user-id" name="userId" autoComplete="username" spellCheck={false} className="min-h-11" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-pin">Temporary PIN</Label>
                <Input id="member-pin" name="pin" type="password" autoComplete="new-password" minLength={4} className="min-h-11" />
                <p className="text-xs leading-5 text-muted-foreground">Required for a new user. Existing users keep their current sign-in PIN.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-role">Account role</Label>
                <Select value={newRole} onValueChange={(value) => setNewRole(value as MemberRole)}>
                  <SelectTrigger id="member-role" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="agent">Agent</SelectItem><SelectItem value="admin">Administrator</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-telegram">Telegram chat ID <span className="font-normal text-muted-foreground">(optional, new users only)</span></Label>
                <Input id="member-telegram" name="telegramChatId" inputMode="numeric" autoComplete="off" className="min-h-11" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="min-h-11" disabled={adding}>
                {adding ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}{adding ? "Adding…" : "Add Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingMember)} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <form key={editingMember?.userId} onSubmit={saveMember}>
            <DialogHeader>
              <DialogTitle>Edit Member Access</DialogTitle>
              <DialogDescription>{editingMember?.userId}. Changes to the role apply only to this company.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-6">
              <div className="space-y-2">
                <Label htmlFor="edit-member-role">Account role</Label>
                <Select value={editRole} onValueChange={(value) => setEditRole(value as MemberRole)}>
                  <SelectTrigger id="edit-member-role" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="agent">Agent</SelectItem><SelectItem value="admin">Administrator</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-member-pin">Reset PIN <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="edit-member-pin" name="pin" type="password" autoComplete="new-password" minLength={4} className="min-h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-member-telegram">Telegram chat ID</Label>
                <Input id="edit-member-telegram" name="telegramChatId" inputMode="numeric" autoComplete="off" defaultValue={editingMember?.telegramChatId || ""} className="min-h-11" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditingMember(null)}>Cancel</Button>
              <Button type="submit" className="min-h-11" disabled={savingMember}>
                {savingMember ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}{savingMember ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removingMember)} onOpenChange={(open) => !open && setRemovingMember(null)}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Member?</DialogTitle>
            <DialogDescription>
              {removingMember?.userId} will lose access to this company. Their identity and audit history are retained.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5 gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setRemovingMember(null)}>Cancel</Button>
            <Button variant="destructive" className="min-h-11" disabled={removing} onClick={removeMember}>
              {removing ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}{removing ? "Removing…" : "Remove Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
