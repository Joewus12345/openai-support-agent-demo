import { requireSession } from "@/lib/server/auth";
import { listAccessibleAccounts } from "@/lib/server/accountAccess";

export async function GET(request: Request) {
  const result = await requireSession(request, {
    requireVerified: false,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;
  const accounts = await listAccessibleAccounts(result.session);

  return new Response(
    JSON.stringify({
      authenticated: true,
      verified: result.session.verified,
      userId: result.session.agent.userId,
      roles: result.session.agent.roles,
      platformAdmin: result.session.agent.platformAdmin,
      activeAccount: result.session.account,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        slug: account.slug,
        status: account.status,
        isPrimary: account.isPrimary,
      })),
      csrf: result.session.csrf,
      expiresAt: result.session.expiresAt,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
