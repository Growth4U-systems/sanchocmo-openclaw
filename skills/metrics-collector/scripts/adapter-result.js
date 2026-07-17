/**
 * Normalize a successful adapter response into the snapshot payload transported
 * to the app ingest process. Keeping this outside collect.js makes the boundary
 * testable without executing the collector CLI.
 */

import { resolveAdapterDateRange } from './adapter-date-range.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_ATTEMPTED_DATES = 366;
const MAX_RESTATEMENT_SCOPES = 10_000;

function isRealIsoDay(value) {
  if (typeof value !== 'string' || !ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function providerDatesInRange(dateRange) {
  const from = dateRange?.from;
  const to = dateRange?.to;
  if (!isRealIsoDay(from) || !isRealIsoDay(to) || from > to) {
    throw new Error(`Invalid provider date range ${from || '?'}..${to || '?'}`);
  }
  const dates = [];
  for (
    let cursor = Date.parse(`${from}T00:00:00.000Z`), end = Date.parse(`${to}T00:00:00.000Z`);
    cursor <= end;
    cursor += DAY_MS
  ) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    if (dates.length > MAX_ATTEMPTED_DATES) {
      throw new Error(`Provider date range cannot exceed ${MAX_ATTEMPTED_DATES} days`);
    }
  }
  return dates;
}

/** Resolve provider dates before importing/running the adapter so its catch path
 * retains the exact lagged attempt (not the generic CLI range). */
export function resolveProviderCollectionAttempt(
  adapterName,
  requestedRange,
  options = {},
) {
  const dateRange = resolveAdapterDateRange(adapterName, requestedRange, options);
  return { dateRange, attemptedDates: providerDatesInRange(dateRange) };
}

function normalizeAttemptedDates(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Adapter result requires exact attemptedDates');
  }
  if (value.length > MAX_ATTEMPTED_DATES || value.some((date) => !isRealIsoDay(date))) {
    throw new Error('Adapter attemptedDates must be bounded real YYYY-MM-DD dates');
  }
  return [...new Set(value)].sort();
}

export function buildFailedSourcePayload(
  error,
  attemptedProviderDates,
  fallbackDateRange,
) {
  return {
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
    attemptedDates: attemptedProviderDates == null
      ? providerDatesInRange(fallbackDateRange)
      : normalizeAttemptedDates(attemptedProviderDates),
  };
}

function normalizeRestatedScopes(value, attemptedDates) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_RESTATEMENT_SCOPES) {
    throw new Error('Adapter restatedScopes must be a bounded array');
  }
  const attempted = new Set(attemptedDates);
  const scopes = new Map();
  for (const scope of value) {
    const metricName = typeof scope?.metricName === 'string' ? scope.metricName.trim() : '';
    if (
      !isRealIsoDay(scope?.metricDate)
      || !attempted.has(scope.metricDate)
      || !metricName
      || metricName.length > 200
    ) {
      throw new Error('Adapter restatedScopes require an attempted metricDate and metricName');
    }
    scopes.set(`${scope.metricDate}\u0000${metricName}`, {
      metricDate: scope.metricDate,
      metricName,
    });
  }
  return [...scopes.values()].sort((left, right) =>
    left.metricDate.localeCompare(right.metricDate)
    || left.metricName.localeCompare(right.metricName));
}

export function buildCollectedSourcePayload(data, collectedAt, attemptedProviderDates) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Adapter result must be an object');
  }
  const status = data.status ?? 'ok';
  if (status !== 'ok' && status !== 'connected_no_data') {
    throw new Error(`Unsupported successful adapter status: ${status}`);
  }
  const metrics = Array.isArray(data.metrics) ? data.metrics : [];
  const attemptedDates = normalizeAttemptedDates(
    data.attemptedDates ?? attemptedProviderDates,
  );
  const restatedScopes = normalizeRestatedScopes(data.restatedScopes, attemptedDates);
  const payload = {
    status,
    collectedAt,
    metrics,
    attemptedDates,
    ...(restatedScopes.length ? { restatedScopes } : {}),
    ...(data.provenance ? { provenance: data.provenance } : {}),
    ...(data.quality ? { quality: data.quality } : {}),
  };

  if (status !== 'connected_no_data') return payload;
  if (metrics.length) {
    throw new Error('connected_no_data adapter result cannot contain metrics');
  }
  if (
    !Array.isArray(data.restatedDates)
    || data.restatedDates.length === 0
    || data.restatedDates.some((date) => !isRealIsoDay(date))
  ) {
    throw new Error('connected_no_data adapter result requires exact restatedDates');
  }
  return {
    ...payload,
    restatedDates: [...new Set(data.restatedDates)].sort(),
  };
}
