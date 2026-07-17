import prisma from "@/lib/prisma";
import { requireTenantSession } from "@/lib/server/tenantSession";

export async function POST(request: Request) {
  try {
    const auth = await requireTenantSession(request, { csrfProtected: true });
    if ("response" in auth) return auth.response;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);

    const count = await prisma.ticket.count({
      where: {
        accountId: auth.accountId,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
    });

    const today = start.toISOString().split("T")[0];
    const index = count + 1;
    const ticket_id = `#${index}/${today}`;

    await prisma.ticket.create({
      data: {
        accountId: auth.accountId,
        ticket: ticket_id,
      },
    });

    return new Response(JSON.stringify({ ticket_id }), { status: 200 });
  } catch (error) {
    console.error("Error creating ticket:", error);
    return new Response(
      JSON.stringify({ error: "Error creating ticket" }),
      { status: 500 }
    );
  }
}
