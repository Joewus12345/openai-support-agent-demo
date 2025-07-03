export async function GET() {
  try {
    const res = await fetch("https://automationghana.com/new-home-2/");
    const html = await res.text();
    // basic stripping of HTML tags
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return new Response(JSON.stringify({ text }), { status: 200 });
  } catch (error) {
    console.error("Error fetching about page:", error);
    return new Response("Error fetching about page", { status: 500 });
  }
}
