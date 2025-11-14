const assert = require('assert');
const { test, mock } = require('node:test');
require('ts-node/register/transpile-only');
require('../scripts/register-tsconfig-paths.js');

const { fileSearch } = require('../lib/tools/fileSearch.ts');

const originalApiKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test-key';

function makeResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('fileSearch sends limit when querying OpenAI vector store', async () => {
  const fetchCalls = [];
  const fetchMock = mock.method(global, 'fetch', async (url, init = {}) => {
    fetchCalls.push({ url, init });
    return makeResponse({ results: [{ id: 'doc-1' }] });
  });

  try {
    const result = await fileSearch({
      query: 'insulation tester',
      limit: 6,
      provider: 'openai',
    });

    assert.deepStrictEqual(result, { results: [{ id: 'doc-1' }] });
    assert.strictEqual(fetchCalls.length, 1);
    const [{ init }] = fetchCalls;
    assert.ok(init);
    const body = JSON.parse(init.body);
    assert.strictEqual(body.limit, 6);
    assert.strictEqual(body.max_results, 6);
  } finally {
    fetchMock.mock.restore();
  }
});

test('fileSearch defaults limit when none specified', async () => {
  const fetchCalls = [];
  const fetchMock = mock.method(global, 'fetch', async (url, init = {}) => {
    fetchCalls.push({ url, init });
    return makeResponse({ results: [] });
  });

  try {
    await fileSearch({ query: 'catalog cable' });
    assert.strictEqual(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0].init.body);
    assert.strictEqual(body.limit, 10);
    assert.strictEqual(body.max_results, 10);
  } finally {
    fetchMock.mock.restore();
  }
});

if (originalApiKey === undefined) {
  delete process.env.OPENAI_API_KEY;
} else {
  process.env.OPENAI_API_KEY = originalApiKey;
}
