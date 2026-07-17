import { AgentRole } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import type { SessionContext } from "@/lib/server/auth";

export async function listAccessibleAccounts(session: SessionContext) {
  if (session.agent.platformAdmin) {
    return prisma.account.findMany({
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { memberships: true, configurations: true } },
      },
    });
  }

  const memberships = await prisma.accountMembership.findMany({
    where: { agentId: session.agent.userId },
    orderBy: { createdAt: "asc" },
    include: {
      account: {
        include: { _count: { select: { memberships: true, configurations: true } } },
      },
    },
  });
  return memberships
    .map((membership) => membership.account)
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
}

export async function canAdministerAccount(session: SessionContext, accountId: string) {
  if (session.agent.platformAdmin) return true;
  const membership = await prisma.accountMembership.findUnique({
    where: { accountId_agentId: { accountId, agentId: session.agent.userId } },
    select: { role: true },
  });
  return membership?.role === AgentRole.admin;
}

export async function canAccessAccount(session: SessionContext, accountId: string) {
  if (session.agent.platformAdmin) return true;
  const membership = await prisma.accountMembership.findUnique({
    where: { accountId_agentId: { accountId, agentId: session.agent.userId } },
    select: { id: true },
  });
  return Boolean(membership);
}
