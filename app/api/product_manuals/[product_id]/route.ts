export async function GET(
  request: Request,
  { params }: { params: { product_id: string } }
) {
  try {
    const { product_id } = params;
    return new Response(
      JSON.stringify({
        product_id,
        manual_url: `/manuals/${product_id}.pdf`,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching product manual:", error);
    return new Response("Error fetching product manual", { status: 500 });
  }
}
