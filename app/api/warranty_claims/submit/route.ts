export async function POST(request: Request) {
  try {
    const { product_id, purchase_date, issue } = await request.json();
    return new Response(
      JSON.stringify({
        message: `Warranty claim submitted for product ${product_id}`,
        purchase_date,
        issue,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error submitting warranty claim:", error);
    return new Response("Error submitting warranty claim", { status: 500 });
  }
}
