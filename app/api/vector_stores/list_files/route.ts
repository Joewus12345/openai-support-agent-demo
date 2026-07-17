import { AgentRole } from "@/lib/generated/prisma";
import { requireAccountOpenAI } from "@/lib/server/accountOpenAI";

export async function GET(request: Request) {
  const authResult = await requireAccountOpenAI(request, {
    role: AgentRole.agent,
    requireVectorStore: true,
  });
  if ("response" in authResult) return authResult.response;
  const { searchParams } = new URL(request.url);
  const vectorStoreId = searchParams.get("vectorStoreId");
  if (vectorStoreId && vectorStoreId !== authResult.vectorStoreId) {
    return Response.json({ error: "Vector store does not belong to the active account" }, { status: 403 });
  }

  try {
    const vectorStore = await authResult.openai.vectorStores.files.list(
      authResult.vectorStoreId!
    );
    return new Response(JSON.stringify(vectorStore), { status: 200 });
  } catch (error) {
    console.error("Error fetching files:", error);
    return new Response("Error fetching files", { status: 500 });
  }
}
