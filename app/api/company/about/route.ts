const cachedAboutText: Record<string, { text: string; timestamp: number }> = {};
const ABOUT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const cacheKey = query.toLowerCase() || "__all__";

    if (
      cachedAboutText[cacheKey] &&
      Date.now() - cachedAboutText[cacheKey].timestamp < ABOUT_CACHE_TTL_MS
    ) {
      return new Response(JSON.stringify({ text: cachedAboutText[cacheKey].text }), {
        status: 200,
      });
    }
    const res = await fetch(
      "https://automationghana.com/wp-json/wp/v2/pages?slug=new-home-2"
    );
    const pages = (await res.json()) as any[];
    const excerptHtml = pages[0]?.excerpt?.rendered || "";
    const baseText = excerptHtml
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    let processedText = baseText;
    if (query) {
      const sentences = baseText.match(/[^.!?]+[.!?]*/g) || [baseText];
      processedText = sentences
        .filter((s: string) => s.toLowerCase().includes(query.toLowerCase()))
        .join(" ")
        .trim();
    }

    cachedAboutText[cacheKey] = { text: processedText, timestamp: Date.now() };
    return new Response(JSON.stringify({ text: processedText }), { status: 200 });
  } catch (error) {
    console.error("Error fetching about page:", error);
    return new Response("Error fetching about page", { status: 500 });
  }
}
