import {
  isKnowledgeFolder,
  listAccountKnowledgeDocuments,
} from "@/lib/server/accountStorage";
import { requireTenantSession } from "@/lib/server/tenantSession";

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    const authResult = await requireTenantSession(request);
    if ("response" in authResult) return authResult.response;
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder");
    if (!isKnowledgeFolder(folder)) {
      return Response.json({ error: "Unsupported knowledge-base folder" }, { status: 400 });
    }
    const page = positiveInteger(searchParams.get("page"), 1);
    const limit = Math.min(positiveInteger(searchParams.get("limit"), 20), 100);
    const search = searchParams.get("search") ?? "";
    const orderBy = searchParams.get("orderBy") === "updated" ? "updated" : "name";
    const result = await listAccountKnowledgeDocuments({
      account: {
        id: authResult.accountId,
        isPrimary: Boolean(authResult.session.account?.isPrimary),
      },
      folder,
      page,
      limit,
      search,
      orderBy,
    });

    return Response.json({
      files: result.documents.map((document) => ({
        name: document.name,
        size: document.byteSize,
        createdAt: document.sourceCreatedAt.toISOString(),
        modifiedAt: document.sourceModifiedAt.toISOString(),
        type: document.name.split(".").pop()?.toLowerCase() || "md",
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (error) {
    console.error("Error fetching files:", error);
    return Response.json({ error: "Error fetching files" }, { status: 500 });
  }
}
