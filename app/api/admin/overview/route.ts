import { AgentRole } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { canAdministerAccount } from "@/lib/server/accountAccess";
import { requireSession } from "@/lib/server/auth";

export async function GET(request: Request) {
  const result = await requireSession(request, {
    role: AgentRole.admin,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;
  const accountId = result.session.account?.id;
  if (!accountId) return Response.json({ error: "No account selected" }, { status: 409 });

  const authorized = await canAdministerAccount(result.session, accountId);
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { _count: { select: { memberships: true, configurations: true } } },
  });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  return Response.json({
    account,
    platformAdmin: result.session.agent.platformAdmin,
    currentUserId: result.session.agent.userId,
  });
}
