import { buildAuthCookie, ensureAuthenticated } from "../helpers";

export async function GET(request: Request) {
  const unauthorized = ensureAuthenticated(request);
  if (unauthorized) return unauthorized;

  return new Response(JSON.stringify({ authenticated: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const expected = process.env.SCRAPE_JOB_ADMIN_TOKEN;

  if (!expected) {
    console.warn("SCRAPE_JOB_ADMIN_TOKEN is not configured; rejecting auth attempts");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body?.token || body.token !== expected) {
    return new Response(JSON.stringify({ error: "Invalid credentials" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cookie = buildAuthCookie();

  return new Response(JSON.stringify({ authenticated: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
}
