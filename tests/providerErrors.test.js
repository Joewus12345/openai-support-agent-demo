const assert = require("node:assert/strict");
const test = require("node:test");

const { describeProviderError } = require("../lib/providers/providerErrors.ts");

test("provider error classifier detects nested OpenAI connection timeouts", () => {
  const cause = Object.assign(new Error("Connect Timeout Error"), {
    name: "ConnectTimeoutError",
    code: "UND_ERR_CONNECT_TIMEOUT",
  });
  const error = new Error("fetch failed", { cause });

  assert.deepEqual(describeProviderError(error, "OpenAI"), {
    code: "provider_unreachable",
    status: 503,
    message:
      "Unable to reach the configured OpenAI endpoint. Check outbound HTTPS, DNS, firewall or proxy settings, then try again.",
    technicalMessage: "fetch failed",
  });
});

test("provider error classifier gives account-safe credential guidance", () => {
  const error = Object.assign(new Error("Incorrect API key provided"), {
    status: 401,
  });
  const result = describeProviderError(error, "OpenAI");

  assert.equal(result.code, "provider_authentication_failed");
  assert.equal(result.status, 502);
  assert.match(result.message, /account admin/u);
});

test("provider error classifier handles rate limits", () => {
  const error = Object.assign(new Error("Rate limit exceeded"), { status: 429 });
  const result = describeProviderError(error, "OpenAI");

  assert.equal(result.code, "provider_rate_limited");
  assert.equal(result.status, 503);
});
