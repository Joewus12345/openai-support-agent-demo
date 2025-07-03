export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.toLowerCase() || "";

    const res = await fetch("https://automationghana.com/new-home-2/");
    const html = await res.text();
    // basic stripping of HTML tags
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    const words = text.split(" ");
    let snippet = words.slice(0, 200).join(" ");
    if (query) {
      const index = words.findIndex((w) => w.toLowerCase().includes(query));
      if (index !== -1) {
        const start = Math.max(0, index - 100);
        const end = Math.min(words.length, index + 100);
        snippet = words.slice(start, end).join(" ");
      }
    }

    return new Response(JSON.stringify({ snippet }), { status: 200 });
  } catch (error) {
    console.error("Error fetching about page:", error);
    return new Response("Error fetching about page", { status: 500 });
  }
}
