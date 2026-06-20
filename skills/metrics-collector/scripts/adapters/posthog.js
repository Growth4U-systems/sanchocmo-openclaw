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
  return Array.isArray(data.results) ? data.results : [];
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
    metrics.push({ name: 'pageviews', value: Number(rows?.[0]?.[0]) || 0, date: from });
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
    const activation = Number(rows?.[0]?.[0]) || 0;
    // Roll-up (NO dimensions) so plan funnel steps / KPI formulas referencing
    // `posthog.activation_events` resolve — the resolvers only match no-dimension
    // metrics (a dimensioned-only metric would render "—" despite collected data).
    metrics.push({ name: 'activation_events', value: activation, date: from });
  } catch (err) {
    console.warn(`  ⚠️  PostHog activation events error: ${err.message}`);
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
    for (let i = 0; i < funnelSteps.length; i++) {
      const step = funnelSteps[i];
      const stepName = typeof step === 'string' ? step : step?.event || step?.name;
      if (!stepName) continue;
      try {
        const rows = await runQuery(
          host,
          projectId,
          headers,
          `SELECT count(DISTINCT person_id) FROM events WHERE event = '${sqlStr(stepName)}' AND ${where}`,
        );
        const count = Number(rows?.[0]?.[0]) || 0;
        // value = the reached count; dimensions are STABLE { step, order } ONLY.
        // Putting the (daily-varying) count in dimensions would make aggregateEntries
        // key each day separately → duplicate per-day funnel rows. The UI derives the
        // per-step dropoff from consecutive reached counts.
        metrics.push({
          name: 'funnel_step_reached',
          value: count,
          date: from,
          dimensions: { step: stepName, order: i + 1 },
        });
      } catch (err) {
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
      // `count` is the total matching recordings; fall back to results length.
      const count = Number.isFinite(data.count)
        ? data.count
        : Array.isArray(data.results)
          ? data.results.length
          : 0;
      metrics.push({ name: 'session_recordings', value: count, date: from });
    } else {
      const text = await resp.text().catch(() => '');
      console.warn(`  ⚠️  PostHog session recordings ${resp.status}: ${text.slice(0, 100)}`);
    }
  } catch (err) {
    console.warn(`  ⚠️  PostHog session recordings error: ${err.message}`);
  }

  return { source: 'posthog', date: from, metrics };
}
