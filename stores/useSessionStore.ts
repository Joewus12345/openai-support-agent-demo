import { create } from "zustand";
import type { AgentRole } from "@/lib/generated/prisma";

export type SessionAccount = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "maintenance";
  isPrimary: boolean;
  suspensionReason?: string | null;
  maintenanceMessage?: string | null;
};

export type SessionDetails = {
  userId: string;
  verified: boolean;
  roles: AgentRole[];
  platformAdmin: boolean;
  activeAccount: SessionAccount | null;
  accounts: SessionAccount[];
  csrfToken: string | null;
  expiresAt?: string;
};

interface SessionState extends Partial<SessionDetails> {
  initialized: boolean;
  setSession: (session: SessionDetails) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userId: undefined,
  verified: undefined,
  roles: undefined,
  platformAdmin: undefined,
  activeAccount: undefined,
  accounts: undefined,
  csrfToken: null,
  expiresAt: undefined,
  initialized: false,
  setSession: (session) =>
    set({
      userId: session.userId,
      verified: session.verified,
      roles: session.roles,
      platformAdmin: session.platformAdmin,
      activeAccount: session.activeAccount,
      accounts: session.accounts,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      initialized: true,
    }),
  clearSession: () =>
    set({
      userId: undefined,
      verified: undefined,
      roles: undefined,
      platformAdmin: undefined,
      activeAccount: undefined,
      accounts: undefined,
      csrfToken: null,
      expiresAt: undefined,
      initialized: true,
    }),
}));

export const sessionStore = useSessionStore;
