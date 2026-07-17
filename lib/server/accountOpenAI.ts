import { AgentRole } from "@/lib/generated/prisma";
import { createOpenAIClient } from "@/lib/providers/openaiClient";
import { resolveAccountRuntimeConfig } from "@/lib/server/accountConfig";
import { requireSession } from "@/lib/server/auth";

export async function requireAccountOpenAI(
  request: Request,
  options: {
    role?: AgentRole;
    csrfProtected?: boolean;
    requireVectorStore?: boolean;
  } = {}
) {
  const authResult = await requireSession(request, {
    role: options.role,
    csrfProtected: options.csrfProtected,
  });
  if ("response" in authResult) return authResult;
  const account = authResult.session.account;
  if (!account) {
    return {
      response: Response.json({ error: "No account selected" }, { status: 409 }),
    } as const;
  }

  const config = await resolveAccountRuntimeConfig(account.id);
  if (!config.OPENAI_API_KEY) {
    return {
      response: Response.json(
        { error: "OPENAI_API_KEY is not configured for this account" },
        { status: 409 }
      ),
    } as const;
  }
  if (options.requireVectorStore && !config.OPENAI_VECTOR_STORE_ID) {
    return {
      response: Response.json(
        { error: "OPENAI_VECTOR_STORE_ID is not configured for this account" },
        { status: 409 }
      ),
    } as const;
  }

  return {
    session: authResult.session,
    account,
    config,
    vectorStoreId: config.OPENAI_VECTOR_STORE_ID,
    openai: createOpenAIClient(config),
  } as const;
}
