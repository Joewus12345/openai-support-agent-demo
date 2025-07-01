export async function POST(
  request: Request,
  context: { params: { order_id: string } }
) {
  try {
    const { order_id } = context.params;
    // Simulate order cancellation
    return new Response(
      JSON.stringify({ message: `Order ${order_id} cancelled successfully` }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error cancelling order:", error);
    return new Response("Error cancelling order", { status: 500 });
  }
}
