import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../posthog.js';

const CONFIG = { _slug: 'acme', projectId: '123' };
const ENV = { ACME_POSTHOG_API_KEY: 'secret' };
const RANGE = { from: '2026-07-14', to: '2026-07-14' };

function response({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

test('PostHog records legitimate additive zeros but omits a rate without denominator', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/session_recordings/')) return response({ body: { count: 0 } });
    return response({ body: { results: [[0]] } });
  });

  const result = await collect(CONFIG, ENV, RANGE);
  const totals = Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
  assert.equal(totals.pageviews, 0);
  assert.equal(totals.activation_events, 0);
  assert.equal(totals.activation_rate, undefined);
  assert.equal(totals.session_recordings, 0);
});

test('PostHog computes activation events per 100 pageviews with a real denominator', async (t) => {
  let queryCount = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/session_recordings/')) return response({ body: { count: 1 } });
    queryCount += 1;
    return response({ body: { results: [[queryCount === 1 ? 200 : 10]] } });
  });

  const result = await collect(CONFIG, ENV, RANGE);
  const totals = Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
  assert.equal(totals.pageviews, 200);
  assert.equal(totals.activation_events, 10);
  assert.equal(totals.activation_rate, 5);
});

test('PostHog fails its canary instead of converting a malformed payload to zero', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ body: { data: [] } }));

  await assert.rejects(() => collect(CONFIG, ENV, RANGE), /missing results array/);
});

test('PostHog rejects ambiguous or non-integer count results', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ body: { results: [[1], [2]] } }));
  await assert.rejects(() => collect(CONFIG, ENV, RANGE), /ambiguous count result/);

  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => response({ body: { results: [[1.5]] } }));
  await assert.rejects(() => collect(CONFIG, ENV, RANGE), /invalid count result/);
});

test('PostHog rejects multi-day ranges instead of storing a period aggregate on day one', async () => {
  await assert.rejects(
    () => collect(CONFIG, ENV, { from: '2026-07-14', to: '2026-07-15' }),
    /collect one day at a time/,
  );
});

test('PostHog marks a failed funnel subquery partial and exposes configured step coverage', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (String(url).includes('/session_recordings/')) return response({ body: { count: 1 } });
    const query = JSON.parse(String(init.body)).query.query;
    if (query.includes("event = '$pageview'")) return response({ body: { results: [[100]] } });
    if (query.includes("event = '$identify'")) return response({ body: { results: [[10]] } });
    if (query.includes("event = 'signup'")) return response({ body: { results: [[7]] } });
    if (query.includes("event = 'activated'")) {
      return response({ ok: false, status: 503, body: { error: 'temporary' } });
    }
    throw new Error(`Unexpected PostHog query: ${query}`);
  });

  const result = await collect(
    { ...CONFIG, funnelSteps: ['signup', 'activated'] },
    ENV,
    RANGE,
  );
  assert.equal(result.quality, 'partial');
  assert.deepEqual(result.attemptedDates, [RANGE.from]);
  assert.ok(result.restatedScopes.some((scope) =>
    scope.metricDate === RANGE.from && scope.metricName === 'funnel_step_reached'));
  const steps = result.metrics.filter((metric) => metric.name === 'funnel_step_reached');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].value, 7);
  assert.deepEqual(steps[0].dimensions, { step: 'signup', order: 1, expectedSteps: 2 });
});

test('PostHog marks a failed activation subquery partial while retaining its totals canary', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (String(url).includes('/session_recordings/')) return response({ body: { count: 1 } });
    const query = JSON.parse(String(init.body)).query.query;
    if (query.includes("event = '$pageview'")) return response({ body: { results: [[100]] } });
    if (query.includes("event = '$identify'")) {
      return response({ ok: false, status: 503, body: { error: 'temporary' } });
    }
    throw new Error(`Unexpected PostHog query: ${query}`);
  });

  const result = await collect(CONFIG, ENV, RANGE);
  assert.equal(result.quality, 'partial');
  assert.equal(result.metrics.find((metric) => metric.name === 'pageviews')?.value, 100);
  assert.equal(result.metrics.some((metric) => metric.name === 'activation_events'), false);
});

test('PostHog marks a configured North Star subquery failure partial', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (String(url).includes('/session_recordings/')) return response({ body: { count: 1 } });
    const query = JSON.parse(String(init.body)).query.query;
    if (query.includes("event = '$pageview'")) return response({ body: { results: [[100]] } });
    if (query.includes("event = '$identify'")) return response({ body: { results: [[10]] } });
    if (query.includes("event = 'subscription_started'")) {
      return response({ ok: false, status: 503, body: { error: 'temporary' } });
    }
    throw new Error(`Unexpected PostHog query: ${query}`);
  });

  const result = await collect(
    { ...CONFIG, northStarEvent: 'subscription_started' },
    ENV,
    RANGE,
  );
  assert.equal(result.quality, 'partial');
  assert.equal(result.metrics.some((metric) => metric.name === 'north_star_weekly'), false);
});

test('PostHog marks a failed session recordings endpoint partial', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/session_recordings/')) {
      return response({ ok: false, status: 503, body: { error: 'temporary' } });
    }
    return response({ body: { results: [[100]] } });
  });

  const result = await collect(CONFIG, ENV, RANGE);
  assert.equal(result.quality, 'partial');
  assert.equal(result.metrics.some((metric) => metric.name === 'session_recordings'), false);
});
