import { promises as fs } from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("query") || "").toLowerCase();
    const filePath = path.join(process.cwd(), "public/knowledge_base/products.json");
    const file = await fs.readFile(filePath, "utf-8");
    const products: { name: string; price: string; url: string }[] = JSON.parse(file);
    const results = products
      .filter((p) => p.name.toLowerCase().includes(query))
      .slice(0, 5);
    return new Response(JSON.stringify(results), { status: 200 });
  } catch (error) {
    console.error("Error searching products:", error);
    return new Response("Error searching products", { status: 500 });
  }
}
