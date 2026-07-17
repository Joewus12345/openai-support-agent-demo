import { requireTenantUser } from "@/lib/server/tenantRecords";

export async function POST(request: Request) {
  try {
    const { user_id, amount, reason } = await request.json();
    const auth = await requireTenantUser(request, user_id);
    if ("response" in auth) return auth.response;
    // Simulate voucher issuance
    return new Response(
      JSON.stringify({
        message: `Voucher of $${amount} issued to user ${user_id} for: ${reason}`,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error issuing voucher:", error);
    return new Response("Error issuing voucher", { status: 500 });
  }
}
