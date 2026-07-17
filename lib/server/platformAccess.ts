import { requireSession } from "@/lib/server/auth";

export async function requirePlatformRequest(
  request: Request,
  options: { csrfProtected?: boolean } = {}
) {
  return requireSession(request, {
    platformAdmin: true,
    csrfProtected: options.csrfProtected,
    requireVerified: true,
  });
}
