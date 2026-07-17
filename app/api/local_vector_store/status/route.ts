import { NextResponse } from "next/server";
import { localVectorStore } from "@/lib/localVectorStore";
import { requireTenantSession } from "@/lib/server/tenantSession";

export async function GET(request: Request) {
  try {
    const authResult = await requireTenantSession(request);
    if ("response" in authResult) return authResult.response;
    const status = await localVectorStore.getStatus(
      authResult.accountId,
      Boolean(authResult.session.account?.isPrimary)
    );
    return NextResponse.json(status);
  } catch (error) {
    console.error("Error fetching local vector store status:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
