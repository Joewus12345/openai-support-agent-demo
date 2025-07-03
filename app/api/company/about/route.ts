export async function GET() {
  try {
    const res = await fetch(
      "https://automationghana.com/wp-json/wp/v2/pages?slug=new-home-2"
    );
    const pages = (await res.json()) as any[];
    const excerptHtml = pages[0]?.excerpt?.rendered || "";
    const text = excerptHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return new Response(JSON.stringify({ text }), { status: 200 });
  } catch (error) {
    console.error("Error fetching about page:", error);
    return new Response("Error fetching about page", { status: 500 });
  }
}
