import { NextRequest } from "next/server";
import { z } from "zod";

import { AgentRole } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { canAdministerAccount } from "@/lib/server/accountAccess";
import { requireSession } from "@/lib/server/auth";
import { hashPin } from "@/lib/vendor/bcrypt";

const updateMemberSchema = z
  .object({
    accountId: z.string().uuid(),
    role: z.nativeEnum(AgentRole).optional(),
    pin: z.string().min(4).max(128).optional(),
    telegramChatId: z.string().trim().max(120).nullable().optional(),
  })
  .refine(
    (value) => value.role !== undefined || value.pin !== undefined || value.telegramChatId !== undefined,
    "No changes provided"
  );

async function ensureAnotherAdministrator(accountId: string, userId: string) {
  const [membership, adminCount] = await Promise.all([
    prisma.accountMembership.findUnique({
      where: { accountId_agentId: { accountId, agentId: userId } },
      select: { role: true },
    }),
    prisma.accountMembership.count({ where: { accountId, role: AgentRole.admin } }),
  ]);
  return membership?.role !== AgentRole.admin || adminCount > 1;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const result = await requireSession(request, {
    role: AgentRole.admin,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const accountId = request.nextUrl.searchParams.get("accountId") || result.session.account?.id;
  if (!accountId) return Response.json({ error: "No account selected" }, { status: 409 });
  const authorized = await canAdministerAccount(result.session, accountId);
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (userId === result.session.agent.userId && !result.session.agent.platformAdmin) {
    return Response.json({ error: "You cannot remove your own account membership" }, { status: 400 });
  }
  if (!(await ensureAnotherAdministrator(accountId, userId))) {
    return Response.json({ error: "Every account must retain at least one administrator" }, { status: 400 });
  }

  const deleted = await prisma.accountMembership.deleteMany({ where: { accountId, agentId: userId } });
  if (!deleted.count) return Response.json({ error: "Member not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const result = await requireSession(request, {
    role: AgentRole.admin,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const parsed = updateMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid member update" }, { status: 400 });
  }
  const { accountId, role, pin, telegramChatId } = parsed.data;
  const authorized = await canAdministerAccount(result.session, accountId);
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (role === AgentRole.agent && !(await ensureAnotherAdministrator(accountId, userId))) {
    return Response.json({ error: "Every account must retain at least one administrator" }, { status: 400 });
  }
  if (userId === result.session.agent.userId && role === AgentRole.agent && !result.session.agent.platformAdmin) {
    return Response.json({ error: "You cannot remove your own administrator role" }, { status: 400 });
  }

  try {
    const membership = await prisma.$transaction(async (transaction) => {
      if (pin || telegramChatId !== undefined) {
        await transaction.agentAccount.update({
          where: { userId },
          data: {
            ...(pin ? { hashedPin: hashPin(pin) } : {}),
            ...(telegramChatId !== undefined ? { telegramChatId } : {}),
          },
        });
      }
      return transaction.accountMembership.update({
        where: { accountId_agentId: { accountId, agentId: userId } },
        data: role ? { role } : {},
        include: { agent: true },
      });
    });
    return Response.json({
      member: {
        userId: membership.agent.userId,
        role: membership.role,
        telegramChatId: membership.agent.telegramChatId,
        platformAdmin: membership.agent.platformAdmin,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to update account member", error);
    return Response.json({ error: "Unable to update member" }, { status: 404 });
  }
}
