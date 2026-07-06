/**
 * PageSpeed Adapter — Google PageSpeed Insights.
 *
 * Point-in-time source for Web/SEO health. The collector stores the latest
 * snapshot under `source=pagespeed`; aggregation rules keep these metrics as
 * `latest`, so weekly collection does not sum scores across days.
 */

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CATEGORIES = ['performance', 'seo', 'accessibility', 'best-practices'];

function resolveUrl(config, env) {
  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  return (
    config.url ||
    config.clientUrl ||
    config.siteUrl ||
    config.website ||
    config._client?.url ||
    config._client?.website ||
    env[`${slugUpper}_PAGESPEED_URL`] ||
    env[`${slugUpper}_CLIENT_URL`] ||
    env[`${slugUpper}_SITE_URL`] ||
    env[`${slugUpper}_WEBSITE_URL`] ||
    env.PAGESPEED_URL ||
    env.CLIENT_URL ||
    env.SITE_URL ||
    env.WEBSITE_URL ||
    ''
  ).trim();
}

function normalizeUrl(value) {
  if (!value) return '';
  return value.startsWith('http') ? value : `https://${value}`;
}

async function fetchStrategy(url, strategy, apiKey) {
  const params = new URLSearchParams({ url, strategy });
  for (const category of CATEGORIES) params.append('category', category);
  if (apiKey) params.set('key', apiKey);

  const resp = await fetch(`${PSI_BASE}?${params.toString()}`);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`PageSpeed ${strategy} ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};
  return {
    performance: Math.round((cats.performance?.score ?? 0) * 100),
    seo: Math.round((cats.seo?.score ?? 0) * 100),
    accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
    lcp: Number((((audits['largest-contentful-paint']?.numericValue ?? 0) / 1000).toFixed(1))),
    cls: Number((audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
    tbt: Math.round(audits['total-blocking-time']?.numericValue ?? 0),
  };
}

export async function collect(config, env) {
  const clientUrl = normalizeUrl(resolveUrl(config, env));
  if (!clientUrl) {
    throw new Error('PageSpeed: missing client URL in clients.json, integrations.json or *_SITE_URL env');
  }

  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const apiKey = env[`${slugUpper}_PAGESPEED_API_KEY`] || env.PAGESPEED_API_KEY || '';
  const metricDate = new Date().toISOString().slice(0, 10);
  const [mobile, desktop] = await Promise.all([
    fetchStrategy(clientUrl, 'mobile', apiKey),
    fetchStrategy(clientUrl, 'desktop', apiKey),
  ]);

  const metrics = [
    { name: 'performance_mobile', value: mobile.performance, date: metricDate },
    { name: 'seo_mobile', value: mobile.seo, date: metricDate },
    { name: 'accessibility_mobile', value: mobile.accessibility, date: metricDate },
    { name: 'best_practices_mobile', value: mobile.bestPractices, date: metricDate },
    { name: 'lcp_mobile', value: mobile.lcp, date: metricDate },
    { name: 'cls_mobile', value: mobile.cls, date: metricDate },
    { name: 'tbt_mobile', value: mobile.tbt, date: metricDate },
    { name: 'performance_desktop', value: desktop.performance, date: metricDate },
    { name: 'seo_desktop', value: desktop.seo, date: metricDate },
    { name: 'accessibility_desktop', value: desktop.accessibility, date: metricDate },
    { name: 'best_practices_desktop', value: desktop.bestPractices, date: metricDate },
    { name: 'lcp_desktop', value: desktop.lcp, date: metricDate },
    { name: 'cls_desktop', value: desktop.cls, date: metricDate },
    { name: 'tbt_desktop', value: desktop.tbt, date: metricDate },
  ];

  return { source: 'pagespeed', date: metricDate, metrics };
}
