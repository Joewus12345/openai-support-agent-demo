import { requireSession } from "@/lib/server/auth";

export async function requireTenantSession(
  request: Request,
  options: { csrfProtected?: boolean; allowInactiveAccount?: boolean } = {}
) {
  const result = await requireSession(request, options);
  if ("response" in result) return result;

  const accountId = result.session.account?.id;
  if (!accountId) {
    return {
      response: Response.json(
        { error: "No account selected" },
        { status: 409 }
      ),
    } as const;
  }

  return { session: result.session, accountId } as const;
}
