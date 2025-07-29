const assert = require('assert');
const test = require('node:test');
require('ts-node/register/transpile-only');
const { convertMessages } = require('../lib/providers/ollama.ts');

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
