const assert = require('assert');
const test = require('node:test');
require('ts-node/register/transpile-only');
const { convertMessages, serializeToolCallArgs } = require('../lib/providers/ollama.ts');

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
