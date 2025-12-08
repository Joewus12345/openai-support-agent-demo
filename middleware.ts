import { NextResponse, type NextRequest } from "next/server";

import { defaultRouteForRoles } from "@/lib/auth/routes";
import { sessionCookieName } from "@/lib/server/auth";

const LOGIN_PATH = "/login";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) return NextResponse.next();

  const isLoginRoute = pathname === LOGIN_PATH || pathname.startsWith("/login/");
  const hasSessionCookie = request.cookies.has(sessionCookieName());

  if (!hasSessionCookie && !isLoginRoute) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (!hasSessionCookie && isLoginRoute) return NextResponse.next();

  const meUrl = new URL("/api/auth/me", request.url);
  const meResponse = await fetch(meUrl.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  }).catch(() => null);

  if (!meResponse || meResponse.status === 401) {
    if (isLoginRoute) return NextResponse.next();
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (!meResponse.ok) return NextResponse.next();

  const data = (await meResponse.json()) as {
    verified: boolean;
    roles: string[];
  };

  if (!data.verified && !isLoginRoute) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (isLoginRoute && data.verified) {
    const redirect = defaultRouteForRoles(data.roles);
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.\w+$).*)"],
};
