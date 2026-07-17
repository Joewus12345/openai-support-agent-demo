import { AsyncLocalStorage } from "node:async_hooks";

export type AccountRuntimeContext = {
  accountId: string;
  config: Record<string, string>;
};

const accountRuntimeStorage = new AsyncLocalStorage<AccountRuntimeContext>();

export function runWithAccountRuntime<T>(
  context: AccountRuntimeContext,
  callback: () => T
): T {
  return accountRuntimeStorage.run(context, callback);
}

export function getAccountRuntimeContext() {
  return accountRuntimeStorage.getStore();
}

/**
 * Account-scoped jobs never fall back to process.env. Calls outside an account
 * context retain the legacy environment behavior for the primary installation.
 */
export function getAccountRuntimeValue(key: string) {
  const context = getAccountRuntimeContext();
  return context ? context.config[key] : process.env[key];
}
