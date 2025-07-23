const assert = require('assert');
const test = require('node:test');

async function handleTurn(messages, onMessage, provider = 'openai', toolsArg = [], model) {
  const response = await fetch('/api/turn_response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      tools: toolsArg,
      provider,
      model,
    }),
  });
  if (!response.ok) return;
  if (provider === 'ollama') {
    await response.text();
    return;
  }
  return;
}

test('model parameter is sent to turn_response', async () => {
  let receivedBody = null;
  global.fetch = async (url, opts) => {
    receivedBody = JSON.parse(opts.body);
    return { ok: true, text: async () => '' };
  };
  await handleTurn([], () => {}, 'ollama', [], 'alpaca');
  assert.strictEqual(receivedBody.model, 'alpaca');
});
