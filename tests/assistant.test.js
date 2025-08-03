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

test('emailRefusalRegex detects common refusal phrases', () => {
  const emailRefusalRegex = new RegExp(
    [
      "don['’]?t feel comfortable giving (?:you )?my email",
      "i don['’]?t want to",
      "i can['’]?t provide that info(?:rmation)?",
      "no[,\\s]*i won['’]?t",
    ].join('|'),
    'i',
  );
  assert.ok(emailRefusalRegex.test("No I won't"));
  assert.ok(emailRefusalRegex.test("I don't want to"));
  assert.ok(emailRefusalRegex.test("I can't provide that info"));
});

test('DEVELOPER_PROMPT mentions ticket workflow', () => {
  const { DEVELOPER_PROMPT } = require('../config/constants');
  assert.match(
    DEVELOPER_PROMPT,
    /identify customers by either an email address or a ticket ID/i
  );
  assert.match(DEVELOPER_PROMPT, /inform the customer of the ticket ID/i);
});

test('handleTurn prefixes ticket system message', async () => {
  const { handleTurn } = require('../lib/assistant');
  const useDataStore = require('../stores/useDataStore').default;
  const originalFetch = global.fetch;
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response('data: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/plain' },
      status: 200,
    });
  };
  try {
    useDataStore.setState({ contactType: 'ticket', contactId: 'TICK123' });
    const messages = [
      { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
    ];
    await handleTurn(messages, () => {});
    assert.strictEqual(body.messages[0].role, 'system');
    assert.match(body.messages[0].content[0].text, /TICK123/);
  } finally {
    global.fetch = originalFetch;
    useDataStore.setState({ contactType: null, contactId: null });
  }
});