import { sessionCookieName } from "@/lib/server/auth";

export async function POST() {
  const secure = process.env.NODE_ENV === "production";
  const expiredCookie = [
    `${sessionCookieName()}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : null,
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": expiredCookie,
    },
  });
}
