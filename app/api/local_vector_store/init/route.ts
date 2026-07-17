import { NextResponse } from "next/server";
import { localVectorStore } from "@/lib/localVectorStore";
import { clearFileSearchCache } from "@/config/functions";
import { AgentRole } from "@/lib/generated/prisma";
import { requireSession } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const authResult = await requireSession(request, {
      role: AgentRole.admin,
      csrfProtected: true,
    });
    if ("response" in authResult) return authResult.response;
    const account = authResult.session.account;
    if (!account) return NextResponse.json({ error: "No account selected" }, { status: 409 });
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";
    await localVectorStore.initialize({
      force,
      accountId: account.id,
      isPrimary: account.isPrimary,
    });
    clearFileSearchCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error initializing local vector store:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
