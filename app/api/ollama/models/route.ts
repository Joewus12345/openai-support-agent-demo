import { NextResponse } from "next/server";
import { Ollama } from "ollama";
import { requireSession } from "@/lib/server/auth";
import { resolveAccountRuntimeConfig } from "@/lib/server/accountConfig";

export async function GET(request: Request) {
  try {
    const authResult = await requireSession(request);
    if ("response" in authResult) return authResult.response;
    const accountId = authResult.session.account?.id;
    if (!accountId) {
      return NextResponse.json({ error: "No account selected" }, { status: 409 });
    }
    const config = await resolveAccountRuntimeConfig(accountId);
    const rawHost = config.OLLAMA_HOST || config.OLLAMA_OPENAI_BASE_URL;
    if (!rawHost) {
      return NextResponse.json(
        { error: "Ollama is not configured for this account" },
        { status: 503 }
      );
    }
    const host = rawHost.replace(/\/v1\/?$/, "");
    const ollama = new Ollama({ host });
    const models = await ollama.list();
    return NextResponse.json(models);
  } catch (error) {
    console.error("Error listing models:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
