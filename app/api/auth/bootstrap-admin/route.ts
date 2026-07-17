import { AgentRole } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { getAgentBootstrapState } from "@/lib/server/bootstrap";
import { hashPin } from "@/lib/vendor/bcrypt";

const SECRET = process.env.BOOTSTRAP_ADMIN_SECRET;

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const { hasAgents } = await getAgentBootstrapState();
  if (hasAgents) {
    return badRequest("Bootstrap is disabled because agents already exist", 403);
  }

  if (!SECRET) {
    return badRequest("Bootstrap secret is not configured", 503);
  }

  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    pin?: string;
    accountName?: string;
    telegramChatId?: string | null;
    secret?: string;
  } | null;

  if (!body?.secret || body.secret !== SECRET) {
    return badRequest("Invalid bootstrap secret", 403);
  }

  if (!body.userId || !body.pin) {
    return badRequest("userId and pin are required");
  }
  const userId = body.userId;
  const pin = body.pin;

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existingPrimary = await transaction.account.findFirst({ where: { isPrimary: true } });
      const account =
        existingPrimary ??
        (await transaction.account.create({
          data: {
            name: body.accountName?.trim() || "Primary account",
            slug: "primary",
            isPrimary: true,
          },
        }));
      const updatedAccount =
        body.accountName?.trim() && existingPrimary?.name === "Primary account"
          ? await transaction.account.update({
              where: { id: account.id },
              data: { name: body.accountName.trim() },
            })
          : account;
      const agent = await transaction.agentAccount.create({
        data: {
          userId,
          hashedPin: hashPin(pin),
          platformAdmin: true,
          roles: [AgentRole.admin, AgentRole.agent],
          telegramChatId: body.telegramChatId ?? null,
        },
      });
      await transaction.accountMembership.create({
        data: {
          accountId: updatedAccount.id,
          agentId: agent.userId,
          role: AgentRole.admin,
          invitedById: agent.userId,
        },
      });
      return { account: updatedAccount, agent };
    });

    return new Response(
      JSON.stringify({
        agent: {
          userId: result.agent.userId,
          roles: result.agent.roles,
          telegramChatId: result.agent.telegramChatId,
          createdAt: result.agent.createdAt,
        },
        account: result.account,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Failed to bootstrap admin", error);
    return badRequest("Unable to create admin account", 500);
  }
}
