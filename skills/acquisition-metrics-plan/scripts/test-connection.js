#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Integration Connection Tester
 * Tests API connections for a client using their integrations.json + .env
 *
 * Usage:
 *   node test-connection.js --slug paymatico --source ga4
 *   node test-connection.js --slug paymatico --all
 *   node test-connection.js --slug paymatico --category analytics
 *
 * Reads:
 *   - brand/{slug}/integrations.json (config + env var names)
 *   - brand/{slug}/.env (secrets)
 *   - schemas/api-catalog.json (test endpoints + credential specs)
 *
 * Updates:
 *   - brand/{slug}/integrations.json (status, lastTestedAt, lastError)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// --- Config ---
const WORKSPACE_DIR = process.env.MC_WORKSPACE ? path.resolve(process.env.MC_WORKSPACE) : null;
const BRAND_DIR = WORKSPACE_DIR
  ? path.join(WORKSPACE_DIR, 'brand')
  : path.resolve(__dirname, '..', '..', '..', 'brand');
const GLOBAL_ENV_PATH = WORKSPACE_DIR
  ? path.join(WORKSPACE_DIR, '..', '.env')
  : path.resolve(__dirname, '..', '..', '..', '.env');
const CLIENTS_PATH = WORKSPACE_DIR
  ? path.join(WORKSPACE_DIR, 'clients.json')
  : path.resolve(__dirname, '..', '..', '..', 'clients.json');
const CATALOG_PATH = path.resolve(__dirname, '..', 'schemas', 'api-catalog.json');

// --- Env loader ---
function loadEnvFile(envPath) {
  const vars = {};
  if (!fs.existsSync(envPath)) return vars;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function normalizeEnvPart(value) {
  return String(value || '').replace(/-/g, '_').toUpperCase();
}

function scopedEnvName(slugUpper, apiId, fieldKey) {
  return `${slugUpper}_${normalizeEnvPart(apiId)}_${normalizeEnvPart(fieldKey)}`;
}

function flatEnvName(apiId, fieldKey) {
  return `${normalizeEnvPart(apiId)}_${normalizeEnvPart(fieldKey)}`;
}

function applyScopedAliases(env, slugUpper, source) {
  const prefix = `${slugUpper}_`;
  for (const [key, value] of Object.entries(source || {})) {
    if (!value || !key.startsWith(prefix)) continue;
    const flat = key.slice(prefix.length);
    if (flat) env[flat] = value;
  }
}

function applyCatalogFallbacks(env, slugUpper, catalog) {
  for (const cat of Object.values(catalog.categories || {})) {
    for (const [apiId, apiMeta] of Object.entries(cat.apis || {})) {
      const fields = [...(apiMeta.credentials || []), ...(apiMeta.config || [])];
      for (const field of fields) {
        if (!field || !field.key) continue;
        const scoped = scopedEnvName(slugUpper, apiId, field.key);
        const flat = flatEnvName(apiId, field.key);
        // `flat` is the resolved Local -> Global value after aliases are
        // applied. Mirror it back to the scoped name even if an older global
        // scoped value exists, so every tester observes the same precedence.
        if (env[flat]) env[scoped] = env[flat];
      }
    }
  }
}

function buildRuntimeEnv(slugUpper, globalEnv, brandEnv, catalog) {
  const env = { ...process.env, ...globalEnv };
  applyScopedAliases(env, slugUpper, process.env);
  applyScopedAliases(env, slugUpper, globalEnv);
  Object.assign(env, brandEnv);
  applyScopedAliases(env, slugUpper, brandEnv);
  applyCatalogFallbacks(env, slugUpper, catalog);
  return env;
}

function loadClientConfig(slug) {
  try {
    const data = JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf8'));
    if (isRecord(data?.[slug])) return data[slug];
    if (Array.isArray(data?.clients)) {
      return data.clients.find((client) => isRecord(client) && client.slug === slug) || {};
    }
  } catch {}
  return {};
}

function loadAdminToken() {
  if (typeof process.env.MC_ADMIN_TOKEN === 'string' && process.env.MC_ADMIN_TOKEN) {
    return process.env.MC_ADMIN_TOKEN;
  }
  try {
    const data = JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf8'));
    return firstPresent(data?.adminToken);
  } catch {
    return '';
  }
}

// --- HTTP request helper ---
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout (10s)')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Tests inject this dependency instead of reaching real provider APIs. Runtime
// always uses httpRequest; keeping the seam here makes every payload contract
// independently verifiable without weakening production validation.
let connectionRequest = httpRequest;

function firstPresent(...values) {
  for (const value of values) {
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function providerEnv(env, slugUpper, ...keys) {
  for (const key of keys) {
    const value = firstPresent(
      env[key],
      slugUpper ? env[`${slugUpper}_${key}`] : '',
    );
    if (value) return value;
  }
  return '';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(body, label) {
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error(`${label}: invalid JSON response`);
  }
  return value;
}

function responseError(_provider, response) {
  const detail = String(response.body || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return `HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function requireIanaTimezone(value, label = 'timezone') {
  const timezone = firstPresent(value);
  if (!timezone) throw new Error(`${label} missing`);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error(`${label} must be a valid IANA timezone`);
  }
  return timezone;
}

function timezoneOffsetMs(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(value.year), Number(value.month) - 1, Number(value.day),
    Number(value.hour), Number(value.minute), Number(value.second),
  ) - Math.floor(timestamp / 1000) * 1000;
}

function localMidnightUtc(date, timezone) {
  const [year, month, day] = date.split('-').map(Number);
  const localTimestamp = Date.UTC(year, month - 1, day);
  let candidate = localTimestamp;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate = localTimestamp - timezoneOffsetMs(candidate, timezone);
  }
  return candidate;
}

function zonedDayBounds(date, timezone) {
  const next = new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    startTime: localMidnightUtc(date, timezone),
    endTime: localMidnightUtc(next, timezone) - 1,
  };
}

function assertFiniteNonNegative(value, label) {
  const number = Number(value);
  if (value == null || value === '' || !Number.isFinite(number) || number < 0) {
    throw new Error(`${label}: expected a non-negative number`);
  }
  return number;
}

function normalizeHttpBase(value, fallback = '') {
  const raw = firstPresent(value, fallback);
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withScheme);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Base URL must use http or https');
  }
  return parsed.toString().replace(/\/+$/, '');
}

// --- System Service Account loader ---
function loadSystemServiceAccount() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    WORKSPACE_DIR ? path.join(WORKSPACE_DIR, '.secrets', 'google-service-account.json') : null,
    path.resolve(__dirname, '..', '..', '..', '.secrets', 'google-service-account.json'),
  ].filter(Boolean);

  for (const saPath of [...new Set(candidates.map((candidate) => path.resolve(candidate)))]) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      if (
        isRecord(serviceAccount) &&
        typeof serviceAccount.client_email === 'string' && serviceAccount.client_email.trim() &&
        typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.trim()
      ) {
        return serviceAccount;
      }
    } catch {
      // Try the next location. Production stores it under MC_WORKSPACE/.secrets.
    }
  }
  return null;
}

let serviceAccountForConnection = loadSystemServiceAccount;
let googleAccessTokenForConnection = getGoogleAccessToken;

// --- Test functions per source ---
const TESTERS = {
  async ga4(config, _env, _slug) {
    const propertyId = firstPresent(config.propertyId, config.PROPERTY_ID);
    if (!propertyId) return { ok: false, error: 'Property ID not configured' };

    const sa = serviceAccountForConnection();
    if (!sa) return { ok: false, error: 'System Google Service Account not configured. Go to /mc/connect/system/google-sa' };

    try {
      const token = await googleAccessTokenForConnection(sa);
      const metrics = [
        'sessions',
        'totalUsers',
        'newUsers',
        'bounceRate',
        'averageSessionDuration',
        'conversions',
        'screenPageViews',
        'engagedSessions',
        'engagementRate',
      ];
      const day = isoDaysAgo(1);
      const res = await connectionRequest(
        `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: day, endDate: day }],
            metrics: metrics.map((name) => ({ name })),
            limit: 1,
          }),
        }
      );
      if (res.status === 403) return { ok: false, error: `Acceso denegado. Asegúrate de dar acceso "Lector" a ${sa.client_email} en la propiedad GA4 ${propertyId}` };
      if (res.status !== 200) return { ok: false, error: responseError('GA4', res) };

      const data = parseJson(res.body, 'GA4 runReport');
      if (!isRecord(data) || !Array.isArray(data.metricHeaders)) {
        throw new Error('GA4 runReport: response missing metricHeaders array');
      }
      const returnedMetrics = data.metricHeaders.map((header) => header?.name);
      if (returnedMetrics.length !== metrics.length || metrics.some((name, index) => returnedMetrics[index] !== name)) {
        throw new Error('GA4 runReport: metric headers do not match the collector query');
      }
      if (data.rows == null) {
        if (Number(data.rowCount) !== 0) throw new Error('GA4 runReport: response missing rows array');
      } else {
        if (!Array.isArray(data.rows) || data.rows.length > 1) {
          throw new Error('GA4 runReport: expected at most one totals row');
        }
        for (const row of data.rows) {
          if (!Array.isArray(row?.metricValues) || row.metricValues.length !== metrics.length) {
            throw new Error('GA4 runReport: malformed metricValues');
          }
          row.metricValues.forEach((entry, index) => {
            assertFiniteNonNegative(entry?.value, `GA4 ${metrics[index]}`);
          });
        }
      }
      return { ok: true, detail: `GA4 Data API v1beta verified for property ${propertyId}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async gsc(config, _env, _slug) {
    const siteUrl = firstPresent(config.siteUrl, config.SITE_URL, config.site_url);
    if (!siteUrl) return { ok: false, error: 'Site URL not configured' };

    const sa = serviceAccountForConnection();
    if (!sa) return { ok: false, error: 'System Google Service Account not configured. Go to /mc/connect/system/google-sa' };

    try {
      const token = await googleAccessTokenForConnection(sa, 'https://www.googleapis.com/auth/webmasters.readonly');
      const encodedUrl = encodeURIComponent(siteUrl);
      const day = isoDaysAgo(3);
      const res = await connectionRequest(
        `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: day,
            endDate: day,
            dimensions: ['date'],
            rowLimit: 1,
          }),
        }
      );
      if (res.status === 403) return { ok: false, error: `Acceso denegado. Asegúrate de dar acceso a ${sa.client_email} en Search Console para ${siteUrl}` };
      if (res.status !== 200) return { ok: false, error: responseError('GSC', res) };

      const data = parseJson(res.body, 'GSC searchAnalytics');
      if (!isRecord(data) || (data.rows != null && !Array.isArray(data.rows))) {
        throw new Error('GSC searchAnalytics: response rows must be an array');
      }
      for (const row of data.rows || []) {
        if (!Array.isArray(row?.keys) || row.keys[0] !== day) {
          throw new Error('GSC searchAnalytics: row missing requested date dimension');
        }
        assertFiniteNonNegative(row.clicks, 'GSC clicks');
        assertFiniteNonNegative(row.impressions, 'GSC impressions');
        const ctr = assertFiniteNonNegative(row.ctr, 'GSC ctr');
        if (ctr > 1) throw new Error('GSC ctr: expected a ratio from 0 to 1');
        assertFiniteNonNegative(row.position, 'GSC position');
      }
      return { ok: true, detail: `GSC Search Analytics verified for ${siteUrl}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async meta_ads(config, env, slug) {
    const token = providerEnv(env, slug, 'META_ADS_ACCESS_TOKEN', 'META_ACCESS_TOKEN');
    const accountId = firstPresent(
      providerEnv(env, slug, 'META_ADS_ACCOUNT_ID', 'META_ACCOUNT_ID'),
      config.accountId,
      config.ACCOUNT_ID,
    );
    if (!token) return { ok: false, error: 'META_ADS_ACCESS_TOKEN (or META_ACCESS_TOKEN) not set' };
    if (!accountId) return { ok: false, error: 'accountId not configured (set ACCOUNT_ID, format: act_XXXXXXXXX)' };

    try {
      const day = isoDaysAgo(1);
      const params = new URLSearchParams({
        fields: 'spend,impressions,clicks,ctr,cpc,frequency,actions,action_values',
        time_range: JSON.stringify({ since: day, until: day }),
      });
      const res = await connectionRequest(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(accountId)}/insights?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status !== 200) return { ok: false, error: responseError('Meta Ads', res) };

      const data = parseJson(res.body, 'Meta Ads Insights');
      if (!isRecord(data) || !Array.isArray(data.data)) {
        throw new Error('Meta Ads Insights: response missing data array');
      }
      if (data.data.length > 1) {
        throw new Error(`Meta Ads Insights: expected at most one account row, received ${data.data.length}`);
      }
      for (const row of data.data) {
        if (!isRecord(row)) throw new Error('Meta Ads Insights: row must be an object');
        assertFiniteNonNegative(row.spend, 'Meta Ads spend');
        assertFiniteNonNegative(row.impressions, 'Meta Ads impressions');
        assertFiniteNonNegative(row.clicks, 'Meta Ads clicks');
        for (const field of ['ctr', 'cpc', 'frequency']) {
          if (row[field] != null && row[field] !== '') {
            assertFiniteNonNegative(row[field], `Meta Ads ${field}`);
          }
        }
        for (const field of ['actions', 'action_values']) {
          if (row[field] != null && !Array.isArray(row[field])) {
            throw new Error(`Meta Ads ${field}: expected an array`);
          }
          const seen = new Set();
          for (const [index, action] of (row[field] || []).entries()) {
            if (!isRecord(action) || typeof action.action_type !== 'string' || !action.action_type) {
              throw new Error(`Meta Ads ${field}[${index}]: malformed action`);
            }
            if (seen.has(action.action_type)) {
              throw new Error(`Meta Ads ${field}: duplicate action type ${action.action_type}`);
            }
            seen.add(action.action_type);
            assertFiniteNonNegative(action.value, `Meta Ads ${field}[${index}].value`);
          }
        }
      }
      return { ok: true, detail: `Meta Marketing API v21 Insights verified for ${accountId}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async posthog(config, env, slug) {
    const apiKey = providerEnv(env, slug, 'POSTHOG_API_KEY');
    const projectId = firstPresent(config.projectId, config.project_id, config.PROJECT_ID);
    if (!apiKey) return { ok: false, error: 'POSTHOG_API_KEY not set' };
    if (!projectId) return { ok: false, error: 'projectId not configured' };

    try {
      const host = normalizeHttpBase(
        firstPresent(config.host, config.HOST, config.posthogHost, config.POSTHOG_HOST),
        'https://us.posthog.com',
      );
      const day = isoDaysAgo(1);
      const query = `SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= toDateTime('${day} 00:00:00') AND timestamp <= toDateTime('${day} 23:59:59')`;
      const res = await connectionRequest(
        `${host}/api/projects/${encodeURIComponent(projectId)}/query/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
        }
      );
      if (res.status !== 200) return { ok: false, error: responseError('PostHog', res) };

      const data = parseJson(res.body, 'PostHog query');
      if (!isRecord(data) || !Array.isArray(data.results) || !Array.isArray(data.results[0])) {
        throw new Error('PostHog query: response missing results rows');
      }
      assertFiniteNonNegative(data.results[0][0], 'PostHog pageview count');
      return { ok: true, detail: `PostHog HogQL verified for project ${projectId}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async amplitude(config, env, slug) {
    const apiKey = env[`${slug}_AMPLITUDE_API_KEY`];
    const secretKey = env[`${slug}_AMPLITUDE_SECRET_KEY`];
    if (!apiKey || !secretKey) return { ok: false, error: `Env vars ${slug}_AMPLITUDE_API_KEY / SECRET_KEY not set` };

    try {
      const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const res = await httpRequest(
        `https://amplitude.com/api/2/events/segmentation?e={"event_type":"_active"}&start=${today}&end=${today}`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'Amplitude accessible' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async metricool(config, env, slug) {
    const token = providerEnv(
      env,
      slug,
      'METRICOOL_USER_TOKEN',
      'METRICOOL_API_TOKEN',
      'METRICOOL_API_KEY',
    );
    if (!token) return { ok: false, error: 'METRICOOL_API_TOKEN (or legacy METRICOOL_API_KEY) not set' };

    let blogId = firstPresent(
      providerEnv(env, slug, 'METRICOOL_BLOG_ID', 'METRICOOL_BRAND_ID'),
      config.blogId,
      config.BLOG_ID,
      config.brandId,
      config.BRAND_ID,
    );
    let userId = firstPresent(
      providerEnv(env, slug, 'METRICOOL_USER_ID'),
      config.userId,
      config.USER_ID,
    );
    const mcUrl = firstPresent(
      config.METRICOOL_URL,
      config.metricoolUrl,
      providerEnv(env, slug, 'METRICOOL_URL'),
    );

    if (mcUrl && (!blogId || !userId)) {
      try {
        const parsed = new URL(mcUrl.startsWith('http') ? mcUrl : `https://${mcUrl}`);
        blogId = blogId || parsed.searchParams.get('blogId');
        userId = userId || parsed.searchParams.get('userId');
      } catch (_) {}
    }

    if (!blogId || !userId) {
      return { ok: false, error: 'Metricool requires both blogId and userId. Paste a Metricool URL containing both values.' };
    }

    try {
      const params = new URLSearchParams({ userId: String(userId), blogId: String(blogId) });
      const url = `https://app.metricool.com/api/admin/simpleProfiles?${params}`;
      const res = await connectionRequest(url, {
        headers: {
          'X-Mc-Auth': token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }
      });
      if (res.status === 200) {
        const profiles = parseJson(res.body, 'Metricool simpleProfiles');
        if (!Array.isArray(profiles)) {
          throw new Error('Metricool simpleProfiles: response was not an array');
        }
        const brand = profiles.find((profile) =>
          isRecord(profile) && String(profile.id ?? profile.blogId) === String(blogId));
        if (!brand) {
          throw new Error(`Metricool simpleProfiles: blogId ${blogId} was not returned for userId ${userId}`);
        }
        const networks = [
          brand.instagram && 'instagram',
          (brand.facebook || brand.facebookPageId) && 'facebook',
          brand.twitter && 'twitter',
          brand.linkedinCompany && 'linkedin',
          brand.tiktok && 'tiktok',
        ].filter(Boolean);
        if (networks.length === 0) {
          throw new Error('Metricool simpleProfiles: brand has no social network supported by the metrics collector');
        }

        // simpleProfiles proves the token and brand mapping, but not access to
        // the analytics endpoint that produces the dashboard data. Probe one
        // supported connected network with the same URL/auth/date contract.
        const network = networks[0];
        const day = isoDaysAgo(1);
        const postsParams = new URLSearchParams({
          userId: String(userId),
          blogId: String(blogId),
          from: `${day}T00:00:00`,
          to: `${day}T23:59:59`,
        });
        const timezone = firstPresent(config.timezone, config.TIMEZONE, brand.timezone);
        if (timezone) postsParams.set('timezone', timezone);
        const postsRes = await connectionRequest(
          `https://app.metricool.com/api/v2/analytics/posts/${network}?${postsParams}`,
          {
            headers: {
              'X-Mc-Auth': token,
              'Content-Type': 'application/json',
              Accept: 'application/json, text/csv',
            },
          },
        );
        if (postsRes.status !== 200) {
          return { ok: false, error: `Metricool ${network} analytics ${responseError('Metricool', postsRes)}` };
        }
        const rawPosts = String(postsRes.body || '').trim();
        let posts;
        const contentType = String(postsRes.headers?.['content-type'] || '');
        if (contentType.includes('json') || rawPosts.startsWith('[') || rawPosts.startsWith('{')) {
          const payload = parseJson(rawPosts, `Metricool ${network} posts`);
          posts = Array.isArray(payload) ? payload : payload?.data;
          if (!Array.isArray(posts)) {
            throw new Error(`Metricool ${network} posts: response was not an array`);
          }
          if (posts.some((post) => !isRecord(post))) {
            throw new Error(`Metricool ${network} posts: every post must be an object`);
          }
        } else if (!rawPosts) {
          posts = [];
        } else {
          if (rawPosts.startsWith('<')) {
            throw new Error(`Metricool ${network} posts: received HTML instead of analytics data`);
          }
          const header = rawPosts.split(/\r?\n/, 1)[0];
          if (!header.includes(',') && !header.includes(';')) {
            throw new Error(`Metricool ${network} posts: malformed CSV response`);
          }
          posts = [];
        }
        return {
          ok: true,
          detail: `Metricool verified (userId=${userId}, blogId=${blogId}, ${network} analytics, networks=${networks.join(',')})`,
        };
      }
      if (res.body && res.body.trim().startsWith('<')) {
        if (res.status === 401) return { ok: false, error: 'Token inválido o incompleto. Verifica que has copiado el token completo desde Metricool → Ajustes → API.' };
        if (res.status === 403) return { ok: false, error: 'Acceso denegado. Verifica que tu plan de Metricool incluye acceso a la API (Advanced o Custom).' };
        return { ok: false, error: `Metricool respondió con error HTTP ${res.status}. Verifica token, userId y blogId.` };
      }
      return { ok: false, error: responseError('Metricool', res) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async instantly(config, env, slug) {
    const apiKey = providerEnv(env, slug, 'INSTANTLY_API_KEY');
    if (!apiKey) return { ok: false, error: 'INSTANTLY_API_KEY not set' };

    try {
      const day = isoDaysAgo(1);
      const params = new URLSearchParams({ start_date: day, end_date: day });
      const res = await connectionRequest(
        `https://api.instantly.ai/api/v2/campaigns/analytics/daily?${params}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );
      if (res.status !== 200) return { ok: false, error: responseError('Instantly', res) };

      const rows = parseJson(res.body, 'Instantly campaign analytics');
      if (!Array.isArray(rows)) throw new Error('Instantly campaign analytics: response was not an array');
      const numericFields = [
        'sent', 'contacted', 'new_leads_contacted', 'opened', 'unique_opened',
        'replies', 'unique_replies', 'replies_automatic', 'clicks', 'unique_clicks',
        'opportunities',
      ];
      for (const row of rows) {
        if (!isRecord(row) || row.date !== day) {
          throw new Error('Instantly campaign analytics: row missing the requested date');
        }
        for (const field of numericFields) {
          if (row[field] != null && row[field] !== '') {
            assertFiniteNonNegative(row[field], `Instantly ${field}`);
          }
        }
      }
      return { ok: true, detail: 'Instantly v2 daily analytics verified' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async notion(config, env, slug) {
    const token = env[`${slug}_NOTION_API_KEY`];
    if (!token) return { ok: false, error: `Env var ${slug}_NOTION_API_KEY not set` };

    try {
      const res = await httpRequest(
        'https://api.notion.com/v1/users/me',
        { headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' } }
      );
      if (res.status === 200) {
        let name = 'token valid';
        try { const me = JSON.parse(res.body); name = me?.bot?.workspace_name ? `workspace "${me.bot.workspace_name}"` : (me?.name || name); } catch {}
        return { ok: true, detail: `Notion ${name}` };
      }
      if (res.status === 401) return { ok: false, error: 'Invalid or revoked Notion token (HTTP 401)' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async lemlist(config, env, slug) {
    const apiKey = providerEnv(env, slug, 'LEMLIST_API_KEY');
    if (!apiKey) return { ok: false, error: 'LEMLIST_API_KEY not set' };

    try {
      const auth = Buffer.from(`:${apiKey}`).toString('base64');
      const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
      const configuredIds = firstPresent(
        Array.isArray(config.CAMPAIGN_IDS) ? config.CAMPAIGN_IDS.join(',') : config.CAMPAIGN_IDS,
        Array.isArray(config.campaignIds) ? config.campaignIds.join(',') : config.campaignIds,
        Array.isArray(config.campaign_ids) ? config.campaign_ids.join(',') : config.campaign_ids,
      ).split(',').map((value) => value.trim()).filter(Boolean);

      let campaignId = configuredIds[0] || '';
      if (!campaignId) {
        const listParams = new URLSearchParams({
          version: 'v2',
          limit: '100',
          offset: '0',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });
        const campaignsRes = await connectionRequest(
          `https://api.lemlist.com/api/campaigns?${listParams}`,
          { headers },
        );
        if (campaignsRes.status !== 200) {
          return { ok: false, error: responseError('Lemlist campaigns', campaignsRes) };
        }
        const campaigns = parseJson(campaignsRes.body, 'Lemlist campaigns');
        if (!Array.isArray(campaigns)) throw new Error('Lemlist campaigns: response was not an array');
        for (const campaign of campaigns) {
          if (!isRecord(campaign) || typeof campaign._id !== 'string' || !campaign._id) {
            throw new Error('Lemlist campaigns: campaign missing _id');
          }
        }
        campaignId = campaigns.find((campaign) =>
          campaign.status !== 'draft' && campaign.status !== 'archived')?._id || '';
      }

      if (campaignId) {
        const day = isoDaysAgo(1);
        const start = `${day}T00:00:00.000Z`;
        const end = `${day}T23:59:59.999Z`;
        const statsRes = await connectionRequest(
          'https://api.lemlist.com/api/v2/campaigns/stats/batch',
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignIds: [campaignId], startDate: start, endDate: end }),
          },
        );
        if (statsRes.status !== 200) {
          return { ok: false, error: responseError('Lemlist stats', statsRes) };
        }
        const stats = parseJson(statsRes.body, 'Lemlist stats');
        if (!isRecord(stats) || !Array.isArray(stats.results)) {
          throw new Error('Lemlist stats: response missing results array');
        }
        if (stats.errors != null && (!Array.isArray(stats.errors) || stats.errors.length > 0)) {
          throw new Error('Lemlist stats: provider returned campaign errors');
        }
      }

      return {
        ok: true,
        detail: campaignId ? `Lemlist campaign stats verified (${campaignId})` : 'Lemlist verified (no active campaigns)',
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async hubspot(config, env, slug) {
    const token = env[`${slug}_HUBSPOT_ACCESS_TOKEN`];
    if (!token) return { ok: false, error: `Env var ${slug}_HUBSPOT_ACCESS_TOKEN not set` };

    try {
      const res = await httpRequest(
        'https://api.hubapi.com/crm/v3/objects/contacts?limit=1',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'HubSpot accessible' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async pipedrive(config, env, slug) {
    const token = env[`${slug}_PIPEDRIVE_API_TOKEN`];
    const domain = config.domain || config.DOMAIN;
    if (!token) return { ok: false, error: `Env var ${slug}_PIPEDRIVE_API_TOKEN not set` };
    if (!domain) return { ok: false, error: 'domain not configured' };

    try {
      const res = await httpRequest(
        `https://${domain}/api/v1/users/me?api_token=${token}`
      );
      if (res.status === 200) return { ok: true, detail: 'Pipedrive accessible' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async ghl(config, env, slug) {
    const apiKey = providerEnv(
      env,
      slug,
      'GHL_API_KEY',
      'GHL_PRIVATE_INTEGRATION_TOKEN',
      'GHL_APIKEY',
      'GOHIGHLEVEL_API_KEY',
    );
    if (!apiKey) return { ok: false, error: 'GHL API key/private integration token not set' };
    const locationId = firstPresent(
      config.locationId,
      config.LOCATION_ID,
      providerEnv(env, slug, 'GHL_LOCATION_ID', 'GHL_G4U_LOCATION', 'GOHIGHLEVEL_LOCATION_ID'),
    );
    if (!locationId) return { ok: false, error: 'locationId not configured (required by the metrics collector)' };

    try {
      const base = 'https://services.leadconnectorhq.com';
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      };
      let timezone = firstPresent(
        config.timezone,
        config.timeZone,
        config.locationTimezone,
        providerEnv(env, slug, 'GHL_TIMEZONE'),
      );
      if (timezone) {
        timezone = requireIanaTimezone(timezone, 'GHL timezone');
      } else {
        const locationRes = await connectionRequest(
          `${base}/locations/${encodeURIComponent(locationId)}`,
          { headers: { ...headers, Version: 'v3' } },
        );
        if (locationRes.status !== 200) {
          return { ok: false, error: `GHL location timezone ${responseError('GHL', locationRes)}` };
        }
        const locationBody = parseJson(locationRes.body, 'GHL location timezone');
        timezone = requireIanaTimezone(
          locationBody?.location?.timezone ?? locationBody?.timezone,
          'GHL location timezone',
        );
      }

      const contactsRes = await connectionRequest(`${base}/contacts/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ locationId, page: 1, pageLimit: 1 }),
      });
      if (contactsRes.status !== 200) {
        return { ok: false, error: `GHL contacts/search ${responseError('GHL', contactsRes)}` };
      }
      const contacts = parseJson(contactsRes.body, 'GHL contacts/search');
      if (!isRecord(contacts) || !Array.isArray(contacts.contacts)) {
        throw new Error('GHL contacts/search: response missing contacts array');
      }
      assertFiniteNonNegative(contacts.total ?? contacts.meta?.total, 'GHL contacts total');

      const calendarsRes = await connectionRequest(
        `${base}/calendars/?locationId=${encodeURIComponent(locationId)}`,
        { headers: { ...headers, Version: '2021-04-15' } },
      );
      if (calendarsRes.status !== 200) {
        return { ok: false, error: `GHL calendars ${responseError('GHL', calendarsRes)}` };
      }
      const calendars = parseJson(calendarsRes.body, 'GHL calendars');
      if (!isRecord(calendars) || !Array.isArray(calendars.calendars)) {
        throw new Error('GHL calendars: response missing calendars array');
      }
      for (const calendar of calendars.calendars) {
        if (!isRecord(calendar) || typeof calendar.id !== 'string' || !calendar.id) {
          throw new Error('GHL calendars: calendar missing id');
        }
      }

      if (calendars.calendars.length > 0) {
        const day = isoDaysAgo(1);
        const { startTime, endTime } = zonedDayBounds(day, timezone);
        const eventParams = new URLSearchParams({
          locationId,
          calendarId: calendars.calendars[0].id,
          startTime: String(startTime),
          endTime: String(endTime),
        });
        const eventsRes = await connectionRequest(`${base}/calendars/events?${eventParams}`, {
          headers: { ...headers, Version: '2021-04-15' },
        });
        if (eventsRes.status !== 200) {
          return { ok: false, error: `GHL calendar events ${responseError('GHL', eventsRes)}` };
        }
        const events = parseJson(eventsRes.body, 'GHL calendar events');
        if (!isRecord(events) || !Array.isArray(events.events)) {
          throw new Error('GHL calendar events: response missing events array');
        }
      }

      const opportunityParams = new URLSearchParams({
        locationId,
        status: 'all',
        limit: '1',
      });
      const opportunitiesRes = await connectionRequest(
        `${base}/opportunities/search?${opportunityParams}`,
        { headers: { ...headers, Version: 'v3' } },
      );
      if (opportunitiesRes.status !== 200) {
        return { ok: false, error: `GHL opportunities/search ${responseError('GHL', opportunitiesRes)}` };
      }
      const opportunities = parseJson(opportunitiesRes.body, 'GHL opportunities/search');
      if (!isRecord(opportunities) || !Array.isArray(opportunities.opportunities)) {
        throw new Error('GHL opportunities/search: response missing opportunities array');
      }
      assertFiniteNonNegative(opportunities.meta?.total, 'GHL opportunities meta.total');

      return {
        ok: true,
        detail: `GHL LeadConnector contacts, calendars and opportunities verified for ${locationId} (${timezone})`,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async koibox(config, env, slug) {
    const apiKey = env[`${slug}_KOIBOX_API_KEY`];
    if (!apiKey) return { ok: false, error: `Env var ${slug}_KOIBOX_API_KEY not set` };
    const accountId = config.ACCOUNT_ID || config.accountId;

    // Koibox does not expose public API documentation. Until the endpoint is
    // confirmed with Koibox support, we validate that the API key is present
    // (same approach as google_ads / linkedin_ads testers).
    // When the endpoint is known, replace this with an actual HTTP request.
    if (accountId) {
      return { ok: true, detail: `API key present, account/centre: ${accountId} (endpoint TBD — contact Koibox support for API docs)` };
    }
    return { ok: true, detail: 'API key present (endpoint TBD — contact Koibox support for API docs)' };
  },

  async stripe(config, env, slug) {
    const apiKey = env[`${slug}_STRIPE_API_KEY`];
    if (!apiKey) return { ok: false, error: `Env var ${slug}_STRIPE_API_KEY not set` };

    try {
      const auth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await httpRequest(
        'https://api.stripe.com/v1/balance',
        { headers: { Authorization: `Basic ${auth}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'Stripe accessible' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // System overrides
  async anthropic(config, env, slug) {
    const apiKey = env[`${slug}_ANTHROPIC_API_KEY`];
    if (!apiKey) return { ok: false, error: `Env var ${slug}_ANTHROPIC_API_KEY not set` };

    try {
      const res = await httpRequest(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        }
      );
      if (res.status === 200) return { ok: true, detail: 'Anthropic API key valid' };
      if (res.status === 401) return { ok: false, error: 'Invalid API key' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async openai(config, env, slug) {
    const apiKey = env[`${slug}_OPENAI_API_KEY`];
    if (!apiKey) return { ok: false, error: `Env var ${slug}_OPENAI_API_KEY not set` };

    try {
      const res = await httpRequest(
        'https://api.openai.com/v1/models',
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'OpenAI API key valid' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async fireworks(config, env, slug) {
    const apiKey = env[`${slug}_FIREWORKS_API_KEY`] || env.FIREWORKS_API_KEY;
    if (!apiKey) return { ok: false, error: `Env var ${slug}_FIREWORKS_API_KEY not set` };

    try {
      const res = await httpRequest(
        'https://api.fireworks.ai/v1/accounts/fireworks/models?pageSize=1',
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (res.status === 200) {
        let detail = 'Fireworks API key valid';
        try {
          const data = JSON.parse(res.body);
          const count = Array.isArray(data.models) ? data.models.length : null;
          if (count !== null) detail = `Fireworks API key valid (${count} model${count === 1 ? '' : 's'} returned)`;
        } catch {}
        return { ok: true, detail };
      }
      if (res.status === 401) return { ok: false, error: 'Invalid Fireworks API key (HTTP 401)' };
      if (res.status === 403) return { ok: false, error: 'Fireworks API key lacks access to list models (HTTP 403)' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async google_ai(config, env, slug) {
    const apiKey = env[`${slug}_GOOGLE_AI_API_KEY`];
    if (!apiKey) return { ok: false, error: `Env var ${slug}_GOOGLE_AI_API_KEY not set` };

    try {
      const res = await httpRequest(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
      );
      if (res.status === 200) return { ok: true, detail: 'Google AI API key valid' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async perplexity(config, env, slug) {
    const apiKey = env[`${slug}_PERPLEXITY_API_KEY`] || env.PERPLEXITY_API_KEY;
    if (!apiKey) return { ok: false, error: `Env var ${slug}_PERPLEXITY_API_KEY (o PERPLEXITY_API_KEY) not set. Crea key en perplexity.ai/settings/api` };
    const model = config.defaultModel || config.DEFAULT_MODEL || 'sonar';
    try {
      // Perplexity has no GET /models endpoint. Use minimal POST /chat/completions
      // with max_tokens=1 to validate the key — costs ~1-3 tokens.
      const res = await httpRequest(
        'https://api.perplexity.ai/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
        }
      );
      if (res.status === 200) return { ok: true, detail: `Perplexity OK · model=${model}` };
      if (res.status === 401) return { ok: false, error: 'Invalid API key (HTTP 401). Verifica que la key empieza con pplx- y que tu cuenta tiene créditos.' };
      if (res.status === 400) {
        // Probably bad model name. Auth still validated by 400 (vs 401).
        return { ok: false, error: `HTTP 400 — modelo "${model}" inválido. Prueba: sonar, sonar-pro, sonar-reasoning. ${res.body.slice(0, 150)}` };
      }
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async google_ads(config, env, slug) {
    const developerToken = providerEnv(env, slug, 'GOOGLE_ADS_DEVELOPER_TOKEN');
    const clientId = providerEnv(env, slug, 'GOOGLE_ADS_CLIENT_ID');
    const clientSecret = providerEnv(env, slug, 'GOOGLE_ADS_CLIENT_SECRET');
    const refreshToken = providerEnv(env, slug, 'GOOGLE_ADS_REFRESH_TOKEN');
    const customerIdRaw = firstPresent(
      config.customerId,
      config.CUSTOMER_ID,
      config.customer_id,
      providerEnv(env, slug, 'GOOGLE_ADS_CUSTOMER_ID'),
    );
    const customerId = customerIdRaw.replace(/\D/g, '');
    const loginCustomerIdRaw = firstPresent(
      config.loginCustomerId,
      config.LOGIN_CUSTOMER_ID,
      config.mccId,
      config.MCC_ID,
      providerEnv(env, slug, 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'GOOGLE_ADS_MCC_ID'),
    );
    const loginCustomerId = loginCustomerIdRaw.replace(/\D/g, '');

    if (!developerToken) return { ok: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN not set' };
    if (!clientId) return { ok: false, error: 'GOOGLE_ADS_CLIENT_ID not set' };
    if (!clientSecret) return { ok: false, error: 'GOOGLE_ADS_CLIENT_SECRET not set' };
    if (!refreshToken) return { ok: false, error: 'GOOGLE_ADS_REFRESH_TOKEN not set' };
    if (!customerId) return { ok: false, error: 'Google Ads customerId not configured' };
    if (loginCustomerIdRaw && !loginCustomerId) {
      return { ok: false, error: 'Google Ads loginCustomerId/MCC_ID is malformed' };
    }

    try {
      const oauthBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });
      const oauthRes = await connectionRequest('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: oauthBody.toString(),
      });
      if (oauthRes.status !== 200) {
        return { ok: false, error: `Google Ads OAuth ${responseError('OAuth', oauthRes)}` };
      }
      const oauth = parseJson(oauthRes.body, 'Google Ads OAuth');
      if (!isRecord(oauth) || typeof oauth.access_token !== 'string' || !oauth.access_token) {
        throw new Error('Google Ads OAuth: response missing access_token');
      }

      const headers = {
        Authorization: `Bearer ${oauth.access_token}`,
        'Content-Type': 'application/json',
        'developer-token': developerToken,
      };
      if (loginCustomerId && loginCustomerId !== customerId) {
        headers['login-customer-id'] = loginCustomerId;
      }
      const adsRes = await connectionRequest(
        `https://googleads.googleapis.com/v24/customers/${customerId}/googleAds:searchStream`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1',
          }),
        },
      );
      if (adsRes.status !== 200) {
        return { ok: false, error: `Google Ads API v24 ${responseError('Google Ads', adsRes)}` };
      }
      const chunks = parseJson(adsRes.body, 'Google Ads searchStream');
      if (!Array.isArray(chunks)) {
        throw new Error('Google Ads searchStream: response was not an array');
      }
      const rows = [];
      for (const chunk of chunks) {
        if (!isRecord(chunk) || !Array.isArray(chunk.results)) {
          throw new Error('Google Ads searchStream: chunk missing results array');
        }
        rows.push(...chunk.results);
      }
      if (rows.length !== 1 || String(rows[0]?.customer?.id || '').replace(/\D/g, '') !== customerId) {
        throw new Error('Google Ads searchStream: customer row did not match configured customerId');
      }
      return {
        ok: true,
        detail: `Google Ads API v24 and OAuth verified for customer ${customerId}`,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async pagespeed(config, env, slug) {
    const rawUrl = firstPresent(
      config.url,
      config.clientUrl,
      config.siteUrl,
      config.website,
      config._client?.url,
      config._client?.website,
      providerEnv(env, slug, 'PAGESPEED_URL', 'CLIENT_URL', 'SITE_URL', 'WEBSITE_URL'),
    );
    if (!rawUrl) return { ok: false, error: 'PageSpeed client URL not configured' };

    try {
      const clientUrl = normalizeHttpBase(rawUrl);
      const apiKey = providerEnv(env, slug, 'PAGESPEED_API_KEY');
      for (const strategy of ['mobile', 'desktop']) {
        const params = new URLSearchParams({ url: clientUrl, strategy });
        for (const category of ['performance', 'seo', 'accessibility', 'best-practices']) {
          params.append('category', category);
        }
        if (apiKey) params.set('key', apiKey);
        const res = await connectionRequest(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
        );
        if (res.status !== 200) {
          return { ok: false, error: `PageSpeed ${strategy} ${responseError('PageSpeed', res)}` };
        }
        const data = parseJson(res.body, `PageSpeed ${strategy}`);
        const categories = data?.lighthouseResult?.categories;
        const audits = data?.lighthouseResult?.audits;
        if (!isRecord(categories) || !isRecord(audits)) {
          throw new Error(`PageSpeed ${strategy}: response missing Lighthouse categories or audits`);
        }
        for (const category of ['performance', 'seo', 'accessibility', 'best-practices']) {
          const score = Number(categories[category]?.score);
          if (!Number.isFinite(score) || score < 0 || score > 1) {
            throw new Error(`PageSpeed ${strategy}: invalid ${category} score`);
          }
        }
        assertFiniteNonNegative(
          audits['largest-contentful-paint']?.numericValue,
          `PageSpeed ${strategy} LCP`,
        );
        assertFiniteNonNegative(
          audits['cumulative-layout-shift']?.numericValue,
          `PageSpeed ${strategy} CLS`,
        );
        assertFiniteNonNegative(
          audits['total-blocking-time']?.numericValue,
          `PageSpeed ${strategy} TBT`,
        );
      }
      return { ok: true, detail: `PageSpeed v5 mobile and desktop verified for ${clientUrl}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async sheets(config, _env, _slug) {
    const spreadsheetId = firstPresent(config.spreadsheetId);
    const sheetRange = firstPresent(config.range, 'Sheet1!A:Z');
    if (!spreadsheetId) return { ok: false, error: 'Sheets spreadsheetId not configured' };

    const sa = serviceAccountForConnection();
    if (!sa) return { ok: false, error: 'System Google Service Account not configured. Go to /mc/connect/system/google-sa' };

    try {
      const token = await googleAccessTokenForConnection(sa, 'https://www.googleapis.com/auth/spreadsheets.readonly');
      const res = await connectionRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetRange)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 403) {
        return {
          ok: false,
          error: `Acceso denegado. Comparte la hoja ${spreadsheetId} con ${sa.client_email}`,
        };
      }
      if (res.status !== 200) return { ok: false, error: responseError('Google Sheets', res) };
      const data = parseJson(res.body, 'Google Sheets values');
      if (!isRecord(data) || (data.values != null && !Array.isArray(data.values))) {
        throw new Error('Google Sheets values: response values must be an array');
      }
      for (const row of data.values || []) {
        if (!Array.isArray(row)) throw new Error('Google Sheets values: every row must be an array');
      }
      return { ok: true, detail: `Google Sheets v4 verified (${spreadsheetId}, ${sheetRange})` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async yalc(config, _env, _slug, clientSlug) {
    const resolvedSlug = firstPresent(clientSlug, config._slug);
    if (!resolvedSlug) return { ok: false, error: 'YALC client slug not configured' };

    const adminToken = firstPresent(config._adminToken, loadAdminToken());
    if (!adminToken) {
      return { ok: false, error: 'YALC metrics test requires MC_ADMIN_TOKEN for the Sancho report proxy' };
    }

    try {
      const mcBaseRaw = firstPresent(
        config._mcBaseUrl,
        process.env.MC_BASE_URL,
        'http://localhost:3000',
      );
      if (!/^https?:\/\//i.test(mcBaseRaw)) {
        throw new Error('YALC metrics test: MC_BASE_URL must include http:// or https://');
      }
      const mcBase = mcBaseRaw.replace(/\/+$/, '');
      const canaryDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const params = new URLSearchParams({ slug: resolvedSlug, from: canaryDay, to: canaryDay });
      const res = await connectionRequest(`${mcBase}/api/partnerships/report?${params}`, {
        headers: { Accept: 'application/json', 'x-admin-token': adminToken },
      });
      if (res.status !== 200) {
        return { ok: false, error: `YALC report proxy ${responseError('YALC', res)}` };
      }
      const report = parseJson(res.body, 'YALC report proxy');
      if (!isRecord(report)) throw new Error('YALC report proxy: response must be an object');
      const reportDate = typeof report.to === 'string' ? report.to.slice(0, 10) : '';
      const reportFrom = typeof report.from === 'string' ? report.from.slice(0, 10) : '';
      const parsedDate = Date.parse(`${reportDate}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
        !Number.isFinite(parsedDate) ||
        new Date(parsedDate).toISOString().slice(0, 10) !== reportDate
      ) {
        throw new Error('YALC report proxy: response missing valid to date');
      }
      if (reportFrom !== canaryDay || reportDate !== canaryDay) {
        throw new Error(`YALC report proxy: response window does not match requested day ${canaryDay}`);
      }
      assertFiniteNonNegative(report.targetCacEur, 'YALC targetCacEur');
      if (!isRecord(report.totals)) throw new Error('YALC report proxy: totals must be an object');
      for (const field of [
        'postsLive', 'clicks', 'signups', 'kyc', 'conversions',
      ]) {
        assertFiniteNonNegative(report.totals[field], `YALC totals.${field}`);
      }
      for (const field of ['investedEur', 'totalCostEur']) {
        if (report.totals[field] != null) {
          assertFiniteNonNegative(report.totals[field], `YALC totals.${field}`);
        }
      }
      if (report.totals.cpaRealEur != null) {
        assertFiniteNonNegative(report.totals.cpaRealEur, 'YALC totals.cpaRealEur');
      }
      if (report.totals.roi != null && !Number.isFinite(Number(report.totals.roi))) {
        throw new Error('YALC totals.roi: expected a finite number or null');
      }
      if (!Array.isArray(report.creators)) throw new Error('YALC report proxy: creators must be an array');
      for (const [index, creator] of report.creators.entries()) {
        if (!isRecord(creator)) throw new Error(`YALC creators[${index}]: expected an object`);
        for (const field of ['clicks', 'signups', 'kyc', 'conversions']) {
          assertFiniteNonNegative(creator[field], `YALC creators[${index}].${field}`);
        }
        if (creator.feeEur != null) {
          assertFiniteNonNegative(creator.feeEur, `YALC creators[${index}].feeEur`);
        }
      }
      if (!isRecord(report.tracking)) {
        throw new Error('YALC report proxy: tracking must be an object');
      }
      if (!['real', 'demo', 'unavailable'].includes(report.tracking.status)) {
        throw new Error('YALC report proxy: tracking.status must be real, demo, or unavailable');
      }
      if (!Array.isArray(report.tracking.sources)) {
        throw new Error('YALC report proxy: tracking.sources must be an array');
      }
      if (!Number.isSafeInteger(report.tracking.recordCount) || report.tracking.recordCount < 0) {
        throw new Error('YALC report proxy: tracking.recordCount must be a non-negative integer');
      }
      if (report.tracking.recordCount !== report.creators.length) {
        throw new Error('YALC report proxy: tracking.recordCount must match creators length');
      }
      return {
        ok: true,
        detail: report.tracking.status === 'unavailable'
          ? `YALC report proxy verified for ${resolvedSlug}; no real creator performance yet`
          : `YALC partnerships report verified for ${resolvedSlug} (${report.tracking.status})`,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async linkedin_ads(config, env, slug) {
    const token = env[`${slug}_LINKEDIN_ADS_ACCESS_TOKEN`];
    if (!token) return { ok: false, error: `Env var ${slug}_LINKEDIN_ADS_ACCESS_TOKEN not set` };
    return { ok: true, detail: 'Token present (LinkedIn OAuth tokens expire — verify in MC)' };
  },

  async tiktok_ads(config, env, slug) {
    const token = env[`${slug}_TIKTOK_ADS_ACCESS_TOKEN`];
    const advId = config.advertiserId || config.ADVERTISER_ID;
    if (!token) return { ok: false, error: `Env var ${slug}_TIKTOK_ADS_ACCESS_TOKEN not set` };
    if (!advId) return { ok: false, error: 'advertiserId not configured' };

    try {
      const res = await httpRequest(
        `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=["${advId}"]`,
        { headers: { 'Access-Token': token } }
      );
      if (res.status === 200) return { ok: true, detail: 'TikTok Ads accessible' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};

// --- Google JWT Auth (for GA4, GSC) ---
async function getGoogleAccessToken(serviceAccount, scope = 'https://www.googleapis.com/auth/analytics.readonly') {
  const crypto = require('crypto');

  if (
    !isRecord(serviceAccount) ||
    typeof serviceAccount.client_email !== 'string' || !serviceAccount.client_email.trim() ||
    typeof serviceAccount.private_key !== 'string' || !serviceAccount.private_key.trim()
  ) {
    throw new Error('Google Service Account is missing client_email or private_key');
  }

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claimSet = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signInput = `${header}.${claimSet}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');

  const jwt = `${signInput}.${signature}`;

  const postData = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await connectionRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData.toString(),
  });

  if (res.status !== 200) throw new Error(`Google OAuth failed: ${res.body.slice(0, 200)}`);
  const payload = parseJson(res.body, 'Google OAuth');
  if (!isRecord(payload) || typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('Google OAuth: response missing access_token');
  }
  return payload.access_token;
}

// --- Main ---
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.slug) {
    console.log(`
Usage:
  node test-connection.js --slug <client-slug> --source <api-name>
  node test-connection.js --slug <client-slug> --all
  node test-connection.js --slug <client-slug> --category <category>

Sources: ${Object.keys(TESTERS).join(', ')}
Categories: analytics, seo, advertising, social, outbound, crm, payments, llm_overrides
    `);
    process.exit(1);
  }

  const slug = args.slug;
  const slugUpper = slug.toUpperCase().replace(/-/g, '_');
  const brandPath = path.join(BRAND_DIR, slug);
  const integrationsPath = path.join(brandPath, 'integrations.json');
  const envPath = path.join(brandPath, '.env');

  // Load integrations.json
  let integrations;
  if (fs.existsSync(integrationsPath)) {
    integrations = JSON.parse(fs.readFileSync(integrationsPath, 'utf8'));
  } else {
    console.log(`⚠️  No integrations.json found at ${integrationsPath}`);
    console.log('   Run the acquisition-metrics-plan skill first to generate it.');
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

  // Load env with Local → Global fallback. Testers may read either
  // `SLUG_API_KEY` or flat `API_KEY`; expose both without leaking values.
  const globalEnv = loadEnvFile(GLOBAL_ENV_PATH);
  const brandEnv = loadEnvFile(envPath);
  const env = buildRuntimeEnv(slugUpper, globalEnv, brandEnv, catalog);
  const clientConfig = loadClientConfig(slug);
  const adminToken = loadAdminToken();
  console.log(`\n🔑 Loaded ${Object.keys(brandEnv).length} local env vars from ${envPath}`);
  console.log(`🔑 Loaded ${Object.keys(globalEnv).length} global env vars from ${GLOBAL_ENV_PATH}`);

  // Determine which sources to test
  let sourcesToTest = [];

  if (args.all) {
    // Test all configured sources
    for (const [key, val] of Object.entries(integrations.dataSources || {})) {
      if (val.status !== 'not_configured') sourcesToTest.push({ key, section: 'dataSources' });
    }
    for (const [key, val] of Object.entries(integrations.systemOverrides || {})) {
      if (val.status !== 'not_configured') sourcesToTest.push({ key, section: 'systemOverrides' });
    }
    if (sourcesToTest.length === 0) {
      console.log('⚠️  No configured integrations to test. All are "not_configured".');
      process.exit(0);
    }
  } else if (args.source) {
    const section = (integrations.dataSources?.[args.source]) ? 'dataSources' :
                    (integrations.systemOverrides?.[args.source]) ? 'systemOverrides' : null;
    if (!section) {
      console.log(`⚠️  Source "${args.source}" not found in integrations.json`);
      process.exit(1);
    }
    sourcesToTest.push({ key: args.source, section });
  } else if (args.category) {
    // Load catalog to find sources in category
    const cat = catalog.categories[args.category];
    if (!cat) {
      console.log(`⚠️  Unknown category: ${args.category}`);
      process.exit(1);
    }
    for (const apiKey of Object.keys(cat.apis)) {
      const section = (integrations.dataSources?.[apiKey]) ? 'dataSources' :
                      (integrations.systemOverrides?.[apiKey]) ? 'systemOverrides' : null;
      if (section) sourcesToTest.push({ key: apiKey, section });
    }
  } else {
    console.log('⚠️  Select --source, --all or --category.');
    process.exit(1);
  }

  // Run tests
  console.log(`\n🧪 Testing ${sourcesToTest.length} integration(s) for "${slug}"...\n`);

  const results = [];

  for (const { key, section } of sourcesToTest) {
    const integration = integrations[section][key];
    const tester = TESTERS[key];

    if (!tester) {
      const error = `No connection tester implemented for ${key}`;
      console.log(`❌ ${key}: ${error}`);
      integration.status = 'error';
      integration.lastTestedAt = new Date().toISOString();
      integration.lastError = error;
      results.push({ key, ok: false, error });
      continue;
    }

    process.stdout.write(`   ${key}... `);
    const config = {
      ...(integration.config || {}),
      _client: clientConfig,
      _slug: slug,
      _adminToken: adminToken,
      _mcBaseUrl: process.env.MC_BASE_URL || 'http://localhost:3000',
    };

    try {
      const rawResult = await tester(config, env, slugUpper, slug);
      const result = isRecord(rawResult) ? rawResult : {};
      const now = new Date().toISOString();

      if (result?.ok === true) {
        console.log(`✅ Connected — ${result.detail}`);
        integration.status = 'connected';
        integration.lastTestedAt = now;
        delete integration.lastError;
      } else {
        const error = typeof result?.error === 'string' && result.error
          ? result.error
          : 'Connection tester returned an invalid or unsuccessful result';
        console.log(`❌ Error — ${error}`);
        integration.status = 'error';
        integration.lastTestedAt = now;
        integration.lastError = error;
        result.ok = false;
        result.error = error;
      }

      results.push({ key, ...result });
    } catch (e) {
      console.log(`❌ Exception — ${e.message}`);
      integration.status = 'error';
      integration.lastTestedAt = new Date().toISOString();
      integration.lastError = e.message;
      results.push({ key, ok: false, error: e.message });
    }
  }

  // Update integrations.json
  integrations.updatedAt = new Date().toISOString();
  fs.writeFileSync(integrationsPath, JSON.stringify(integrations, null, 2));
  console.log(`\n📝 Updated ${integrationsPath}`);

  // Summary
  const connected = results.filter(r => r.ok === true).length;
  const failed = results.filter(r => r.ok === false).length;

  console.log(`\n📊 Results: ${connected} ✅ connected | ${failed} ❌ failed\n`);

  if (failed > 0) process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') { args.all = true; continue; }
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] || true;
      i++;
    }
  }
  return args;
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = {
  TESTERS,
  buildRuntimeEnv,
  loadSystemServiceAccount,
  parseArgs,
  _setConnectionRequestForTests(request) {
    connectionRequest = typeof request === 'function' ? request : httpRequest;
  },
  _setGoogleAuthForTests({ serviceAccount, accessToken } = {}) {
    serviceAccountForConnection = typeof serviceAccount === 'function'
      ? serviceAccount
      : loadSystemServiceAccount;
    googleAccessTokenForConnection = typeof accessToken === 'function'
      ? accessToken
      : getGoogleAccessToken;
  },
};
