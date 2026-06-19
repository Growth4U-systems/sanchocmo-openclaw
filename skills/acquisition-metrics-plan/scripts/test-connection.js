#!/usr/bin/env node
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

// --- System Service Account loader ---
function loadSystemServiceAccount() {
  const saPath = path.resolve(__dirname, '..', '..', '..', '.secrets', 'google-service-account.json');
  try {
    return JSON.parse(fs.readFileSync(saPath, 'utf8'));
  } catch {
    return null;
  }
}

// --- Test functions per source ---
const TESTERS = {
  async ga4(config, env, slug) {
    const propertyId = config.propertyId || config.PROPERTY_ID;
    if (!propertyId) return { ok: false, error: 'Property ID not configured' };

    // Load system Service Account
    const sa = loadSystemServiceAccount();
    if (!sa) return { ok: false, error: 'System Google Service Account not configured. Go to /mc/connect/system/google-sa' };

    try {
      const token = await getGoogleAccessToken(sa);
      const res = await httpRequest(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}/metadata`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'GA4 metadata accessible' };
      if (res.status === 403) return { ok: false, error: `Acceso denegado. Asegúrate de dar acceso "Lector" a ${sa.client_email} en la propiedad GA4 ${propertyId}` };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async gsc(config, env, slug) {
    const siteUrl = config.siteUrl || config.SITE_URL;
    if (!siteUrl) return { ok: false, error: 'Site URL not configured' };

    // Load system Service Account
    const sa = loadSystemServiceAccount();
    if (!sa) return { ok: false, error: 'System Google Service Account not configured. Go to /mc/connect/system/google-sa' };

    try {
      const token = await getGoogleAccessToken(sa, 'https://www.googleapis.com/auth/webmasters.readonly');
      const encodedUrl = encodeURIComponent(siteUrl);
      const res = await httpRequest(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedUrl}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'GSC site accessible' };
      if (res.status === 403) return { ok: false, error: `Acceso denegado. Asegúrate de dar acceso a ${sa.client_email} en Search Console para ${siteUrl}` };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async meta_ads(config, env, slug) {
    const token = env[`${slug}_META_ADS_ACCESS_TOKEN`];
    const accountId = config.accountId || config.ACCOUNT_ID;
    if (!token) return { ok: false, error: `Env var ${slug}_META_ADS_ACCESS_TOKEN not set` };
    if (!accountId) return { ok: false, error: 'accountId not configured (set ACCOUNT_ID, format: act_XXXXXXXXX)' };

    try {
      const res = await httpRequest(
        `https://graph.facebook.com/v19.0/${accountId}?fields=name,account_status&access_token=${token}`
      );
      if (res.status === 200) {
        const data = JSON.parse(res.body);
        return { ok: true, detail: `Account: ${data.name}, Status: ${data.account_status}` };
      }
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async posthog(config, env, slug) {
    const apiKey = env[`${slug}_POSTHOG_API_KEY`];
    const projectId = config.projectId || config.PROJECT_ID;
    const host = config.host || config.HOST || 'https://app.posthog.com';
    if (!apiKey) return { ok: false, error: `Env var ${slug}_POSTHOG_API_KEY not set` };
    if (!projectId) return { ok: false, error: 'projectId not configured' };

    try {
      const res = await httpRequest(
        `${host}/api/projects/${projectId}/`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'PostHog project accessible' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
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
    const token = env[`${slug}_METRICOOL_API_TOKEN`];
    if (!token) return { ok: false, error: `Env var ${slug}_METRICOOL_API_TOKEN not set` };

    // Extract blogId and userId from URL or direct config
    let brandId = config.BRAND_ID || env[`${slug}_METRICOOL_BRAND_ID`];
    let userId = config.USER_ID || env[`${slug}_METRICOOL_USER_ID`];
    const mcUrl = config.METRICOOL_URL || env[`${slug}_METRICOOL_URL`];

    if (mcUrl && (!brandId || !userId)) {
      try {
        const parsed = new URL(mcUrl.startsWith('http') ? mcUrl : `https://${mcUrl}`);
        brandId = brandId || parsed.searchParams.get('blogId');
        userId = userId || parsed.searchParams.get('userId');
      } catch (_) {}
    }

    if (!brandId) return { ok: false, error: `Brand ID missing. Paste your Metricool URL (must contain blogId and userId).` };

    try {
      const url = `https://app.metricool.com/api/admin/simpleProfiles?blogId=${brandId}${userId ? '&userId=' + userId : ''}`;
      const res = await httpRequest(url, {
        headers: { 'X-Mc-Auth': token, 'Content-Type': 'application/json' }
      });
      if (res.status === 200) return { ok: true, detail: `Metricool connected (blogId=${brandId})` };
      // Metricool returns HTML error pages — detect and give clear message
      if (res.body && res.body.trim().startsWith('<')) {
        if (res.status === 401) return { ok: false, error: 'Token inválido o incompleto. Verifica que has copiado el token completo desde Metricool → Ajustes → API.' };
        if (res.status === 403) return { ok: false, error: 'Acceso denegado. Verifica que tu plan de Metricool incluye acceso a la API (Advanced o Custom).' };
        return { ok: false, error: `Metricool respondió con error HTTP ${res.status}. Verifica token y Brand ID.` };
      }
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async instantly(config, env, slug) {
    const apiKey = env[`${slug}_INSTANTLY_API_KEY`];
    if (!apiKey) return { ok: false, error: `Env var ${slug}_INSTANTLY_API_KEY not set` };

    try {
      const res = await httpRequest(
        'https://api.instantly.ai/api/v2/campaigns?limit=1',
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'Instantly v2 authenticated' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
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
    const apiKey = env[`${slug}_LEMLIST_API_KEY`];
    if (!apiKey) return { ok: false, error: `Env var ${slug}_LEMLIST_API_KEY not set` };

    try {
      const auth = Buffer.from(`:${apiKey}`).toString('base64');
      const res = await httpRequest(
        'https://api.lemlist.com/api/team',
        { headers: { Authorization: `Basic ${auth}` } }
      );
      if (res.status === 200) return { ok: true, detail: 'Lemlist accessible' };
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
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
    const apiKey = env[`${slug}_GHL_API_KEY`];
    if (!apiKey) return { ok: false, error: `Env var ${slug}_GHL_API_KEY not set` };
    const locationId = config.locationId || config.LOCATION_ID;

    try {
      // Detect API version: pit- prefix = v2 (Private Integration Token), otherwise v1
      if (apiKey.startsWith('pit-')) {
        // GHL API v2 — uses services.leadconnectorhq.com
        if (!locationId) return { ok: false, error: 'locationId not configured (required for API v2)' };
        const res = await httpRequest(
          `https://services.leadconnectorhq.com/locations/${locationId}`,
          { headers: { Authorization: `Bearer ${apiKey}`, 'Version': '2021-07-28' } }
        );
        if (res.status === 200) {
          try {
            const data = JSON.parse(res.body);
            return { ok: true, detail: `GHL v2 connected — Location: ${data.location?.name || locationId}` };
          } catch { return { ok: true, detail: 'GHL v2 connected' }; }
        }
        return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
      } else {
        // GHL API v1 — uses rest.gohighlevel.com
        const res = await httpRequest(
          'https://rest.gohighlevel.com/v1/contacts/?limit=1',
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (res.status === 200) return { ok: true, detail: 'GHL v1 accessible' };
        return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
      }
    } catch (e) {
      return { ok: false, error: e.message };
    }
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

  // Google Ads requires complex OAuth — just check if creds exist
  async google_ads(config, env, slug) {
    const refreshToken = env[`${slug}_GOOGLE_ADS_REFRESH_TOKEN`];
    const devToken = env[`${slug}_GOOGLE_ADS_DEVELOPER_TOKEN`];
    if (!refreshToken) return { ok: false, error: `Env var ${slug}_GOOGLE_ADS_REFRESH_TOKEN not set` };
    if (!devToken) return { ok: false, error: `Env var ${slug}_GOOGLE_ADS_DEVELOPER_TOKEN not set` };
    return { ok: true, detail: 'Credentials present (full OAuth test requires token exchange)' };
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

  const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
  const res = await httpRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData,
  });

  if (res.status !== 200) throw new Error(`Google OAuth failed: ${res.body.slice(0, 200)}`);
  return JSON.parse(res.body).access_token;
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

  // Load .env
  const env = loadEnvFile(envPath);
  const envCount = Object.keys(env).length;
  console.log(`\n🔑 Loaded ${envCount} env vars from ${envPath}`);

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
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
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
  }

  // Run tests
  console.log(`\n🧪 Testing ${sourcesToTest.length} integration(s) for "${slug}"...\n`);

  const results = [];

  for (const { key, section } of sourcesToTest) {
    const integration = integrations[section][key];
    const tester = TESTERS[key];

    if (!tester) {
      console.log(`⏭️  ${key}: No tester implemented, skipping`);
      results.push({ key, status: 'skipped', reason: 'No tester' });
      continue;
    }

    process.stdout.write(`   ${key}... `);
    const config = integration.config || {};

    try {
      const result = await tester(config, env, slugUpper);
      const now = new Date().toISOString();

      if (result.ok) {
        console.log(`✅ Connected — ${result.detail}`);
        integration.status = 'connected';
        integration.lastTestedAt = now;
        delete integration.lastError;
      } else {
        console.log(`❌ Error — ${result.error}`);
        integration.status = 'error';
        integration.lastTestedAt = now;
        integration.lastError = result.error;
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
  const connected = results.filter(r => r.ok).length;
  const failed = results.filter(r => r.ok === false).length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log(`\n📊 Results: ${connected} ✅ connected | ${failed} ❌ failed | ${skipped} ⏭️ skipped\n`);

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

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
