const assert = require('assert');
const { test, mock } = require('node:test');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

// Mock external dependencies
const conversationResolution = require('../lib/conversationResolution.ts');
const releaseAgentMock = mock.method(conversationResolution, 'releaseAgent', async () => {});

const chatwootBot = require('../lib/chatwootBot.ts');
const sendBotMessageMock = mock.method(chatwootBot, 'sendBotMessage', async () => {});

const providers = require('../lib/providers/index.ts');
const providerFnMock = mock.fn((messages, toolsArg, options) =>
  (async function* () {
    void messages;
    void toolsArg;
    void options;
    yield { event: 'response.output_text.delta', data: { delta: 'hi' } };
  })()
);
const getProviderMock = mock.method(providers, 'getProvider', () => providerFnMock);

const conversationHistory = require('../lib/getConversationHistory.ts');
const getConversationHistoryMock = mock.method(
  conversationHistory,
  'getConversationHistory',
  async () => []
);

const { toResponseMessage } = require('../lib/utils/toResponseMessage.ts');

const agentRotation = require('../lib/agentRotation.ts');
const getNextAgentMock = mock.method(agentRotation, 'getNextAgent', async () => null);
const setActiveConversationMock = mock.method(agentRotation, 'setActiveConversation', async () => {});

const handoff = require('../lib/handoff.ts');
const handOffMock = mock.method(handoff, 'default', async () => true);

const handoffQueue = require('../lib/handoffQueue.ts');
const enqueueRequestMock = mock.method(handoffQueue, 'enqueueRequest', async () => {});

const chatwoot = require('../lib/chatwoot.ts');
const getConversationMock = mock.method(chatwoot, 'getConversation', async () => ({ id: 1, status: 'resolved', inbox_id: 1 }));
const setConversationLabelsMock = mock.method(chatwoot, 'setConversationLabels', async () => {});

const { CONVO_LABELS } = require('../lib/constants.ts');
const { CHATWOOT_SYSTEM_PROMPT } = require('../config/constants.ts');

const guardrails = require('../lib/guardrails.ts');
const runRelevanceGuardrailMock = mock.method(
  guardrails,
  'runRelevanceGuardrail',
  async () => ({ tripwireTriggered: false })
);
const runJailbreakGuardrailMock = mock.method(
  guardrails,
  'runJailbreakGuardrail',
  async () => ({ tripwireTriggered: false })
);

const prisma = require('../lib/prisma.ts').default;
prisma.handoffRequest.findUnique = mock.fn(async () => null);
prisma.conversationMessage = {
  upsert: mock.fn(async () => ({})),
  findMany: mock.fn(async () => []),
};

const redis = require('../lib/redis.ts').default;
const redisPipelineMock = {
  rpush: mock.fn(() => {}),
  expire: mock.fn(() => {}),
  exec: mock.fn(async () => {}),
};
redis.exists = mock.fn(async () => 0);
redis.rpush = mock.fn(async () => {});
redis.pipeline = mock.fn(() => redisPipelineMock);

const { POST: webhookPost } = require('../app/api/chatwoot-webhook/route.ts');
const { POST: statusWebhookPost } = require('../app/api/chatwoot-status-webhook/route.ts');
 
test.after(async () => {
  await prisma.$disconnect();
  if (typeof redis.disconnect === 'function') {
    await redis.disconnect();
  }
});

function resetMocks() {
  releaseAgentMock.mock.resetCalls();
  sendBotMessageMock.mock.resetCalls();
  getProviderMock.mock.resetCalls();
  providerFnMock.mock.resetCalls();
  getNextAgentMock.mock.resetCalls();
  setActiveConversationMock.mock.resetCalls();
  handOffMock.mock.resetCalls();
  enqueueRequestMock.mock.resetCalls();
  getConversationMock.mock.resetCalls();
  setConversationLabelsMock.mock.resetCalls();
  prisma.handoffRequest.findUnique.mock.resetCalls();
  prisma.conversationMessage.upsert.mock.resetCalls();
  prisma.conversationMessage.findMany.mock.resetCalls();
  getConversationHistoryMock.mock.resetCalls();
  redis.exists.mock.resetCalls();
  redis.rpush.mock.resetCalls();
  redis.pipeline.mock.resetCalls();
  redisPipelineMock.rpush.mock.resetCalls();
  redisPipelineMock.expire.mock.resetCalls();
  redisPipelineMock.exec.mock.resetCalls();
  runRelevanceGuardrailMock.mock.resetCalls();
  runJailbreakGuardrailMock.mock.resetCalls();
}

test('chatwoot status webhook releases agent on conversation_status_changed', async () => {
  const payload = {
    event: 'conversation_status_changed',
    data: {
      event: 'conversation_status_changed',
      status: 'snoozed',
      previous_status: 'open',
      account: { id: 1 },
      conversation: { id: 1 },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 1);
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 0);
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  resetMocks();
});

test('chatwoot status webhook releases agent on label removal', async () => {
  const payload = {
    event: 'conversation_updated',
    data: {
      event: 'conversation_updated',
      changed_attributes: [
        {
          label_list: {
            previous_value: [CONVO_LABELS.assigned],
            current_value: [],
          },
        },
      ],
      account: { id: 2 },
      conversation: { id: 2 },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 1);
  resetMocks();
});

test('chatwoot status webhook releases agent on status update', async () => {
  const payload = {
    event: 'conversation_updated',
    data: {
      event: 'conversation_updated',
      changed_attributes: [
        {
          status: { previous_value: 'open', current_value: 'resolved' },
        },
      ],
      account: { id: 3 },
      conversation: { id: 3 },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 1);
  resetMocks();
});

test('chatwoot webhook escalates when agent available', async () => {
  getNextAgentMock.mock.mockImplementationOnce(async () => ({ id: 10, role: 'agent' }));
  getConversationMock.mock.mockImplementationOnce(async () => ({ id: 1, status: 'resolved', inbox_id: 1 }));
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 1,
        message_type: 0,
        content: 'I need a human',
        account: { id: 1 },
        conversation: { id: 1, inbox_id: 1, status: 'resolved', account_id: 1 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const body = await res.json();
  assert.strictEqual(body.status, 'handoff');
  assert.strictEqual(handOffMock.mock.calls.length, 1);
  assert.strictEqual(enqueueRequestMock.mock.calls.length, 1);
  assert.deepStrictEqual(enqueueRequestMock.mock.calls[0].arguments, [1, 1, 'assigned', 10, 1]);
  assert.strictEqual(setConversationLabelsMock.mock.calls.length, 1);
  assert.deepStrictEqual(setConversationLabelsMock.mock.calls[0].arguments[2], [CONVO_LABELS.assigned]);
  assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[2], 'A human agent will join shortly.');
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  resetMocks();
});

test('chatwoot webhook queues request when no agent available', async () => {
  getNextAgentMock.mock.mockImplementationOnce(async () => null);
  getConversationMock.mock.mockImplementationOnce(async () => ({ id: 2, status: 'resolved', inbox_id: 1 }));
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 2,
        message_type: 0,
        content: 'Need human assistance',
        account: { id: 2 },
        conversation: { id: 2, inbox_id: 1, status: 'resolved', account_id: 2 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const body = await res.json();
  assert.strictEqual(body.status, 'handoff');
  assert.strictEqual(handOffMock.mock.calls.length, 0);
  assert.strictEqual(enqueueRequestMock.mock.calls.length, 1);
  assert.deepStrictEqual(enqueueRequestMock.mock.calls[0].arguments, [2, 2, undefined, undefined, 1]);
  assert.strictEqual(setConversationLabelsMock.mock.calls.length, 1);
  assert.deepStrictEqual(setConversationLabelsMock.mock.calls[0].arguments[2], [CONVO_LABELS.waiting]);
  assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[2], 'All human agents are currently busy. Please wait for the next available agent.');
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  resetMocks();
});

test('chatwoot status webhook releases agent on resolution system message', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        message_type: 2,
        content: 'Conversation was marked as pending',
        account: { id: 3 },
        conversation: { id: 3 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 1);
  resetMocks();
});

test('chatwoot webhook ignores request for missing IDs', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 3,
        message_type: 0,
        content: 'hi',
        conversation: { id: 3, inbox_id: 1, status: 'resolved' },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.status, 'ignored');
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 0);
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  resetMocks();
});

test('chatwoot webhook processes incoming message', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        message_type: 0,
        content: 'Hello',
        account: { id: 7 },
        conversation: { id: 7, inbox_id: 1, status: 'resolved', account_id: 7 },
      },
    },
  };
  const history = [
    toResponseMessage('user', 'hi there'),
    toResponseMessage('assistant', 'hi'),
    toResponseMessage('user', 'Hello'),
  ];
  getConversationHistoryMock.mock.mockImplementationOnce(async () => history);
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  assert.deepStrictEqual(
    providerFnMock.mock.calls[0].arguments[0],
    [toResponseMessage('system', CHATWOOT_SYSTEM_PROMPT), ...history]
  );
  const call = sendBotMessageMock.mock.calls[0].arguments;
  assert.strictEqual(call[0], 7);
  assert.strictEqual(call[1], 7);
  assert.strictEqual(call[2], 'hi');
  resetMocks();
});

test('chatwoot webhook sends fallback when relevance guardrail triggers', async () => {
  runRelevanceGuardrailMock.mock.mockImplementationOnce(async () => ({
    tripwireTriggered: true,
  }));
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        message_type: 0,
        content: 'off topic',
        account: { id: 9 },
        conversation: { id: 9, inbox_id: 1, status: 'resolved', account_id: 9 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const body = await res.json();
  assert.strictEqual(body.status, 'guardrail');
  assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[2], "I can't assist with that request.");
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  resetMocks();
});

test('chatwoot webhook sends fallback when jailbreak guardrail triggers', async () => {
  runJailbreakGuardrailMock.mock.mockImplementationOnce(async () => ({
    tripwireTriggered: true,
  }));
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        message_type: 0,
        content: 'jailbreak attempt',
        account: { id: 10 },
        conversation: { id: 10, inbox_id: 1, status: 'resolved', account_id: 10 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const body = await res.json();
  assert.strictEqual(body.status, 'guardrail');
  assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[2], "I can't assist with that request.");
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  resetMocks();
});

test('chatwoot webhook returns 500 when sendBotMessage fails', async () => {
  sendBotMessageMock.mock.mockImplementationOnce(async () => {
    throw new Error('fail');
  });
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        message_type: 0,
        content: 'Hello',
        account: { id: 8 },
        conversation: { id: 8, inbox_id: 1, status: 'resolved', account_id: 8 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  assert.strictEqual(res.status, 500);
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  resetMocks();
});
