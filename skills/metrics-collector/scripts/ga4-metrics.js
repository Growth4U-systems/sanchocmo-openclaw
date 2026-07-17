const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Four reports are issued per day (totals + channel + page + device). This cap
// supports a 90-day repair while bounding one invocation to at most 368 calls;
// larger historical backfills must be split explicitly.
const MAX_DAYS_PER_COLLECTION = 92;
const TOTAL_METRICS = [
  { providerName: 'sessions', metricName: 'sessions' },
  { providerName: 'totalUsers', metricName: 'totalUsers' },
  { providerName: 'newUsers', metricName: 'newUsers' },
  { providerName: 'bounceRate', metricName: 'bounceRate' },
  { providerName: 'averageSessionDuration', metricName: 'averageSessionDuration' },
  // GA4 Data API replaced the deprecated `conversions` field with
  // `keyEvents`. Keep Sancho's stable internal name at the adapter boundary.
  { providerName: 'keyEvents', metricName: 'conversions' },
  { providerName: 'screenPageViews', metricName: 'screenPageViews' },
  { providerName: 'engagedSessions', metricName: 'engagedSessions' },
  { providerName: 'engagementRate', metricName: 'engagementRate' },
];
const EMPTY_DAY_ZERO_METRICS = new Set([
  'sessions',
  'totalUsers',
  'newUsers',
  'conversions',
  'screenPageViews',
  'engagedSessions',
]);
const GA4_RESTATED_METRICS = [...new Set([
  ...TOTAL_METRICS.map(({ metricName }) => metricName),
  'topPage',
  'topPageSessions',
  'topPageDuration',
  'topPageEngagementRate',
])];

export function ga4DatesInRange(dateRange) {
  const from = String(dateRange?.from || '');
  const to = String(dateRange?.to || '');
  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to) || from > to) {
    throw new Error(`GA4: invalid date range ${from || '?'}..${to || '?'}`);
  }

  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (
    !Number.isFinite(cursor.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    cursor.toISOString().slice(0, 10) !== from ||
    end.toISOString().slice(0, 10) !== to
  ) {
    throw new Error(`GA4: invalid date range ${from}..${to}`);
  }

  const dates = [];
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    if (dates.length > MAX_DAYS_PER_COLLECTION) {
      throw new Error(
        `GA4: date range exceeds ${MAX_DAYS_PER_COLLECTION} days; split the backfill into smaller ranges`,
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function reportRows(result, label) {
  if (!result || typeof result !== 'object') {
    throw new Error(`GA4: malformed ${label} response`);
  }
  if (Array.isArray(result.rows)) return result.rows;
  if (result.rows == null && Number(result.rowCount) === 0) return [];
  throw new Error(`GA4: malformed ${label} rows`);
}

function metricNumbers(row, expectedLength, label) {
  if (!Array.isArray(row?.metricValues) || row.metricValues.length !== expectedLength) {
    throw new Error(`GA4: malformed ${label} metricValues`);
  }
  return row.metricValues.map((entry) => {
    const value = Number(entry?.value);
    if (!Number.isFinite(value)) {
      throw new Error(`GA4: non-finite ${label} metric value`);
    }
    return value;
  });
}

function dimensionValue(row, label) {
  const value = row?.dimensionValues?.[0]?.value;
  if (typeof value !== 'string' || !value) {
    throw new Error(`GA4: malformed ${label} dimension`);
  }
  return value;
}

/**
 * Collect every requested property-calendar day independently. GA4 interprets
 * YYYY-MM-DD ranges in the property's configured timezone. Its unique-user metrics are
 * not additive and a report spanning several days cannot be assigned to the
 * first day without corrupting the time series. Daily reports also preserve the
 * existing per-day top-page limit and breakdown semantics.
 */
export async function collectGa4Result(token, propertyId, dateRange, report) {
  if (typeof report !== 'function') {
    throw new Error('GA4: report function is required');
  }
  const metrics = [];
  let optionalBreakdownPartial = false;

  const attemptedDates = ga4DatesInRange(dateRange);
  for (const date of attemptedDates) {
    const dr = [{ startDate: date, endDate: date }];

    const totals = await report(token, propertyId, {
      dateRanges: dr,
      metrics: TOTAL_METRICS.map(({ providerName }) => ({ name: providerName })),
    });
    const totalRows = reportRows(totals, 'totals');
    if (totalRows.length > 1) {
      throw new Error('GA4: malformed totals response (expected at most one row)');
    }
    if (totalRows.length === 0) {
      for (const name of EMPTY_DAY_ZERO_METRICS) {
        metrics.push({ name, value: 0, date });
      }
    } else {
      const values = metricNumbers(totalRows[0], TOTAL_METRICS.length, 'totals');
      TOTAL_METRICS.forEach(({ metricName }, index) => {
        metrics.push({ name: metricName, value: values[index], date });
      });
    }

    try {
      const byChannel = await report(token, propertyId, {
        dateRanges: dr,
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'engagedSessions' },
          { name: 'screenPageViews' },
        ],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      });
      const channelMetrics = [];
      for (const row of reportRows(byChannel, 'channel breakdown')) {
        const channel = dimensionValue(row, 'channel breakdown');
        const [sessions, users, newUsers, engagedSessions, pageViews] =
          metricNumbers(row, 5, 'channel breakdown');
        channelMetrics.push(
          { name: 'sessions', value: sessions, date, dimensions: { channel } },
          { name: 'totalUsers', value: users, date, dimensions: { channel } },
          { name: 'newUsers', value: newUsers, date, dimensions: { channel } },
          { name: 'engagedSessions', value: engagedSessions, date, dimensions: { channel } },
          { name: 'screenPageViews', value: pageViews, date, dimensions: { channel } },
        );
      }
      metrics.push(...channelMetrics);
    } catch (err) {
      optionalBreakdownPartial = true;
      console.warn(`  ⚠️  GA4 channel breakdown error (${date}): ${err.message}`);
    }

    try {
      const topPages = await report(token, propertyId, {
        dateRanges: dr,
        metrics: [
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'averageSessionDuration' },
          { name: 'engagementRate' },
        ],
        dimensions: [{ name: 'pagePath' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 15,
      });
      const pageMetrics = [];
      for (const row of reportRows(topPages, 'top pages')) {
        const page = dimensionValue(row, 'top pages');
        const [pageViews, sessions, duration, engagementRate] = metricNumbers(
          row,
          4,
          'top pages',
        );
        const dimensions = { page };
        pageMetrics.push(
          { name: 'topPage', value: pageViews, date, dimensions },
          { name: 'topPageSessions', value: sessions, date, dimensions },
        );
        // Duration and rate are measurements, not identity. Sibling metrics
        // preserve one stable dimsKey for the page and can be weighted by its
        // observed sessions across a multi-day range.
        if (sessions > 0) {
          pageMetrics.push(
            { name: 'topPageDuration', value: duration, date, dimensions },
            {
              name: 'topPageEngagementRate',
              value: Math.round(engagementRate * 10_000) / 100,
              date,
              dimensions,
            },
          );
        }
      }
      metrics.push(...pageMetrics);
    } catch (err) {
      optionalBreakdownPartial = true;
      console.warn(`  ⚠️  GA4 top pages error (${date}): ${err.message}`);
    }

    try {
      const byDevice = await report(token, propertyId, {
        dateRanges: dr,
        metrics: [
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'engagementRate' },
        ],
        dimensions: [{ name: 'deviceCategory' }],
      });
      const deviceMetrics = [];
      for (const row of reportRows(byDevice, 'device breakdown')) {
        const device = dimensionValue(row, 'device breakdown');
        const [sessions, bounceRate, engagementRate] = metricNumbers(
          row,
          3,
          'device breakdown',
        );
        deviceMetrics.push(
          { name: 'sessions', value: sessions, date, dimensions: { device } },
          { name: 'bounceRate', value: bounceRate, date, dimensions: { device } },
          { name: 'engagementRate', value: engagementRate, date, dimensions: { device } },
        );
      }
      metrics.push(...deviceMetrics);
    } catch (err) {
      optionalBreakdownPartial = true;
      console.warn(`  ⚠️  GA4 device breakdown error (${date}): ${err.message}`);
    }
  }

  return {
    metrics,
    attemptedDates,
    restatedScopes: attemptedDates.flatMap((metricDate) =>
      GA4_RESTATED_METRICS.map((metricName) => ({ metricDate, metricName }))),
    ...(optionalBreakdownPartial ? { quality: 'partial' } : {}),
  };
}

/**
 * Backwards-compatible metric-only helper used by focused parsers/tests. The
 * adapter consumes collectGa4Result so optional-breakdown quality reaches the
 * ingest boundary instead of being silently reported as a fully complete run.
 */
export async function collectGa4Metrics(token, propertyId, dateRange, report) {
  return (await collectGa4Result(token, propertyId, dateRange, report)).metrics;
}
