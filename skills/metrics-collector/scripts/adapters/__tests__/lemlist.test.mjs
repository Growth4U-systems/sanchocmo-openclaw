import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../lemlist.js';

function completeStat(campaignId, overrides = {}) {
  return {
    campaignId,
    messagesSent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
    messagesBounced: 0,
    messagesNotSent: 0,
    meetingBooked: 0,
    nbLeads: 0,
    nbLeadsLaunched: 0,
    nbLeadsReached: 0,
    nbLeadsInteracted: 0,
    nbLeadsAnswered: 0,
    nbLeadsInterested: 0,
    nbLeadsNotInterested: 0,
    nbLeadsUnsubscribed: 0,
    nbLeadsInterrupted: 0,
    invitationAccepted: 0,
    ...overrides,
  };
}

test('Lemlist adapter collects daily totals and campaign dimensions for cron', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/campaigns?')) {
      return Response.json([
        { _id: 'cmp-1', name: 'Outbound ES', status: 'running' },
        { _id: 'archived-1', name: 'Archived yesterday', status: 'archived' },
        { _id: 'draft-1', name: 'Draft', status: 'draft' },
      ]);
    }
    if (String(url).endsWith('/v2/campaigns/stats/batch')) {
      const requested = JSON.parse(String(init.body)).campaignIds;
      assert.deepEqual(requested, ['cmp-1', 'archived-1']);
      return Response.json({
        results: [
          completeStat('cmp-1', {
            messagesSent: 10,
            delivered: 9,
            opened: 4,
            replied: 2,
            meetingBooked: 1,
          }),
          completeStat('archived-1', { messagesSent: 2, delivered: 2 }),
        ],
        errors: [],
      });
    }
    return new Response('', { status: 404 });
  };

  try {
    const result = await collect(
      {
        _slug: 'growth4u',
        _pointInTimeDate: '2026-07-02',
        _explicitRange: false,
      },
      { GROWTH4U_LEMLIST_API_KEY: 'secret' },
      { from: '2026-07-01', to: '2026-07-01' },
    );
    const totals = Object.fromEntries(
      result.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
    );
    assert.equal(result.source, 'lemlist');
    assert.equal(result.quality, undefined);
    assert.equal(totals.campaigns, 1);
    assert.equal(totals.sent, 12);
    assert.equal(totals.delivered, 11);
    assert.equal(totals.opens, 4);
    assert.equal(totals.replies, 2);
    assert.equal(totals.meetings, 1);
    assert.equal(totals.bounced, 0);
    assert.equal(result.metrics.find((metric) => metric.name === 'campaigns')?.date, '2026-07-02');
    assert.deepEqual(result.attemptedDates, ['2026-07-01', '2026-07-02']);
    assert.equal(
      result.metrics.find((metric) => metric.name === 'sent' && metric.dimensions)?.dimensions?.campaignName,
      'Outbound ES',
    );
    assert.equal(
      result.metrics.find((metric) => metric.dimensions?.campaignId === 'archived-1')
        ?.dimensions?.campaignStatus,
      'archived',
    );
    assert.ok(calls.every((call) => call.init.headers.Authorization === 'Basic OnNlY3JldA=='));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Lemlist adapter emits separate rows for each explicit backfill day', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init = {}) => {
    const body = JSON.parse(String(init.body));
    const day = body.startDate.slice(0, 10);
    return Response.json({
      results: [completeStat('cmp-1', { messagesSent: day.endsWith('01') ? 2 : 3 })],
      errors: [],
    });
  };

  try {
    const result = await collect(
      {
        _slug: 'growth4u',
        _pointInTimeDate: '2026-07-17',
        _explicitRange: true,
        CAMPAIGN_IDS: 'cmp-1',
      },
      { GROWTH4U_LEMLIST_API_KEY: 'secret' },
      { from: '2026-07-01', to: '2026-07-02' },
    );
    assert.deepEqual(
      result.metrics.filter((metric) => metric.name === 'sent' && !metric.dimensions)
        .map((metric) => [metric.date, metric.value]),
      [['2026-07-01', 2], ['2026-07-02', 3]],
    );
    assert.deepEqual(
      result.metrics.filter((metric) => metric.name === 'campaigns')
        .map((metric) => [metric.date, metric.value]),
      [],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Lemlist historical repair includes archived campaigns but excludes drafts', async (t) => {
  let requestedCampaignIds = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (String(url).includes('/campaigns?')) {
      return Response.json([
        { _id: 'running-1', name: 'Running', status: 'running' },
        { _id: 'archived-1', name: 'Archived', status: 'archived' },
        { _id: 'draft-1', name: 'Draft', status: 'draft' },
      ]);
    }
    const body = JSON.parse(String(init.body));
    requestedCampaignIds = body.campaignIds;
    return Response.json({
      results: [
        completeStat('running-1', { messagesSent: 2 }),
        completeStat('archived-1', { messagesSent: 5 }),
      ],
      errors: [],
    });
  });

  const result = await collect(
    { _slug: 'growth4u', _pointInTimeDate: '2026-07-17', _explicitRange: true },
    { GROWTH4U_LEMLIST_API_KEY: 'secret' },
    { from: '2026-04-01', to: '2026-04-01' },
  );

  assert.deepEqual(requestedCampaignIds, ['running-1', 'archived-1']);
  assert.equal(
    result.metrics.find((metric) => metric.name === 'sent' && !metric.dimensions)?.value,
    7,
  );
  assert.equal(result.metrics.some((metric) => metric.name === 'campaigns'), false);
  assert.equal(
    result.metrics.find((metric) => metric.dimensions?.campaignId === 'archived-1')
      ?.dimensions?.campaignStatus,
    'archived',
  );
});

test('Lemlist adapter fails atomically on partial batch errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    results: [],
    errors: [{ campaignId: 'cmp-1', message: 'forbidden' }],
  });

  try {
    await assert.rejects(
      collect(
        { _slug: 'growth4u', CAMPAIGN_IDS: ['cmp-1'] },
        { GROWTH4U_LEMLIST_API_KEY: 'secret' },
        { from: '2026-07-01', to: '2026-07-01' },
      ),
      /campaign error/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Lemlist marks incomplete sparse batches partial without inventing zero rollups', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    results: [{ campaignId: 'cmp-1', messagesSent: 5 }],
    errors: [],
  }));

  const result = await collect(
    { _slug: 'growth4u', _explicitRange: true, CAMPAIGN_IDS: ['cmp-1', 'cmp-2'] },
    { GROWTH4U_LEMLIST_API_KEY: 'secret' },
    { from: '2026-07-01', to: '2026-07-01' },
  );

  assert.equal(result.quality, 'partial');
  assert.equal(
    result.metrics.find((metric) => metric.name === 'sent' && !metric.dimensions)?.value,
    5,
  );
  assert.equal(result.metrics.some((metric) => metric.name === 'delivered'), false);
  assert.equal(
    result.metrics.some((metric) => metric.dimensions?.campaignId === 'cmp-2'),
    false,
  );
  assert.equal(result.restatedScopes.length, 18);
});

test('Lemlist marks duplicate campaign results partial and omits the ambiguous rows', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    results: [
      completeStat('cmp-1', { messagesSent: 2 }),
      completeStat('cmp-1', { messagesSent: 3 }),
    ],
    errors: [],
  }));

  const result = await collect(
    { _slug: 'growth4u', _explicitRange: true, CAMPAIGN_IDS: ['cmp-1'] },
    { GROWTH4U_LEMLIST_API_KEY: 'secret' },
    { from: '2026-07-01', to: '2026-07-01' },
  );

  assert.equal(result.quality, 'partial');
  assert.deepEqual(result.metrics, []);
  assert.equal(result.restatedScopes.length, 18);
});

test('Lemlist rejects impossible dates and does not call a configured subset the total campaign stock', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    results: [completeStat('cmp-1', { messagesSent: 1 })],
    errors: [],
  }));

  await assert.rejects(
    () => collect(
      { _slug: 'growth4u', CAMPAIGN_IDS: ['cmp-1'] },
      { GROWTH4U_LEMLIST_API_KEY: 'secret' },
      { from: '2026-02-30', to: '2026-02-30' },
    ),
    /invalid.*date/i,
  );
  assert.equal(fetchMock.mock.callCount(), 0);

  const result = await collect(
    { _slug: 'growth4u', CAMPAIGN_IDS: ['cmp-1'] },
    { GROWTH4U_LEMLIST_API_KEY: 'secret' },
    { from: '2026-07-01', to: '2026-07-01' },
  );
  assert.equal(result.metrics.some((metric) => metric.name === 'campaigns'), false);
  assert.equal(result.metrics.find((metric) => metric.name === 'sent' && !metric.dimensions)?.value, 1);
});
