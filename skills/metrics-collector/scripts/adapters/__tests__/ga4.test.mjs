import assert from 'node:assert/strict';
import test from 'node:test';

import { collectGa4Metrics, collectGa4Result, ga4DatesInRange } from '../../ga4-metrics.js';

function metricValues(values) {
  return values.map((value) => ({ value: String(value) }));
}

test('GA4 multi-day collection queries and persists every UTC day independently', async () => {
  const calls = [];
  const report = async (_token, propertyId, body) => {
    calls.push({ propertyId, body });
    const date = body.dateRanges[0].startDate;
    const day = date.endsWith('-01') ? 1 : 2;
    const dimension = body.dimensions?.[0]?.name;

    if (!dimension) {
      return {
        rows: [{
          metricValues: metricValues([
            day * 10,
            day * 100,
            day * 20,
            0.4,
            30,
            day,
            day * 40,
            day * 8,
            0.6,
          ]),
        }],
      };
    }
    if (dimension === 'sessionDefaultChannelGroup') {
      return {
        rows: [{
          dimensionValues: [{ value: 'Organic Search' }],
          metricValues: metricValues([day * 7, day * 70, day * 14, day * 5, day * 30]),
        }],
      };
    }
    if (dimension === 'pagePath') {
      return {
        rows: [{
          dimensionValues: [{ value: '/pricing' }],
          // Pageviews and sessions deliberately differ: session-based rates
          // must never use pageviews as their companion weight.
          metricValues: metricValues([day * 12, day * 3, 24.5, 0.75]),
        }],
      };
    }
    if (dimension === 'deviceCategory') {
      return {
        rows: [{
          dimensionValues: [{ value: 'mobile' }],
          metricValues: metricValues([day * 6, 0.3, 0.7]),
        }],
      };
    }
    throw new Error(`unexpected dimension ${dimension}`);
  };

  const metrics = await collectGa4Metrics(
    'token',
    '123456',
    { from: '2026-07-01', to: '2026-07-02' },
    report,
  );

  assert.equal(calls.length, 8);
  assert.ok(calls.every((call) => call.propertyId === '123456'));
  assert.ok(calls.every((call) =>
    call.body.dateRanges[0].startDate === call.body.dateRanges[0].endDate));
  assert.deepEqual(
    calls.map((call) => call.body.dateRanges[0].startDate),
    [
      '2026-07-01',
      '2026-07-01',
      '2026-07-01',
      '2026-07-01',
      '2026-07-02',
      '2026-07-02',
      '2026-07-02',
      '2026-07-02',
    ],
  );
  assert.ok(
    calls.filter((call) => !call.body.dimensions).every((call) =>
      call.body.metrics.some((metric) => metric.name === 'keyEvents') &&
      !call.body.metrics.some((metric) => metric.name === 'conversions')),
  );

  const rollupSessions = metrics.filter(
    (metric) => metric.name === 'sessions' && !metric.dimensions,
  );
  assert.deepEqual(
    rollupSessions.map((metric) => [metric.date, metric.value]),
    [['2026-07-01', 10], ['2026-07-02', 20]],
  );
  const dailyUsers = metrics.filter(
    (metric) => metric.name === 'totalUsers' && !metric.dimensions,
  );
  assert.deepEqual(
    dailyUsers.map((metric) => [metric.date, metric.value]),
    [['2026-07-01', 100], ['2026-07-02', 200]],
  );
  assert.deepEqual(
    metrics.filter((metric) => metric.name === 'conversions' && !metric.dimensions)
      .map((metric) => [metric.date, metric.value]),
    [['2026-07-01', 1], ['2026-07-02', 2]],
  );
  const channelSessions = metrics.filter(
    (metric) => metric.name === 'sessions' && metric.dimensions?.channel,
  );
  assert.deepEqual(channelSessions.map((metric) => metric.date), [
    '2026-07-01',
    '2026-07-02',
  ]);
  const pages = metrics.filter((metric) => metric.name === 'topPage');
  assert.deepEqual(
    pages.map((metric) => [metric.date, metric.dimensions.page]),
    [['2026-07-01', '/pricing'], ['2026-07-02', '/pricing']],
  );
  assert.ok(pages.every((metric) =>
    JSON.stringify(metric.dimensions) === JSON.stringify({ page: '/pricing' })));
  assert.deepEqual(
    metrics.filter((metric) => metric.name === 'topPageSessions')
      .map((metric) => [metric.date, metric.value, metric.dimensions]),
    [
      ['2026-07-01', 3, { page: '/pricing' }],
      ['2026-07-02', 6, { page: '/pricing' }],
    ],
  );
  assert.deepEqual(
    metrics.filter((metric) => metric.name === 'topPageDuration')
      .map((metric) => [metric.date, metric.value, metric.dimensions]),
    [
      ['2026-07-01', 24.5, { page: '/pricing' }],
      ['2026-07-02', 24.5, { page: '/pricing' }],
    ],
  );
  assert.deepEqual(
    metrics.filter((metric) => metric.name === 'topPageEngagementRate')
      .map((metric) => [metric.date, metric.value, metric.dimensions]),
    [
      ['2026-07-01', 75, { page: '/pricing' }],
      ['2026-07-02', 75, { page: '/pricing' }],
    ],
  );
});

test('GA4 rejects invalid or excessively large backfill ranges before querying', () => {
  assert.throws(
    () => ga4DatesInRange({ from: '2026-02-31', to: '2026-03-02' }),
    /invalid date range/,
  );
  assert.throws(
    () => ga4DatesInRange({ from: '2026-07-03', to: '2026-07-02' }),
    /invalid date range/,
  );
  assert.throws(
    () => ga4DatesInRange({ from: '2025-01-01', to: '2026-07-02' }),
    /exceeds 92 days/,
  );
});

test('GA4 emits only defined additive zeros for a valid empty day', async () => {
  const metrics = await collectGa4Metrics(
    'token',
    '123456',
    { from: '2026-07-01', to: '2026-07-01' },
    async () => ({ rows: [] }),
  );

  const rollups = metrics.filter((metric) => !metric.dimensions);
  assert.deepEqual(
    Object.fromEntries(rollups.map((metric) => [metric.name, metric.value])),
    {
      sessions: 0,
      totalUsers: 0,
      newUsers: 0,
      conversions: 0,
      screenPageViews: 0,
      engagedSessions: 0,
    },
  );
  assert.equal(rollups.some((metric) => metric.name === 'bounceRate'), false);
  assert.equal(
    rollups.some((metric) => metric.name === 'averageSessionDuration'),
    false,
  );
  assert.equal(rollups.some((metric) => metric.name === 'engagementRate'), false);
});

test('GA4 fails malformed totals instead of converting invalid values to zero', async () => {
  await assert.rejects(
    collectGa4Metrics(
      'token',
      '123456',
      { from: '2026-07-01', to: '2026-07-01' },
      async () => ({
        rows: [{
          metricValues: metricValues([
            10,
            100,
            20,
            0.4,
            30,
            1,
            40,
            8,
            'not-a-number',
          ]),
        }],
      }),
    ),
    /non-finite totals metric value/,
  );
});

test('GA4 omits a malformed optional breakdown without inventing zero rows', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await collectGa4Result(
      'token',
      '123456',
      { from: '2026-07-01', to: '2026-07-01' },
      async (_token, _propertyId, body) => {
        const dimension = body.dimensions?.[0]?.name;
        if (!dimension) {
          return {
            rows: [{
              metricValues: metricValues([10, 100, 20, 0.4, 30, 1, 40, 8, 0.6]),
            }],
          };
        }
        if (dimension === 'sessionDefaultChannelGroup') {
          return {
            rows: [{
              dimensionValues: [{ value: 'Organic Search' }],
              metricValues: metricValues([7, 'invalid', 14, 5, 30]),
            }],
          };
        }
        return { rows: [] };
      },
    );

    const metrics = result.metrics;
    assert.equal(result.quality, 'partial');
    assert.deepEqual(result.attemptedDates, ['2026-07-01']);
    assert.ok(result.restatedScopes.some((scope) =>
      scope.metricDate === '2026-07-01' && scope.metricName === 'sessions'));
    assert.equal(
      metrics.find((metric) => metric.name === 'sessions' && !metric.dimensions)?.value,
      10,
    );
    assert.equal(metrics.some((metric) => metric.dimensions?.channel), false);
  } finally {
    console.warn = originalWarn;
  }
});
