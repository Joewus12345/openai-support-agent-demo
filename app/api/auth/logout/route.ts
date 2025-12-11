import { buildExpiredSessionCookie } from "@/lib/server/auth";

export async function POST() {
  const expiredCookie = buildExpiredSessionCookie();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": expiredCookie,
    },
  });
}
