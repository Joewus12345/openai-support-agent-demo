export async function POST(request: Request) {
  try {
    const body = await request.json();
    const customAttributes =
      body && typeof body === "object" && "custom_attributes" in body
        ? (body.custom_attributes as Record<string, unknown>)
        : {};
    const {
      customer_name,
      company_name,
      company_location,
      contact,
      complaint_type,
      issue_description,
    } = customAttributes as Record<string, unknown>;

    // Simulate complaint creation.
    return new Response(
      JSON.stringify({
        message: `Complaint created for customer ${String(
          customer_name ?? "unknown"
        )}`,
        custom_attributes: {
          customer_name,
          company_name,
          company_location,
          contact,
          complaint_type,
          issue_description,
        },
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error creating complaint:", error);
    return new Response("Error creating complaint", { status: 500 });
  }
}
