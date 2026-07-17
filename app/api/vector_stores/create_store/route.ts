import { AgentRole } from "@/lib/generated/prisma";
import { requireAccountOpenAI } from "@/lib/server/accountOpenAI";

export async function POST(request: Request) {
  const authResult = await requireAccountOpenAI(request, {
    role: AgentRole.admin,
    csrfProtected: true,
  });
  if ("response" in authResult) return authResult.response;
  const { name } = await request.json();
  try {
    const vectorStore = await authResult.openai.vectorStores.create({
      name,
    });
    console.log("Vector store created:", vectorStore);
    return new Response(JSON.stringify(vectorStore), { status: 200 });
  } catch (error) {
    console.error("Error creating vector store:", error);
    return new Response("Error creating vector store", { status: 500 });
  }
}
