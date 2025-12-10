const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

function firstHeaderValue(value: string | null | undefined) {
  if (!value) return null;
  return value.split(",")[0]?.trim() || null;
}

function stripPort(host: string | null | undefined) {
  if (!host) return null;
  return host.split(":")[0] ?? null;
}

function parseCfVisitor(header: string | null | undefined) {
  if (!header) return null;
  try {
    const parsed = JSON.parse(header);
    const scheme = typeof parsed?.scheme === "string" ? parsed.scheme.toLowerCase() : null;
    if (scheme === "http" || scheme === "https") return scheme;
  } catch {
    // ignore
  }
  return null;
}

function isLocalhost(host: string | null | undefined) {
  if (!host) return false;
  const normalized = stripPort(firstHeaderValue(host))?.toLowerCase();
  return normalized ? LOCAL_HOSTS.includes(normalized) : false;
}

function resolveProtocol(request: Request | undefined) {
  const forwarded = firstHeaderValue(request?.headers.get("x-forwarded-proto"));
  if (forwarded === "http" || forwarded === "https") return forwarded;

  const cfVisitorScheme = parseCfVisitor(request?.headers.get("cf-visitor"));
  if (cfVisitorScheme) return cfVisitorScheme;

  if (request) {
    try {
      const url = new URL(request.url);
      const proto = url.protocol.replace(":", "").toLowerCase();
      if (proto === "http" || proto === "https") return proto;
    } catch {
      // ignore
    }
  }

  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function resolveHost(request: Request | undefined) {
  const forwardedHost = firstHeaderValue(request?.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(request?.headers.get("host"));
  return host ?? null;
}

export type RequestContext = {
  protocol: "http" | "https";
  host: string | null;
  hostname: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  cfVisitorScheme: string | null;
  isLocalhost: boolean;
};

export function getRequestContext(request?: Request): RequestContext {
  const forwardedProto = firstHeaderValue(request?.headers.get("x-forwarded-proto"));
  const cfVisitorScheme = parseCfVisitor(request?.headers.get("cf-visitor"));
  const protocol = resolveProtocol(request);
  const forwardedHost = firstHeaderValue(request?.headers.get("x-forwarded-host"));
  const host = resolveHost(request);
  const hostname = stripPort(host);
  const localhost = isLocalhost(hostname);

  return {
    protocol,
    host,
    hostname,
    forwardedHost,
    forwardedProto,
    cfVisitorScheme,
    isLocalhost: localhost,
  };
}

export function isLocalHostName(hostname: string | null | undefined) {
  return isLocalhost(hostname);
}
