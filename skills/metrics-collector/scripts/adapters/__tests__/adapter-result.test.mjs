import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCollectedSourcePayload,
  buildFailedSourcePayload,
  providerDatesInRange,
  resolveProviderCollectionAttempt,
} from '../../adapter-result.js';

test('collector transports explicit connected_no_data evidence to ingest', () => {
  assert.deepEqual(
    buildCollectedSourcePayload({
      status: 'connected_no_data',
      metrics: [],
      restatedDates: ['2026-07-02', '2026-07-01', '2026-07-02'],
      quality: 'partial',
    }, '2026-07-03T08:00:00.000Z', ['2026-07-01', '2026-07-02']),
    {
      status: 'connected_no_data',
      collectedAt: '2026-07-03T08:00:00.000Z',
      metrics: [],
      attemptedDates: ['2026-07-01', '2026-07-02'],
      restatedDates: ['2026-07-01', '2026-07-02'],
      quality: 'partial',
    },
  );
});

test('collector rejects destructive no-data evidence without exact dates', () => {
  assert.throws(
    () => buildCollectedSourcePayload(
      { status: 'connected_no_data', metrics: [] },
      '2026-07-03T08:00:00.000Z',
      ['2026-07-02'],
    ),
    /requires exact restatedDates/,
  );
  assert.throws(
    () => buildCollectedSourcePayload({
      status: 'connected_no_data',
      metrics: [{ name: 'clicksDaily', value: 0, date: '2026-07-02' }],
      restatedDates: ['2026-07-02'],
    }, '2026-07-03T08:00:00.000Z', ['2026-07-02']),
    /cannot contain metrics/,
  );
});

test('collector transports only exact, attempted restatement scopes', () => {
  assert.deepEqual(
    buildCollectedSourcePayload({
      metrics: [],
      restatedScopes: [
        { metricDate: '2026-07-02', metricName: 'sessions' },
        { metricDate: '2026-07-02', metricName: 'sessions' },
      ],
    }, '2026-07-03T08:00:00.000Z', ['2026-07-02']),
    {
      status: 'ok',
      collectedAt: '2026-07-03T08:00:00.000Z',
      metrics: [],
      attemptedDates: ['2026-07-02'],
      restatedScopes: [{ metricDate: '2026-07-02', metricName: 'sessions' }],
    },
  );

  assert.throws(
    () => buildCollectedSourcePayload({
      metrics: [],
      restatedScopes: [{ metricDate: '2026-07-01', metricName: 'sessions' }],
    }, '2026-07-03T08:00:00.000Z', ['2026-07-02']),
    /attempted metricDate/,
  );
});

test('provider range expansion is exact and bounded', () => {
  assert.deepEqual(
    providerDatesInRange({ from: '2026-07-01', to: '2026-07-03' }),
    ['2026-07-01', '2026-07-02', '2026-07-03'],
  );
  assert.throws(
    () => providerDatesInRange({ from: '2026-02-30', to: '2026-03-01' }),
    /Invalid provider date range/,
  );
});

test('routine GSC errors retain the resolved D-3 provider day', () => {
  const requestedYesterday = { from: '2026-07-16', to: '2026-07-16' };
  const attempt = resolveProviderCollectionAttempt('gsc', requestedYesterday, {
    explicitRange: false,
    now: new Date('2026-07-17T08:00:00.000Z'),
  });
  const payload = buildFailedSourcePayload(
    new Error('upstream failed'),
    attempt.attemptedDates,
    requestedYesterday,
  );

  assert.deepEqual(attempt.dateRange, { from: '2026-07-14', to: '2026-07-14' });
  assert.deepEqual(payload.attemptedDates, ['2026-07-14']);
  assert.equal(payload.attemptedDates.includes('2026-07-16'), false);
});
