import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../instantly.js';

const ENV = { ACME_INSTANTLY_API_KEY: 'secret' };
const CONFIG = { _slug: 'acme' };
const RANGE = { from: '2026-07-14', to: '2026-07-14' };

function completeDailyRow(date, overrides = {}) {
  return {
    date,
    sent: 0,
    contacted: 0,
    new_leads_contacted: 0,
    opened: 0,
    unique_opened: 0,
    replies: 0,
    unique_replies: 0,
    replies_automatic: 0,
    clicks: 0,
    unique_clicks: 0,
    opportunities: 0,
    ...overrides,
  };
}

function response({ ok = true, status = 200, body = [] } = {}) {
  return {
    ok,
    status,
    async json() { return body; },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
  };
}

test('Instantly fails the source when core campaign analytics returns HTTP error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ ok: false, status: 503, body: 'unavailable' }));

  await assert.rejects(() => collect(CONFIG, ENV, RANGE), /HTTP 503/);
});

test('Instantly fails the source when a successful payload has an invalid schema', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ body: { data: [] } }));

  await assert.rejects(() => collect(CONFIG, ENV, RANGE), /response was not an array/);
});

test('Instantly persists explicit zeros after a legitimate empty response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ body: [] }));

  const result = await collect(CONFIG, ENV, { from: '2026-07-14', to: '2026-07-15' });
  assert.equal(result.metrics.length, 22);
  assert.equal(result.quality, undefined);
  assert.deepEqual(result.attemptedDates, ['2026-07-14', '2026-07-15']);
  assert.equal(result.restatedScopes.length, 22);
  assert.deepEqual(
    result.metrics.filter((metric) => metric.name === 'emailsSent'),
    [
      { name: 'emailsSent', value: 0, date: '2026-07-14' },
      { name: 'emailsSent', value: 0, date: '2026-07-15' },
    ],
  );
});

test('Instantly keeps sparse provider rows partial without converting missing fields to zero', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ body: [
    { date: '2026-07-14', sent: 5, opened: 2 },
  ] }));

  const result = await collect(CONFIG, ENV, RANGE);
  assert.equal(result.quality, 'partial');
  assert.deepEqual(result.metrics, [
    { name: 'emailsSent', value: 5, date: '2026-07-14' },
    { name: 'opens', value: 2, date: '2026-07-14' },
  ]);
  assert.equal(result.metrics.some((metric) => metric.name === 'uniqueOpens'), false);
  assert.equal(result.restatedScopes.length, 11);
});

test('Instantly does not sum duplicate rows from an identity-free daily endpoint', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ body: [
    completeDailyRow('2026-07-14', { sent: 2, opened: 1 }),
    completeDailyRow('2026-07-14', { sent: 3, opened: 2 }),
  ] }));

  const result = await collect(CONFIG, ENV, RANGE);
  assert.equal(result.quality, 'partial');
  assert.deepEqual(result.metrics, []);
  assert.equal(result.restatedScopes.length, 11);
});

test('Instantly preserves explicit zero fields in a complete daily row', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ body: [
    completeDailyRow('2026-07-14', { sent: 5 }),
  ] }));

  const result = await collect(CONFIG, ENV, RANGE);
  assert.equal(result.quality, undefined);
  assert.equal(result.metrics.length, 11);
  assert.equal(result.metrics.find((metric) => metric.name === 'emailsSent')?.value, 5);
  assert.equal(result.metrics.find((metric) => metric.name === 'uniqueReplies')?.value, 0);
});
