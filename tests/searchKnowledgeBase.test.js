const assert = require('assert');
const { test, mock } = require('node:test');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const { searchKnowledgeBase } = require('../lib/knowledgeBase/searchKnowledgeBase.ts');
const fileSearchModule = require('../lib/tools/fileSearch.ts');

test('searchKnowledgeBase searches the primary query alongside additional queries', async () => {
  const observedQueries = [];
  const fileSearchMock = mock.method(
    fileSearchModule,
    'fileSearch',
    async ({ query }) => {
      observedQueries.push(query);
      return { results: [] };
    }
  );

  try {
    const { results, error } = await searchKnowledgeBase({
      query: 'autoflex cable',
      queries: [' helukabel  ', 'autoflex cable   '],
      provider: 'docs-provider',
    });

    assert.ifError(error);
    assert.deepStrictEqual(observedQueries, ['autoflex cable', 'helukabel']);
    assert.deepStrictEqual(results, []);
  } finally {
    fileSearchMock.mock.restore();
  }
});
