const assert = require('assert');
const { test, mock } = require('node:test');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const conversationResolution = require('../lib/conversationResolution.ts');
const chatwoot = require('../lib/chatwoot.ts');
const chatwootBot = require('../lib/chatwootBot.ts');
const agentRotation = require('../lib/agentRotation.ts');
const handoffQueue = require('../lib/handoffQueue.ts');
const prisma = require('../lib/prisma.ts').default;
const redis = require('../lib/redis.ts').default;

// Mock external dependencies
mock.method(chatwoot, 'getConversationLabels', async () => ({ payload: [] }));
mock.method(chatwoot, 'setConversationLabels', async () => {});
mock.method(chatwoot, 'setAgentAvailability', async () => {});
mock.method(agentRotation, 'clearActiveConversation', async () => {});
mock.method(agentRotation, 'setActiveConversation', async () => {});
mock.method(handoffQueue, 'updateRequest', async () => {});

const accountId = 1;
const releasedConversationId = 1;
const queuedConversationId = 2;
const freedAgentId = 5;

prisma.agentAssignment.findFirst = mock.fn(async () => ({ agentId: freedAgentId }));

test.after(async () => {
  await prisma.$disconnect();
  if (typeof redis.disconnect === 'function') {
    redis.disconnect();
  }
});

let status = 'resolved';

const dequeueRequestMock = mock.method(handoffQueue, 'dequeueRequest', async () => ({ conversationId: queuedConversationId, conversationKey: `chatwoot:${accountId}:${queuedConversationId}` }));
const toggleMock = mock.method(chatwootBot, 'toggleConversationStatus', async () => {
  status = 'open';
});
const assignMock = mock.method(chatwootBot, 'assignConversation', async () => {});
const sendMock = mock.method(chatwootBot, 'sendBotMessage', async () => {
  assert.strictEqual(status, 'open');
});

test('releaseAgent opens and assigns conversation before notifying', async () => {
  await conversationResolution.releaseAgent(accountId, releasedConversationId, { assignee_id: freedAgentId });

  assert.strictEqual(dequeueRequestMock.mock.calls.length, 1);
  assert.strictEqual(toggleMock.mock.calls.length, 1);
  assert.deepStrictEqual(toggleMock.mock.calls[0].arguments, [accountId, queuedConversationId, 'open']);
  assert.strictEqual(assignMock.mock.calls.length, 1);
  assert.deepStrictEqual(assignMock.mock.calls[0].arguments, [accountId, queuedConversationId, freedAgentId]);
  assert.strictEqual(sendMock.mock.calls.length, 1);
});
