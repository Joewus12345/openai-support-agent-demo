import { promises as fs } from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder");
    const faqDir = path.join(process.cwd(), `public/${folder}`); // path to the faq directory
    const entries = await fs.readdir(faqDir, { withFileTypes: true });
    const filesWithMetadata = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const filePath = path.join(faqDir, entry.name);
          const stats = await fs.stat(filePath);

          return {
            name: entry.name,
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
            type: path.extname(entry.name).replace(".", ""),
          };
        })
    );

    return new Response(JSON.stringify({ files: filesWithMetadata }), { status: 200 });
  } catch (error) {
    console.error("Error fetching files:", error);
    return new Response("Error fetching files", { status: 500 });
  }
}
