const assert = require('assert');
const test = require('node:test');

function parseToolCallJson(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj.name === 'string') {
      return { name: obj.name, parameters: obj.parameters };
    }
  } catch {
    return null;
  }
  return null;
}

function runParse(content) {
  const chatMessages = [];
  const conversationItems = [];
  const parsed = parseToolCallJson(content);
  if (parsed) {
    const id = 'test';
    const argStr = parsed.parameters ? JSON.stringify(parsed.parameters) : '';
    chatMessages.push({
      type: 'tool_call',
      tool_type: 'function_call',
      status: 'in_progress',
      id,
      name: parsed.name,
      arguments: argStr,
      parsedArguments: parsed.parameters ?? {},
      output: null,
    });
    conversationItems.push({
      type: 'function_call',
      role: 'assistant',
      id,
      name: parsed.name,
      arguments: argStr,
    });
  }
  return { parsed, chatMessages, conversationItems };
}

test('parseToolCallJson detects valid JSON', () => {
  const text = '{"name":"search_files","parameters":{"query":"foo"}}';
  const { parsed } = runParse(text);
  assert.ok(parsed);
  assert.strictEqual(parsed.name, 'search_files');
});

test('parseToolCallJson ignores non JSON', () => {
  const { parsed } = runParse('Hello world');
  assert.strictEqual(parsed, null);
});
