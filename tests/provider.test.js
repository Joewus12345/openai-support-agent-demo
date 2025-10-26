require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const assert = require('assert');
const { test, mock } = require('node:test');
const { convertMessages, serializeToolCallArgs } = require('../lib/providers/ollama.ts');
const { retryWithBackoff, ProviderRetryError } = require('../lib/providers/retry.ts');

test('ollamaProvider serializes function_call_output', () => {
  const messages = [
    { role: 'user', content: 'hi' },
    { type: 'function_call_output', call_id: '123', output: 'ok' },
  ];

  const converted = convertMessages(messages);

  assert.deepStrictEqual(converted, [
    { role: 'user', content: 'hi' },
    { role: 'tool', tool_call_id: '123', content: 'ok' },
  ]);
});

test('serializeToolCallArgs handles string arguments', () => {
  const input = '{"a":1}';
  assert.strictEqual(serializeToolCallArgs(input), input);
});

test('serializeToolCallArgs handles object arguments', () => {
  const input = { a: 1 };
  assert.strictEqual(serializeToolCallArgs(input), JSON.stringify(input));
});

test('tool call arguments accumulate across chunks', async () => {
  async function* gen() {
    yield { message: { tool_calls: [ { id: '1', function: { name: 'do', arguments: '{"a":' } } ] } };
    yield { message: { tool_calls: [ { id: '1', function: { arguments: '1}' } } ] } };
    yield { message: { tool_calls: [] }, done: true };
  }

  const calls = new Map();
  const events = [];
  let finalText = '';
  for await (const chunk of gen()) {
    const toolCalls = chunk.message?.tool_calls || [];
    for (const call of toolCalls) {
      const id = call.id;
      let state = calls.get(id);
      if (!state) {
        state = { name: call.function?.name, args: '' };
        calls.set(id, state);
        events.push({ event: 'response.output_item.added', id });
      }
      if (call.function?.arguments) {
        state.args += call.function.arguments;
        events.push({ event: 'response.function_call_arguments.delta', id, delta: call.function.arguments });
      }
    }

    if (chunk.done) {
      for (const [id, state] of calls.entries()) {
        events.push({ event: 'response.function_call_arguments.done', id, arguments: state.args });
        events.push({ event: 'response.output_item.done', id, arguments: state.args });
      }
      if (finalText.trim()) events.push({ event: 'response.output_text.done' });
    }
  }

  const deltas = events.filter(e => e.event === 'response.function_call_arguments.delta');
  assert.deepStrictEqual(deltas.map(d => d.delta), ['{"a":', '1}']);
  const done = events.find(e => e.event === 'response.function_call_arguments.done');
  assert.strictEqual(done.arguments, '{"a":1}');
});

test('ollamaOpenAIProvider argument handling with string', () => {
  const id = '1';
  const call = { function: { arguments: '{"x":1}' } };
  const state = { type: 'function', args: '' };
  const events = [];
  const delta = serializeToolCallArgs(call.function?.arguments);
  if (delta) {
    state.args += delta;
    if (state.type === 'function') {
      events.push({
        event: 'response.function_call_arguments.delta',
        data: { item_id: id, delta },
      });
    }
  }
  assert.strictEqual(state.args, '{"x":1}');
  assert.deepStrictEqual(events, [
    {
      event: 'response.function_call_arguments.delta',
      data: { item_id: id, delta: '{"x":1}' },
    },
  ]);
});

test('ollamaOpenAIProvider argument handling with object', () => {
  const id = '2';
  const call = { function: { arguments: { b: 2 } } };
  const state = { type: 'function', args: '' };
  const events = [];
  const delta = serializeToolCallArgs(call.function?.arguments);
  if (delta) {
    state.args += delta;
    if (state.type === 'function') {
      events.push({
        event: 'response.function_call_arguments.delta',
        data: { item_id: id, delta },
      });
    }
  }
  assert.strictEqual(state.args, JSON.stringify({ b: 2 }));
  assert.deepStrictEqual(events, [
    {
      event: 'response.function_call_arguments.delta',
      data: { item_id: id, delta: JSON.stringify({ b: 2 }) },
    },
  ]);
});

test('retryWithBackoff honors retry-after header and skips jitter', async () => {
  const delays = [];
  let attempts = 0;
  const error = new Error('rate limited');
  error.status = 429;
  error.response = {
    status: 429,
    headers: {
      'retry-after': '2',
    },
  };
  const jitter = mock.fn((delay) => delay / 2);

  const operation = mock.fn(async () => {
    attempts += 1;
    if (attempts < 2) {
      throw error;
    }
    return 'ok';
  });

  const result = await retryWithBackoff(operation, {
    provider: 'openai',
    maxRetries: 3,
    baseDelayMs: 100,
    sleepFn: async (ms) => {
      delays.push(ms);
    },
    jitterFn: jitter,
  });

  assert.strictEqual(result.result, 'ok');
  assert.strictEqual(result.attempts, 2);
  assert.deepStrictEqual(delays, [2000]);
  assert.strictEqual(operation.mock.calls.length, 2);
  assert.strictEqual(jitter.mock.calls.length, 0);
});

test('retryWithBackoff throws ProviderRetryError after max retries', async () => {
  const delays = [];
  const error = new Error('still rate limited');
  error.status = 429;
  error.response = {
    status: 429,
  };
  const jitter = mock.fn((delay, attempt) => delay + attempt);

  const operation = mock.fn(async () => {
    throw error;
  });

  await assert.rejects(
    retryWithBackoff(operation, {
      provider: 'openai',
      maxRetries: 2,
      baseDelayMs: 50,
      sleepFn: async (ms) => {
        delays.push(ms);
      },
      jitterFn: jitter,
    }),
    (err) => {
      assert(err instanceof ProviderRetryError);
      assert.strictEqual(err.retriesExhausted, true);
      assert.strictEqual(err.attempts, 3);
      return true;
    }
  );

  assert.deepStrictEqual(delays, [51, 102]);
  assert.strictEqual(operation.mock.calls.length, 3);
  assert.strictEqual(jitter.mock.calls.length, 2);
  assert.deepStrictEqual(
    jitter.mock.calls.map((call) => call.arguments),
    [
      [50, 1],
      [100, 2],
    ]
  );
});
