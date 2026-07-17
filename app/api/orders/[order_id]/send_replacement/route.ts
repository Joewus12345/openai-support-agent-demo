import { requireTenantOrder } from "@/lib/server/tenantRecords";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ order_id: string }> }
) {
  try {
    const { order_id } = await params;
    const auth = await requireTenantOrder(request, order_id);
    if ("response" in auth) return auth.response;
    const { product_id } = await request.json();
    // Simulate sending a replacement
    return new Response(
      JSON.stringify({
        message: `Replacement for product ${product_id} in order ${order_id} sent successfully`,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending replacement:", error);
    return new Response("Error sending replacement", { status: 500 });
  }
}
