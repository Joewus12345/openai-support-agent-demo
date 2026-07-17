import { AgentRole } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { canAdministerAccount } from "@/lib/server/accountAccess";
import { requireSession } from "@/lib/server/auth";
import { hashPin } from "@/lib/vendor/bcrypt";
import { z } from "zod";

const createMemberSchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().trim().min(2).max(120),
  pin: z.string().min(4).max(128).optional(),
  role: z.nativeEnum(AgentRole),
  telegramChatId: z.string().trim().max(120).nullable().optional(),
});

function serializeMembership(membership: {
  role: AgentRole;
  createdAt: Date;
  updatedAt: Date;
  agent: {
    userId: string;
    telegramChatId: string | null;
    platformAdmin: boolean;
  };
}) {
  return {
    userId: membership.agent.userId,
    role: membership.role,
    telegramChatId: membership.agent.telegramChatId,
    platformAdmin: membership.agent.platformAdmin,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

export async function GET(request: Request) {
  const result = await requireSession(request, {
    role: AgentRole.admin,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const accountId = new URL(request.url).searchParams.get("accountId") || result.session.account?.id;
  if (!accountId) return Response.json({ error: "No account selected" }, { status: 409 });
  const authorized = await canAdministerAccount(result.session, accountId);
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });

  const memberships = await prisma.accountMembership.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    include: { agent: true },
  });
  return Response.json({ members: memberships.map(serializeMembership) });
}

export async function POST(request: Request) {
  const result = await requireSession(request, {
    role: AgentRole.admin,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const parsed = createMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid member details" }, { status: 400 });
  }
  const authorized = await canAdministerAccount(result.session, parsed.data.accountId);
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const membership = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.agentAccount.findUnique({ where: { userId: parsed.data.userId } });
      if (!existing && !parsed.data.pin) throw new Error("A temporary PIN is required for a new user");
      const agent = existing
        ? existing
        : await transaction.agentAccount.create({
            data: {
              userId: parsed.data.userId,
              hashedPin: hashPin(parsed.data.pin as string),
              roles: [AgentRole.agent],
              telegramChatId: parsed.data.telegramChatId ?? null,
            },
          });
      return transaction.accountMembership.create({
        data: {
          accountId: parsed.data.accountId,
          agentId: agent.userId,
          role: parsed.data.role,
          invitedById: result.session.agent.userId,
        },
        include: { agent: true },
      });
    });
    return Response.json({ member: serializeMembership(membership) }, { status: 201 });
  } catch (error) {
    console.error("Failed to add account member", error);
    const message = error instanceof Error ? error.message : "Unable to add member";
    const conflict = message.toLowerCase().includes("unique constraint");
    return Response.json(
      { error: conflict ? "This user already belongs to the account" : message },
      { status: conflict ? 409 : 400 }
    );
  }
}
