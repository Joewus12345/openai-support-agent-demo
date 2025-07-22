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

function processOutputTextDone(content) {
  let suggestedMessage = { text: 'placeholder' };
  const { parsed, chatMessages, conversationItems } = runParse(content);
  if (parsed) {
    suggestedMessage = null;
  }
  return { parsed, chatMessages, conversationItems, suggestedMessage };
}

test('parseToolCallJson detects valid JSON', () => {
  const text = '{"name":"search_knowledge_base","parameters":{"query":"foo"}}';
  const { parsed } = runParse(text);
  assert.ok(parsed);
  assert.strictEqual(parsed.name, 'search_knowledge_base');
});

test('parseToolCallJson ignores non JSON', () => {
  const { parsed } = runParse('Hello world');
  assert.strictEqual(parsed, null);
});

test('suggestedMessage cleared after tool call', () => {
  const text = '{"name":"search_knowledge_base","parameters":{"query":"bar"}}';
  const { parsed, chatMessages, conversationItems, suggestedMessage } =
    processOutputTextDone(text);
  assert.ok(parsed);
  assert.strictEqual(chatMessages.length, 1);
  assert.strictEqual(conversationItems.length, 1);
  assert.strictEqual(suggestedMessage, null);
});