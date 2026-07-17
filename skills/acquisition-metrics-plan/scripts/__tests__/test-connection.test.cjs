/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { afterEach, test } = require('node:test');

const {
  TESTERS,
  buildRuntimeEnv,
  _setConnectionRequestForTests,
  _setGoogleAuthForTests,
} = require('../test-connection.js');

function response(payload, status = 200, headers = {}) {
  return {
    status,
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    headers,
  };
}

function mockRequests(responses) {
  const calls = [];
  _setConnectionRequestForTests(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (responses.length === 0) throw new Error(`Unexpected request: ${url}`);
    const next = responses.shift();
    return typeof next === 'function' ? next(url, options) : next;
  });
  return calls;
}

function lighthousePayload() {
  return {
    lighthouseResult: {
      categories: {
        performance: { score: 0.91 },
        seo: { score: 0.97 },
        accessibility: { score: 0.94 },
        'best-practices': { score: 0.9 },
      },
      audits: {
        'largest-contentful-paint': { numericValue: 1500 },
        'cumulative-layout-shift': { numericValue: 0.02 },
        'total-blocking-time': { numericValue: 80 },
      },
    },
  };
}

afterEach(() => {
  _setConnectionRequestForTests();
  _setGoogleAuthForTests();
});

test('runtime env keeps brand-local flat/scoped credentials ahead of global fallbacks', () => {
  const catalog = {
    categories: {
      metrics: {
        apis: {
          sample: { credentials: [{ key: 'API_KEY' }], config: [] },
        },
      },
    },
  };
  const fromFlat = buildRuntimeEnv(
    'ACME',
    { ACME_SAMPLE_API_KEY: 'global-scoped', SAMPLE_API_KEY: 'global-flat' },
    { SAMPLE_API_KEY: 'brand-flat' },
    catalog,
  );
  assert.equal(fromFlat.SAMPLE_API_KEY, 'brand-flat');
  assert.equal(fromFlat.ACME_SAMPLE_API_KEY, 'brand-flat');

  const fromScoped = buildRuntimeEnv(
    'ACME',
    { SAMPLE_API_KEY: 'global-flat' },
    { ACME_SAMPLE_API_KEY: 'brand-scoped' },
    catalog,
  );
  assert.equal(fromScoped.SAMPLE_API_KEY, 'brand-scoped');
  assert.equal(fromScoped.ACME_SAMPLE_API_KEY, 'brand-scoped');
});

test('Google service account resolution honors MC_WORKSPACE/.secrets', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sancho-sa-'));
  const secretsDir = path.join(workspace, '.secrets');
  fs.mkdirSync(secretsDir);
  fs.writeFileSync(path.join(secretsDir, 'google-service-account.json'), JSON.stringify({
    client_email: 'metrics@example.iam.gserviceaccount.com',
    private_key: 'private-key',
  }));
  const script = path.resolve(__dirname, '..', 'test-connection.js');
  const childEnv = { ...process.env, MC_WORKSPACE: workspace };
  delete childEnv.GOOGLE_APPLICATION_CREDENTIALS;
  const child = spawnSync(
    process.execPath,
    ['-e', `const m=require(${JSON.stringify(script)}); process.stdout.write(m.loadSystemServiceAccount().client_email)`],
    { env: childEnv, encoding: 'utf8' },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'metrics@example.iam.gserviceaccount.com');
});

test('CLI fails closed and persists error when a configured source has no tester', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sancho-connections-'));
  const brandDir = path.join(workspace, 'brand', 'acme');
  fs.mkdirSync(brandDir, { recursive: true });
  const integrationsPath = path.join(brandDir, 'integrations.json');
  fs.writeFileSync(integrationsPath, JSON.stringify({
    dataSources: { unsupported_metrics_source: { status: 'pending', config: {} } },
  }));
  const script = path.resolve(__dirname, '..', 'test-connection.js');
  const child = spawnSync(
    process.execPath,
    [script, '--slug', 'acme', '--source', 'unsupported_metrics_source'],
    { env: { ...process.env, MC_WORKSPACE: workspace }, encoding: 'utf8' },
  );
  assert.equal(child.status, 1);
  const saved = JSON.parse(fs.readFileSync(integrationsPath, 'utf8'));
  assert.equal(saved.dataSources.unsupported_metrics_source.status, 'error');
  assert.match(saved.dataSources.unsupported_metrics_source.lastError, /No connection tester/);
  assert.ok(saved.dataSources.unsupported_metrics_source.lastTestedAt);
});

test('GA4 verifies the v1beta runReport payload used by the collector', async () => {
  const metricNames = [
    'sessions', 'totalUsers', 'newUsers', 'bounceRate', 'averageSessionDuration',
    'conversions', 'screenPageViews', 'engagedSessions', 'engagementRate',
  ];
  _setGoogleAuthForTests({
    serviceAccount: () => ({ client_email: 'metrics@example.com', private_key: 'key' }),
    accessToken: async () => 'access',
  });
  const calls = mockRequests([response({
    metricHeaders: metricNames.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rowCount: 0,
  })]);
  const result = await TESTERS.ga4({ PROPERTY_ID: '123' }, {}, 'ACME');
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://analyticsdata.googleapis.com/v1beta/properties/123:runReport');
  assert.equal(calls[0].options.method, 'POST');

  mockRequests([response({ rowCount: 0 })]);
  const invalid = await TESTERS.ga4({ PROPERTY_ID: '123' }, {}, 'ACME');
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /metricHeaders/);
});

test('GSC verifies Search Analytics rows using the same read scope and date dimension', async () => {
  const scopes = [];
  _setGoogleAuthForTests({
    serviceAccount: () => ({ client_email: 'metrics@example.com', private_key: 'key' }),
    accessToken: async (_sa, scope) => {
      scopes.push(scope);
      return 'access';
    },
  });
  const calls = mockRequests([response({ rows: [] })]);
  const result = await TESTERS.gsc({ site_url: 'sc-domain:example.com' }, {}, 'ACME');
  assert.equal(result.ok, true);
  assert.match(calls[0].url, /www\.googleapis\.com\/webmasters\/v3\/sites\/sc-domain%3Aexample\.com\/searchAnalytics\/query/);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(scopes, ['https://www.googleapis.com/auth/webmasters.readonly']);

  mockRequests([response({ rows: {} })]);
  const invalid = await TESTERS.gsc({ SITE_URL: 'https://example.com/' }, {}, 'ACME');
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /rows must be an array/);
});

test('Sheets verifies the v4 values payload with the shared service account', async () => {
  _setGoogleAuthForTests({
    serviceAccount: () => ({ client_email: 'metrics@example.com', private_key: 'key' }),
    accessToken: async () => 'access',
  });
  const calls = mockRequests([response({ values: [['date', 'revenue']] })]);
  const result = await TESTERS.sheets(
    { spreadsheetId: 'sheet_1', range: 'Manual Data!A:Z' },
    {},
    'ACME',
  );
  assert.equal(result.ok, true);
  assert.match(calls[0].url, /sheets\.googleapis\.com\/v4\/spreadsheets\/sheet_1\/values\/Manual%20Data!A%3AZ/);

  mockRequests([response({ values: {} })]);
  const invalid = await TESTERS.sheets({ spreadsheetId: 'sheet_1' }, {}, 'ACME');
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /values must be an array/);
});

test('Meta Ads uses Graph v21 Insights with Bearer auth and rejects malformed HTTP 200', async () => {
  const calls = mockRequests([response({ account_status: 1 })]);
  const invalid = await TESTERS.meta_ads(
    { ACCOUNT_ID: 'act_123' },
    { ACME_META_ACCESS_TOKEN: 'secret' },
    'ACME',
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /missing data array/);
  assert.match(calls[0].url, /graph\.facebook\.com\/v21\.0\/act_123\/insights/);
  assert.doesNotMatch(calls[0].url, /access_token=/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');

  const validCalls = mockRequests([response({ data: [] })]);
  const valid = await TESTERS.meta_ads(
    { ACCOUNT_ID: 'act_123' },
    { META_ADS_ACCESS_TOKEN: 'secret' },
    'ACME',
  );
  assert.equal(valid.ok, true);
  assert.equal(validCalls.length, 1);
});

test('Metricool requires userId and blogId and validates profile brand/network on HTTP 200', async () => {
  const missingUser = await TESTERS.metricool(
    { METRICOOL_URL: 'https://app.metricool.com/evolution?blogId=10' },
    { METRICOOL_API_TOKEN: 'token' },
    'ACME',
  );
  assert.equal(missingUser.ok, false);
  assert.match(missingUser.error, /both blogId and userId/);

  mockRequests([response({ id: 10 })]);
  const invalidShape = await TESTERS.metricool(
    { METRICOOL_URL: 'https://app.metricool.com/evolution?blogId=10&userId=20' },
    { METRICOOL_API_TOKEN: 'token' },
    'ACME',
  );
  assert.equal(invalidShape.ok, false);
  assert.match(invalidShape.error, /not an array/);

  const calls = mockRequests([
    response([{ id: 10, instagram: true }]),
    response([]),
  ]);
  const valid = await TESTERS.metricool(
    { METRICOOL_URL: 'https://app.metricool.com/evolution?blogId=10&userId=20' },
    { ACME_METRICOOL_API_TOKEN: 'token' },
    'ACME',
  );
  assert.equal(valid.ok, true);
  assert.match(calls[0].url, /userId=20/);
  assert.match(calls[0].url, /blogId=10/);
  assert.equal(calls[0].options.headers['X-Mc-Auth'], 'token');
  assert.match(calls[1].url, /v2\/analytics\/posts\/instagram/);

  mockRequests([
    response([{ id: 10, instagram: true }]),
    response({ items: [] }),
  ]);
  const invalidAnalytics = await TESTERS.metricool(
    { METRICOOL_URL: 'https://app.metricool.com/evolution?blogId=10&userId=20' },
    { METRICOOL_API_TOKEN: 'token' },
    'ACME',
  );
  assert.equal(invalidAnalytics.ok, false);
  assert.match(invalidAnalytics.error, /posts: response was not an array/);
});

test('GHL always verifies modern LeadConnector contacts, calendars and opportunities', async () => {
  const calls = mockRequests([
    response({ contacts: [], total: 0 }),
    response({ calendars: [] }),
    response({ opportunities: [], meta: { total: 0 } }),
  ]);
  const result = await TESTERS.ghl(
    { LOCATION_ID: 'loc_1', timezone: 'UTC' },
    { ACME_GHL_API_KEY: 'non-pit-token' },
    'ACME',
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.url.startsWith('https://services.leadconnectorhq.com/')));
  assert.ok(calls.every((call) => !call.url.includes('rest.gohighlevel.com')));
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer non-pit-token');
  assert.match(calls[2].url, /locationId=loc_1/);
  assert.doesNotMatch(calls[2].url, /location_id=/);
  assert.equal(calls[2].options.headers.Version, 'v3');

  mockRequests([response({ contacts: [] })]);
  const invalid = await TESTERS.ghl(
    { LOCATION_ID: 'loc_1', timezone: 'UTC' },
    { GHL_API_KEY: 'token' },
    'ACME',
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /contacts total/);
});

test('GHL connection test discovers and validates the location timezone when omitted', async () => {
  const calls = mockRequests([
    response({ location: { timezone: 'Europe/Madrid' } }),
    response({ contacts: [], total: 0 }),
    response({ calendars: [] }),
    response({ opportunities: [], meta: { total: 0 } }),
  ]);
  const result = await TESTERS.ghl(
    { LOCATION_ID: 'loc_1' },
    { ACME_GHL_API_KEY: 'token' },
    'ACME',
  );

  assert.equal(result.ok, true);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, 'https://services.leadconnectorhq.com/locations/loc_1');
  assert.equal(calls[0].options.headers.Version, 'v3');
  assert.match(result.detail, /Europe\/Madrid/);
});

test('Google Ads requires every collector credential, exchanges OAuth, and queries API v24', async () => {
  const incomplete = await TESTERS.google_ads(
    { CUSTOMER_ID: '123-456-7890' },
    { GOOGLE_ADS_REFRESH_TOKEN: 'refresh', GOOGLE_ADS_DEVELOPER_TOKEN: 'developer' },
    'ACME',
  );
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.error, /CLIENT_ID/);

  const calls = mockRequests([
    response({ access_token: 'access' }),
    response([{ results: [{ customer: { id: '1234567890', descriptiveName: 'Account' } }] }]),
  ]);
  const result = await TESTERS.google_ads(
    { CUSTOMER_ID: '123-456-7890', MCC_ID: '999-888-7777' },
    {
      GOOGLE_ADS_REFRESH_TOKEN: 'refresh',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'developer',
      GOOGLE_ADS_CLIENT_ID: 'client',
      GOOGLE_ADS_CLIENT_SECRET: 'secret',
    },
    'ACME',
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.match(calls[1].url, /googleads\.googleapis\.com\/v24\/customers\/1234567890/);
  assert.equal(calls[1].options.headers['developer-token'], 'developer');
  assert.equal(calls[1].options.headers['login-customer-id'], '9998887777');

  mockRequests([response({ access_token: 'access' }), response({ results: [] })]);
  const invalidShape = await TESTERS.google_ads(
    { CUSTOMER_ID: '123-456-7890' },
    {
      GOOGLE_ADS_REFRESH_TOKEN: 'refresh',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'developer',
      GOOGLE_ADS_CLIENT_ID: 'client',
      GOOGLE_ADS_CLIENT_SECRET: 'secret',
    },
    'ACME',
  );
  assert.equal(invalidShape.ok, false);
  assert.match(invalidShape.error, /response was not an array/);
});

test('PostHog verifies the collector HogQL canary and rejects a project-shaped 200', async () => {
  mockRequests([response({ id: 42 })]);
  const invalid = await TESTERS.posthog(
    { PROJECT_ID: '42', HOST: 'eu.posthog.com/' },
    { POSTHOG_API_KEY: 'phx_test' },
    'ACME',
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /missing results rows/);

  const calls = mockRequests([response({ results: [[0]] })]);
  const valid = await TESTERS.posthog(
    { PROJECT_ID: '42', HOST: 'https://eu.posthog.com/' },
    { ACME_POSTHOG_API_KEY: 'phx_test' },
    'ACME',
  );
  assert.equal(valid.ok, true);
  assert.equal(calls[0].url, 'https://eu.posthog.com/api/projects/42/query/');
  assert.equal(calls[0].options.method, 'POST');
});

test('Instantly verifies daily analytics array rather than a generic campaigns 200', async () => {
  mockRequests([response({ items: [] })]);
  const invalid = await TESTERS.instantly({}, { INSTANTLY_API_KEY: 'key' }, 'ACME');
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /not an array/);

  const calls = mockRequests([response([])]);
  const valid = await TESTERS.instantly({}, { ACME_INSTANTLY_API_KEY: 'key' }, 'ACME');
  assert.equal(valid.ok, true);
  assert.match(calls[0].url, /campaigns\/analytics\/daily/);
});

test('Explee verifies the configured AutoGTM project with a read-only lifetime request', async () => {
  const calls = mockRequests([
    response({ projects: [{ id: 18200, domain: 'growth4u.io' }], total: 1 }),
    response({
      project_id: 18200,
      period: 'all',
      total_emails_sent: 100,
      total_replies: 8,
      overall_reply_rate_pct: 8,
      total_hot_leads: 3,
      total_spend_usd: 12.5,
      campaigns: [],
    }),
  ]);
  const result = await TESTERS.explee(
    { PROJECT_ID: '18200' },
    { ACME_EXPLEE_API_KEY: 'key' },
    'ACME',
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.explee.com/public/api/v1/autogtm/projects');
  assert.equal(
    calls[1].url,
    'https://api.explee.com/public/api/v1/autogtm/projects/18200/analytics?period=all',
  );
  assert.equal(calls[0].options.headers['X-API-Key'], 'key');
  assert.equal(calls[0].options.method, undefined);

  mockRequests([
    response({ projects: [{ id: 18200 }], total: 1 }),
    response({ project_id: 18200, period: 'all', campaigns: [] }),
  ]);
  const invalid = await TESTERS.explee(
    { PROJECT_ID: '18200' },
    { EXPLEE_API_KEY: 'key' },
    'ACME',
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /total_emails_sent/);

  mockRequests([
    response({ projects: [{ id: 18200 }], total: 1 }),
    response({
      project_id: 18200,
      period: 'all',
      total_emails_sent: 100,
      total_replies: 8,
      overall_reply_rate_pct: 8,
      total_hot_leads: 3,
      total_spend_usd: 12.5,
      campaigns: [{}],
    }),
  ]);
  const malformedCampaign = await TESTERS.explee(
    { PROJECT_ID: '18200' },
    { EXPLEE_API_KEY: 'key' },
    'ACME',
  );
  assert.equal(malformedCampaign.ok, false);
  assert.match(malformedCampaign.error, /campaign_id/);

  mockRequests([
    response({ projects: [{ id: 18200 }], total: 1 }),
    response({
      project_id: 18200,
      period: 'all',
      total_emails_sent: 100,
      total_replies: 8,
      overall_reply_rate_pct: 99,
      total_hot_leads: 3,
      total_spend_usd: 12.5,
      campaigns: [],
    }),
  ]);
  const inconsistentRate = await TESTERS.explee(
    { PROJECT_ID: '18200' },
    { EXPLEE_API_KEY: 'key' },
    'ACME',
  );
  assert.equal(inconsistentRate.ok, false);
  assert.match(inconsistentRate.error, /does not match its reported counts/);
});

test('Explee auto-selects one project and rejects ambiguous or inaccessible projects', async () => {
  mockRequests([
    response({ projects: [{ id: 42 }], total: 1 }),
    response({
      project_id: 42,
      period: 'all',
      total_emails_sent: 0,
      total_replies: 0,
      overall_reply_rate_pct: 0,
      total_hot_leads: 0,
      total_spend_usd: 0,
      campaigns: [],
    }),
  ]);
  const single = await TESTERS.explee({}, { EXPLEE_API_KEY: 'key' }, 'ACME');
  assert.equal(single.ok, true);

  mockRequests([response({ projects: [{ id: 1 }, { id: 2 }], total: 2 })]);
  const ambiguous = await TESTERS.explee({}, { EXPLEE_API_KEY: 'key' }, 'ACME');
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.error, /configure PROJECT_ID explicitly/);

  mockRequests([response({ projects: [{ id: 1 }], total: 1 })]);
  const inaccessible = await TESTERS.explee(
    { PROJECT_ID: '2' },
    { EXPLEE_API_KEY: 'key' },
    'ACME',
  );
  assert.equal(inaccessible.ok, false);
  assert.match(inaccessible.error, /not available/);
});

test('Lemlist verifies campaign listing and batch stats when a campaign is configured', async () => {
  const calls = mockRequests([response({ results: [], errors: [] })]);
  const result = await TESTERS.lemlist(
    { CAMPAIGN_IDS: 'cam_1' },
    { LEMLIST_API_KEY: 'key' },
    'ACME',
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.lemlist.com/api/v2/campaigns/stats/batch');
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.headers.Authorization, /^Basic /);

  mockRequests([response({ ok: true })]);
  const invalid = await TESTERS.lemlist(
    { CAMPAIGN_IDS: 'cam_1' },
    { LEMLIST_API_KEY: 'key' },
    'ACME',
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /missing results array/);
});

test('PageSpeed requires valid Lighthouse payloads for mobile and desktop', async () => {
  const calls = mockRequests([response(lighthousePayload()), response(lighthousePayload())]);
  const result = await TESTERS.pagespeed(
    { url: 'example.com' },
    { PAGESPEED_API_KEY: 'key' },
    'ACME',
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /strategy=mobile/);
  assert.match(calls[1].url, /strategy=desktop/);

  mockRequests([response({ lighthouseResult: {} })]);
  const invalid = await TESTERS.pagespeed({ url: 'example.com' }, {}, 'ACME');
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /missing Lighthouse/);
});

test('YALC verifies the exact Sancho partnerships report proxy consumed by metrics', async () => {
  const canaryDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const calls = mockRequests([response({
    from: `${canaryDay}T00:00:00.000Z`,
    to: `${canaryDay}T23:59:59.999Z`,
    targetCacEur: 50,
    totals: {
      postsLive: 1,
      clicks: 2,
      signups: 1,
      kyc: 1,
      conversions: 1,
      investedEur: 20,
      totalCostEur: 25,
      cpaRealEur: 25,
      roi: -0.5,
    },
    creators: [{ clicks: 2, signups: 1, kyc: 1, conversions: 1, feeEur: 20 }],
    tracking: { status: 'real', sources: ['impact'], recordCount: 1 },
  })]);
  const result = await TESTERS.yalc(
    { _adminToken: 'admin', _mcBaseUrl: 'http://sancho.test' },
    {},
    'ACME',
    'acme',
  );
  assert.equal(result.ok, true);
  assert.equal(
    calls[0].url,
    `http://sancho.test/api/partnerships/report?slug=acme&from=${canaryDay}&to=${canaryDay}`,
  );
  assert.equal(calls[0].options.headers['x-admin-token'], 'admin');

  mockRequests([response({
    from: `${canaryDay}T00:00:00.000Z`,
    to: `${canaryDay}T23:59:59.999Z`,
    targetCacEur: 50,
    totals: {
      postsLive: 1,
      clicks: 2,
      signups: 1,
      kyc: 1,
      conversions: 1,
      investedEur: null,
      totalCostEur: null,
      cpaRealEur: null,
      roi: null,
    },
    creators: [{ clicks: 2, signups: 1, kyc: 1, conversions: 1, feeEur: null }],
    tracking: { status: 'real', sources: ['impact'], recordCount: 1 },
  })]);
  const incompleteFinancials = await TESTERS.yalc(
    { _adminToken: 'admin', _mcBaseUrl: 'http://sancho.test' },
    {},
    'ACME',
    'acme',
  );
  assert.equal(incompleteFinancials.ok, true);

  mockRequests([response({
    from: `${canaryDay}T00:00:00.000Z`,
    to: `${canaryDay}T23:59:59.999Z`,
    targetCacEur: 50,
    totals: {
      postsLive: 0,
      clicks: 0,
      signups: 0,
      kyc: 0,
      conversions: 0,
      investedEur: 0,
      totalCostEur: 0,
      cpaRealEur: null,
      roi: null,
    },
    creators: [],
    tracking: { status: 'unavailable', sources: [], recordCount: 0 },
  })]);
  const connectedWithoutData = await TESTERS.yalc(
    { _adminToken: 'admin', _mcBaseUrl: 'http://sancho.test' },
    {},
    'ACME',
    'acme',
  );
  assert.equal(connectedWithoutData.ok, true);
  assert.match(connectedWithoutData.detail, /no real creator performance/i);

  mockRequests([response({ ok: true })]);
  const invalid = await TESTERS.yalc(
    { _adminToken: 'admin', _mcBaseUrl: 'http://sancho.test' },
    {},
    'ACME',
    'acme',
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /valid to date/);
});
