import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../explee.js';

const CONFIG = {
  _slug: 'growth4u',
  _pointInTimeDate: '2026-07-17',
  _explicitRange: false,
};
const ENV = { GROWTH4U_EXPLEE_API_KEY: 'secret' };
const RANGE = { from: '2026-07-16', to: '2026-07-16' };

function json(payload, status = 200) {
  return Response.json(payload, { status });
}

function mockResponses(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (!responses.length) throw new Error(`Unexpected request: ${url}`);
    return responses.shift();
  });
  return calls;
}

function analytics(overrides = {}) {
  return {
    project_id: 18200,
    period: 'all',
    total_emails_sent: 100,
    total_replies: 8,
    overall_reply_rate_pct: 8.01,
    total_hot_leads: 4,
    total_spend_usd: 20,
    campaigns: [{
      campaign_id: 1,
      name: 'ICP',
      status: 'outreach',
      status_reason: null,
      emails_sent: 100,
      total_replies: 8,
      reply_rate_pct: 8,
      hot_leads: 4,
      spend_usd: 20,
      cost_per_lead_usd: 5,
      daily_budget_usd: 10,
      leads_pool_used: 80,
      leads_pool_total: 120,
      manual_status_counts: {},
    }],
    ...overrides,
  };
}

test('Explee collects a lifetime project snapshot and recomputes ratios from components', async (t) => {
  const calls = mockResponses(t, [
    json({ projects: [{ id: 18200, domain: 'growth4u.io' }], total: 1 }),
    json(analytics()),
  ]);

  const result = await collect(CONFIG, ENV, RANGE);
  assert.equal(result.source, 'explee');
  assert.equal(result.date, '2026-07-17');
  assert.deepEqual(result.attemptedDates, ['2026-07-17']);
  assert.equal(result.restatedScopes.length, 7);
  const metrics = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
  assert.equal(metrics.get('campaignsCurrent'), 1);
  assert.equal(metrics.get('emailsSentLifetime'), 100);
  assert.equal(metrics.get('repliesLifetime'), 8);
  assert.equal(metrics.get('replyRatePctLifetime'), 8);
  assert.equal(metrics.get('hotLeadsLifetime'), 4);
  assert.equal(metrics.get('spendUsdLifetime'), 20);
  assert.equal(metrics.get('costPerHotLeadUsdLifetime'), 5);
  assert.equal(calls[0].url, 'https://api.explee.com/public/api/v1/autogtm/projects');
  assert.equal(
    calls[1].url,
    'https://api.explee.com/public/api/v1/autogtm/projects/18200/analytics?period=all',
  );
  assert.equal(calls[0].options.headers['X-API-Key'], 'secret');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].url.includes('secret'), false);
});

test('Explee keeps zero volumes but does not invent undefined ratios', async (t) => {
  mockResponses(t, [
    json({ projects: [{ id: 18200 }], total: 1 }),
    json(analytics({
      total_emails_sent: 0,
      total_replies: 0,
      overall_reply_rate_pct: 0,
      total_hot_leads: 0,
      total_spend_usd: 0,
      campaigns: [],
    })),
  ]);

  const result = await collect(CONFIG, ENV, RANGE);
  assert.equal(result.metrics.find((metric) => metric.name === 'emailsSentLifetime')?.value, 0);
  assert.equal(result.metrics.find((metric) => metric.name === 'hotLeadsLifetime')?.value, 0);
  assert.equal(result.metrics.some((metric) => metric.name === 'replyRatePctLifetime'), false);
  assert.equal(result.metrics.some((metric) => metric.name === 'costPerHotLeadUsdLifetime'), false);
  assert.equal(result.restatedScopes.some((scope) => scope.metricName === 'replyRatePctLifetime'), true);
  assert.equal(result.restatedScopes.some((scope) => scope.metricName === 'costPerHotLeadUsdLifetime'), true);
});

test('Explee requires an explicit project when the API key owns several', async (t) => {
  mockResponses(t, [json({ projects: [{ id: 1 }, { id: 2 }], total: 2 })]);
  await assert.rejects(
    () => collect(CONFIG, ENV, RANGE),
    /configure PROJECT_ID explicitly/,
  );
});

test('Explee rejects explicit historical repairs and malformed provider payloads', async (t) => {
  await assert.rejects(
    () => collect({ ...CONFIG, _explicitRange: true }, ENV, RANGE),
    /does not support exact historical ranges/,
  );

  mockResponses(t, [
    json({ projects: [{ id: 18200 }], total: 1 }),
    json(analytics({ total_emails_sent: undefined })),
  ]);
  await assert.rejects(
    () => collect(CONFIG, ENV, RANGE),
    /total_emails_sent/,
  );

  mockResponses(t, [
    json({ projects: [{ id: 18200 }], total: 1 }),
    json(analytics({ total_spend_usd: null })),
  ]);
  await assert.rejects(
    () => collect(CONFIG, ENV, RANGE),
    /total_spend_usd/,
  );
});

test('Explee rejects malformed campaign rollups before counting them', async (t) => {
  mockResponses(t, [
    json({ projects: [{ id: 18200 }], total: 1 }),
    json(analytics({ campaigns: [{}] })),
  ]);
  await assert.rejects(
    () => collect(CONFIG, ENV, RANGE),
    /campaign_id/,
  );
});

test('Explee rejects a provider reply rate that contradicts its component counts', async (t) => {
  mockResponses(t, [
    json({ projects: [{ id: 18200 }], total: 1 }),
    json(analytics({ overall_reply_rate_pct: 99 })),
  ]);
  await assert.rejects(
    () => collect(CONFIG, ENV, RANGE),
    /does not match its reported numerator and denominator/,
  );
});
