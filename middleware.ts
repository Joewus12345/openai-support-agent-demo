import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { defaultRouteForRoles } from '@/lib/auth/routes';
import { getRequestContext } from '@/lib/server/requestContext';

type AgentRole = 'admin' | 'agent';
const AGENT_ROLES = new Set<AgentRole>(['admin', 'agent']);

const LOGIN_PATH = '/login';
const ONBOARDING_PATH = '/onboarding';
const ACCOUNT_UNAVAILABLE_PATH = '/account-unavailable';
const ADMIN_ONLY_PATHS = ['/admin', '/admin/dashboard', '/init_vs'];
const PLATFORM_ADMIN_PATHS: string[] = [];
const AUTH_MIDDLEWARE_DEBUG = (process.env.AUTH_MIDDLEWARE_DEBUG ?? '').toLowerCase() === 'true';

async function fetchBootstrapState(request: NextRequest) {
  const bootstrapUrl = new URL('/api/auth/bootstrap-state', request.url);
  const response = await fetch(bootstrapUrl.toString(), { cache: 'no-store' }).catch(() => null);
  if (!response || !response.ok) return { hasAgents: true };
  const data = (await response.json().catch(() => null)) as { hasAgents?: boolean } | null;
  return { hasAgents: data?.hasAgents !== false ? !!data?.hasAgents : false };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const context = getRequestContext(request);

  // The primary account's legacy files stay on disk during migration, but
  // knowledge content is only served through an authenticated account API.
  if (pathname.startsWith('/knowledge_base/') || pathname.startsWith('/faq/')) {
    return new NextResponse(null, { status: 404 });
  }

  // Never gate static assets through auth middleware.
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico' || /\.[^/]+$/.test(pathname)) {
    return NextResponse.next();
  }

  const logRedirect = (reason: string, extra: Record<string, unknown> = {}) => {
    if (!AUTH_MIDDLEWARE_DEBUG) return;
    console.log(
      JSON.stringify(
        {
          label: 'middleware.redirect',
          reason,
          path: pathname,
          host: context.host,
          forwardedHost: context.forwardedHost,
          forwardedProto: context.forwardedProto,
          cfVisitorScheme: context.cfVisitorScheme,
          ...extra,
        },
        null,
        2,
      ),
    );
  };

  if (pathname.startsWith('/api')) return NextResponse.next();

  const bootstrapState = await fetchBootstrapState(request);
  const isBootstrapMode = !bootstrapState.hasAgents;
  const isOnboardingRoute = pathname.startsWith(ONBOARDING_PATH);
  const isBootstrapEndpoint = pathname.startsWith('/api/auth/bootstrap-admin');

  if (isBootstrapMode) {
    if (isOnboardingRoute || isBootstrapEndpoint) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
  }

  if (isOnboardingRoute || isBootstrapEndpoint) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  const isLoginRoute = pathname === LOGIN_PATH || pathname.startsWith('/login/');
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie && !isLoginRoute) {
    logRedirect('missing_session_cookie');
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (!hasSessionCookie && isLoginRoute) return NextResponse.next();

  const internalApiBase = process.env.INTERNAL_API_BASE_URL ?? 'http://127.0.0.1:3000';
  const meUrl = context.isLocalhost ? (context.protocol === 'http' ? new URL('/api/auth/me', request.url) : new URL('/api/auth/me', internalApiBase)) : new URL('/api/auth/me', internalApiBase);

  let meResponse: Response | null = null;

  try {
    meResponse = await fetch(meUrl.toString(), {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
  } catch (error) {
    logRedirect('me_fetch_error', {
      hasSessionCookie,
      meUrl: meUrl.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    if (isLoginRoute) return NextResponse.next();
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (!meResponse || meResponse.status === 401) {
    const meBody = meResponse
      ? await meResponse
          .clone()
          .text()
          .catch(() => null)
      : null;
    logRedirect('unauthorized_me_response', {
      hasSessionCookie,
      meStatus: meResponse?.status ?? null,
      meBody,
      meUrl: meUrl.toString(),
    });
    if (isLoginRoute) return NextResponse.next();
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (!meResponse.ok) return NextResponse.next();

  const data = (await meResponse.json()) as {
    verified: boolean;
    roles: AgentRole[] | string[];
    platformAdmin?: boolean;
    activeAccount?: { status?: 'active' | 'suspended' | 'maintenance' } | null;
  };

  const roles = Array.isArray(data.roles) ? (data.roles as (AgentRole | string)[]) : [];
  const normalizedRoles: AgentRole[] = roles.filter((role): role is AgentRole => AGENT_ROLES.has(role as AgentRole));

  if (!data.verified && !isLoginRoute) {
    logRedirect('unverified_session', { hasSessionCookie, meStatus: meResponse.status });
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (isLoginRoute && data.verified) {
    const redirect = defaultRouteForRoles(normalizedRoles);
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  const isUnavailableRoute = pathname.startsWith(ACCOUNT_UNAVAILABLE_PATH);
  const accountIsInactive = data.activeAccount?.status === 'suspended' || data.activeAccount?.status === 'maintenance';
  if (accountIsInactive && data.platformAdmin && !pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }
  if (accountIsInactive && !data.platformAdmin && !isUnavailableRoute) {
    return NextResponse.redirect(new URL(ACCOUNT_UNAVAILABLE_PATH, request.url));
  }
  if (isUnavailableRoute && (!accountIsInactive || data.platformAdmin)) {
    return NextResponse.redirect(new URL(defaultRouteForRoles(normalizedRoles), request.url));
  }

  const isAdmin = normalizedRoles.includes('admin');
  const isRestrictedAdminPath = ADMIN_ONLY_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
  const isPlatformAdminPath = PLATFORM_ADMIN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));

  if (!isAdmin && isRestrictedAdminPath) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (!data.platformAdmin && isPlatformAdminPath) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/knowledge_base/:path*',
    '/faq/:path*',
    '/((?!api|_next/|favicon.ico|.*\\..*$).*)',
  ],
};
