const assert = require('assert');
const { test, mock } = require('node:test');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const {
  scheduleProviderCall,
  setLimiterConfigForTesting,
  resetLimiterForTesting,
} = require('../lib/providers/limiter.ts');

async function waitForCondition(predicate, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) {
      return true;
    }
    mock.timers.tick(0);
    await Promise.resolve();
  }
  return predicate();
}

test('limiter enforces concurrency per provider', async () => {
  resetLimiterForTesting();
  setLimiterConfigForTesting({
    openai: {
      concurrency: 1,
      tokensPerInterval: 1000,
      intervalMs: 1000,
      maxTokens: 1000,
    },
  });

  mock.timers.enable({ now: 0 });
  try {
    const startOrder = [];

    const launchJob = (id) =>
      scheduleProviderCall('openai', { input: 10, output: 0 }, async () => {
        startOrder.push({ id, time: Date.now() });
        await new Promise((resolve) => setTimeout(resolve, 50));
        return (async function* () {
          yield id;
        })();
      });

    const firstStreamPromise = launchJob('first');
    const secondStreamPromise = launchJob('second');

    await waitForCondition(() => startOrder.length >= 1);
    assert.strictEqual(startOrder.length, 1);
    assert.strictEqual(startOrder[0].id, 'first');

    mock.timers.tick(50);
    const firstStream = await firstStreamPromise;
    const firstValues = [];
    for await (const value of firstStream) {
      firstValues.push(value);
    }
    assert.deepStrictEqual(firstValues, ['first']);

    await waitForCondition(() => startOrder.length >= 2);
    assert.strictEqual(startOrder[1].id, 'second');
    assert.ok(startOrder[1].time >= 50);

    mock.timers.tick(50);
    const secondStream = await secondStreamPromise;
    const secondValues = [];
    for await (const value of secondStream) {
      secondValues.push(value);
    }
    assert.deepStrictEqual(secondValues, ['second']);
  } finally {
    mock.timers.reset();
    resetLimiterForTesting();
  }
});

test('limiter enforces token bucket delays', async () => {
  resetLimiterForTesting();
  setLimiterConfigForTesting({
    openai: {
      concurrency: 4,
      tokensPerInterval: 50,
      intervalMs: 1000,
      maxTokens: 50,
    },
  });

  mock.timers.enable({ now: 0 });
  try {
    const startOrder = [];

    const launchJob = (id) =>
      scheduleProviderCall('openai', { input: 40, output: 0 }, async () => {
        startOrder.push({ id, time: Date.now() });
        return (async function* () {
          yield id;
        })();
      });

    const firstStreamPromise = launchJob('first');
    const secondStreamPromise = launchJob('second');

    await waitForCondition(() => startOrder.length >= 1);
    assert.strictEqual(startOrder.length, 1);

    const firstStream = await firstStreamPromise;
    const firstValues = [];
    for await (const value of firstStream) {
      firstValues.push(value);
    }
    assert.deepStrictEqual(firstValues, ['first']);

    assert.strictEqual(startOrder.length, 1);

    mock.timers.tick(1000);
    mock.timers.tick(0);
    await waitForCondition(() => startOrder.length >= 2, 100);

    assert.strictEqual(startOrder.length, 2);
    assert.ok(startOrder[1].time >= 1000);

    const secondStream = await secondStreamPromise;
    const secondValues = [];
    for await (const value of secondStream) {
      secondValues.push(value);
    }
    assert.deepStrictEqual(secondValues, ['second']);
  } finally {
    mock.timers.reset();
    resetLimiterForTesting();
  }
});
