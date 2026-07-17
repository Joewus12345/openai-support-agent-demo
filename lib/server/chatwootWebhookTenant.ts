import crypto from "crypto";

import prisma from "@/lib/prisma";
import { resolveAccountRuntimeConfig } from "@/lib/server/accountConfig";

export async function resolveChatwootWebhookTenant(request: Request) {
  const url = new URL(request.url);
  const tenantHint =
    request.headers.get("x-support-account")?.trim() ||
    url.searchParams.get("tenant")?.trim();
  if (!tenantHint) return { tenantId: undefined, config: undefined } as const;

  const account = await prisma.account.findFirst({
    where: { OR: [{ id: tenantHint }, { slug: tenantHint }] },
    select: { id: true, status: true },
  });
  if (!account) {
    return {
      response: Response.json({ error: "Account not found" }, { status: 404 }),
    } as const;
  }
  if (account.status !== "active") {
    return {
      response: Response.json(
        { error: "Account is not active" },
        { status: 423 }
      ),
    } as const;
  }

  const config = await resolveAccountRuntimeConfig(account.id);
  const expectedSecret =
    config.CHATWOOT_WEBHOOK_ENDPOINT_SECRET ||
    config.CHATWOOT_BOT_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return {
      response: Response.json(
        { error: "Webhook secret is not configured for this account" },
        { status: 503 }
      ),
    } as const;
  }

  const authorization = request.headers.get("authorization")?.trim();
  const providedSecret =
    request.headers.get("x-chatwoot-webhook-secret")?.trim() ||
    request.headers.get("x-webhook-secret")?.trim() ||
    (authorization?.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : undefined) ||
    url.searchParams.get("secret")?.trim();
  const expectedHash = crypto
    .createHash("sha256")
    .update(expectedSecret)
    .digest();
  const providedHash = crypto
    .createHash("sha256")
    .update(providedSecret || "")
    .digest();
  if (
    !providedSecret ||
    !crypto.timingSafeEqual(expectedHash, providedHash)
  ) {
    return {
      response: Response.json(
        { error: "Invalid webhook secret" },
        { status: 401 }
      ),
    } as const;
  }

  return { tenantId: account.id, config } as const;
}
