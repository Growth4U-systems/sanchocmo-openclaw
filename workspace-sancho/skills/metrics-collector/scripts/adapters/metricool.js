/**
 * Metricool Adapter — Social media analytics via Metricool API
 *
 * Auth: X-Mc-Auth header with userToken, plus userId and blogId as query params.
 * Pulls: followers, engagement, reach, posts via Stats Service endpoints.
 *
 * API docs: https://app.metricool.com/api/swagger.json
 * Endpoints used:
 *   GET /stats/aggregations/{category} — aggregated metrics by category
 *   GET /stats/values/{category} — daily metric values
 *   GET /stats/instagram/posts — IG posts with metrics
 *   GET /stats/facebook/posts — FB posts with metrics
 */

const BASE_URL = 'https://app.metricool.com/api';

// Categories for aggregations endpoint
const CATEGORIES = ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok'];

/**
 * @param {object} config - From integrations.json
 * @param {object} env - Must contain METRICOOL_USER_TOKEN, METRICOOL_USER_ID, METRICOOL_BLOG_ID
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const userToken = env.METRICOOL_USER_TOKEN;
  const userId = env.METRICOOL_USER_ID;
  const blogId = env.METRICOOL_BLOG_ID;

  if (!userToken || !userId || !blogId) {
    throw new Error('Metricool: missing METRICOOL_USER_TOKEN, METRICOOL_USER_ID, or METRICOOL_BLOG_ID in .env');
  }

  const authParams = `userId=${userId}&blogId=${blogId}`;
  const dateParams = `init=${dateRange.from}&end=${dateRange.to}`;
  const headers = {
    'X-Mc-Auth': userToken,
    'Content-Type': 'application/json',
  };

  const metrics = [];

  // Pull aggregated metrics for each social network category
  for (const category of CATEGORIES) {
    try {
      const url = `${BASE_URL}/stats/aggregations/${category}?${authParams}&${dateParams}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        // Not all accounts have all networks — skip 404/403
        if (response.status === 404 || response.status === 403) continue;
        const text = await response.text();
        console.warn(`  ⚠️  Metricool ${category} ${response.status}: ${text.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();

      // Metricool returns an object with metric name → value pairs
      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'number' || typeof value === 'string') {
            metrics.push({
              name: key,
              value: typeof value === 'string' ? parseFloat(value) || 0 : value,
              date: dateRange.from,
              dimensions: { network: category },
            });
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠️  Metricool ${category} error: ${err.message}`);
    }
  }

  // Pull timeline for key metrics (followers over time)
  for (const metric of ['followers', 'engagement']) {
    try {
      const url = `${BASE_URL}/stats/timeline/${metric}?${authParams}&${dateParams}`;
      const response = await fetch(url, { headers });
      if (!response.ok) continue;

      const data = await response.json();
      if (Array.isArray(data)) {
        for (const point of data) {
          if (point.date && point.value !== undefined) {
            metrics.push({
              name: metric,
              value: point.value,
              date: point.date,
              dimensions: { type: 'timeline' },
            });
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠️  Metricool timeline/${metric} error: ${err.message}`);
    }
  }

  return { source: 'metricool', date: dateRange.from, metrics };
}
