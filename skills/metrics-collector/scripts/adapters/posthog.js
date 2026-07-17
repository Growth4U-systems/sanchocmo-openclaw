/**
 * PostHog Adapter — Product analytics via PostHog API
 *
 * Feeds the "Product" surface (Métricas v2). Pulls activation / funnel data via
 * the HogQL Query API and the count of session recordings:
 *   - pageviews           total $pageview events in the range
 *   - activation_events   total activation events (config.activationEvent, default `$identify`)
 *   - funnel_step_reached per-step reached counts, dims { step, order } (config.funnelSteps)
 *   - session_recordings  count of recordings captured in the range
 *
 * Auth: personal API key (Bearer) from {SLUG}_POSTHOG_API_KEY / POSTHOG_API_KEY.
 * Config: { projectId, host?, activationEvent?, funnelSteps? } in integrations.json.
 *   - host defaults to https://us.posthog.com (use https://eu.posthog.com for EU cloud,
 *     or a self-hosted base URL). The path-less host is fine; we append /api/... below.
 *
 * API docs: https://posthog.com/docs/api/queries  ·  https://posthog.com/docs/api/session-recordings
 */

const DEFAULT_HOST = 'https://us.posthog.com';
const DEFAULT_ACTIVATION_EVENT = '$identify';
const POSTHOG_RESTATED_METRICS = [
  'pageviews',
  'activation_events',
  'activation_rate',
  'north_star_weekly',
  'funnel_step_reached',
  'session_recordings',
];

/** Strip any trailing slash so `${host}/api/...` never doubles up. */
function normalizeHost(host) {
  const h = (host || DEFAULT_HOST).trim();
  const withScheme = h.startsWith('http') ? h : `https://${h}`;
  return withScheme.replace(/\/+$/, '');
}

/**
 * Run a HogQL query against the project. Returns the rows array (`results`) or
 * throws on a non-2xx so the caller's try/catch can log + degrade.
 * @returns {Promise<Array<Array<unknown>>>}
 */
async function runQuery(host, projectId, headers, query) {
  const url = `${host}/api/projects/${projectId}/query/`;
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`PostHog query ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!Array.isArray(data.results)) {
    throw new Error('PostHog query: response missing results array');
  }
  return data.results;
}

function countResult(rows, label) {
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !Array.isArray(rows[0]) ||
    rows[0].length !== 1
  ) {
    throw new Error(`PostHog ${label}: ambiguous count result`);
  }
  const raw = rows[0][0];
  if (raw == null || raw === '') {
    throw new Error(`PostHog ${label}: response missing count result`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`PostHog ${label}: invalid count result`);
  }
  return value;
}

/** HogQL-escape a single-quoted string literal. */
function sqlStr(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * @param {object} config - { projectId, host?, activationEvent?, funnelSteps? }
 * @param {object} env - { {SLUG}_POSTHOG_API_KEY: "..." } or { POSTHOG_API_KEY: "..." }
 * @param {{ from: string, to: string }} dateRange - YYYY-MM-DD
 */
export async function collect(config, env, dateRange) {
  if (dateRange.from !== dateRange.to) {
    throw new Error('PostHog: multi-day ranges are not supported safely; collect one day at a time');
  }
  const projectId = config.projectId || config.project_id || config.PROJECT_ID;
  if (!projectId) throw new Error('PostHog: missing projectId in integrations.json');

  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const apiKey =
    env[`${slugUpper}_POSTHOG_API_KEY`] ||
    env.POSTHOG_API_KEY;
  if (!apiKey) throw new Error('PostHog: missing POSTHOG_API_KEY in .env');

  const host = normalizeHost(config.host || config.HOST || config.posthogHost || config.POSTHOG_HOST);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const metrics = [];
  let optionalQualityPartial = false;
  // HogQL compares against timestamp; include the full `to` day.
  const from = dateRange.from;
  const to = dateRange.to;
  const where = `timestamp >= toDateTime('${sqlStr(from)} 00:00:00') AND timestamp <= toDateTime('${sqlStr(to)} 23:59:59')`;

  // --- Pageviews (CANARY) ---
  // NOT wrapped in try/catch on purpose: a failure here means a bad key / project /
  // host, so let it propagate → collect.js marks the source FAILED instead of
  // recording an empty "ok" snapshot that looks connected. (The later, non-essential
  // queries below stay graceful so one flaky sub-query doesn't fail the whole pull.)
  {
    const rows = await runQuery(
      host,
      projectId,
      headers,
      `SELECT count() FROM events WHERE event = '$pageview' AND ${where}`,
    );
    metrics.push({ name: 'pageviews', value: countResult(rows, 'pageviews'), date: from });
  }

  // --- Activation events ---
  const activationEvent = config.activationEvent || config.activation_event || DEFAULT_ACTIVATION_EVENT;
  try {
    const rows = await runQuery(
      host,
      projectId,
      headers,
      `SELECT count() FROM events WHERE event = '${sqlStr(activationEvent)}' AND ${where}`,
    );
    const activation = countResult(rows, 'activation events');
    // Roll-up (NO dimensions) so plan funnel steps / KPI formulas referencing
    // `posthog.activation_events` resolve — the resolvers only match no-dimension
    // metrics (a dimensioned-only metric would render "—" despite collected data).
    metrics.push({ name: 'activation_events', value: activation, date: from });
    const pageviews = Number(metrics.find((metric) => metric.name === 'pageviews' && !metric.dimensions)?.value) || 0;
    // 0 / 0 is undefined, not 0%. Keep the additive event counts, but omit the
    // derived rate until there is a real denominator so the UI renders an honest
    // missing state instead of a fabricated successful conversion rate.
    if (pageviews > 0) {
      metrics.push({ name: 'activation_rate', value: (activation / pageviews) * 100, date: from });
    }
  } catch (err) {
    optionalQualityPartial = true;
    console.warn(`  ⚠️  PostHog activation events error: ${err.message}`);
  }

  const northStarEvent = config.northStarEvent || config.north_star_event;
  if (northStarEvent) {
    try {
      const rows = await runQuery(
        host,
        projectId,
        headers,
        `SELECT count() FROM events WHERE event = '${sqlStr(northStarEvent)}' AND ${where}`,
      );
      metrics.push({ name: 'north_star_weekly', value: countResult(rows, 'north star event'), date: from });
    } catch (err) {
      optionalQualityPartial = true;
      console.warn(`  ⚠️  PostHog north star event "${northStarEvent}" error: ${err.message}`);
    }
  }

  // --- Funnel step dropoff (per-step counts, dimensioned by step) ---
  // funnelSteps is an ordered list of event names that make up the product funnel.
  // We emit the count per step plus the dropoff (drop from the previous step) so
  // the UI can render "X → Y, −N lost" without re-deriving the order.
  const funnelSteps = Array.isArray(config.funnelSteps)
    ? config.funnelSteps
    : Array.isArray(config.funnel_steps)
      ? config.funnel_steps
      : [];
  if (funnelSteps.length > 0) {
    const expectedSteps = funnelSteps.reduce((count, step) => {
      const stepName = typeof step === 'string' ? step : step?.event || step?.name;
      return typeof stepName === 'string' && stepName.trim() ? count + 1 : count;
    }, 0);
    if (expectedSteps !== funnelSteps.length) optionalQualityPartial = true;
    for (let i = 0; i < funnelSteps.length; i++) {
      const step = funnelSteps[i];
      const stepName = typeof step === 'string' ? step : step?.event || step?.name;
      if (!stepName) continue;
      try {
        const rows = await runQuery(
          host,
          projectId,
          headers,
          // count() (events), NOT count(DISTINCT person_id): the collector stores
          // daily snapshots that aggregateEntries SUMS over the dashboard range, and
          // distinct-person counts aren't additive across days (a person active on
          // two days would be double-counted). Event counts are additive and preserve
          // the funnel shape (step1 ≥ step2 ≥ …).
          `SELECT count() FROM events WHERE event = '${sqlStr(stepName)}' AND ${where}`,
        );
        const count = countResult(rows, `funnel step "${stepName}"`);
        // value = the reached count; dimensions are stable config metadata only.
        // Putting the (daily-varying) count in dimensions would make aggregateEntries
        // key each day separately → duplicate per-day funnel rows. The UI derives the
        // per-step dropoff from consecutive reached counts.
        metrics.push({
          name: 'funnel_step_reached',
          value: count,
          date: from,
          dimensions: { step: stepName, order: i + 1, expectedSteps },
        });
      } catch (err) {
        optionalQualityPartial = true;
        console.warn(`  ⚠️  PostHog funnel step "${stepName}" error: ${err.message}`);
      }
    }
  }

  // --- Session recordings (count in range) ---
  try {
    const params = new URLSearchParams({
      date_from: from,
      date_to: to,
      limit: '1',
    });
    const url = `${host}/api/projects/${projectId}/session_recordings/?${params.toString()}`;
    const resp = await fetch(url, { headers });
    if (resp.ok) {
      const data = await resp.json();
      // Trust only the endpoint's total `count`. The request uses limit=1, so a
      // `results.length` fallback would cap the value at 1 — skip the metric instead
      // of reporting a wrong number when no count is returned.
      if (Number.isSafeInteger(data.count) && data.count >= 0) {
        metrics.push({ name: 'session_recordings', value: data.count, date: from });
      } else {
        optionalQualityPartial = true;
        console.warn('  ⚠️  PostHog session recordings: no numeric count in response, skipping');
      }
    } else {
      optionalQualityPartial = true;
      const text = await resp.text().catch(() => '');
      console.warn(`  ⚠️  PostHog session recordings ${resp.status}: ${text.slice(0, 100)}`);
    }
  } catch (err) {
    optionalQualityPartial = true;
    console.warn(`  ⚠️  PostHog session recordings error: ${err.message}`);
  }

  return {
    source: 'posthog',
    date: from,
    metrics,
    attemptedDates: [from],
    restatedScopes: POSTHOG_RESTATED_METRICS.map((metricName) => ({
      metricDate: from,
      metricName,
    })),
    ...(optionalQualityPartial ? { quality: 'partial' } : {}),
  };
}
