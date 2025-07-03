let cachedAboutText: { text: string; timestamp: number } | null = null;
const ABOUT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    if (
      cachedAboutText &&
      Date.now() - cachedAboutText.timestamp < ABOUT_CACHE_TTL_MS
    ) {
      return new Response(JSON.stringify({ text: cachedAboutText.text }), {
        status: 200,
      });
    }
    const res = await fetch(
      "https://automationghana.com/wp-json/wp/v2/pages?slug=new-home-2"
    );
    const pages = (await res.json()) as any[];
    const excerptHtml = pages[0]?.excerpt?.rendered || "";
    const text = excerptHtml
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    cachedAboutText = { text, timestamp: Date.now() };
    return new Response(JSON.stringify({ text }), { status: 200 });
  } catch (error) {
    console.error("Error fetching about page:", error);
    return new Response("Error fetching about page", { status: 500 });
  }
}
