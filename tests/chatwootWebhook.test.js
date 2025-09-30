const assert = require('assert');
const { test, mock } = require('node:test');
process.env.RELEASE_MAX_ATTEMPTS = '2';
process.env.RELEASE_RETRY_BASE_MS = '1';
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

// Mock external dependencies
const conversationResolution = require('../lib/conversationResolution.ts');
const releaseAgentMock = mock.method(conversationResolution, 'releaseAgent', async () => {});

const chatwootBot = require('../lib/chatwootBot.ts');
let nextMessageId = 0;
const sendBotMessageMock = mock.method(
  chatwootBot,
  'sendBotMessage',
  async (accountId, conversationId, content) => ({
    id: ++nextMessageId,
    inbox_id: 1,
    content,
    conversation_id: conversationId,
    account_id: accountId,
    created_at: Math.floor(Date.now() / 1000),
  })
);

const {
  MESSAGE_FALLBACK_TEXT,
  HANDOFF_FALLBACK_TEXT,
} = require('../lib/friendlyErrors.ts');

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

const conversationSynopsis = require('../lib/getConversationSynopsis.ts');
const getConversationSynopsisMock = mock.method(
  conversationSynopsis,
  'getConversationSynopsis',
  async () => undefined
);

const conversationTranscript = require('../lib/getConversationTranscript.ts');
const originalGetConversationTranscript = conversationTranscript.getConversationTranscript;
const getConversationTranscriptMock = mock.method(
  conversationTranscript,
  'getConversationTranscript',
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
const updateRequestMock = mock.method(handoffQueue, 'updateRequest', async () => {});

const chatwoot = require('../lib/chatwoot.ts');
const getConversationMock = mock.method(chatwoot, 'getConversation', async () => ({ id: 1, status: 'resolved', inbox_id: 1 }));
const setConversationLabelsMock = mock.method(chatwoot, 'setConversationLabels', async () => {});
const getConversationLabelsMock = mock.method(
  chatwoot,
  'getConversationLabels',
  async () => ({ payload: [] })
);

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
  findUnique: mock.fn(async () => null),
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
redis.lrange = mock.fn(async () => []);

const tokenCounter = require('../lib/utils/tokenCounter.ts');
const originalEstimateMessageTokens = tokenCounter.estimateMessageTokens;
const estimateMessageTokensMock = mock.method(
  tokenCounter,
  'estimateMessageTokens',
  (...args) => originalEstimateMessageTokens(...args)
);

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
  releaseAgentMock.mock.mockImplementation(async () => {});
  sendBotMessageMock.mock.resetCalls();
  nextMessageId = 0;
  getProviderMock.mock.resetCalls();
  providerFnMock.mock.resetCalls();
  getNextAgentMock.mock.resetCalls();
  setActiveConversationMock.mock.resetCalls();
  handOffMock.mock.resetCalls();
  enqueueRequestMock.mock.resetCalls();
  updateRequestMock.mock.resetCalls();
  getConversationMock.mock.resetCalls();
  setConversationLabelsMock.mock.resetCalls();
  getConversationLabelsMock.mock.resetCalls();
  prisma.handoffRequest.findUnique.mock.resetCalls();
  prisma.conversationMessage.upsert.mock.resetCalls();
  prisma.conversationMessage.findMany.mock.resetCalls();
  prisma.conversationMessage.findMany.mock.mockImplementation(async () => []);
  prisma.conversationMessage.findUnique.mock.resetCalls();
  getConversationHistoryMock.mock.resetCalls();
  getConversationTranscriptMock.mock.resetCalls();
  getConversationSynopsisMock.mock.resetCalls();
  getConversationSynopsisMock.mock.mockImplementation(async () => undefined);
  redis.exists.mock.resetCalls();
  redis.rpush.mock.resetCalls();
  redis.pipeline.mock.resetCalls();
  redis.lrange.mock.resetCalls();
  redisPipelineMock.rpush.mock.resetCalls();
  redisPipelineMock.expire.mock.resetCalls();
  redisPipelineMock.exec.mock.resetCalls();
  estimateMessageTokensMock.mock.resetCalls();
  estimateMessageTokensMock.mock.mockImplementation((...args) =>
    originalEstimateMessageTokens(...args)
  );
  runRelevanceGuardrailMock.mock.resetCalls();
  runRelevanceGuardrailMock.mock.mockImplementation(async () => ({
    tripwireTriggered: false,
  }));
  runJailbreakGuardrailMock.mock.resetCalls();
  runJailbreakGuardrailMock.mock.mockImplementation(async () => ({
    tripwireTriggered: false,
  }));
}

function getLoggedBotMessages() {
  return prisma.conversationMessage.upsert.mock.calls
    .map((call) => call.arguments?.[0]?.create)
    .filter((create) => create && create.sender === 'bot');
}

function assertLoggedIds(...expectedIds) {
  const botMessages = getLoggedBotMessages();
  assert.strictEqual(botMessages.length, expectedIds.length);
  expectedIds.forEach((id, index) => {
    assert.strictEqual(botMessages[index].messageId, id);
  });
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
  assertLoggedIds();
  resetMocks();
});

test('chatwoot status webhook returns error when releaseAgent fails', async () => {
  const payload = {
    event: 'conversation_status_changed',
    data: {
      event: 'conversation_status_changed',
      status: 'snoozed',
      previous_status: 'open',
      account: { id: 2 },
      conversation: { id: 2 },
    },
  };
  releaseAgentMock.mock.mockImplementationOnce(async () => {
    throw new Error('Unable to resolve freed agent for conversation 2');
  });
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(res.status, 500);
  assert.ok(data.error.includes('Unable to resolve freed agent'));
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.strictEqual(
    sendBotMessageMock.mock.calls[0].arguments[2],
    HANDOFF_FALLBACK_TEXT
  );
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot status webhook stops returning 500 after retry limit', async () => {
  const payload = {
    event: 'conversation_status_changed',
    data: {
      event: 'conversation_status_changed',
      status: 'snoozed',
      previous_status: 'open',
      account: { id: 3 },
      conversation: { id: 3 },
    },
  };
  releaseAgentMock.mock.mockImplementation(async () => {
    throw new Error('fail');
  });
  // first attempt => 500
  let req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  let res = await statusWebhookPost(req);
  assert.strictEqual(res.status, 500);
  // second attempt => limit reached, no 500
  req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.status, 'unreleased');
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 2);
  assert.strictEqual(
    sendBotMessageMock.mock.calls[0].arguments[2],
    HANDOFF_FALLBACK_TEXT
  );
  assert.strictEqual(
    sendBotMessageMock.mock.calls[1].arguments[2],
    HANDOFF_FALLBACK_TEXT
  );
  assertLoggedIds(1, 2);
  resetMocks();
});

test('chatwoot status webhook skips release on label removal', async () => {
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
      assignee_id: 42,
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 0);
  assertLoggedIds();
  resetMocks();
});

test('chatwoot status webhook releases agent on status-only update with top-level labels', async () => {
  const payload = {
    event: 'conversation_updated',
    data: {
      event: 'conversation_updated',
      changed_attributes: [
        {
          status: { previous_value: 'open', current_value: 'pending' },
        },
      ],
      account: { id: 6 },
      conversation: { id: 6 },
      assignee_id: 44,
      labels: [CONVO_LABELS.assigned, 'other'],
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
  assertLoggedIds();
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
      assignee_id: 43,
      labels: [CONVO_LABELS.assigned],
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
  assertLoggedIds();
  resetMocks();
});

test('chatwoot status webhook releases agent when label present without change', async () => {
  const payload = {
    event: 'conversation_updated',
    data: {
      event: 'conversation_updated',
      changed_attributes: [
        {
          status: { previous_value: 'open', current_value: 'resolved' },
        },
      ],
      account: { id: 5 },
      conversation: { id: 5 },
      labels: `${CONVO_LABELS.assigned},other`,
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
  assertLoggedIds();
  resetMocks();
});

test('chatwoot status webhook skips release when status changes without label', async () => {
  const consoleInfoMock = mock.method(console, 'info', () => {});
  const payload = {
    event: 'conversation_updated',
    data: {
      event: 'conversation_updated',
      changed_attributes: [
        {
          status: { previous_value: 'open', current_value: 'pending' },
        },
      ],
      account: { id: 7 },
      conversation: { id: 7 },
      assignee_id: 50,
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 0);
  const resolvedFieldsCall = consoleInfoMock.mock.calls.find(
    (c) => c.arguments[0] === 'chatwoot status webhook resolved fields'
  );
  assert.ok(resolvedFieldsCall);
  assert.strictEqual(resolvedFieldsCall.arguments[1].status_previous, 'open');
  assert.strictEqual(resolvedFieldsCall.arguments[1].status_current, 'pending');
  assert.strictEqual(resolvedFieldsCall.arguments[1].labels_current, undefined);
  assert.strictEqual(resolvedFieldsCall.arguments[1].labels_previous, undefined);
  consoleInfoMock.mock.restore();
  assertLoggedIds();
  resetMocks();
});

test('chatwoot status webhook skips release when label removed but status open', async () => {
  const consoleInfoMock = mock.method(console, 'info', () => {});
  const payload = {
    event: 'conversation_updated',
    data: {
      event: 'conversation_updated',
      changed_attributes: [
        {
          status: { previous_value: 'open', current_value: 'open' },
        },
        {
          label_list: {
            previous_value: [CONVO_LABELS.assigned],
            current_value: [],
          },
        },
      ],
      account: { id: 8 },
      conversation: { id: 8 },
      assignee_id: 51,
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 0);
  const resolvedFieldsCall = consoleInfoMock.mock.calls.find(
    (c) => c.arguments[0] === 'chatwoot status webhook resolved fields'
  );
  assert.ok(resolvedFieldsCall);
  assert.strictEqual(resolvedFieldsCall.arguments[1].status_previous, 'open');
  assert.strictEqual(resolvedFieldsCall.arguments[1].status_current, 'open');
  assert.deepStrictEqual(resolvedFieldsCall.arguments[1].labels_previous, [
    CONVO_LABELS.assigned,
  ]);
  assert.deepStrictEqual(resolvedFieldsCall.arguments[1].labels_current, []);
  consoleInfoMock.mock.restore();
  assertLoggedIds();
  resetMocks();
});

test('chatwoot status webhook releases agent when status changes with label', async () => {
  const consoleInfoMock = mock.method(console, 'info', () => {});
  const payload = {
    event: 'conversation_updated',
    data: {
      event: 'conversation_updated',
      changed_attributes: [
        {
          status: { previous_value: 'open', current_value: 'resolved' },
        },
        {
          label_list: {
            previous_value: [CONVO_LABELS.assigned],
            current_value: [CONVO_LABELS.assigned],
          },
        },
      ],
      account: { id: 9 },
      conversation: { id: 9 },
      assignee_id: 52,
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
  const resolvedFieldsCall = consoleInfoMock.mock.calls.find(
    (c) => c.arguments[0] === 'chatwoot status webhook resolved fields'
  );
  assert.ok(resolvedFieldsCall);
  assert.strictEqual(resolvedFieldsCall.arguments[1].status_previous, 'open');
  assert.strictEqual(resolvedFieldsCall.arguments[1].status_current, 'resolved');
  assert.deepStrictEqual(resolvedFieldsCall.arguments[1].labels_previous, [
    CONVO_LABELS.assigned,
  ]);
  assert.deepStrictEqual(resolvedFieldsCall.arguments[1].labels_current, [
    CONVO_LABELS.assigned,
  ]);
  consoleInfoMock.mock.restore();
  assertLoggedIds();
  resetMocks();
});

test('chatwoot status webhook skips release when no assignee', async () => {
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
      account: { id: 4 },
      conversation: { id: 4 },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await statusWebhookPost(req);
  const data = await res.json();
  assert.strictEqual(data.status, 'handled');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 0);
  assertLoggedIds();
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
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 1,
  });
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  assertLoggedIds(1);
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
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 2,
  });
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook sends fallback when enqueueRequest fails', async () => {
  getNextAgentMock.mock.mockImplementationOnce(async () => ({ id: 10, role: 'agent' }));
  getConversationMock.mock.mockImplementationOnce(async () => ({ id: 1, status: 'resolved', inbox_id: 1 }));
  enqueueRequestMock.mock.mockImplementationOnce(async () => { throw new Error('fail'); });
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
  assert.strictEqual(body.status, 'fallback');
  assert.strictEqual(handOffMock.mock.calls.length, 0);
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[2], HANDOFF_FALLBACK_TEXT);
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 1,
  });
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook sends fallback when updateRequest fails', async () => {
  getNextAgentMock.mock.mockImplementationOnce(async () => ({ id: 10, role: 'agent' }));
  getConversationMock.mock.mockImplementationOnce(async () => ({ id: 1, status: 'resolved', inbox_id: 1 }));
  handOffMock.mock.mockImplementationOnce(async () => false);
  updateRequestMock.mock.mockImplementationOnce(async () => { throw new Error('fail'); });
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
  assert.strictEqual(body.status, 'fallback');
  assert.strictEqual(updateRequestMock.mock.calls.length, 1);
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[2], HANDOFF_FALLBACK_TEXT);
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 1,
  });
  assert.strictEqual(setConversationLabelsMock.mock.calls.length, 0);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot status webhook ignores resolution system message', async () => {
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
  assert.strictEqual(data.status, 'ignored');
  assert.strictEqual(releaseAgentMock.mock.calls.length, 0);
  resetMocks();
});

test('chatwoot webhook releases agent on resolution with assigned label', async () => {
  getConversationLabelsMock.mock.mockImplementationOnce(async () => ({
    payload: [CONVO_LABELS.assigned],
  }));
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 11,
        message_type: 2,
        content: 'Conversation was marked resolved',
        account: { id: 11 },
        conversation: { id: 11, inbox_id: 1, account_id: 11 },
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
  assertLoggedIds();
  resetMocks();
});

test('chatwoot webhook skips release when assigned label missing', async () => {
  getConversationLabelsMock.mock.mockImplementationOnce(async () => ({
    payload: [],
  }));
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 12,
        message_type: 2,
        content: 'Conversation was marked resolved',
        account: { id: 12 },
        conversation: { id: 12, inbox_id: 1, account_id: 12 },
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
  assert.strictEqual(releaseAgentMock.mock.calls.length, 0);
  assertLoggedIds();
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
  assertLoggedIds();
  resetMocks();
});

test('chatwoot webhook processes incoming message', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 700,
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
  getConversationSynopsisMock.mock.mockImplementationOnce(async () => 'Mock synopsis');
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const result = await res.json();
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  assert.strictEqual(getConversationSynopsisMock.mock.calls.length, 1);
  const synopsisCall = getConversationSynopsisMock.mock.calls[0];
  assert.strictEqual(synopsisCall.arguments[0], 'chatwoot:7:1:7');
  const expectedMessages = [
    toResponseMessage('system', CHATWOOT_SYSTEM_PROMPT),
    toResponseMessage('developer', 'Mock synopsis'),
    ...history,
  ];
  assert.deepStrictEqual(providerFnMock.mock.calls[0].arguments[0], expectedMessages);
  const call = sendBotMessageMock.mock.calls[0].arguments;
  assert.strictEqual(call[0], 7);
  assert.strictEqual(call[1], 7);
  assert.strictEqual(call[2], 'hi');
  assert.deepStrictEqual(call[3], { private: false, inReplyTo: 700 });
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook includes developer quote guidance when transcript exists', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 701,
        message_type: 0,
        content: 'Need help again',
        account: { id: 70 },
        conversation: { id: 70, inbox_id: 1, status: 'resolved', account_id: 70 },
      },
    },
  };
  const history = [
    toResponseMessage('user', 'previous question about orders'),
    toResponseMessage('assistant', 'response from assistant'),
  ];
  const prismaTranscriptRecords = [
    {
      messageId: 4321,
      sender: 'contact',
      message_type: 0,
      content: 'Need help with an installation',
      created_at: new Date('2024-05-15T10:00:00Z'),
      channel: 'web_widget',
    },
    {
      messageId: 4322,
      sender: 'Agent Bot',
      message_type: 1,
      content: 'Sure, I can take a look at that for you',
      created_at: new Date('2024-05-15T10:05:00Z'),
      channel: 'web_widget',
    },
    {
      messageId: 4323,
      sender: 'contact',
      message_type: 0,
      content: 'Twilio WhatsApp follow up (exclude)',
      created_at: new Date('2024-05-15T10:06:00Z'),
      channel: 'twilio_whatsapp',
    },
    {
      messageId: 4324,
      sender: 'contact',
      message_type: 0,
      content: 'Official WhatsApp order update',
      created_at: new Date('2024-05-15T10:07:00Z'),
      channel: 'whatsapp_official',
    },
    {
      messageId: 4325,
      sender: 'contact',
      message_type: 0,
      content: 'SMS follow up (exclude)',
      created_at: new Date('2024-05-15T10:08:00Z'),
      channel: 'sms',
    },
  ];
  getConversationHistoryMock.mock.mockImplementationOnce(async () => history);
  redis.lrange.mock.mockImplementationOnce(async () => []);
  prisma.conversationMessage.findMany.mock.mockImplementation(async (args) => {
    if (
      args &&
      typeof args === 'object' &&
      args.orderBy &&
      typeof args.orderBy === 'object' &&
      args.orderBy.messageId === 'desc'
    ) {
      return prismaTranscriptRecords;
    }
    return [];
  });
  getConversationTranscriptMock.mock.mockImplementationOnce(async (...args) =>
    originalGetConversationTranscript(...args)
  );
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  getConversationSynopsisMock.mock.mockImplementationOnce(async () => 'Quote summary');
  const res = await webhookPost(req);
  const result = await res.json();
  assert.ok(result);
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  assert.strictEqual(getConversationTranscriptMock.mock.calls.length, 1);
  const transcriptCall = getConversationTranscriptMock.mock.calls[0];
  assert.strictEqual(transcriptCall.arguments[0], 'chatwoot:70:1:70');
  assert.deepStrictEqual(transcriptCall.arguments[1], {
    userLimit: 4,
    assistantLimit: 2,
  });
  const transcriptResult = await transcriptCall.result;
  assert.ok(Array.isArray(transcriptResult));
  assert.ok(
    transcriptResult.some(
      (entry) => entry?.messageId === 4324 && entry?.sender === 'user'
    )
  );
  assert.ok(!transcriptResult.some((entry) => entry?.messageId === 4323));
  assert.ok(!transcriptResult.some((entry) => entry?.messageId === 4325));
  const messages = providerFnMock.mock.calls[0].arguments[0];
  assert.strictEqual(messages[0].role, 'system');
  assert.strictEqual(messages[1].role, 'developer');
  assert.strictEqual(messages[1].content[0].text, 'Quote summary');
  assert.strictEqual(messages[2].role, 'developer');
  const developerText = messages[2].content[0].text;
  assert.ok(
    developerText.includes(
      'Quote candidates available for set_reply_reference (newest first):'
    )
  );
  assert.ok(developerText.includes('user#4324'));
  assert.ok(developerText.includes('Official WhatsApp order update'));
  assert.ok(developerText.includes('user#4321'));
  assert.ok(developerText.includes('assistant#4322'));
  assert.ok(!developerText.includes('user#4323'));
  assert.ok(!developerText.includes('Twilio WhatsApp follow up (exclude)'));
  assert.ok(!developerText.includes('user#4325'));
  assert.ok(!developerText.includes('SMS follow up (exclude)'));
  assert.ok(developerText.includes('2024-05-15'));
  assert.deepStrictEqual(messages.slice(3), history);
  resetMocks();
});

test('chatwoot webhook trims prompt when token estimate exceeds threshold', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 702,
        message_type: 0,
        content: 'Please help again',
        account: { id: 71 },
        conversation: { id: 71, inbox_id: 1, status: 'resolved', account_id: 71 },
      },
    },
  };
  const history = Array.from({ length: 5 }, (_, index) =>
    toResponseMessage(index % 2 === 0 ? 'user' : 'assistant', `turn-${index}`)
  );
  getConversationHistoryMock.mock.mockImplementationOnce(async () => history);
  getConversationSynopsisMock.mock.mockImplementationOnce(async () => 'Token summary');
  estimateMessageTokensMock.mock.mockImplementation((messages) => {
    const arr = Array.isArray(messages) ? messages : [];
    return arr.length * 6000;
  });
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  const tokenCalls = estimateMessageTokensMock.mock.calls;
  assert.ok(tokenCalls.length >= 1);
  const firstMessages = tokenCalls[0].arguments[0];
  const finalMessages = tokenCalls[tokenCalls.length - 1].arguments[0];
  assert.ok(Array.isArray(firstMessages));
  assert.ok(Array.isArray(finalMessages));
  assert.ok(finalMessages.length < firstMessages.length);
  assert.strictEqual(finalMessages.length, 4);
  assert.strictEqual(finalMessages[0].role, 'system');
  assert.strictEqual(finalMessages[1].role, 'developer');
  assert.strictEqual(finalMessages[1].content[0].text, 'Token summary');
  const trimmedHistory = finalMessages.slice(2);
  assert.strictEqual(trimmedHistory.length, 2);
  assert.deepStrictEqual(
    trimmedHistory.map((m) => m.content[0].text),
    history.slice(-2).map((m) => m.content[0].text)
  );
  resetMocks();
});

test('chatwoot webhook treats lone greeting as relevant', async () => {
  let guardrailOutput;
  runRelevanceGuardrailMock.mock.mockImplementationOnce(async ({ input }) => {
    guardrailOutput = { tripwireTriggered: false, outputInfo: { relevant: true } };
    return guardrailOutput;
  });
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        message_type: 0,
        content: 'hello',
        account: { id: 11 },
        conversation: { id: 11, inbox_id: 1, status: 'resolved', account_id: 11 },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(runRelevanceGuardrailMock.mock.calls.length, 1);
  assert.ok(guardrailOutput);
  assert.strictEqual(guardrailOutput.outputInfo.relevant, true);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook includes referenced message in guardrail input', async () => {
  let guardrailInput;
  runRelevanceGuardrailMock.mock.mockImplementationOnce(async ({ input }) => {
    guardrailInput = input;
    return { tripwireTriggered: false };
  });
  redis.exists.mock.mockImplementationOnce(async () => 1);
  const referencedMessageId = 1234;
  redis.lrange.mock.mockImplementationOnce(async () => [
    JSON.stringify({
      messageId: referencedMessageId,
      sender: 'contact',
      content: 'Original order number was 5678.',
    }),
  ]);
  getConversationHistoryMock.mock.mockImplementationOnce(async () => [
    toResponseMessage('assistant', 'Could you share more details?'),
  ]);
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 4321,
        message_type: 0,
        content: 'Sure, here are the details you asked for.',
        content_attributes: { in_reply_to: referencedMessageId },
        account: { id: 12 },
        conversation: {
          id: 21,
          inbox_id: 1,
          status: 'resolved',
          account_id: 12,
        },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(runRelevanceGuardrailMock.mock.calls.length, 1);
  assert.ok(guardrailInput);
  const turns = JSON.parse(guardrailInput);
  assert.ok(Array.isArray(turns));
  assert.strictEqual(turns[0].role, 'user');
  assert.strictEqual(turns[0].content, 'Original order number was 5678.');
  assert.strictEqual(turns[turns.length - 1].role, 'user');
  const expectedEnrichedText =
    'Customer referenced: "Original order number was 5678."\n\nSure, here are the details you asked for.';
  assert.strictEqual(turns[turns.length - 1].content, expectedEnrichedText);
  assert.strictEqual(
    prisma.conversationMessage.upsert.mock.calls[0].arguments[0].create.content,
    expectedEnrichedText
  );
  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  assert.strictEqual(
    providerMessages[providerMessages.length - 1].content[0].text,
    expectedEnrichedText
  );
  assert.strictEqual(redisPipelineMock.rpush.mock.calls.length, 1);
  const storedRedisEntry = JSON.parse(
    redisPipelineMock.rpush.mock.calls[0].arguments[1]
  );
  assert.strictEqual(storedRedisEntry.content, expectedEnrichedText);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook loads referenced message from prisma when redis misses', async () => {
  const referencedMessageId = 2468;
  redis.lrange.mock.mockImplementationOnce(async () => []);
  prisma.conversationMessage.findUnique.mock.mockImplementationOnce(async () => ({
    sender: 'contact',
    content: 'Stored in the database.',
  }));
  getConversationHistoryMock.mock.mockImplementationOnce(async () => [
    toResponseMessage('assistant', 'Previous turn from assistant.'),
  ]);
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 4322,
        message_type: 0,
        content: 'Following up on the prior details.',
        content_attributes: { in_reply_to: referencedMessageId },
        account: { id: 13 },
        conversation: {
          id: 22,
          inbox_id: 1,
          status: 'resolved',
          account_id: 13,
        },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(prisma.conversationMessage.findUnique.mock.calls.length, 1);
  const enrichedContent =
    'Customer referenced: "Stored in the database."\n\nFollowing up on the prior details.';
  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  assert.strictEqual(
    providerMessages[providerMessages.length - 1].content[0].text,
    enrichedContent
  );
  assert.strictEqual(
    prisma.conversationMessage.upsert.mock.calls[0].arguments[0].create.content,
    enrichedContent
  );
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  const replyOptions = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.deepStrictEqual(replyOptions, { private: false, inReplyTo: referencedMessageId });
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook replies to referenced message when available', async () => {
  const referencedMessageId = 6789;
  redis.lrange.mock.mockImplementationOnce(async () => [
    JSON.stringify({
      messageId: referencedMessageId,
      sender: 'contact',
      content: 'Here are the original details.',
    }),
  ]);
  getConversationHistoryMock.mock.mockImplementationOnce(async () => [
    toResponseMessage('assistant', 'Could you provide more information?'),
  ]);
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 9876,
        message_type: 0,
        content: 'Absolutely, here you go.',
        content_attributes: { in_reply_to: referencedMessageId },
        account: { id: 20 },
        conversation: {
          id: 33,
          inbox_id: 1,
          status: 'resolved',
          account_id: 20,
        },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  const options = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.ok(options);
  assert.strictEqual(options.private, false);
  assert.strictEqual(options.inReplyTo, referencedMessageId);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook forwards content_attributes.in_reply_to to sendBotMessage', async () => {
  const referencedMessageId = '13579';
  redis.lrange.mock.mockImplementationOnce(async () => [
    JSON.stringify({
      messageId: Number(referencedMessageId),
      sender: 'contact',
      content: 'Details from earlier.',
    }),
  ]);
  getConversationHistoryMock.mock.mockImplementationOnce(async () => [
    toResponseMessage('assistant', 'Could you clarify the request?'),
  ]);
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 9877,
        message_type: 0,
        content: 'Here is what you asked for.',
        content_attributes: { in_reply_to: referencedMessageId },
        account: { id: 21 },
        conversation: {
          id: 34,
          inbox_id: 1,
          status: 'resolved',
          account_id: 21,
        },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  const options = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.strictEqual(options.private, false);
  assert.strictEqual(options.inReplyTo, Number(referencedMessageId));
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook sends fallback when relevance guardrail triggers', async () => {
  runRelevanceGuardrailMock.mock.mockImplementation(async () => ({
    tripwireTriggered: true,
  }));
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 901,
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
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 901,
  });
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook sends fallback when jailbreak guardrail triggers', async () => {
  runJailbreakGuardrailMock.mock.mockImplementation(async () => ({
    tripwireTriggered: true,
  }));
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 902,
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
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 902,
  });
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook sends fallback when sendBotMessage fails', async () => {
  sendBotMessageMock.mock.mockImplementationOnce(async () => {
    throw new Error('fail');
  });
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 800,
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
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.status, 'fallback');
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 2);
  const initialOptions = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.strictEqual(initialOptions.private, false);
  assert.strictEqual(initialOptions.inReplyTo, 800);
  assert.strictEqual(
    sendBotMessageMock.mock.calls[1].arguments[2],
    MESSAGE_FALLBACK_TEXT
  );
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[1].arguments[3], {
    private: false,
    inReplyTo: 800,
  });
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook auto quotes acknowledgement when heuristic triggers', async () => {
  const referencedMessageId = 4123;
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 905,
        message_type: 0,
        content: 'Yes',
        account: { id: 17 },
        conversation: {
          id: 905,
          inbox_id: 1,
          status: 'resolved',
          account_id: 17,
        },
        content_attributes: { in_reply_to: referencedMessageId },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  const options = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.deepStrictEqual(options, { private: false, inReplyTo: referencedMessageId });
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook leaves inReplyTo unset when heuristic does not trigger', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 906,
        message_type: 0,
        content: 'Thanks for the help earlier, here are the details.',
        account: { id: 18 },
        conversation: {
          id: 906,
          inbox_id: 1,
          status: 'resolved',
          account_id: 18,
        },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  const options = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.strictEqual(options.private, false);
  assert.strictEqual(options.inReplyTo, 906);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook uses set_reply_reference message override', async () => {
  const overrideMessageId = 54321;
  providerFnMock.mock.mockImplementationOnce(() =>
    (async function* () {
      yield {
        event: 'response.output_item.added',
        data: {
          item: {
            type: 'function_call',
            name: 'set_reply_reference',
            id: 'call-override',
            call_id: 'call-override',
            arguments: '',
          },
        },
      };
      yield {
        event: 'response.function_call_arguments.delta',
        data: { item_id: 'call-override', delta: '{"message_id": 54321' },
      };
      yield {
        event: 'response.function_call_arguments.delta',
        data: { item_id: 'call-override', delta: ', "use_quotes": true}' },
      };
      yield {
        event: 'response.function_call_arguments.done',
        data: {
          item_id: 'call-override',
          arguments: '{"message_id":54321,"use_quotes":true}',
        },
      };
      yield {
        event: 'response.output_text.delta',
        data: { delta: 'Custom reply.' },
      };
    })()
  );
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 910,
        message_type: 0,
        content: 'Need context',
        account: { id: 15 },
        conversation: {
          id: 910,
          inbox_id: 1,
          status: 'resolved',
          account_id: 15,
        },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  const options = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.deepStrictEqual(options, { private: false, inReplyTo: overrideMessageId });
  resetMocks();
});

test('chatwoot webhook handles streaming quote override without final arguments', async () => {
  const overrideMessageId = 65432;
  providerFnMock.mock.mockImplementationOnce(() =>
    (async function* () {
      yield {
        event: 'response.output_item.added',
        data: {
          item: {
            type: 'function_call',
            name: 'set_reply_reference',
            id: 'call-missing-args',
            call_id: 'call-missing-args',
            arguments: '',
          },
        },
      };
      yield {
        event: 'response.function_call_arguments.delta',
        data: { item_id: 'call-missing-args', delta: '{"message_id":' },
      };
      yield {
        event: 'response.function_call_arguments.delta',
        data: { item_id: 'call-missing-args', delta: `${overrideMessageId}` },
      };
      yield {
        event: 'response.function_call_arguments.delta',
        data: { item_id: 'call-missing-args', delta: ',"use_quotes":true}' },
      };
      yield {
        event: 'response.function_call_arguments.done',
        data: { item_id: 'call-missing-args' },
      };
      yield {
        event: 'response.output_text.delta',
        data: { delta: 'Here is the information you requested.' },
      };
    })()
  );

  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 913,
        message_type: 0,
        content: 'Could you provide those details again?',
        account: { id: 17 },
        conversation: {
          id: 913,
          inbox_id: 1,
          status: 'resolved',
          account_id: 17,
        },
      },
    },
  };

  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();

  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  const options = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.deepStrictEqual(options, { private: false, inReplyTo: overrideMessageId });
  resetMocks();
});

test('chatwoot webhook set_reply_reference streaming controls quoting content attributes', async () => {
  const scenarios = [
    {
      name: 'applies quoting override with private flag',
      callId: 'call-private-quote',
      arguments: { message_id: 654321, private: true, use_quotes: true },
      expected: { private: true, inReplyTo: 654321 },
      accountId: 19,
      conversationId: 919,
      messageId: 919,
      content: 'Here are the latest order details for review.',
      replyText: 'Sharing the requested details now.',
    },
    {
      name: 'omits content attributes when quoting is disabled',
      callId: 'call-private-skip',
      arguments: { private: true, use_quotes: false },
      expected: { private: true },
      accountId: 20,
      conversationId: 920,
      messageId: 920,
      content: 'Please send a private note without quoting anything.',
      replyText: 'Absolutely, sending a private update.',
    },
  ];

  for (const scenario of scenarios) {
    providerFnMock.mock.mockImplementationOnce(() =>
      (async function* () {
        yield {
          event: 'response.output_item.added',
          data: {
            item: {
              type: 'function_call',
              name: 'set_reply_reference',
              id: scenario.callId,
              call_id: scenario.callId,
              arguments: '',
            },
          },
        };
        const argumentString = JSON.stringify(scenario.arguments);
        const splitIndex = Math.max(1, Math.floor(argumentString.length / 2));
        const fragments = [
          argumentString.slice(0, splitIndex),
          argumentString.slice(splitIndex),
        ].filter((fragment) => fragment.length > 0);
        for (const fragment of fragments) {
          yield {
            event: 'response.function_call_arguments.delta',
            data: { item_id: scenario.callId, delta: fragment },
          };
        }
        yield {
          event: 'response.function_call_arguments.done',
          data: { item_id: scenario.callId, arguments: argumentString },
        };
        yield {
          event: 'response.output_text.delta',
          data: { delta: scenario.replyText },
        };
      })()
    );

    const payload = {
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id: scenario.messageId,
          message_type: 0,
          content: scenario.content,
          account: { id: scenario.accountId },
          conversation: {
            id: scenario.conversationId,
            inbox_id: 1,
            status: 'resolved',
            account_id: scenario.accountId,
          },
        },
      },
    };

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const res = await webhookPost(req);
    await res.json();

    assert.strictEqual(
      sendBotMessageMock.mock.calls.length,
      1,
      `${scenario.name} send count`
    );
    const options = sendBotMessageMock.mock.calls[0].arguments[3];
    assert.strictEqual(
      options.private,
      scenario.expected.private,
      `${scenario.name} private flag`
    );
    if (Object.prototype.hasOwnProperty.call(scenario.expected, 'inReplyTo')) {
      assert.strictEqual(
        options.inReplyTo,
        scenario.expected.inReplyTo,
        `${scenario.name} quoting override`
      );
    } else {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(options, 'inReplyTo'),
        `${scenario.name} should not include inReplyTo`
      );
    }

    resetMocks();
  }
});

test('chatwoot webhook fallback keeps quoting inbound when set_reply_reference skips quotes', async () => {
  sendBotMessageMock.mock.mockImplementationOnce(async () => {
    throw new Error('initial send failure');
  });
  providerFnMock.mock.mockImplementationOnce(() =>
    (async function* () {
      yield {
        event: 'response.output_item.added',
        data: {
          item: {
            type: 'function_call',
            name: 'set_reply_reference',
            id: 'call-skip',
            call_id: 'call-skip',
            arguments: '',
          },
        },
      };
      yield {
        event: 'response.function_call_arguments.delta',
        data: { item_id: 'call-skip', delta: '{"use_quotes": false}' },
      };
      yield {
        event: 'response.function_call_arguments.done',
        data: { item_id: 'call-skip', arguments: '{"use_quotes": false}' },
      };
      yield {
        event: 'response.output_text.delta',
        data: { delta: 'Working on it.' },
      };
    })()
  );
  const inboundId = 911;
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: inboundId,
        message_type: 0,
        content: 'No quotes please',
        account: { id: 16 },
        conversation: {
          id: inboundId,
          inbox_id: 1,
          status: 'resolved',
          account_id: 16,
        },
      },
    },
  };
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const body = await res.json();
  assert.strictEqual(body.status, 'fallback');
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 2);
  const firstOptions = sendBotMessageMock.mock.calls[0].arguments[3];
  assert.strictEqual(firstOptions.private, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(firstOptions, 'inReplyTo'));
  const fallbackOptions = sendBotMessageMock.mock.calls[1].arguments[3];
  assert.deepStrictEqual(fallbackOptions, { private: false, inReplyTo: inboundId });
  resetMocks();
});
