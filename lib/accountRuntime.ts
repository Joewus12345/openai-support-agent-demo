export type AccountRuntimeSnapshot = {
  accountId: string;
  config: Record<string, string>;
};

type AccountRuntimeAccessors = {
  getContext: () => AccountRuntimeSnapshot | undefined;
  getValue: (key: string) => string | undefined;
};

const defaultAccessors: AccountRuntimeAccessors = {
  getContext: () => undefined,
  getValue: (key) =>
    typeof process === "undefined" ? undefined : process.env[key],
};

let accessors = defaultAccessors;

/**
 * Installs request-scoped accessors from a server entry point. Keeping the
 * Node AsyncLocalStorage dependency behind this bridge prevents shared
 * Chatwoot helpers from leaking `node:async_hooks` into the browser bundle.
 */
export function setAccountRuntimeAccessors(
  nextAccessors: AccountRuntimeAccessors
) {
  accessors = nextAccessors;
}

export function getAccountRuntimeContext() {
  return accessors.getContext();
}

export function getAccountRuntimeValue(key: string) {
  return accessors.getValue(key);
}
