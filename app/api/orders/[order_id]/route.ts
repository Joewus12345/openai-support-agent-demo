import { DEMO_ORDERS } from "@/config/demoData";

export async function GET(
  request: Request,
  context: { params: { order_id: string } }
) {
  try {
    const { order_id } = context.params;
    const order = DEMO_ORDERS.find((order) => order.id === order_id);
    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(order), { status: 200 });
  } catch (error) {
    console.error("Error retrieving order:", error);
    return new Response("Error retrieving order", { status: 500 });
  }
}
