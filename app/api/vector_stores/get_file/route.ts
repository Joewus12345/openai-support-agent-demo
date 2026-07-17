import { AgentRole } from "@/lib/generated/prisma";
import { requireAccountOpenAI } from "@/lib/server/accountOpenAI";

export async function GET(request: Request) {
  const authResult = await requireAccountOpenAI(request, {
    role: AgentRole.agent,
    requireVectorStore: true,
  });
  if ("response" in authResult) return authResult.response;
  const { searchParams } = new URL(request.url);
  const vectorStoreId = searchParams.get("vectorStoreId") ?? "";
  const fileId = searchParams.get("fileId") ?? "";
  if (vectorStoreId && vectorStoreId !== authResult.vectorStoreId) {
    return Response.json({ error: "Vector store does not belong to the active account" }, { status: 403 });
  }
  try {
    const fileContent = await authResult.openai.vectorStores.files.retrieve(
      fileId,
      { vector_store_id: authResult.vectorStoreId! }
    );
    return new Response(JSON.stringify(fileContent), { status: 200 });
  } catch (error) {
    console.error("Error retrieving file:", error);
    return new Response("Error retrieving file", { status: 500 });
  }
}
