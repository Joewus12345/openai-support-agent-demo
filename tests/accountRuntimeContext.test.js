const assert = require('node:assert/strict');
const { test } = require('node:test');

require('ts-node/register/transpile-only');
require('../scripts/register-tsconfig-paths.js');

const {
  getAccountRuntimeContext,
  getAccountRuntimeValue,
  runWithAccountRuntime,
} = require('../lib/server/accountRuntimeContext.ts');

test('account runtime values do not inherit primary environment secrets', async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'primary-key';

  try {
    assert.equal(getAccountRuntimeValue('OPENAI_API_KEY'), 'primary-key');

    await runWithAccountRuntime(
      { accountId: 'tenant-a', config: { OPENAI_MODEL: 'tenant-model' } },
      async () => {
        assert.equal(getAccountRuntimeContext().accountId, 'tenant-a');
        assert.equal(getAccountRuntimeValue('OPENAI_MODEL'), 'tenant-model');
        assert.equal(getAccountRuntimeValue('OPENAI_API_KEY'), undefined);
      }
    );
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('parallel account runtimes keep credentials isolated', async () => {
  const readTenant = (accountId, apiKey, delay) =>
    runWithAccountRuntime(
      { accountId, config: { OPENAI_API_KEY: apiKey } },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return {
          accountId: getAccountRuntimeContext().accountId,
          apiKey: getAccountRuntimeValue('OPENAI_API_KEY'),
        };
      }
    );

  const [tenantA, tenantB] = await Promise.all([
    readTenant('tenant-a', 'key-a', 5),
    readTenant('tenant-b', 'key-b', 1),
  ]);

  assert.deepEqual(tenantA, { accountId: 'tenant-a', apiKey: 'key-a' });
  assert.deepEqual(tenantB, { accountId: 'tenant-b', apiKey: 'key-b' });
});
