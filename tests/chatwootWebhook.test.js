const assert = require('assert');
const { test, mock } = require('node:test');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

// Mock releaseAgent to avoid hitting Prisma or external services
const conversationResolution = require('../lib/conversationResolution.ts');
const releaseAgentMock = mock.method(conversationResolution, 'releaseAgent', async () => {});

const { POST: statusPost } = require('../app/api/chatwoot-status-webhook/route.ts');
const { POST: webhookPost } = require('../app/api/chatwoot-webhook/route.ts');

test('chatwoot status webhook handles pending system message', async () => {
  const payload = {
    event: 'message_created',
    data: {
      message: {
        message_type: 2,
        content: 'Conversation was marked as pending',
        account: { id: 1 },
        conversation: { id: 1 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 1);
  releaseAgentMock.mock.resetCalls();
});

test('chatwoot webhook handles pending system message', async () => {
  const payload = {
    event: 'message_created',
    data: {
      message: {
        message_type: 2,
        content: 'Conversation was marked as pending',
        account: { id: 2 },
        conversation: { id: 2 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 1);
});
