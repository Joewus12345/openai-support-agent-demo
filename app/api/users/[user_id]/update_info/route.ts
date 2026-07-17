import prisma from "@/lib/prisma";
import { requireTenantSession } from "@/lib/server/tenantSession";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ user_id: string }> }
) {
  try {
    const auth = await requireTenantSession(request, { csrfProtected: true });
    if ("response" in auth) return auth.response;
    const { user_id } = await params;
    const { email, phone, address, name } = await request.json();
    const data = {
      ...(email && { email }),
      ...(phone && { phone }),
      ...(address && { address }),
      ...(name && { name }),
    };
    await prisma.user.update({
      where: { accountId_id: { accountId: auth.accountId, id: user_id } },
      data,
    });
    return new Response(
      JSON.stringify({
        message: `User ${user_id} info updated`,
        updated: data,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating user info:", error);
    return new Response("Error updating user info", { status: 500 });
  }
}
