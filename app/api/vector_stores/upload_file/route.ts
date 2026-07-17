import fs from "fs";
import path from "path";
import { AgentRole } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { toStorageKey } from "@/lib/server/accountStorage";
import { requireAccountOpenAI } from "@/lib/server/accountOpenAI";
export async function POST(request: Request) {
  const authResult = await requireAccountOpenAI(request, {
    role: AgentRole.admin,
    csrfProtected: true,
  });
  if ("response" in authResult) return authResult.response;
  const { filePath } = await request.json();

  try {
    const workingDir = process.cwd();
    const absolutePath = path.resolve(workingDir, filePath);
    const storageKey = toStorageKey(absolutePath);
    const ownedDocument = await prisma.knowledgeDocument.findFirst({
      where: { accountId: authResult.account.id, storageKey },
      select: { id: true },
    });
    if (!ownedDocument) {
      return Response.json(
        { error: "File does not belong to the active account" },
        { status: 403 }
      );
    }
    const fileContent = fs.createReadStream(absolutePath);
    const file = await authResult.openai.files.create({
      file: fileContent,
      purpose: "assistants",
    });

    return new Response(JSON.stringify(file), { status: 200 });
  } catch (error) {
    console.error("Error uploading file:", error);
    return new Response("Error uploading file", { status: 500 });
  }
}
