import { ACCOUNT_CONFIG_FIELDS } from "@/config/accountConfiguration";
import { AgentRole } from "@/lib/generated/prisma";
import { canAdministerAccount } from "@/lib/server/accountAccess";
import {
  getAccountConfigurationState,
  updateAccountConfiguration,
} from "@/lib/server/accountConfig";
import { requireSession } from "@/lib/server/auth";
import { z } from "zod";

const updateSchema = z.object({
  accountId: z.string().uuid(),
  values: z.record(z.string(), z.string().max(4000).nullable()),
});

export async function GET(request: Request) {
  const result = await requireSession(request, {
    role: AgentRole.admin,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const accountId = new URL(request.url).searchParams.get("accountId") || result.session.account?.id;
  if (!accountId) return Response.json({ error: "No account selected" }, { status: 409 });
  const authorized = await canAdministerAccount(result.session, accountId);
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const state = await getAccountConfigurationState(accountId);
    if (!state) return Response.json({ error: "Account not found" }, { status: 404 });
    const stateByKey = new Map(state.fields.map((field) => [field.key, field]));
    return Response.json({
      account: {
        id: state.account.id,
        name: state.account.name,
        slug: state.account.slug,
        isPrimary: state.account.isPrimary,
      },
      locked: state.account.isPrimary,
      fields: ACCOUNT_CONFIG_FIELDS.map((definition) => ({
        ...definition,
        ...stateByKey.get(definition.key),
      })),
    });
  } catch (error) {
    console.error("Failed to read account configuration", error);
    return Response.json({ error: "Unable to decrypt account configuration" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const result = await requireSession(request, {
    role: AgentRole.admin,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid configuration" }, { status: 400 });
  }
  const authorized = await canAdministerAccount(result.session, parsed.data.accountId);
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    await updateAccountConfiguration(
      parsed.data.accountId,
      parsed.data.values,
      result.session.agent.userId
    );
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to update account configuration", error);
    const message = error instanceof Error ? error.message : "Unable to update configuration";
    const status = message.includes("ENCRYPTION_KEY") ? 503 : message.includes("primary account") ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}
