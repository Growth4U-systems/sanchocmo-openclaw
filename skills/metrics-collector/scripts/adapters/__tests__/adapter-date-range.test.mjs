import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pointInTimeMetricDate,
  resolveCollectionObservationDate,
  resolveAdapterDateRange,
  shouldDeleteStale,
  validateReplaceOptions,
} from '../../adapter-date-range.js';

test('explicit repairs date current-state metrics on the real collection day', () => {
  const requested = { from: '2026-04-01', to: '2026-04-30' };
  assert.equal(resolveCollectionObservationDate(requested, {
    explicitRange: true,
    collectedAt: '2026-07-17T10:15:00.000Z',
  }), '2026-07-17');
  assert.equal(resolveCollectionObservationDate(requested, {
    explicitRange: false,
    collectedAt: '2026-07-17T10:15:00.000Z',
  }), '2026-07-17');
  assert.equal(
    pointInTimeMetricDate({ _pointInTimeDate: '2026-07-17' }, requested),
    '2026-07-17',
  );
  assert.throws(
    () => resolveCollectionObservationDate(requested, {
      explicitRange: true,
      collectedAt: 'not-a-date',
    }),
    /Invalid point-in-time observation date/,
  );
});

test('routine GSC collection resolves to one non-overlapping lagged day', () => {
  const requested = { from: '2026-07-15', to: '2026-07-15' };
  const first = resolveAdapterDateRange('gsc', requested, {
    now: new Date('2026-07-16T12:00:00Z'),
  });
  const next = resolveAdapterDateRange('gsc', requested, {
    now: new Date('2026-07-17T12:00:00Z'),
  });

  assert.deepEqual(first, { from: '2026-07-13', to: '2026-07-13' });
  assert.deepEqual(next, { from: '2026-07-14', to: '2026-07-14' });
  assert.notEqual(first.from, next.from);
});

test('explicit GSC backfill and non-GSC ranges are preserved', () => {
  const requested = { from: '2026-04-01', to: '2026-06-30' };
  assert.equal(
    resolveAdapterDateRange('gsc', requested, { explicitRange: true }),
    requested,
  );
  assert.equal(resolveAdapterDateRange('ga4', requested), requested);
});

test('--replace is restricted to one source with a complete explicit range', () => {
  assert.throws(
    () => validateReplaceOptions({ replace: true, collectAll: true, fromDate: '2026-04-01', toDate: '2026-06-30' }),
    /requires --source/,
  );
  assert.throws(
    () => validateReplaceOptions({ replace: true, sourceFilter: 'gsc', fromDate: '2026-04-01' }),
    /explicit --from and --to/,
  );
  assert.equal(shouldDeleteStale({
    replace: true,
    sourceFilter: 'gsc',
    fromDate: '2026-04-01',
    toDate: '2026-06-30',
  }), true);
  assert.equal(shouldDeleteStale({
    sourceFilter: 'gsc',
    fromDate: '2026-04-01',
    toDate: '2026-06-30',
  }), false);
  assert.equal(shouldDeleteStale({ collectAll: true }), true);
});
