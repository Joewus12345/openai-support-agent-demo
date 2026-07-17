import { AgentRole } from "@/lib/generated/prisma";
import { requireAccountOpenAI } from "@/lib/server/accountOpenAI";

export async function POST(request: Request) {
  const authResult = await requireAccountOpenAI(request, {
    role: AgentRole.admin,
    csrfProtected: true,
    requireVectorStore: true,
  });
  if ("response" in authResult) return authResult.response;
  const { vectorStoreId, fileId, attributes } = await request.json();
  if (vectorStoreId && vectorStoreId !== authResult.vectorStoreId) {
    return Response.json({ error: "Vector store does not belong to the active account" }, { status: 403 });
  }
  console.log(
    `Adding file ${fileId} with attributes ${JSON.stringify(attributes)}`
  );
  try {
    const vectorStore = await authResult.openai.vectorStores.files.create(authResult.vectorStoreId!, {
      file_id: fileId,
      attributes,
    });
    return new Response(JSON.stringify(vectorStore), { status: 200 });
  } catch (error) {
    console.error("Error adding file:", error);
    return new Response("Error adding file", { status: 500 });
  }
}
