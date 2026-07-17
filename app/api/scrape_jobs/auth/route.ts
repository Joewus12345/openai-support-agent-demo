import { AgentRole } from "@/lib/generated/prisma";
import { requireScrapeSession } from "../helpers";

export async function GET(request: Request) {
  const result = await requireScrapeSession(request, { role: AgentRole.agent });
  if ("response" in result) return result.response;

  return new Response(
    JSON.stringify({
      authenticated: true,
      roles: result.session.agent.roles,
      accountId: result.accountId,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function POST() {
  return new Response(JSON.stringify({ error: "Deprecated" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
}
