import { setAccountRuntimeAccessors } from "@/lib/accountRuntime";
import { search_knowledge_base } from "@/lib/server/searchFiles";
import { resolveAccountRuntimeConfig } from "@/lib/server/accountConfig";
import {
  getAccountRuntimeContext,
  getAccountRuntimeValue,
  runWithAccountRuntime,
} from "@/lib/server/accountRuntimeContext";
import { requireSession } from "@/lib/server/auth";

setAccountRuntimeAccessors({
  getContext: getAccountRuntimeContext,
  getValue: getAccountRuntimeValue,
});

export async function POST(request: Request) {
  try {
    const paramsPromise = request.json();
    const authResult = await requireSession(request, { csrfProtected: true });
    if ("response" in authResult) return authResult.response;
    const accountId = authResult.session.account?.id;
    if (!accountId) {
      return Response.json({ error: "No account selected" }, { status: 409 });
    }
    const [params, config] = await Promise.all([
      paramsPromise,
      resolveAccountRuntimeConfig(accountId),
    ]);
    const result = await runWithAccountRuntime(
      { accountId, config },
      () => search_knowledge_base(params)
    );
    return Response.json(result);
  } catch (error) {
    console.error("Error searching knowledge base:", error);
    return new Response("Failed to search knowledge base", { status: 500 });
  }
}
