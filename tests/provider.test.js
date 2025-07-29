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
