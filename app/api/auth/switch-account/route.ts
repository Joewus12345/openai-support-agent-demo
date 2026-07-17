import { AgentRole } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { canAccessAccount } from "@/lib/server/accountAccess";
import { requireSession } from "@/lib/server/auth";

export async function POST(request: Request) {
  const result = await requireSession(request, {
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const body = (await request.json().catch(() => null)) as { accountId?: string } | null;
  if (!body?.accountId) {
    return Response.json({ error: "accountId is required" }, { status: 400 });
  }

  const allowed = await canAccessAccount(result.session, body.accountId);
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });

  const account = await prisma.account.findUnique({ where: { id: body.accountId } });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  const membership = result.session.agent.platformAdmin
    ? null
    : await prisma.accountMembership.findUnique({
        where: {
          accountId_agentId: {
            accountId: body.accountId,
            agentId: result.session.agent.userId,
          },
        },
      });

  await prisma.loginToken.update({
    where: { id: result.session.tokenId },
    data: { accountId: account.id },
  });

  const roles =
    result.session.agent.platformAdmin || membership?.role === AgentRole.admin
      ? [AgentRole.admin, AgentRole.agent]
      : [AgentRole.agent];

  return Response.json({ account, roles });
}
