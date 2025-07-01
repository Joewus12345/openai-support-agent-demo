export async function POST(request: Request) {
  try {
    const { equipment_id, preferred_date, issue_description } = await request.json();
    return new Response(
      JSON.stringify({
        message: `Service visit scheduled for equipment ${equipment_id} on ${preferred_date}`,
        issue_description,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error scheduling service visit:", error);
    return new Response("Error scheduling service visit", { status: 500 });
  }
}
