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
      event: 'message_created',
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
      event: 'message_created',
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
  releaseAgentMock.mock.resetCalls();
});

test('chatwoot webhook handles conversation_status_changed', async () => {
  const payload = {
    event: 'conversation_status_changed',
    data: {
      event: 'conversation_status_changed',
      status: 'resolved',
      previous_status: 'open',
      account: { id: 5 },
      conversation: { id: 5 },
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
  releaseAgentMock.mock.resetCalls();
});

test('chatwoot webhook handles label removal', async () => {
  const payload = {
    event: 'conversation_updated',
    data: {
      event: 'conversation_updated',
      changed_attributes: [{ labels: [] }],
      account: { id: 6 },
      conversation: { id: 6 },
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
  releaseAgentMock.mock.resetCalls();
});

test('chatwoot status webhook handles conversation_status_changed', async () => {
  const payload = {
    data: {
      event: 'conversation_status_changed',
      status: 'resolved',
      previous_status: 'open',
      account: { id: 3 },
      conversation: { id: 3 },
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

test('chatwoot status webhook handles label removal', async () => {
  const payload = {
    data: {
      event: 'conversation_updated',
      changed_attributes: [{ labels: [] }],
      account: { id: 4 },
      conversation: { id: 4 },
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

test('chatwoot status webhook returns 400 for missing IDs', async () => {
  const payload = { data: { event: 'conversation_status_changed' } };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusPost(req);
  const data = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(data.status, 'ignored');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 0);
  releaseAgentMock.mock.resetCalls();
});

test('chatwoot webhook returns 400 for missing IDs', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        message_type: 2,
        content: 'Conversation was marked as pending',
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(releaseAgentMock.mock.calls.length, 0);
  releaseAgentMock.mock.resetCalls();
});
