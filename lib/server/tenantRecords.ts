import prisma from "@/lib/prisma";
import { requireTenantSession } from "@/lib/server/tenantSession";

export async function requireTenantOrder(request: Request, orderId: string) {
  const auth = await requireTenantSession(request, { csrfProtected: true });
  if ("response" in auth) return auth;

  const order = await prisma.order.findUnique({
    where: {
      accountId_orderId: { accountId: auth.accountId, orderId },
    },
  });
  if (!order) {
    return {
      response: Response.json({ error: "Order not found" }, { status: 404 }),
    } as const;
  }
  return { ...auth, order } as const;
}

export async function requireTenantUser(request: Request, userId: string) {
  const auth = await requireTenantSession(request, { csrfProtected: true });
  if ("response" in auth) return auth;

  const user = await prisma.user.findUnique({
    where: {
      accountId_id: { accountId: auth.accountId, id: userId },
    },
  });
  if (!user) {
    return {
      response: Response.json({ error: "User not found" }, { status: 404 }),
    } as const;
  }
  return { ...auth, user } as const;
}
