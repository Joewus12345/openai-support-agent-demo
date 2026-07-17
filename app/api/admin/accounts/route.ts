import { AgentRole } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/server/auth";
import { hashPin } from "@/lib/vendor/bcrypt";
import { z } from "zod";

const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().max(80).optional(),
  adminUserId: z.string().trim().min(2).max(120),
  adminPin: z.string().min(4).max(128).optional(),
});

function slugify(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function GET(request: Request) {
  const result = await requireSession(request, {
    platformAdmin: true,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const accounts = await prisma.account.findMany({
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { memberships: true, configurations: true } } },
  });
  return Response.json({ accounts });
}

export async function POST(request: Request) {
  const result = await requireSession(request, {
    platformAdmin: true,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const parsed = createAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid account details" }, { status: 400 });
  }
  const { name, adminUserId, adminPin } = parsed.data;
  const slug = slugify(parsed.data.slug || name);
  if (!slug) return Response.json({ error: "Choose a valid account slug" }, { status: 400 });

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const existingAgent = await transaction.agentAccount.findUnique({ where: { userId: adminUserId } });
      if (!existingAgent && !adminPin) {
        throw new Error("A temporary PIN is required for a new administrator");
      }
      const account = await transaction.account.create({
        data: { name, slug, createdById: result.session.agent.userId },
      });
      const agent = existingAgent
        ? existingAgent
        : await transaction.agentAccount.create({
            data: {
              userId: adminUserId,
              hashedPin: hashPin(adminPin as string),
              roles: [AgentRole.agent],
            },
          });
      await transaction.accountMembership.create({
        data: {
          accountId: account.id,
          agentId: agent.userId,
          role: AgentRole.admin,
          invitedById: result.session.agent.userId,
        },
      });
      return transaction.account.findUnique({
        where: { id: account.id },
        include: { _count: { select: { memberships: true, configurations: true } } },
      });
    });
    return Response.json({ account: created }, { status: 201 });
  } catch (error) {
    console.error("Failed to create account", error);
    const message = error instanceof Error ? error.message : "Unable to create account";
    const conflict = message.toLowerCase().includes("unique constraint");
    return Response.json(
      { error: conflict ? "That account slug is already in use" : message },
      { status: conflict ? 409 : 400 }
    );
  }
}
