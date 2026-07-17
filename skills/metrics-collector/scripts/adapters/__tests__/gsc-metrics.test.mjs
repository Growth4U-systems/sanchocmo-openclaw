import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGscQueryBody,
  gscRestatementScopes,
  gscRowsToMetrics,
} from '../../gsc-metrics.js';

test('GSC queries always include date before any breakdown dimension', () => {
  const range = { from: '2026-04-01', to: '2026-06-29' };
  assert.deepEqual(buildGscQueryBody(range), {
    startDate: range.from,
    endDate: range.to,
    dimensions: ['date'],
    rowLimit: 90,
  });
  assert.deepEqual(buildGscQueryBody(range, 'query'), {
    startDate: range.from,
    endDate: range.to,
    dimensions: ['date', 'query'],
    rowLimit: 1_800,
  });
});

test('GSC multi-day rows are persisted on their actual dates', () => {
  const range = { from: '2026-07-12', to: '2026-07-13' };
  const metrics = gscRowsToMetrics([
    { keys: ['2026-07-12'], clicks: 3, impressions: 100, ctr: 0.03, position: 4.321 },
    { keys: ['2026-07-13'], clicks: 5, impressions: 200, ctr: 0.025, position: 3.456 },
  ], range);

  assert.deepEqual(
    metrics.filter((metric) => metric.name === 'clicks').map((metric) => [metric.date, metric.value]),
    [['2026-07-12', 3], ['2026-07-13', 5]],
  );
  assert.deepEqual(
    metrics.filter((metric) => metric.name === 'ctr').map((metric) => [metric.date, metric.value]),
    [['2026-07-12', 3], ['2026-07-13', 2.5]],
  );
  assert.ok(metrics.every((metric) => metric.dimensions === undefined));
});

test('GSC date/query rows keep date out of logical dimensions', () => {
  const range = { from: '2026-07-13', to: '2026-07-13' };
  const metrics = gscRowsToMetrics([
    { keys: ['2026-07-13', 'sancho cmo'], clicks: 4, impressions: 40, ctr: 0.1, position: 1.2 },
  ], range, 'query');

  assert.ok(metrics.every((metric) => metric.date === '2026-07-13'));
  assert.ok(metrics.every((metric) => metric.dimensions?.query === 'sancho cmo'));
});

test('GSC refuses aggregate rows that lack the date dimension', () => {
  assert.throws(
    () => gscRowsToMetrics([{ clicks: 10, impressions: 100 }], { from: '2026-07-12', to: '2026-07-13' }),
    /missing a valid date dimension/,
  );
});

test('GSC headline totals emit explicit zeros for dates omitted by the API', () => {
  const metrics = gscRowsToMetrics(
    [{ keys: ['2026-07-10'], clicks: 2, impressions: 20, ctr: 0.1, position: 4 }],
    { from: '2026-07-10', to: '2026-07-11' },
    null,
    { fillMissingDates: true },
  );

  assert.deepEqual(
    metrics.filter((metric) => metric.date === '2026-07-11'),
    [
      { name: 'clicks', value: 0, date: '2026-07-11' },
      { name: 'impressions', value: 0, date: '2026-07-11' },
    ],
  );
});

test('GSC clean empty days explicitly restate undefined derived metrics', () => {
  assert.deepEqual(
    gscRestatementScopes({ from: '2026-07-11', to: '2026-07-11' }),
    [
      { metricDate: '2026-07-11', metricName: 'clicks' },
      { metricDate: '2026-07-11', metricName: 'impressions' },
      { metricDate: '2026-07-11', metricName: 'ctr' },
      { metricDate: '2026-07-11', metricName: 'position' },
    ],
  );
});

test('GSC rejects impossible calendar dates and reversed ranges', () => {
  assert.throws(
    () => buildGscQueryBody({ from: '2026-02-30', to: '2026-03-01' }),
    /invalid date range/,
  );
  assert.throws(
    () => buildGscQueryBody({ from: '2026-07-12', to: '2026-07-11' }),
    /invalid date range/,
  );
});

test('GSC rejects malformed numeric metrics instead of persisting NaN or zero', () => {
  assert.throws(
    () => gscRowsToMetrics(
      [{ keys: ['2026-07-12'], clicks: 'bad', impressions: 100, ctr: 0.1, position: 3 }],
      { from: '2026-07-12', to: '2026-07-12' },
    ),
    /invalid clicks/,
  );
  assert.throws(
    () => gscRowsToMetrics(
      [{ keys: ['2026-07-12'], clicks: 10, impressions: 100, ctr: 1.5, position: 3 }],
      { from: '2026-07-12', to: '2026-07-12' },
    ),
    /invalid ctr ratio/,
  );
});

test('GSC rejects breakdown rows without the requested logical dimension', () => {
  assert.throws(
    () => gscRowsToMetrics(
      [{ keys: ['2026-07-12'], clicks: 1, impressions: 10, ctr: 0.1, position: 3 }],
      { from: '2026-07-12', to: '2026-07-12' },
      'query',
    ),
    /missing query dimension/,
  );
});
