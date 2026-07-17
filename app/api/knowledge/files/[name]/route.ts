import { promises as fs } from "node:fs";

import { KnowledgeDocumentKind } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import {
  ensureKnowledgeDocumentsIndexed,
  isKnowledgeFolder,
  resolveKnowledgeStorageKey,
} from "@/lib/server/accountStorage";
import { requireTenantSession } from "@/lib/server/tenantSession";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const authResult = await requireTenantSession(request);
  if ("response" in authResult) return authResult.response;

  const folder = new URL(request.url).searchParams.get("folder");
  if (!isKnowledgeFolder(folder)) {
    return Response.json({ error: "Unsupported knowledge-base folder" }, { status: 400 });
  }

  const account = {
    id: authResult.accountId,
    isPrimary: Boolean(authResult.session.account?.isPrimary),
  };
  await ensureKnowledgeDocumentsIndexed(account, folder);
  const { name } = await params;
  const document = await prisma.knowledgeDocument.findUnique({
    where: {
      accountId_kind_name: {
        accountId: authResult.accountId,
        kind: folder as KnowledgeDocumentKind,
        name,
      },
    },
  });
  if (!document) return Response.json({ error: "File not found" }, { status: 404 });

  try {
    const absolutePath = resolveKnowledgeStorageKey(document.storageKey, account, folder);
    const content = await fs.readFile(absolutePath, "utf8");
    return new Response(content, {
      headers: {
        "Content-Type": `${document.mimeType}; charset=utf-8`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to read account knowledge document", {
      accountId: authResult.accountId,
      documentId: document.id,
      error,
    });
    return Response.json({ error: "File content is unavailable" }, { status: 404 });
  }
}
