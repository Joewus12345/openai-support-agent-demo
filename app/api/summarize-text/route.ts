import { NextResponse } from "next/server";
import { summarizeText } from "@/lib/server/summarizeText";
import { requireSession } from "@/lib/server/auth";
import { resolveAccountRuntimeConfig } from "@/lib/server/accountConfig";

export async function POST(request: Request) {
  try {
    const bodyPromise = request.json();
    const authResult = await requireSession(request, { csrfProtected: true });
    if ("response" in authResult) return authResult.response;
    const accountId = authResult.session.account?.id;
    if (!accountId) {
      return NextResponse.json({ error: "No account selected" }, { status: 409 });
    }
    const [{ text, maxTokens }, config] = await Promise.all([
      bodyPromise,
      resolveAccountRuntimeConfig(accountId),
    ]);
    if (typeof text !== "string") {
      return NextResponse.json({ error: "Invalid text" }, { status: 400 });
    }
    const summary = await summarizeText(text, maxTokens, {
      config,
      cacheNamespace: accountId,
    });
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Error summarizing text:", error);
    return NextResponse.json(
      { error: "Failed to summarize text" },
      { status: 500 }
    );
  }
}
