import prisma from "@/lib/prisma";
import { requireTenantSession } from "@/lib/server/tenantSession";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ user_id: string }> }
) {
  try {
    const auth = await requireTenantSession(request);
    if ("response" in auth) return auth.response;
    const { user_id } = await params;
    const orders = await prisma.order.findMany({
      where: { accountId: auth.accountId, userId: user_id },
      orderBy: { createdAt: "desc" },
    });
    return new Response(JSON.stringify(orders), {
      status: 200,
    });
  } catch (error) {
    console.error("Error retrieving order history:", error);
    return new Response("Error retrieving order history", { status: 500 });
  }
}
