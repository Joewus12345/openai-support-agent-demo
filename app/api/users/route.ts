import prisma from "@/lib/prisma";
import { requireTenantSession } from "@/lib/server/tenantSession";

export async function GET(request: Request) {
  try {
    const auth = await requireTenantSession(request);
    if ("response" in auth) return auth.response;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
      });
    }
    const user = await prisma.user.findUnique({
      where: { accountId_email: { accountId: auth.accountId, email } },
      include: { orders: true },
    });
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(user), { status: 200 });
  } catch (error) {
    console.error("Error fetching user:", error);
    return new Response("Error fetching user", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireTenantSession(request, { csrfProtected: true });
    if ("response" in auth) return auth.response;
    const { email, name, phone, address } = await request.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
      });
    }
    const user = await prisma.user.upsert({
      where: { accountId_email: { accountId: auth.accountId, email } },
      update: { name, phone, address },
      create: { accountId: auth.accountId, email, name, phone, address },
      include: { orders: true },
    });
    return new Response(JSON.stringify(user), { status: 200 });
  } catch (error) {
    console.error("Error creating user:", error);
    return new Response("Error creating user", { status: 500 });
  }
}
