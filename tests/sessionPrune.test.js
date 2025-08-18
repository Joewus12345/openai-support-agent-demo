const assert = require('assert');
const test = require('node:test');
const { mock } = test;

const constants = require('../config/constants');
constants.MAX_UNSUMMARIZED_MESSAGES = 3;

const user = { id: 'u1', longSummary: null };
const session = {
  id: 's1',
  userId: 'u1',
  messages: [],
  summary: null,
  lastSummarizedIndex: 0,
  user,
};

const prismaMock = {
  chatSession: {
    findUnique: async () => session,
    update: async ({ data }) => {
      Object.assign(session, data);
      return session;
    },
    findMany: async () => [session], // for potential calls
  },
  user: {
    update: async ({ data }) => {
      Object.assign(user, data);
      return user;
    },
  },
};

const redisMock = { set: async () => {}, get: async () => null };

const summarizeSession = mock.fn(async ({ priorSummary, newMessages }) => {
  const text = newMessages
    .map((m) => m.content?.[0]?.text || '')
    .join(' ')
    .trim();
  return text;
});

require.cache[require.resolve('../lib/prisma.ts')] = { exports: prismaMock };
require.cache[require.resolve('../lib/redis.ts')] = { exports: redisMock };
require.cache[require.resolve('../lib/server/summarizeSession.ts')] = {
  exports: { summarizeSession },
};

const { saveSessionMessages } = require('../lib/server/saveSessionMessages.ts');

function reset() {
  session.messages = [];
  session.summary = null;
  session.lastSummarizedIndex = 0;
  user.longSummary = null;
  summarizeSession.mock.resetCalls();
}

test('saveSessionMessages prunes old unsummarized messages', async () => {
  reset();
  const msgs = [
    { id: '1', role: 'user', content: [{ type: 'input_text', text: 'm1' }] },
    { id: '2', role: 'assistant', content: [{ type: 'output_text', text: 'm2' }] },
    { id: '3', role: 'user', content: [{ type: 'input_text', text: 'm3' }] },
    { id: '4', role: 'assistant', content: [{ type: 'output_text', text: 'm4' }] },
    { id: '5', role: 'user', content: [{ type: 'input_text', text: 'm5' }] },
  ];
  await saveSessionMessages('s1', msgs);
  assert.strictEqual(session.summary, 'm1 m2');
  assert.strictEqual(session.lastSummarizedIndex, 0);
  assert.deepStrictEqual(
    session.messages.map((m) => m.content[0].text),
    ['m3', 'm4', 'm5']
  );
  assert.strictEqual(summarizeSession.mock.calls.length, 1);
});

test('end session removes messages after summarization', async () => {
  reset();
  session.messages = [
    { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
    { role: 'assistant', content: [{ type: 'output_text', text: 'there' }] },
  ];
  const { POST } = await import('../app/api/sessions/[session_id]/end/route.ts');
  const req = new Request('http://test', {
    method: 'POST',
    body: JSON.stringify({ messages: [] }),
    headers: { 'Content-Type': 'application/json' },
  });
  await POST(req, { params: Promise.resolve({ session_id: 's1' }) });
  assert.deepStrictEqual(session.messages, []);
  assert.strictEqual(session.summary, 'hi there');
  assert.strictEqual(session.lastSummarizedIndex, 0);
});
