type ErrorRecord = Record<string, unknown>;

export type ProviderErrorDetails = {
  code: string;
  status: number;
  message: string;
  technicalMessage: string;
};

function errorChain(error: unknown) {
  const chain: ErrorRecord[] = [];
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as ErrorRecord;
    chain.push(record);
    current = record.cause;
  }
  return chain;
}

function firstString(values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

export function describeProviderError(
  error: unknown,
  provider = "AI provider"
): ProviderErrorDetails {
  const chain = errorChain(error);
  const names = chain
    .map((entry) => entry.name)
    .filter((value): value is string => typeof value === "string");
  const codes = chain
    .map((entry) => entry.code)
    .filter((value): value is string => typeof value === "string");
  const messages = chain
    .map((entry) => entry.message)
    .filter((value): value is string => typeof value === "string");
  const status = chain
    .map((entry) => entry.status)
    .find((value): value is number => typeof value === "number");
  const combined = [...names, ...codes, ...messages].join(" ").toLowerCase();
  const technicalMessage = firstString(messages) ?? "Unknown provider error";

  if (
    combined.includes("connecttimeouterror") ||
    combined.includes("und_err_connect_timeout") ||
    combined.includes("apiconnectiontimeouterror") ||
    combined.includes("request timed out") ||
    combined.includes("fetch failed") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound")
  ) {
    return {
      code: "provider_unreachable",
      status: 503,
      message: `Unable to reach the configured ${provider} endpoint. Check outbound HTTPS, DNS, firewall or proxy settings, then try again.`,
      technicalMessage,
    };
  }

  if (status === 401 || status === 403 || combined.includes("incorrect api key")) {
    return {
      code: "provider_authentication_failed",
      status: 502,
      message: `${provider} rejected this account's credentials. Ask an account admin to verify the configured API key.`,
      technicalMessage,
    };
  }

  if (status === 429 || combined.includes("rate limit")) {
    return {
      code: "provider_rate_limited",
      status: 503,
      message: `${provider} is temporarily rate limited. Please retry shortly.`,
      technicalMessage,
    };
  }

  return {
    code: "provider_request_failed",
    status: 502,
    message: `${provider} could not complete the request. Please try again or review the account provider configuration.`,
    technicalMessage,
  };
}
