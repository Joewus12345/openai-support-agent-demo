import { getAccountRuntimeContext } from "@/lib/accountRuntime";

export const PRIMARY_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Server-side Chatwoot work runs inside an account runtime. Legacy webhooks
 * without an explicit tenant remain attached to the original primary account.
 */
export function getRuntimeTenantAccountId() {
  return getAccountRuntimeContext()?.accountId ?? PRIMARY_ACCOUNT_ID;
}
