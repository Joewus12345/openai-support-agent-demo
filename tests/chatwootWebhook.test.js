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
const defaultSendBotMessageImplementation = async (
  accountId,
  conversationId,
  content
) => ({
  id: ++nextMessageId,
  inbox_id: 1,
  content,
  conversation_id: conversationId,
  account_id: accountId,
  created_at: Math.floor(Date.now() / 1000),
});
const sendBotMessageMock = mock.method(
  chatwootBot,
  'sendBotMessage',
  defaultSendBotMessageImplementation
);

const {
  MESSAGE_FALLBACK_TEXT,
  HANDOFF_FALLBACK_TEXT,
} = require('../lib/friendlyErrors.ts');
const { ProviderRetryError } = require('../lib/providers/retry.ts');

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
const {
  scheduleProviderCall,
  setLimiterConfigForTesting,
  resetLimiterForTesting,
} = require('../lib/providers/limiter.ts');

const chatwootJobQueueModule = require('../lib/chatwoot/jobQueue.ts');
const {
  enqueueChatwootJob,
  setChatwootQueueEnabledForTesting,
  waitForChatwootQueueIdle,
  resetChatwootQueueForTesting,
  setChatwootQueuePersistenceEnabledForTesting,
  hydrateChatwootQueueFromStorageForTesting,
  setChatwootQueueConcurrencyForTesting,
  getChatwootQueueConcurrency,
  setChatwootQueueRetryConfigForTesting,
  setChatwootQueueJobTimeoutForTesting,
  setChatwootQueueFailureReporter,
  getChatwootQueueFailureReporterForTesting,
} = chatwootJobQueueModule;
setChatwootQueueEnabledForTesting(false);
setChatwootQueuePersistenceEnabledForTesting(false);

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
const {
  RELEVANCE_FOLLOW_UP_MESSAGE,
  RELEVANCE_REJECTION_MESSAGE,
} = require('../config/guardrailMessages.ts');

const agentRotation = require('../lib/agentRotation.ts');
const getNextAgentMock = mock.method(
  agentRotation,
  'getNextAgent',
  async () => ({
    agent: null,
    availabilitySummary: { online: 0, busy: 0, offline: 0 },
  })
);
const setActiveConversationMock = mock.method(agentRotation, 'setActiveConversation', async () => {});

const handoff = require('../lib/handoff.ts');
const handOffMock = mock.method(handoff, 'default', async () => true);

const handoffQueue = require('../lib/handoffQueue.ts');
const enqueueRequestMock = mock.method(handoffQueue, 'enqueueRequest', async () => {});
const updateRequestMock = mock.method(handoffQueue, 'updateRequest', async () => {});
const updateQueuePositionsMock = mock.method(
  handoffQueue,
  'updateQueuePositions',
  async () => []
);

const chatwoot = require('../lib/chatwoot.ts');
const getConversationMock = mock.method(chatwoot, 'getConversation', async () => ({ id: 1, status: 'resolved', inbox_id: 1 }));
const setConversationLabelsMock = mock.method(chatwoot, 'setConversationLabels', async () => {});
const getConversationLabelsMock = mock.method(
  chatwoot,
  'getConversationLabels',
  async () => ({ payload: [] })
);

const fetchAttachmentImageModule = require('../lib/chatwoot/fetchAttachmentImage.ts');
const fetchAttachmentImageMock = mock.method(
  fetchAttachmentImageModule,
  'fetchAttachmentImage',
  async () => undefined
);

const imageInsightsModule = require('../lib/chatwoot/imageInsights.ts');
const unexpectedImageInsightsCallMessage =
  'Unexpected OpenAI call in chatwootWebhook tests; provide a stub.';
const sharedImageInsightsClientMock = {
  responses: {
    create: mock.fn(async () => {
      throw new Error(unexpectedImageInsightsCallMessage);
    }),
  },
};
const gatherImageInsightsMock = mock.method(
  imageInsightsModule,
  'gatherImageInsights',
  async () => undefined
);

let releaseImageInsightsClientStub;
let imageInsightsClientStubPromise;
test.before(() => {
  if (typeof imageInsightsModule.withImageInsightsClientStub === 'function') {
    imageInsightsClientStubPromise =
      imageInsightsModule.withImageInsightsClientStub(
        sharedImageInsightsClientMock,
        () =>
          new Promise((resolve) => {
            releaseImageInsightsClientStub = resolve;
          })
      );
  } else if (
    typeof imageInsightsModule.setImageInsightsClientForTesting === 'function'
  ) {
    imageInsightsModule.setImageInsightsClientForTesting(
      sharedImageInsightsClientMock
    );
  }
});

const { normalizeQueryLengths } = require('../lib/utils/normalizeQueryLengths.ts');

const fileSearchModule = require('../lib/tools/fileSearch.ts');
const fileSearchMock = mock.method(
  fileSearchModule,
  'fileSearch',
  async () => ({ results: [] })
);

const searchKnowledgeBaseModule = require('../lib/knowledgeBase/searchKnowledgeBase.ts');
const searchKnowledgeBaseMock = mock.method(
  searchKnowledgeBaseModule,
  'searchKnowledgeBase',
  async () => ({ results: [] })
);
const { searchKnowledgeBase } = searchKnowledgeBaseModule;

const { CONVO_LABELS } = require('../lib/constants.ts');
const { CHATWOOT_SYSTEM_PROMPT, MODEL } = require('../config/constants.ts');

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
redis.lrem = mock.fn(async () => {});

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
  releaseImageInsightsClientStub?.();
  if (imageInsightsClientStubPromise) {
    await imageInsightsClientStubPromise;
  } else {
    imageInsightsModule.setImageInsightsClientForTesting?.(undefined);
  }
  await prisma.$disconnect();
  if (typeof redis.disconnect === 'function') {
    await redis.disconnect();
  }
});

function resetMocks() {
  sharedImageInsightsClientMock.responses.create.mock.resetCalls();
  sharedImageInsightsClientMock.responses.create.mock.mockImplementation(
    async () => {
      throw new Error(unexpectedImageInsightsCallMessage);
    }
  );
  releaseAgentMock.mock.resetCalls();
  releaseAgentMock.mock.mockImplementation(async () => {});
  sendBotMessageMock.mock.resetCalls();
  sendBotMessageMock.mock.mockImplementation(
    defaultSendBotMessageImplementation
  );
  nextMessageId = 0;
  getProviderMock.mock.resetCalls();
  getProviderMock.mock.mockImplementation(() => providerFnMock);
  providerFnMock.mock.resetCalls();
  getNextAgentMock.mock.resetCalls();
  getNextAgentMock.mock.mockImplementation(async () => ({
    agent: null,
    availabilitySummary: { online: 0, busy: 0, offline: 0 },
  }));
  setActiveConversationMock.mock.resetCalls();
  handOffMock.mock.resetCalls();
  enqueueRequestMock.mock.resetCalls();
  updateRequestMock.mock.resetCalls();
  updateQueuePositionsMock.mock.resetCalls();
  updateQueuePositionsMock.mock.mockImplementation(async () => []);
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
  redis.lrem.mock.resetCalls();
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
  fetchAttachmentImageMock.mock.resetCalls();
  fetchAttachmentImageMock.mock.mockImplementation(async () => undefined);
  gatherImageInsightsMock.mock.resetCalls();
  gatherImageInsightsMock.mock.mockImplementation(async () => undefined);
  searchKnowledgeBaseMock.mock.resetCalls();
  searchKnowledgeBaseMock.mock.mockImplementation(async () => ({ results: [] }));
  fileSearchMock.mock.resetCalls();
  fileSearchMock.mock.mockImplementation(async () => ({ results: [] }));
  delete process.env.CHATWOOT_WEBHOOK_PROVIDER;
  delete process.env.CHATWOOT_OPENAI_TOKEN_LIMIT;
  delete process.env.CHATWOOT_OLLAMA_TOKEN_LIMIT;
  delete process.env.CHATWOOT_OLLAMA_OPENAI_TOKEN_LIMIT;
  delete process.env.CHATWOOT_DEFAULT_TOKEN_LIMIT;
  resetLimiterForTesting();
  resetChatwootQueueForTesting();
  setChatwootQueueEnabledForTesting(false);
  setChatwootQueuePersistenceEnabledForTesting(false);
  setChatwootQueueFailureReporter(undefined);
}

async function tickAndFlush(ms = 0) {
  mock.timers.tick(ms);
  await Promise.resolve();
}

async function waitForLimiter(predicate, attempts = 50, stepMs = 0) {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) {
      return true;
    }
    await tickAndFlush(stepMs);
  }
  return predicate();
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

test('chatwoot webhook sends fallback when provider retries are exhausted', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 901,
        message_type: 0,
        content: 'Retry exhausted please help',
        account: { id: 91 },
        conversation: {
          id: 91,
          inbox_id: 1,
          status: 'resolved',
          account_id: 91,
        },
      },
    },
  };

  const underlying = new Error('rate limited');
  providerFnMock.mock.mockImplementationOnce(async function* () {
    throw new ProviderRetryError('Rate limited', {
      provider: 'openai',
      status: 429,
      attempts: 3,
      retriesExhausted: true,
      retryable: true,
      cause: underlying,
    });
  });

  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const res = await webhookPost(req);
  const body = await res.json();

  assert.strictEqual(body.status, 'fallback');
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[2], MESSAGE_FALLBACK_TEXT);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook surfaces provider errors when retries are not exhausted', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 902,
        message_type: 0,
        content: 'Retry once please',
        account: { id: 92 },
        conversation: {
          id: 92,
          inbox_id: 1,
          status: 'resolved',
          account_id: 92,
        },
      },
    },
  };

  const underlying = new Error('transient 500');
  providerFnMock.mock.mockImplementationOnce(async function* () {
    throw new ProviderRetryError('Server error', {
      provider: 'openai',
      status: 500,
      attempts: 1,
      retriesExhausted: false,
      retryable: true,
      cause: underlying,
    });
  });

  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const res = await webhookPost(req);
  const body = await res.json();

  assert.strictEqual(res.status, 500);
  assert.strictEqual(body.error, 'Server error');
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 0);
  assertLoggedIds();
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
  getNextAgentMock.mock.mockImplementationOnce(async () => ({
    agent: { id: 10, role: 'agent', availability_status: 'online' },
    availabilitySummary: { online: 1, busy: 0, offline: 0 },
  }));
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

test('chatwoot webhook queues request when agents busy', async () => {
  getNextAgentMock.mock.mockImplementationOnce(async () => ({
    agent: null,
    availabilitySummary: { online: 0, busy: 3, offline: 1 },
  }));
  getConversationMock.mock.mockImplementationOnce(async () => ({ id: 2, status: 'resolved', inbox_id: 1 }));
  updateQueuePositionsMock.mock.mockImplementationOnce(async () => [
    {
      conversationKey: 'chatwoot:2:2:99',
      conversationId: 99,
      accountId: 2,
      inboxId: 2,
      requestedAt: new Date(),
      status: 'pending',
      agentId: null,
      lastPositionNotified: 3,
      position: 1,
    },
    {
      conversationKey: 'chatwoot:2:1:2',
      conversationId: 2,
      accountId: 2,
      inboxId: 1,
      requestedAt: new Date(),
      status: 'pending',
      agentId: null,
      lastPositionNotified: 1,
      position: 2,
    },
  ]);
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
  assert.strictEqual(updateQueuePositionsMock.mock.calls.length, 1);
  assert.deepStrictEqual(updateQueuePositionsMock.mock.calls[0].arguments, [
    { accountId: 2 },
  ]);
  assert.strictEqual(setConversationLabelsMock.mock.calls.length, 1);
  assert.deepStrictEqual(setConversationLabelsMock.mock.calls[0].arguments[2], [CONVO_LABELS.waiting]);
  assert.strictEqual(
    sendBotMessageMock.mock.calls[0].arguments[2],
    'All human agents are currently busy. Please wait for the next available agent. You are currently number 2 in the queue.'
  );
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 2,
  });
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook queues request when agents offline', async () => {
  getNextAgentMock.mock.mockImplementationOnce(async () => ({
    agent: null,
    availabilitySummary: { online: 0, busy: 0, offline: 4 },
  }));
  getConversationMock.mock.mockImplementationOnce(async () => ({
    id: 3,
    status: 'resolved',
    inbox_id: 1,
  }));
  updateQueuePositionsMock.mock.mockImplementationOnce(async () => [
    {
      conversationKey: 'chatwoot:3:1:3',
      conversationId: 3,
      accountId: 3,
      inboxId: 1,
      requestedAt: new Date(),
      status: 'pending',
      agentId: null,
      lastPositionNotified: 1,
      position: 1,
    },
  ]);
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 3,
        message_type: 0,
        content: 'Is a human available?',
        account: { id: 3 },
        conversation: { id: 3, inbox_id: 1, status: 'resolved', account_id: 3 },
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
  assert.deepStrictEqual(enqueueRequestMock.mock.calls[0].arguments, [3, 3, undefined, undefined, 1]);
  assert.strictEqual(updateQueuePositionsMock.mock.calls.length, 1);
  assert.deepStrictEqual(updateQueuePositionsMock.mock.calls[0].arguments, [
    { accountId: 3 },
  ]);
  assert.strictEqual(setConversationLabelsMock.mock.calls.length, 1);
  assert.deepStrictEqual(setConversationLabelsMock.mock.calls[0].arguments[2], [CONVO_LABELS.waiting]);
  assert.strictEqual(
    sendBotMessageMock.mock.calls[0].arguments[2],
    'No human agents are currently available. Please try again later. You are currently number 1 in the queue.'
  );
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 3,
  });
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook sends fallback when enqueueRequest fails', async () => {
  getNextAgentMock.mock.mockImplementationOnce(async () => ({
    agent: { id: 10, role: 'agent', availability_status: 'online' },
    availabilitySummary: { online: 1, busy: 0, offline: 0 },
  }));
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
  getNextAgentMock.mock.mockImplementationOnce(async () => ({
    agent: { id: 10, role: 'agent', availability_status: 'online' },
    availabilitySummary: { online: 1, busy: 0, offline: 0 },
  }));
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

test('chatwoot webhook processes attachment-only message', async () => {
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 701,
        message_type: 0,
        content: null,
        attachments: [
          {
            file_name: 'invoice.pdf',
            file_type: 'application/pdf',
            data_url: 'https://example.com/invoice.pdf',
          },
        ],
        account: { id: 7 },
        conversation: {
          id: 7,
          inbox_id: 1,
          status: 'resolved',
          account_id: 7,
        },
      },
    },
  };
  const history = [
    toResponseMessage('user', 'hi there'),
    toResponseMessage('assistant', 'hi'),
  ];
  getConversationHistoryMock.mock.mockImplementationOnce(async () => history);
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const result = await res.json();
  assert.strictEqual(res.status, 200);
  assert.notStrictEqual(result.status, 'ignored');
  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.ok(prisma.conversationMessage.upsert.mock.calls.length > 0);
  const storedMessage = prisma.conversationMessage.upsert.mock.calls[0].arguments[0];
  assert.match(storedMessage.create.content, /Attachment: invoice\.pdf/);
  resetMocks();
});

test('chatwoot webhook forwards image attachments to vision models', async () => {
  process.env.CHATWOOT_WEBHOOK_MODEL = 'gpt-4o';
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 801,
        message_type: 0,
        content: 'Check this image',
        attachments: [
          {
            file_name: 'cat.png',
            file_type: 'image/png',
            data_url: 'https://example.com/cat.png',
          },
        ],
        account: { id: 8 },
        conversation: {
          id: 8,
          inbox_id: 1,
          status: 'resolved',
          account_id: 8,
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

  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  const userMessages = providerMessages.filter((m) => m.role === 'user');
  const lastUser = userMessages[userMessages.length - 1];
  const imageItems = lastUser.content.filter((item) => item.type === 'input_image');
  assert.strictEqual(imageItems.length, 1);
  assert.deepStrictEqual(imageItems[0], {
    type: 'input_image',
    image_url: 'https://example.com/cat.png',
    detail: 'auto',
  });
  const storedContent =
    prisma.conversationMessage.upsert.mock.calls[0].arguments[0].create.content;
  assert.ok(
    storedContent.includes(
      'Attachment: cat.png (image/png | https://example.com/cat.png)'
    )
  );
  delete process.env.CHATWOOT_WEBHOOK_MODEL;
  resetMocks();
});

test('chatwoot webhook handles image mime without filename for vision models', async () => {
  process.env.CHATWOOT_WEBHOOK_MODEL = 'gpt-4o';
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 811,
        message_type: 0,
        content: 'Screenshot attached',
        attachments: [
          {
            file_type: 'image',
            download_url: 'https://example.com/screenshot.jpeg',
          },
        ],
        account: { id: 8 },
        conversation: {
          id: 8,
          inbox_id: 1,
          status: 'resolved',
          account_id: 8,
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

  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  const userMessages = providerMessages.filter((m) => m.role === 'user');
  const lastUser = userMessages[userMessages.length - 1];
  const imageItems = lastUser.content.filter((item) => item.type === 'input_image');
  assert.strictEqual(imageItems.length, 1);
  assert.deepStrictEqual(imageItems[0], {
    type: 'input_image',
    image_url: 'https://example.com/screenshot.jpeg',
    detail: 'auto',
  });
  const storedContent =
    prisma.conversationMessage.upsert.mock.calls[0].arguments[0].create.content;
  assert.ok(
    storedContent.includes(
      'Attachment: Image attachment (image | https://example.com/screenshot.jpeg)'
    )
  );
  delete process.env.CHATWOOT_WEBHOOK_MODEL;
  resetMocks();
});

test('chatwoot webhook downloads remote images for vision models', async () => {
  process.env.CHATWOOT_WEBHOOK_MODEL = 'gpt-4o';
  fetchAttachmentImageMock.mock.mockImplementationOnce(
    async () => 'data:image/png;base64,abc123'
  );
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 811,
        message_type: 0,
        content: 'Remote image',
        attachments: [
          {
            file_name: 'cat.png',
            file_type: 'image/png',
            download_url: 'https://example.com/cat.png',
          },
        ],
        account: { id: 8 },
        conversation: {
          id: 8,
          inbox_id: 1,
          status: 'resolved',
          account_id: 8,
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

  assert.strictEqual(fetchAttachmentImageMock.mock.calls.length, 1);
  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  const userMessages = providerMessages.filter((m) => m.role === 'user');
  const lastUser = userMessages[userMessages.length - 1];
  const imageItems = lastUser.content.filter((item) => item.type === 'input_image');
  assert.strictEqual(imageItems.length, 1);
  assert.match(imageItems[0].image_url, /^data:image\//);

  delete process.env.CHATWOOT_WEBHOOK_MODEL;
  resetMocks();
});

test('chatwoot webhook rejects object image_url payloads before provider call', async () => {
  process.env.CHATWOOT_WEBHOOK_MODEL = 'gpt-4o';
  getConversationHistoryMock.mock.mockImplementationOnce(async () => [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: 'Legacy attachment shape' },
        { type: 'input_image', image_url: { url: 'https://example.com/legacy.png' } },
      ],
    },
  ]);

  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 900,
        message_type: 0,
        content: 'Checking legacy content',
        attachments: [],
        account: { id: 9 },
        conversation: {
          id: 9,
          inbox_id: 1,
          status: 'resolved',
          account_id: 9,
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
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  assert.strictEqual(providerFnMock.mock.calls.length, 0);
  assert.ok(sendBotMessageMock.mock.calls.length >= 1);

  delete process.env.CHATWOOT_WEBHOOK_MODEL;
  resetMocks();
});

test('chatwoot webhook stores attachment note when model lacks vision', async () => {
  process.env.CHATWOOT_WEBHOOK_MODEL = 'gpt-3.5-turbo';
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 802,
        message_type: 0,
        content: 'Please review the document',
        attachments: [
          {
            file_name: 'report.pdf',
            file_type: 'application/pdf',
            download_url: 'https://example.com/report.pdf',
          },
        ],
        account: { id: 9 },
        conversation: {
          id: 9,
          inbox_id: 1,
          status: 'resolved',
          account_id: 9,
        },
      },
    },
  };

  const expectedNote =
    'Attachment: report.pdf (application/pdf | https://example.com/report.pdf)';
  getConversationHistoryMock.mock.mockImplementationOnce(async () => [
    toResponseMessage(
      'user',
      `Please review the document\n\n${expectedNote}`
    ),
  ]);

  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const res = await webhookPost(req);
  await res.json();

  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  const userMessages = providerMessages.filter((m) => m.role === 'user');
  const lastUser = userMessages[userMessages.length - 1];
  assert.strictEqual(
    lastUser.content.every((item) => item.type !== 'input_image'),
    true
  );
  const storedContent =
    prisma.conversationMessage.upsert.mock.calls[0].arguments[0].create.content;
  assert.ok(storedContent.includes(expectedNote));
  const textSegments = lastUser.content
    .filter((item) => item.type !== 'input_image')
    .map((item) => item.text);
  assert.ok(textSegments.some((text) => text.includes(expectedNote)));
  delete process.env.CHATWOOT_WEBHOOK_MODEL;
  resetMocks();
});

test('chatwoot webhook estimates tokens before selecting provider', async () => {
  process.env.CHATWOOT_WEBHOOK_PROVIDER = 'openai';
  process.env.CHATWOOT_OPENAI_TOKEN_LIMIT = '5000';

  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 702,
        message_type: 0,
        content: 'Token order test',
        account: { id: 9 },
        conversation: { id: 9, inbox_id: 1, status: 'resolved', account_id: 9 },
      },
    },
  };

  const history = [
    toResponseMessage('user', 'Earlier question'),
    toResponseMessage('assistant', 'Earlier answer'),
    toResponseMessage('user', 'Token order test'),
  ];
  getConversationHistoryMock.mock.mockImplementationOnce(async () => history);

  const order = [];
  estimateMessageTokensMock.mock.mockImplementation((...args) => {
    order.push('tokens');
    return originalEstimateMessageTokens(...args);
  });
  getProviderMock.mock.mockImplementationOnce(() => {
    order.push('provider');
    return providerFnMock;
  });

  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();

  assert(order.includes('provider'));
  const providerIndex = order.indexOf('provider');
  const firstTokenIndex = order.indexOf('tokens');
  assert.notStrictEqual(providerIndex, -1);
  assert.notStrictEqual(firstTokenIndex, -1);
  assert(firstTokenIndex <= providerIndex);
  resetMocks();
});

test('chatwoot webhook trims history to provider token limit', async () => {
  process.env.CHATWOOT_WEBHOOK_PROVIDER = 'openai';
  process.env.CHATWOOT_OPENAI_TOKEN_LIMIT = '400';

  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 703,
        message_type: 0,
        content: 'Latest update from customer',
        account: { id: 10 },
        conversation: { id: 10, inbox_id: 1, status: 'resolved', account_id: 10 },
      },
    },
  };

  const oldestMarker = 'Oldest entry that should be trimmed';
  const history = [toResponseMessage('user', oldestMarker)];
  for (let i = 0; i < 8; i += 1) {
    history.push(
      toResponseMessage('assistant', `Assistant turn ${i} ${'a'.repeat(900)}`)
    );
    history.push(
      toResponseMessage('user', `User turn ${i} ${'b'.repeat(900)}`)
    );
  }
  history.push(toResponseMessage('user', 'Latest update from customer'));
  getConversationHistoryMock.mock.mockImplementationOnce(async () => history);

  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  await res.json();

  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  const limit = Number.parseInt(process.env.CHATWOOT_OPENAI_TOKEN_LIMIT, 10);
  const tokenCount = originalEstimateMessageTokens(providerMessages, MODEL);
  assert(tokenCount <= limit, `token count ${tokenCount} should be <= ${limit}`);

  const flattened = providerMessages
    .map((msg) => {
      if (Array.isArray(msg?.content)) {
        return msg.content.map((part) => part?.text || '').join(' ');
      }
      if (typeof msg?.content === 'string') {
        return msg.content;
      }
      return '';
    })
    .join(' ');

  assert.ok(!flattened.includes(oldestMarker));
  assert.ok(flattened.includes('Latest update from customer'));
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

test('chatwoot webhook skips relevance guardrail for image-only attachments', async () => {
  process.env.CHATWOOT_WEBHOOK_MODEL = 'gpt-4o';
  const observedSearchQueries = [];
  searchKnowledgeBaseMock.mock.mockImplementationOnce(
    async ({ query, queries }) => {
      const requested = [
        query,
        ...(Array.isArray(queries) ? queries : []),
      ].filter((value) => typeof value === 'string' && value);
      observedSearchQueries.push(...requested);

      if (requested[0] === 'autoflex cable 25mm') {
        return {
          results: [
            {
              text: 'Autoflex Cable, H07V-K-1Cx25mm², 29226, Helukabel',
              attributes: {
                title: 'Autoflex Cable Product',
                url: 'https://store.automationghana.com/product/autoflex',
              },
              score: 0.92,
            },
          ],
        };
      }

      return { results: [] };
    }
  );

  gatherImageInsightsMock.mock.mockImplementationOnce(async () => {
    const queries = ['autoflex cable 25mm', 'helukabel'];
    const searchResult = await searchKnowledgeBase({
      query: queries[0],
      queries: queries.slice(1),
      provider: 'docs',
      limit: 3,
    });

    const knowledgeBaseMatches = (searchResult.results ?? []).map((entry) => ({
      title:
        entry.attributes?.title ?? entry.title ?? 'Autoflex Cable Product',
      snippet:
        entry.text ??
        entry.snippet ??
        entry.attributes?.summary ??
        'Autoflex Cable, H07V-K-1Cx25mm², 29226, Helukabel',
      url: entry.attributes?.url ?? entry.url ?? undefined,
      score: typeof entry.score === 'number' ? entry.score : undefined,
    }));

    const fallbackMatch = {
      title: 'Autoflex Cable Product',
      snippet: 'Autoflex Cable, H07V-K-1Cx25mm², 29226, Helukabel',
      url: 'https://store.automationghana.com/product/autoflex',
      score: 0.92,
    };
    const topMatch = knowledgeBaseMatches[0] ?? fallbackMatch;

    const detailParts = [topMatch.snippet];
    if (topMatch.url) {
      detailParts.push(`URL: ${topMatch.url}`);
    }
    if (typeof topMatch.score === 'number') {
      detailParts.push(`score=${topMatch.score.toFixed(3)}`);
    }

    return {
      userPromptSupplement:
        'Image summary: Autoflex cable\nNotable attributes: 25mm, copper',
      developerNote: [
        'Image analysis context:',
        '- Summary: Autoflex cable',
        '- Attributes: 25mm, copper',
        `- Suggested queries: ${queries.join(', ')}`,
        'Relevant knowledge base matches (most similar first):',
        `  1. ${topMatch.title}`,
        `     ${detailParts.join(' | ')}`,
        'Use these matches to recommend the closest product or share alternatives.',
      ].join('\n'),
      description: 'Autoflex cable',
      queries,
      knowledgeBaseMatches,
    };
  });
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 8123,
        message_type: 0,
        content: '',
        attachments: [
          {
            file_name: 'photo.jpg',
            file_type: 'image/jpeg',
            data_url: 'data:image/jpeg;base64,AAAAAAAAAAAAAAAAAAAA',
          },
        ],
        account: { id: 18 },
        conversation: {
          id: 28,
          inbox_id: 1,
          status: 'resolved',
          account_id: 18,
        },
      },
    },
  };
  const history = [
    toResponseMessage('assistant', 'Please share a photo of the issue.'),
  ];
  getConversationHistoryMock.mock.mockImplementationOnce(async () => history);
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const res = await webhookPost(req);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.notStrictEqual(body.status, 'guardrail');
  assert.strictEqual(runRelevanceGuardrailMock.mock.calls.length, 0);
  assert.strictEqual(runJailbreakGuardrailMock.mock.calls.length, 1);
  assert.strictEqual(getProviderMock.mock.calls.length, 1);
  assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
  assert.deepStrictEqual(observedSearchQueries, [
    'autoflex cable 25mm',
    'helukabel',
  ]);
  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  const lastUserMessage = providerMessages.find(
    (message) => message.role === 'user'
  );
  assert.ok(lastUserMessage);
  const userTextItems = lastUserMessage.content.filter(
    (item) => item.type === 'input_text'
  );
  assert.ok(
    userTextItems.some((item) =>
      item.text.includes('Image summary: Autoflex cable')
    )
  );
  assert.ok(
    lastUserMessage.content.some((item) => item.type === 'input_image')
  );
  const developerMessages = providerMessages.filter(
    (message) => message.role === 'developer'
  );
  assert.ok(developerMessages.length >= 1);
  assert.ok(
    developerMessages.some((msg) =>
      msg.content.some((item) =>
        item.type === 'input_text' &&
        item.text.includes('Image analysis context')
      )
    )
  );
  assert.ok(
    developerMessages.some((msg) =>
      msg.content.some((item) =>
        item.type === 'input_text' &&
        item.text.includes('Autoflex Cable Product')
      )
    )
  );
  const storedMessage =
    prisma.conversationMessage.upsert.mock.calls[0].arguments[0];
  assert.match(storedMessage.create.content, /Attachment: photo\.jpg/);
  assert.ok(gatherImageInsightsMock.mock.calls.length >= 1);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook truncates long image insight queries before searching knowledge base', async () => {
  const observedSearchQueries = [];
  searchKnowledgeBaseMock.mock.mockImplementationOnce(
    async ({ query, queries }) => {
      const requested = [
        query,
        ...(Array.isArray(queries) ? queries : []),
      ].filter((value) => typeof value === 'string' && value);
      observedSearchQueries.push(...requested);
      return { results: [] };
    }
  );

  const longDescription =
    'High resolution product photo featuring the limited edition industrial grade torque wrench with adjustable head and ergonomic grip for maintenance crews across facilities.';

  gatherImageInsightsMock.mock.mockImplementationOnce(
    async ({ knowledgeBaseProvider, maxKnowledgeBaseResults }) => {
      await searchKnowledgeBase({
        query: undefined,
        queries: [longDescription],
        provider: knowledgeBaseProvider ?? 'docs-provider',
        limit: maxKnowledgeBaseResults ?? 3,
      });

      return {
        description: longDescription,
        queries: [longDescription],
        knowledgeBaseMatches: [],
      };
    }
  );

  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 5678,
        message_type: 0,
        content: '',
        attachments: [
          {
            file_name: 'product.jpg',
            file_type: 'image/jpeg',
            data_url: 'data:image/jpeg;base64,BBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          },
        ],
        account: { id: 52 },
        conversation: {
          id: 72,
          inbox_id: 1,
          status: 'open',
          account_id: 52,
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

  assert.strictEqual(res.status, 200);
  assert.notStrictEqual(body.status, 'guardrail');
  assert.ok(gatherImageInsightsMock.mock.calls.length >= 1);
  assert.ok(observedSearchQueries.length >= 1);

  const expectedSegments = normalizeQueryLengths([longDescription]);
  assert.deepStrictEqual(
    observedSearchQueries.slice(0, expectedSegments.length),
    expectedSegments
  );
  assert.ok(observedSearchQueries.every((query) => query.length <= Infinity));

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

test('chatwoot webhook merges referenced context with image insights', async () => {
  process.env.CHATWOOT_WEBHOOK_MODEL = 'gpt-4o';
  process.env.CHATWOOT_WEBHOOK_PROVIDER = 'docs';

  let guardrailInput;
  runRelevanceGuardrailMock.mock.mockImplementationOnce(async ({ input }) => {
    guardrailInput = input;
    return { tripwireTriggered: false, outputInfo: { relevant: true } };
  });

  const referencedMessageId = 9870;
  const referencedContent = 'Please confirm the XR-2000 motor replacement we discussed.';
  redis.exists.mock.mockImplementationOnce(async () => 1);
  redis.lrange.mock.mockImplementationOnce(async () => [
    JSON.stringify({
      messageId: referencedMessageId,
      sender: 'contact',
      content: referencedContent,
    }),
  ]);
  getConversationHistoryMock.mock.mockImplementationOnce(async () => [
    toResponseMessage('assistant', 'Can you send a photo of the damaged unit?'),
  ]);

  const knowledgeBaseMatches = [
    {
      title: 'XR-2000 Motor Datasheet',
      snippet: 'Official specifications for the XR-2000 industrial motor.',
      url: 'https://example.com/xr-2000',
      score: 0.89,
    },
  ];
  const dedupedQueries = ['xr-2000 industrial motor', 'replacement motor assembly'];

  let observedSearchArgs;
  searchKnowledgeBaseMock.mock.mockImplementationOnce(async (args) => {
    observedSearchArgs = args;
    return { results: knowledgeBaseMatches };
  });

  gatherImageInsightsMock.mock.mockImplementationOnce(
    async ({ knowledgeBaseProvider, maxKnowledgeBaseResults }) => {
      const rawQueries = [...dedupedQueries, dedupedQueries[0]];
      const uniqueQueries = Array.from(new Set(rawQueries));
      assert.deepStrictEqual(uniqueQueries, dedupedQueries);

      await searchKnowledgeBase({
        query: uniqueQueries[0],
        queries: uniqueQueries.slice(1),
        provider: knowledgeBaseProvider,
        limit: maxKnowledgeBaseResults,
      });

      const developerNote = [
        'Image analysis context:',
        '- Summary: XR-2000 motor assembly',
        '- Attributes: cracked casing',
        `- Suggested queries: ${uniqueQueries.join(', ')}`,
        'Relevant knowledge base matches (most similar first):',
        `  1. ${knowledgeBaseMatches[0].title}`,
        `     ${knowledgeBaseMatches[0].snippet}`,
        'Use these matches to confirm the correct replacement part.',
      ].join('\n');

      return {
        userPromptSupplement:
          'Image summary: XR-2000 motor assembly\nNotable attributes: cracked casing',
        developerNote,
        description: 'XR-2000 motor assembly',
        queries: uniqueQueries,
        knowledgeBaseMatches,
      };
    }
  );

  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 6543,
        message_type: 0,
        content: 'Here is the photo you requested.',
        content_attributes: { in_reply_to: referencedMessageId },
        attachments: [
          {
            file_name: 'motor.jpg',
            file_type: 'image/jpeg',
            data_url: 'data:image/jpeg;base64,CCCCCCCCCCCCCCCCCCCC',
          },
        ],
        account: { id: 64 },
        conversation: {
          id: 91,
          inbox_id: 1,
          status: 'resolved',
          account_id: 64,
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

  assert.strictEqual(res.status, 200);
  assert.strictEqual(runRelevanceGuardrailMock.mock.calls.length, 1);
  assert.ok(guardrailInput);

  const turns = JSON.parse(guardrailInput);
  const lastTurn = turns[turns.length - 1];
  assert.strictEqual(lastTurn.role, 'user');
  assert.ok(lastTurn.content.includes(referencedContent));
  assert.ok(lastTurn.content.includes('Image summary: XR-2000 motor assembly'));

  const providerMessages = providerFnMock.mock.calls[0].arguments[0];
  const developerEntry = providerMessages.find(
    (message) =>
      message.role === 'developer' &&
      message.content.some((item) =>
        typeof item?.text === 'string' && item.text.includes('Image analysis context:')
      )
  );
  assert.ok(developerEntry);
  assert.ok(
    developerEntry.content.some(
      (item) => typeof item?.text === 'string' && item.text.includes('XR-2000 Motor Datasheet')
    )
  );

  const userEntry = providerMessages.find(
    (message) => message.role === 'user' && Array.isArray(message.content)
  );
  assert.ok(userEntry);
  assert.ok(userEntry.content.some((item) => item?.type === 'input_image'));
  assert.ok(
    userEntry.content.some(
      (item) =>
        item?.type === 'input_text' &&
        typeof item.text === 'string' &&
        item.text.includes('Customer referenced:')
    )
  );

  assert.ok(observedSearchArgs);
  assert.strictEqual(observedSearchArgs.query, dedupedQueries[0]);
  assert.deepStrictEqual(observedSearchArgs.queries, dedupedQueries.slice(1));

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
  assert.strictEqual(
    sendBotMessageMock.mock.calls[0].arguments[2],
    RELEVANCE_FOLLOW_UP_MESSAGE
  );
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 901,
  });
  assert.strictEqual(getProviderMock.mock.calls.length, 0);
  assertLoggedIds(1);
  resetMocks();
});

test('chatwoot webhook rejects after clarification when relevance guardrail triggers again', async () => {
  runRelevanceGuardrailMock.mock.mockImplementation(async () => ({
    tripwireTriggered: true,
  }));
  getConversationHistoryMock.mock.mockImplementationOnce(async () => [
    toResponseMessage('assistant', RELEVANCE_FOLLOW_UP_MESSAGE),
  ]);
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 905,
        message_type: 0,
        content: 'still off topic',
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
  assert.strictEqual(
    sendBotMessageMock.mock.calls[0].arguments[2],
    RELEVANCE_REJECTION_MESSAGE
  );
  assert.deepStrictEqual(sendBotMessageMock.mock.calls[0].arguments[3], {
    private: false,
    inReplyTo: 905,
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
  assert.strictEqual(
    sendBotMessageMock.mock.calls[0].arguments[2],
    RELEVANCE_REJECTION_MESSAGE
  );
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

test('chatwoot webhook queues provider calls when concurrency exceeded', async () => {
  resetMocks();
  mock.timers.enable({ now: 0 });
  try {
    setLimiterConfigForTesting({
      openai: { concurrency: 1, tokensPerInterval: 5000, intervalMs: 1000, maxTokens: 5000 },
    });
    estimateMessageTokensMock.mock.mockImplementation(() => 200);

    const startTimes = [];
    const limiterTokensSeen = [];

    const waitFor = async (predicate, attempts = 50) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) {
          return true;
        }
        mock.timers.tick(0);
        await Promise.resolve();
      }
      return predicate();
    };

    getProviderMock.mock.mockImplementation(() => {
      return (messages, toolsArg, options) => {
        void messages;
        void toolsArg;
        limiterTokensSeen.push(options?.limiterTokens);
        return (async function* () {
          const stream = await scheduleProviderCall(
            'openai',
            options?.limiterTokens,
            async () => {
              startTimes.push(Date.now());
              await new Promise((resolve) => setTimeout(resolve, 100));
              return (async function* () {
                yield { event: 'response.output_text.delta', data: { delta: 'hi' } };
                yield { event: 'response.output_text.done', data: {} };
              })();
            }
          );
          for await (const event of stream) {
            yield event;
          }
        })();
      };
    });

    const buildPayload = (id) => ({
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id,
          message_type: 0,
          content: 'Queued request',
          account: { id: 16 },
          conversation: {
            id,
            inbox_id: 1,
            status: 'resolved',
            account_id: 16,
          },
        },
      },
    });

    const req1 = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(buildPayload(701)),
    });
    const req2 = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(buildPayload(702)),
    });

    const resPromise1 = webhookPost(req1);
    const resPromise2 = webhookPost(req2);

    await waitFor(() => getProviderMock.mock.calls.length >= 1);
    await waitFor(() => startTimes.length >= 1);
    assert.strictEqual(startTimes.length >= 1, true);
    const firstStart = startTimes[0];
    assert.strictEqual(firstStart, 0);

    for (let i = 0; i < 10; i += 1) {
      mock.timers.tick(0);
      await Promise.resolve();
      assert.strictEqual(startTimes.length, 1);
    }

    mock.timers.tick(100);
    const res1 = await resPromise1;
    await res1.json();

    await waitFor(() => startTimes.length >= 2);
    mock.timers.tick(100);
    const res2 = await resPromise2;
    await res2.json();

    assert.strictEqual(startTimes.length, 2);
    assert.ok(
      limiterTokensSeen.every((tokens) => tokens && typeof tokens.input === 'number')
    );
  } finally {
    mock.timers.reset();
    resetMocks();
  }
});

test('chatwoot webhook enforces token bucket delays', async () => {
  resetMocks();
  mock.timers.enable({ now: 0 });
  try {
    setLimiterConfigForTesting({
      openai: { concurrency: 3, tokensPerInterval: 60, intervalMs: 1000, maxTokens: 60 },
    });
    estimateMessageTokensMock.mock.mockImplementation(() => 40);

    const startTimes = [];

    const waitFor = async (predicate, attempts = 50) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) {
          return true;
        }
        mock.timers.tick(0);
        await Promise.resolve();
      }
      return predicate();
    };

    getProviderMock.mock.mockImplementation(() => {
      return (messages, toolsArg, options) => {
        void messages;
        void toolsArg;
        return (async function* () {
          const stream = await scheduleProviderCall(
            'openai',
            options?.limiterTokens,
            async () => {
              startTimes.push(Date.now());
              return (async function* () {
                yield { event: 'response.output_text.delta', data: { delta: 'hi' } };
                yield { event: 'response.output_text.done', data: {} };
              })();
            }
          );
          for await (const event of stream) {
            yield event;
          }
        })();
      };
    });

    const buildPayload = (id) => ({
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id,
          message_type: 0,
          content: 'Token bucket test',
          account: { id: 16 },
          conversation: {
            id,
            inbox_id: 1,
            status: 'resolved',
            account_id: 16,
          },
        },
      },
    });

    const req1 = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(buildPayload(801)),
    });
    const req2 = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(buildPayload(802)),
    });

    const resPromise1 = webhookPost(req1);
    const resPromise2 = webhookPost(req2);

    await waitFor(() => getProviderMock.mock.calls.length >= 1);
    await waitFor(() => startTimes.length >= 1);
    assert.strictEqual(startTimes.length >= 1, true);
    const firstStart = startTimes[0];
    assert.strictEqual(firstStart, 0);

    const res1 = await resPromise1;
    await res1.json();

    assert.strictEqual(startTimes.length, 1);

    mock.timers.tick(1000);
    await waitFor(() => startTimes.length >= 2);

    assert.strictEqual(startTimes.length, 2);
    assert.ok(startTimes[1] >= 1000);

    const res2 = await resPromise2;
    await res2.json();
  } finally {
    mock.timers.reset();
    resetMocks();
  }
});

test('chatwoot webhook avoids starving large token requests', async () => {
  resetMocks();
  mock.timers.enable({ now: 0 });
  const storedMessages = new Map();
  const originalUpsertImpl =
    prisma.conversationMessage.upsert.mock.originalImplementation;
  const originalHistoryImpl =
    getConversationHistoryMock.mock.originalImplementation;
  try {
    setLimiterConfigForTesting({
      openai: { concurrency: 1, tokensPerInterval: 10, intervalMs: 100, maxTokens: 50 },
    });
    prisma.conversationMessage.upsert.mock.mockImplementation(async (args) => {
      const conversationId = args?.create?.conversationId;
      const content = args?.create?.content;
      if (typeof conversationId === 'number' && typeof content === 'string') {
        storedMessages.set(conversationId, content);
      }
      return typeof originalUpsertImpl === 'function'
        ? originalUpsertImpl(args)
        : {};
    });

    getConversationHistoryMock.mock.mockImplementation(async (conversationKey) => {
      const keyParts = typeof conversationKey === 'string'
        ? conversationKey.split(':')
        : [];
      const conversationId = Number.parseInt(keyParts[keyParts.length - 1] ?? '', 10);
      const content = storedMessages.get(conversationId);
      if (typeof content === 'string' && content.length > 0) {
        return [toResponseMessage('user', content)];
      }
      return originalHistoryImpl
        ? originalHistoryImpl(conversationKey)
        : [];
    });

    estimateMessageTokensMock.mock.mockImplementation((messages) => {
      const latest = messages?.[messages.length - 1];
      const content = Array.isArray(latest?.content)
        ? latest.content.map((item) => item?.text ?? '').join(' ')
        : typeof latest?.content === 'string'
        ? latest.content
        : '';
      if (content.includes('Large job')) {
        return 50;
      }
      if (content.includes('Warmup')) {
        return 10;
      }
      return 10;
    });

    const startEvents = [];
    getProviderMock.mock.mockImplementation(() => {
      return (messages, toolsArg, options) => {
        void messages;
        void toolsArg;
        const limiterTokens = options?.limiterTokens ?? { input: 0, output: 0 };
        return (async function* () {
          const stream = await scheduleProviderCall(
            'openai',
            limiterTokens,
            async () => {
              const tokens = limiterTokens.input ?? 0;
              startEvents.push({ tokens, time: Date.now() });
              return (async function* () {
                yield { event: 'response.output_text.delta', data: { delta: 'hi' } };
                yield { event: 'response.output_text.done', data: {} };
              })();
            }
          );
          for await (const event of stream) {
            yield event;
          }
        })();
      };
    });

    const buildPayload = (id, content) => ({
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id,
          message_type: 0,
          content,
          account: { id: 16 },
          conversation: {
            id,
            inbox_id: 1,
            status: 'resolved',
            account_id: 16,
          },
        },
      },
    });

    const requestFor = (payload) =>
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

    const responses = [];
    responses.push(webhookPost(requestFor(buildPayload(801, 'Warmup request'))));
    responses.push(webhookPost(requestFor(buildPayload(802, 'Large job request'))));
    for (let i = 0; i < 4; i += 1) {
      responses.push(
        webhookPost(
          requestFor(buildPayload(803 + i, `Small follow up ${i}`))
        )
      );
    }

    await waitForLimiter(() => startEvents.length >= 1);
    assert.ok(startEvents[0].tokens < 50);

    await waitForLimiter(
      () => startEvents.filter((event) => event.tokens < 50).length >= 2,
      100,
      10
    );

    await waitForLimiter(
      () => startEvents.some((event) => event.tokens >= 50),
      500,
      10
    );

    const largeStart = startEvents.find((event) => event.tokens >= 50);
    assert.ok(largeStart, 'expected large limiter job to start');
    assert.ok(largeStart.time >= 500);
    const firstLargeIndex = startEvents.findIndex((event) => event.tokens >= 50);
    assert.ok(firstLargeIndex >= 1);

    await waitForLimiter(
      () => startEvents.length === responses.length,
      300,
      10
    );
    for (const responsePromise of responses) {
      const response = await responsePromise;
      await response.json();
    }
  } finally {
    mock.timers.reset();
    prisma.conversationMessage.upsert.mock.mockImplementation(
      typeof originalUpsertImpl === 'function'
        ? originalUpsertImpl
        : async () => ({})
    );
    getConversationHistoryMock.mock.mockImplementation(
      typeof originalHistoryImpl === 'function'
        ? originalHistoryImpl
        : async () => []
    );
    resetMocks();
  }
});

test('chatwoot webhook enqueues async job and delivers reply', async () => {
  resetMocks();
  setChatwootQueueEnabledForTesting(true);

  try {
    const payload = {
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id: 900,
          message_type: 0,
          content: 'Hello from queue',
          account: { id: 90 },
          conversation: {
            id: 90,
            inbox_id: 1,
            status: 'resolved',
            account_id: 90,
          },
        },
      },
    };
    const res = await webhookPost(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );

    assert.strictEqual(res.status, 202);
    const body = await res.json();
    assert.deepStrictEqual(body, { status: 'accepted' });

    assert.strictEqual(
      sendBotMessageMock.mock.calls.length,
      0,
      'job should run asynchronously'
    );

    await waitForChatwootQueueIdle();

    assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
    const [accountId, conversationId, content] =
      sendBotMessageMock.mock.calls[0].arguments;
    assert.strictEqual(accountId, 90);
    assert.strictEqual(conversationId, 90);
    assert.strictEqual(content, 'hi');
    assertLoggedIds(1);
  } finally {
    setChatwootQueueEnabledForTesting(false);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});

test('chatwoot webhook queue backlog does not delay responses', async () => {
  resetMocks();
  setChatwootQueueEnabledForTesting(true);

  try {
    let releaseFirstSend;
    let firstSendStarted = false;
    let firstSendResolved = false;
    const firstSendBarrier = new Promise((resolve) => {
      releaseFirstSend = resolve;
    });

    sendBotMessageMock.mock.mockImplementationOnce(async (...args) => {
      firstSendStarted = true;
      await firstSendBarrier;
      firstSendResolved = true;
      return defaultSendBotMessageImplementation(...args);
    });

    sendBotMessageMock.mock.mockImplementation(
      defaultSendBotMessageImplementation
    );

    const buildPayload = (id, content) => ({
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id,
          message_type: 0,
          content,
          account: { id },
          conversation: {
            id,
            inbox_id: 1,
            status: 'resolved',
            account_id: id,
          },
        },
      },
    });

    const resA = await webhookPost(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(buildPayload(901, 'First queued message')),
      })
    );
    const resB = await webhookPost(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(buildPayload(902, 'Second queued message')),
      })
    );

    assert.strictEqual(resA.status, 202);
    assert.strictEqual(resB.status, 202);
    assert.deepStrictEqual(await resA.json(), { status: 'accepted' });
    assert.deepStrictEqual(await resB.json(), { status: 'accepted' });

    assert.strictEqual(firstSendStarted, true, 'first job should have started');
    assert.strictEqual(
      firstSendResolved,
      false,
      'first job should have started but not completed yet'
    );

    const idlePromise = waitForChatwootQueueIdle();
    const raceResult = await Promise.race([
      idlePromise.then(() => 'idle'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 20)),
    ]);

    assert.strictEqual(
      raceResult,
      'pending',
      'queue should not finish first job before second payload is accepted'
    );

    releaseFirstSend();

    await idlePromise;

    await waitForChatwootQueueIdle();

    assert.strictEqual(sendBotMessageMock.mock.calls.length, 2);
    const firstCall = sendBotMessageMock.mock.calls[0].arguments;
    const secondCall = sendBotMessageMock.mock.calls[1].arguments;
    assert.strictEqual(firstCall[0], 901);
    assert.strictEqual(firstCall[1], 901);
    assert.strictEqual(secondCall[0], 902);
    assert.strictEqual(secondCall[1], 902);
  } finally {
    setChatwootQueueEnabledForTesting(false);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});

test('chatwoot webhook queue runs multiple conversations concurrently but preserves ordering per conversation', async () => {
  resetMocks();
  const originalConcurrency = getChatwootQueueConcurrency();
  setChatwootQueueEnabledForTesting(true);
  setChatwootQueueConcurrencyForTesting(2);
  const waitFor = async (predicate, attempts = 50, delayMs = 10) => {
    for (let i = 0; i < attempts; i += 1) {
      if (predicate()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return predicate();
  };

  const jobStarts = [];
  const jobResolvers = new Map();
  const nextOccurrences = new Map();

  const buildPayload = (conversationId, messageId, content) => ({
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: messageId,
        message_type: 0,
        content,
        account: { id: 77 },
        conversation: {
          id: conversationId,
          inbox_id: 1,
          status: 'open',
          account_id: 77,
        },
      },
    },
  });

  const requestFor = (payload) =>
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  const responses = [
    webhookPost(
      requestFor(
        buildPayload(1001, 5001, 'conversation-1-first')
      )
    ),
    webhookPost(requestFor(buildPayload(2001, 6001, 'conversation-2'))),
    webhookPost(
      requestFor(
        buildPayload(1001, 5002, 'conversation-1-second')
      )
    ),
  ];

  try {
    for (const responsePromise of responses) {
      const response = await responsePromise;
      assert.strictEqual(response.status, 202);
      assert.deepStrictEqual(await response.json(), { status: 'accepted' });
    }

    await waitForChatwootQueueIdle();

    jobStarts.length = 0;
    jobResolvers.clear();
    nextOccurrences.clear();

    const scheduleJob = (conversationId) => {
      enqueueChatwootJob(
        async () => {
          const convKey = String(conversationId);
          const occurrence = nextOccurrences.get(convKey) ?? 0;
          nextOccurrences.set(convKey, occurrence + 1);
          const key = `${convKey}:${occurrence}`;
          jobStarts.push({ conversationId: convKey, key });
          await new Promise((resolve) => {
            jobResolvers.set(key, () => {
              jobResolvers.delete(key);
              resolve();
            });
          });
        },
        { conversationId, accountId: conversationId },
        { persist: false }
      );
    };

    scheduleJob(1001);
    scheduleJob(2001);
    scheduleJob(1001);

    assert.ok(
      await waitFor(() => jobStarts.length >= 2, 600, 20),
      'expected first two jobs to begin running'
    );

    const firstTwo = jobStarts.slice(0, 2);
    assert.strictEqual(firstTwo.length, 2);
    assert.ok(
      firstTwo.some(
        (entry) => entry.conversationId === '1001' && entry.key === '1001:0'
      ),
      'expected first conversation job to start'
    );
    assert.ok(
      firstTwo.some(
        (entry) => entry.conversationId === '2001' && entry.key === '2001:0'
      ),
      'expected second conversation to start in parallel'
    );
    assert.ok(
      !firstTwo.some((entry) => entry.key === '1001:1'),
      'second job for same conversation should wait for the first to finish'
    );

    const releaseFirst = jobResolvers.get('1001:0');
    assert.ok(releaseFirst, 'expected resolver for first conversation job');
    releaseFirst?.();

    assert.ok(
      await waitFor(() => jobStarts.length >= 3, 600, 20),
      'expected third job to start after first conversation released'
    );

    const thirdEntry = jobStarts[2];
    assert.ok(thirdEntry, 'expected queued job to continue after first finished');
    assert.strictEqual(thirdEntry.conversationId, '1001');
    assert.strictEqual(thirdEntry.key, '1001:1');

    const releaseSecondConversation = jobResolvers.get('2001:0');
    assert.ok(
      releaseSecondConversation,
      'expected resolver for second conversation job'
    );
    releaseSecondConversation?.();

    const releaseSecondJob = jobResolvers.get('1001:1');
    assert.ok(
      releaseSecondJob,
      'expected resolver for second job in first conversation'
    );
    releaseSecondJob?.();

    await waitForChatwootQueueIdle();
  } finally {
    for (const release of [...jobResolvers.values()]) {
      try {
        release?.();
      } catch {
        // ignore resolver errors during cleanup
      }
    }
    jobResolvers.clear();
    try {
      await waitForChatwootQueueIdle();
    } catch {
      // ignore idle wait errors during cleanup
    }
    setChatwootQueueEnabledForTesting(false);
    resetChatwootQueueForTesting();
    setChatwootQueueConcurrencyForTesting(originalConcurrency);
    resetMocks();
  }
});

test('chatwoot queue logs lifecycle metrics for concurrent jobs', async () => {
  resetMocks();
  const consoleInfoMock = mock.method(console, 'info', () => {});
  const originalConcurrency = getChatwootQueueConcurrency();
  mock.timers.enable({ now: 0 });

  try {
    setChatwootQueueConcurrencyForTesting(2);

    const jobA = enqueueChatwootJob(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return 'A complete';
      },
      { conversationId: 'conv-a', accountId: 'acct-a' },
      { persist: false }
    );

    const jobB = enqueueChatwootJob(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return 'B complete';
      },
      { conversationId: 'conv-b', accountId: 'acct-b' },
      { persist: false }
    );

    const jobC = enqueueChatwootJob(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'C complete';
      },
      { conversationId: 'conv-a', accountId: 'acct-a' },
      { persist: false }
    );

    const advance = async (ms = 0) => {
      mock.timers.tick(ms);
      await Promise.resolve();
    };

    await advance(0);
    await advance(15);
    await jobA.done;
    await advance(0);
    await advance(5);
    await jobC.done;
    await advance(10);
    await jobB.done;

    await waitForChatwootQueueIdle();

    const jobEvents = consoleInfoMock.mock.calls
      .filter((call) => call.arguments[0] === 'chatwoot webhook job event')
      .map((call) => call.arguments[1]);

    assert.strictEqual(jobEvents.length, 9);

    const eventsByJob = (jobId) =>
      jobEvents.filter((event) => event.jobId === jobId && event.phase !== undefined);

    const phasesFor = (jobId) => eventsByJob(jobId).map((event) => event.phase);

    assert.deepStrictEqual(phasesFor(jobA.id), ['queued', 'started', 'completed']);
    assert.deepStrictEqual(phasesFor(jobB.id), ['queued', 'started', 'completed']);
    assert.deepStrictEqual(phasesFor(jobC.id), ['queued', 'started', 'completed']);

    const startedEventC = eventsByJob(jobC.id).find((event) => event.phase === 'started');
    assert.ok(startedEventC, 'expected jobC started event');
    assert.ok(
      typeof startedEventC.waitMs === 'number' && startedEventC.waitMs >= 15,
      'expected jobC wait time to reflect queued delay'
    );

    const completedEventA = eventsByJob(jobA.id).find((event) => event.phase === 'completed');
    assert.ok(completedEventA, 'expected jobA completed event');
    assert.ok(
      typeof completedEventA.runtimeMs === 'number' && completedEventA.runtimeMs >= 15,
      'expected jobA runtime to be recorded'
    );

    const completedEventB = eventsByJob(jobB.id).find((event) => event.phase === 'completed');
    assert.ok(completedEventB, 'expected jobB completed event');
    assert.ok(
      typeof completedEventB.runtimeMs === 'number' && completedEventB.runtimeMs >= 30,
      'expected jobB runtime to be recorded'
    );

    for (const event of jobEvents) {
      assert.ok(typeof event.queueLength === 'number');
      assert.ok(typeof event.activeWorkers === 'number');
      assert.strictEqual(event.accountId, event.metadata?.accountId);
      assert.strictEqual(event.conversationId, event.metadata?.conversationId);
    }
  } finally {
    consoleInfoMock.mock.restore();
    mock.timers.reset();
    setChatwootQueueConcurrencyForTesting(originalConcurrency);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});

test('chatwoot webhook job emits phase timing logs for queued processing', async () => {
  resetMocks();
  const consoleInfoMock = mock.method(console, 'info', () => {});
  mock.timers.enable({ now: 0 });
  setChatwootQueueEnabledForTesting(true);

  try {
    const payload = {
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id: 9901,
          message_type: 0,
          content: 'Phase timing request',
          account: { id: 9901 },
          conversation: {
            id: 9901,
            inbox_id: 1,
            status: 'resolved',
            account_id: 9901,
          },
        },
      },
    };

    const response = await webhookPost(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );

    assert.strictEqual(response.status, 202);
    assert.deepStrictEqual(await response.json(), { status: 'accepted' });

    await waitForChatwootQueueIdle();

    const phaseEvents = consoleInfoMock.mock.calls
      .filter((call) => call.arguments[0] === 'chatwoot webhook job phase')
      .map((call) => call.arguments[1]);

    const expectedPhases = [
      'payload-normalization',
      'attachment-insight',
      'history-retrieval',
      'guardrail-evaluation',
      'provider-execution',
      'chatwoot-postback',
    ];

    const jobIds = new Set(phaseEvents.map((event) => event.jobId));
    assert.strictEqual(jobIds.size, 1, 'expected single job id for phase logs');

    for (const phase of expectedPhases) {
      const starts = phaseEvents.filter(
        (event) => event.phase === phase && event.event === 'start'
      );
      const completes = phaseEvents.filter(
        (event) => event.phase === phase && event.event === 'complete'
      );
      assert.ok(starts.length >= 1, `expected start log for phase ${phase}`);
      assert.ok(completes.length >= 1, `expected completion log for phase ${phase}`);
      for (const event of [...starts, ...completes]) {
        assert.strictEqual(typeof event.elapsedMs, 'number');
      }
      for (const event of completes) {
        assert.strictEqual(typeof event.phaseMs, 'number');
      }
    }
  } finally {
    consoleInfoMock.mock.restore();
    mock.timers.reset();
    setChatwootQueueEnabledForTesting(false);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});

test('chatwoot webhook phase logs persist across provider retries', async () => {
  resetMocks();
  const consoleInfoMock = mock.method(console, 'info', () => {});
  mock.timers.enable({ now: 0 });

  try {
    setChatwootQueueEnabledForTesting(true);
    setChatwootQueueRetryConfigForTesting({
      maxAttempts: 2,
      baseDelayMs: 10,
      maxDelayMs: 10,
      backoffFactor: 1,
    });

    let attempt = 0;
    providerFnMock.mock.mockImplementation(() =>
      (async function* () {
        attempt += 1;
        if (attempt === 1) {
          throw new ProviderRetryError('transient', {
            provider: 'openai',
            status: 503,
            attempts: attempt,
            retriesExhausted: false,
            retryable: true,
          });
        }
        yield { event: 'response.output_text.delta', data: { delta: 'hello again' } };
      })()
    );

    const payload = {
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id: 9902,
          message_type: 0,
          content: 'Retry timing request',
          account: { id: 9902 },
          conversation: {
            id: 9902,
            inbox_id: 1,
            status: 'resolved',
            account_id: 9902,
          },
        },
      },
    };

    const response = await webhookPost(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
    assert.strictEqual(response.status, 202);
    assert.deepStrictEqual(await response.json(), { status: 'accepted' });

    await tickAndFlush(1);
    await tickAndFlush(10);
    await tickAndFlush();
    const reachedTwoStarts = await waitForLimiter(
      () =>
        consoleInfoMock.mock.calls.filter(
          (call) =>
            call.arguments[0] === 'chatwoot webhook job phase' &&
            call.arguments[1]?.phase === 'provider-execution' &&
            call.arguments[1]?.event === 'start'
        ).length >= 2,
      20,
      1
    );
    assert.ok(reachedTwoStarts, 'expected provider execution phase to retry');
    await waitForChatwootQueueIdle();

    const phaseEvents = consoleInfoMock.mock.calls
      .filter((call) => call.arguments[0] === 'chatwoot webhook job phase')
      .map((call) => call.arguments[1]);

    const providerStarts = phaseEvents.filter(
      (event) => event.phase === 'provider-execution' && event.event === 'start'
    );
    const providerCompletes = phaseEvents.filter(
      (event) => event.phase === 'provider-execution' && event.event === 'complete'
    );

    assert.ok(
      providerStarts.length >= 2,
      'expected provider execution phase to start at least twice'
    );
    assert.ok(
      providerCompletes.length >= 2,
      'expected provider execution phase to complete after retries'
    );

    const jobIds = new Set(providerStarts.map((event) => event.jobId));
    assert.strictEqual(jobIds.size, 1, 'expected retry attempts to share a job id');

    for (const event of phaseEvents) {
      assert.strictEqual(typeof event.elapsedMs, 'number');
      if (event.event === 'complete') {
        assert.strictEqual(typeof event.phaseMs, 'number');
      }
    }
  } finally {
    consoleInfoMock.mock.restore();
    mock.timers.reset();
    setChatwootQueueEnabledForTesting(false);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});

test('chatwoot queue retries transient errors before succeeding', async () => {
  resetMocks();
  try {
    setChatwootQueueRetryConfigForTesting({
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 10,
      backoffFactor: 1,
    });
    const failureReporter = mock.fn();
    setChatwootQueueFailureReporter(failureReporter);

    let attempt = 0;
    const job = enqueueChatwootJob(
      async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new ProviderRetryError('Transient failure', {
            provider: 'openai',
            status: 503,
            attempts: attempt,
            retriesExhausted: false,
            retryable: true,
          });
        }
        return 'success';
      },
      { conversationId: 'retry-test', accountId: 'retry-test' },
      { persist: false }
    );

    const result = await job.done;
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempt, 2);
    assert.strictEqual(failureReporter.mock.calls.length, 0);
    await waitForChatwootQueueIdle();
  } finally {
    setChatwootQueueFailureReporter(undefined);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});

test('chatwoot queue times out long-running jobs and frees queued work', async () => {
  resetMocks();
  const originalConcurrency = getChatwootQueueConcurrency();
  try {
    setChatwootQueueConcurrencyForTesting(1);
    setChatwootQueueJobTimeoutForTesting(50);
    setChatwootQueueRetryConfigForTesting({
      maxAttempts: 3,
      baseDelayMs: 40,
      maxDelayMs: 40,
      backoffFactor: 1,
    });
    const failureReporter = mock.fn();
    setChatwootQueueFailureReporter(failureReporter);

    const startOrder = [];
    let attemptA = 0;
    const jobA = enqueueChatwootJob(
      async () => {
        attemptA += 1;
        startOrder.push(`A${attemptA}`);
        if (attemptA === 1) {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        return 'A recovered';
      },
      { conversationId: 'A', accountId: 'A' },
      { persist: false }
    );

    let attemptB = 0;
    const jobB = enqueueChatwootJob(
      async () => {
        attemptB += 1;
        startOrder.push(`B${attemptB}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'B done';
      },
      { conversationId: 'B', accountId: 'B' },
      { persist: false }
    );

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepStrictEqual(startOrder.slice(0, 2), ['A1', 'B1']);

    const [resultA, resultB] = await Promise.all([jobA.done, jobB.done]);
    assert.strictEqual(resultA, 'A recovered');
    assert.strictEqual(resultB, 'B done');
    assert.deepStrictEqual(startOrder, ['A1', 'B1', 'A2']);
    assert.strictEqual(failureReporter.mock.calls.length, 0);
    assert.strictEqual(attemptA, 2);
    assert.strictEqual(attemptB, 1);
    await waitForChatwootQueueIdle();
  } finally {
    setChatwootQueueFailureReporter(undefined);
    setChatwootQueueConcurrencyForTesting(originalConcurrency);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});

test('chatwoot webhook persists queued jobs when redis durability enabled', async () => {
  resetMocks();
  setChatwootQueueEnabledForTesting(true);
  setChatwootQueuePersistenceEnabledForTesting(true);

  try {
    const payload = {
      event: 'message_created',
      data: {
        event: 'message_created',
        message: {
          id: 950,
          message_type: 0,
          content: 'Durable queue message',
          account: { id: 95 },
          conversation: {
            id: 95,
            inbox_id: 1,
            status: 'resolved',
            account_id: 95,
          },
        },
      },
    };

    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await webhookPost(request);
    assert.strictEqual(response.status, 202);
    assert.strictEqual(redis.rpush.mock.calls.length, 1);
    const [queueKey, serialized] = redis.rpush.mock.calls[0].arguments;
    assert.strictEqual(queueKey, 'chatwoot:webhook:jobs');
    const stored = JSON.parse(serialized);
    assert.strictEqual(stored.metadata.accountId, 95);
    assert.strictEqual(stored.metadata.conversationId, 95);
    assert.deepStrictEqual(stored.metadata.payload, payload);
    assert.ok(
      typeof stored.options?.queuedAt === 'number',
      'expected queuedAt to be persisted for hydration timing'
    );

    await waitForChatwootQueueIdle();

    assert.strictEqual(redis.lrem.mock.calls.length, 1);
    assert.deepStrictEqual(redis.lrem.mock.calls[0].arguments, [
      'chatwoot:webhook:jobs',
      1,
      serialized,
    ]);
  } finally {
    setChatwootQueuePersistenceEnabledForTesting(false);
    setChatwootQueueEnabledForTesting(false);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});

test('chatwoot webhook hydrates persisted jobs from redis', async () => {
  resetMocks();
  const payload = {
    event: 'message_created',
    data: {
      event: 'message_created',
      message: {
        id: 960,
        message_type: 0,
        content: 'Recover me',
        account: { id: 96 },
        conversation: {
          id: 96,
          inbox_id: 1,
          status: 'resolved',
          account_id: 96,
        },
      },
    },
  };
  const sanitizedPayload = JSON.parse(JSON.stringify(payload));
  const serializedJob = JSON.stringify({
    id: 1234,
    metadata: { accountId: 96, conversationId: 96, payload: sanitizedPayload },
  });
  redis.lrange.mock.mockImplementationOnce(async () => [serializedJob]);
  redis.lrange.mock.mockImplementation(async () => []);

  setChatwootQueuePersistenceEnabledForTesting(true);
  setChatwootQueueEnabledForTesting(true);

  try {
    await hydrateChatwootQueueFromStorageForTesting();
    await waitForChatwootQueueIdle();

    assert.strictEqual(sendBotMessageMock.mock.calls.length, 1);
    assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[0], 96);
    assert.strictEqual(sendBotMessageMock.mock.calls[0].arguments[1], 96);
    assert.strictEqual(redis.rpush.mock.calls.length, 0);
    assert.ok(
      redis.lrem.mock.calls.some((call) => call.arguments[2] === serializedJob)
    );
  } finally {
    setChatwootQueuePersistenceEnabledForTesting(false);
    setChatwootQueueEnabledForTesting(false);
    resetChatwootQueueForTesting();
    resetMocks();
  }
});
