import assert from 'node:assert/strict';
import test from 'node:test';

import { collect, zonedDayBounds } from '../ghl.js';

test('GHL adapter prefers slug-prefixed private integration token', async () => {
  const originalFetch = globalThis.fetch;
  const authHeaders = [];
  globalThis.fetch = async (_url, options = {}) => {
    authHeaders.push(options.headers?.Authorization);
    return Response.json({ statusCode: 401, message: 'Invalid token' }, { status: 401 });
  };

  try {
    await assert.rejects(
      collect(
        { _slug: 'growth4u', locationId: 'loc-1', timezone: 'UTC' },
        {
          GHL_API_KEY: 'global-token',
          GROWTH4U_GHL_API_KEY: 'client-token',
        },
        { from: '2026-07-01', to: '2026-07-01' },
      ),
      /contacts collection failed.*401/,
    );
    assert.ok(authHeaders.length > 0);
    assert.equal(new Set(authHeaders).size, 1);
    assert.equal(authHeaders[0], 'Bearer client-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GHL adapter accepts UI-style token aliases before global fallback', async () => {
  const originalFetch = globalThis.fetch;
  const authHeaders = [];
  globalThis.fetch = async (_url, options = {}) => {
    authHeaders.push(options.headers?.Authorization);
    return Response.json({ statusCode: 401, message: 'Invalid token' }, { status: 401 });
  };

  try {
    await assert.rejects(
      collect(
        { _slug: 'growth4u', LOCATION_ID: 'loc-1', timezone: 'UTC' },
        {
          GHL_API_KEY: 'global-token',
          GROWTH4U_GHL_APIKEY: 'ui-alias-token',
        },
        { from: '2026-07-01', to: '2026-07-01' },
      ),
      /contacts collection failed.*401/,
    );
    assert.ok(authHeaders.length > 0);
    assert.equal(new Set(authHeaders).size, 1);
    assert.equal(authHeaders[0], 'Bearer ui-alias-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function successfulGhlResponse(url, options = {}) {
  const value = String(url);
  if (value.endsWith('/contacts/search')) {
    const body = JSON.parse(String(options.body || '{}'));
    if (Array.isArray(body.filters)) return Response.json({ contacts: [] });
    if (body.pageLimit === 1) return Response.json({ total: 0 });
    return Response.json({ contacts: [] });
  }
  if (value.includes('/calendars/?')) return Response.json({ calendars: [] });
  if (value.includes('/opportunities/search')) {
    const request = new URL(value);
    assert.ok(request.searchParams.get('locationId'));
    assert.equal(request.searchParams.has('location_id'), false);
    assert.equal(request.searchParams.has('pipeline_id'), false);
    assert.equal(options.headers?.Version, 'v3');
    if (request.searchParams.get('status') === 'won') {
      return Response.json({ opportunities: [] });
    }
    return value.includes('&date=')
      ? Response.json({ opportunities: [] })
      : Response.json({ meta: { total: 0 } });
  }
  if (value.includes('/opportunities/pipelines')) return Response.json({ pipelines: [] });
  if (value.includes('/conversations/search')) return Response.json({ conversations: [] });
  throw new Error(`Unexpected GHL test URL: ${value}`);
}

async function collectEmptyGhl() {
  return collect(
    {
      _slug: 'growth4u',
      _pointInTimeDate: '2026-07-02',
      _explicitRange: false,
      locationId: 'loc-1',
      timezone: 'UTC',
    },
    { GROWTH4U_GHL_API_KEY: 'client-token' },
    { from: '2026-07-01', to: '2026-07-01' },
  );
}

test('GHL adapter persists legitimate zeros only after successful core responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = successfulGhlResponse;

  try {
    const result = await collectEmptyGhl();
    const rollups = Object.fromEntries(
      result.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
    );
    assert.deepEqual(rollups, {
      newContacts: 0,
      totalContacts: 0,
      appointments: 0,
      appointmentsByChannel: 0,
      opportunities: 0,
      opportunitiesByChannel: 0,
      pipelineValue: 0,
      totalOpportunities: 0,
      wonOpportunities: 0,
      wonValue: 0,
    });
    assert.equal(result.metrics.find((metric) => metric.name === 'newContacts')?.date, '2026-07-01');
    assert.equal(result.metrics.find((metric) => metric.name === 'totalContacts')?.date, '2026-07-02');
    assert.equal(result.metrics.find((metric) => metric.name === 'wonOpportunities')?.date, '2026-07-02');
    assert.equal(result.metrics.find((metric) => metric.name === 'wonValue')?.date, '2026-07-02');
    assert.deepEqual(result.attemptedDates, ['2026-07-01', '2026-07-02']);
    assert.deepEqual(
      result.restatedScopes.filter((scope) => scope.metricDate === '2026-07-02'),
      [
        { metricDate: '2026-07-02', metricName: 'pipeline' },
        { metricDate: '2026-07-02', metricName: 'pipelineStage' },
        { metricDate: '2026-07-02', metricName: 'wonOpportunities' },
        { metricDate: '2026-07-02', metricName: 'wonValue' },
        { metricDate: '2026-07-02', metricName: 'wonByChannel' },
        { metricDate: '2026-07-02', metricName: 'wonValueByChannel' },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GHL adapter fails the source instead of converting calendar errors to zero', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/calendars/?')) {
      return Response.json({ message: 'upstream unavailable' }, { status: 503 });
    }
    return successfulGhlResponse(url, options);
  };

  try {
    await assert.rejects(collectEmptyGhl(), /appointments collection failed.*503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GHL adapter fails the source instead of converting opportunity errors to zero', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('/opportunities/search') && value.includes('&date=')) {
      return Response.json({ message: 'bad gateway' }, { status: 502 });
    }
    return successfulGhlResponse(url, options);
  };

  try {
    await assert.rejects(collectEmptyGhl(), /opportunities collection failed.*502/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GHL adapter treats a failed all-time contacts total as a source error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/contacts/search')) {
      const body = JSON.parse(String(options.body || '{}'));
      if (body.pageLimit === 1 && !body.filters) {
        return Response.json({ message: 'rate limited' }, { status: 429 });
      }
    }
    return successfulGhlResponse(url, options);
  };

  try {
    await assert.rejects(collectEmptyGhl(), /contacts collection failed.*429/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GHL rejects multi-day ranges instead of storing a period aggregate on day one', async () => {
  await assert.rejects(
    () => collect(
      { _slug: 'acme' },
      {},
      { from: '2026-07-14', to: '2026-07-15' },
    ),
    /collect one day at a time/,
  );
});

test('GHL paginates the optional pipeline-stage snapshot atomically', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/contacts/search')) {
      const body = JSON.parse(String(options.body || '{}'));
      if (body.pageLimit === 1) return Response.json({ total: 0 });
      return Response.json({ contacts: [] });
    }
    if (value.includes('/calendars/?')) return Response.json({ calendars: [] });
    if (value.includes('/opportunities/pipelines')) {
      return Response.json({ pipelines: [{
        id: 'pipe-1',
        name: 'Sales',
        stages: [
          { id: 'stage-1', name: 'Qualified' },
          { id: 'stage-2', name: 'Won' },
        ],
      }] });
    }
    if (value.includes('pipelineId=pipe-1')) {
      assert.equal(options.headers?.Version, 'v3');
      const count = value.includes('page=2') ? 50 : 100;
      return Response.json({
        opportunities: Array.from({ length: count }, (_, index) => ({
          id: `opp-${index}`,
          pipelineStageId: 'stage-1',
        })),
      });
    }
    if (value.includes('/opportunities/search')) {
      if (value.includes('status=won')) return Response.json({ opportunities: [] });
      return value.includes('&date=')
        ? Response.json({ opportunities: [] })
        : Response.json({ meta: { total: 0 } });
    }
    if (value.includes('/conversations/search')) return Response.json({ conversations: [] });
    throw new Error(`Unexpected GHL test URL: ${value}`);
  });

  const result = await collectEmptyGhl();
  const pipeline = result.metrics.find((metric) => metric.name === 'pipeline');
  assert.equal(pipeline?.value, 150);
  assert.deepEqual(pipeline?.dimensions, {
    pipelineId: 'pipe-1',
    pipelineName: 'Sales',
  });
  const stages = result.metrics.filter((metric) => metric.name === 'pipelineStage');
  assert.deepEqual(
    stages.map((stage) => [stage.dimensions.stageId, stage.dimensions.stageName, stage.value]),
    [
      ['stage-1', 'Qualified', 150],
      ['stage-2', 'Won', 0],
    ],
  );
  for (const metric of [pipeline, ...stages]) {
    assert.ok(metric?.dimensions);
    assert.ok(Object.values(metric.dimensions).every((value) =>
      value == null || ['string', 'number', 'boolean'].includes(typeof value)));
  }
  assert.equal(result.quality, undefined);
});

test('GHL historical repair keeps daily events and omits current-only totals and snapshots', async (t) => {
  let currentOnlyCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/contacts/search')) {
      const body = JSON.parse(String(options.body || '{}'));
      if (Array.isArray(body.filters)) return Response.json({ contacts: [] });
      if (body.pageLimit === 1 || body.pageLimit === 15) currentOnlyCalls += 1;
      return Response.json({ contacts: [] });
    }
    if (value.includes('/calendars/?')) return Response.json({ calendars: [] });
    if (value.includes('/opportunities/pipelines')) {
      currentOnlyCalls += 1;
      return Response.json({ pipelines: [{
        id: 'pipe-1',
        name: 'Sales',
        stages: [{ id: 'stage-1', name: 'Won' }],
      }] });
    }
    if (value.includes('pipelineId=pipe-1')) {
      currentOnlyCalls += 1;
      return Response.json({ opportunities: [{ id: 'opp-1', pipelineStageId: 'stage-1' }] });
    }
    if (value.includes('/opportunities/search')) {
      if (value.includes('&date=')) return Response.json({ opportunities: [] });
      currentOnlyCalls += 1;
      return Response.json({ meta: { total: 9 } });
    }
    if (value.includes('/conversations/search')) {
      currentOnlyCalls += 1;
      return Response.json({ conversations: [{ contactId: 'contact-1', unreadCount: 2 }] });
    }
    throw new Error(`Unexpected GHL test URL: ${value}`);
  });

  const result = await collect(
    {
      _slug: 'growth4u',
      _pointInTimeDate: '2026-07-17',
      _explicitRange: true,
      locationId: 'loc-1',
      timezone: 'UTC',
    },
    { GROWTH4U_GHL_API_KEY: 'client-token' },
    { from: '2026-04-01', to: '2026-04-01' },
  );
  const dateOf = (name) => result.metrics.find((metric) => metric.name === name)?.date;

  for (const name of [
    'newContacts',
    'appointments',
    'appointmentsByChannel',
    'opportunities',
    'opportunitiesByChannel',
    'pipelineValue',
  ]) {
    assert.equal(dateOf(name), '2026-04-01', `${name} is an event/day measurement`);
  }
  for (const name of [
    'totalContacts',
    'totalOpportunities',
    'pipeline',
    'pipelineStage',
    'recentConversation',
    'wonOpportunities',
    'wonValue',
    'wonByChannel',
    'wonValueByChannel',
  ]) {
    assert.equal(dateOf(name), undefined, `${name} waits for the final routine snapshot`);
  }
  assert.equal(currentOnlyCalls, 0);
});

test('GHL marks an unavailable optional pipeline snapshot partial without persisting stale-shaped rows', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('/opportunities/pipelines')) {
      return Response.json({ message: 'temporarily unavailable' }, { status: 503 });
    }
    return successfulGhlResponse(url, options);
  });

  const result = await collectEmptyGhl();
  assert.equal(result.quality, 'partial');
  assert.equal(result.metrics.some((metric) =>
    metric.name === 'pipeline' || metric.name === 'pipelineStage'), false);
});

test('GHL atribuye reuniones, oportunidades y ganadas al canal del contacto vía join', async (t) => {
  const contactLookups = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/contacts/search')) {
      const body = JSON.parse(String(options.body || '{}'));
      if (body.pageLimit === 1) return Response.json({ total: 0 });
      return Response.json({ contacts: [] });
    }
    const contactMatch = value.match(/\/contacts\/([^/?]+)$/);
    if (contactMatch) {
      contactLookups.push(contactMatch[1]);
      if (contactMatch[1] === 'contact-a') {
        return Response.json({ contact: { source: 'Explee outbound' } });
      }
      if (contactMatch[1] === 'contact-b') {
        return Response.json({
          contact: { attributions: [{ medium: 'social', utmSessionSource: 'linkedin.com' }] },
        });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    }
    if (value.includes('/calendars/?')) return Response.json({ calendars: [{ id: 'cal-1' }] });
    if (value.includes('/calendars/events')) {
      return Response.json({ events: [
        { contactId: 'contact-a', appointmentStatus: 'confirmed' },
        { contactId: 'contact-b', appointmentStatus: 'showed' },
        { appointmentStatus: 'noshow' },
      ] });
    }
    if (value.includes('/opportunities/pipelines')) return Response.json({ pipelines: [] });
    if (value.includes('/opportunities/search')) {
      if (value.includes('status=won')) {
        return Response.json({ opportunities: [
          { id: 'opp-9', status: 'won', monetaryValue: 1200, contact: { id: 'contact-b' } },
        ] });
      }
      if (value.includes('&date=')) {
        return Response.json({ opportunities: [
          { id: 'opp-1', monetaryValue: 0, contact: { id: 'contact-a' } },
          { id: 'opp-2', monetaryValue: 0, contactId: 'contact-c' },
        ] });
      }
      return Response.json({ meta: { total: 2 } });
    }
    if (value.includes('/conversations/search')) return Response.json({ conversations: [] });
    throw new Error(`Unexpected GHL test URL: ${value}`);
  });

  const result = await collectEmptyGhl();
  const dims = (name) => Object.fromEntries(
    result.metrics
      .filter((metric) => metric.name === name && metric.dimensions)
      .map((metric) => [metric.dimensions.channel, metric.value]),
  );
  const rollup = (name) => result.metrics.find((metric) => metric.name === name && !metric.dimensions);

  // Daily channel splits keep the rollup+dimension emission pattern.
  assert.equal(rollup('appointmentsByChannel')?.value, 3);
  assert.equal(rollup('appointmentsByChannel')?.date, '2026-07-01');
  assert.deepEqual(dims('appointmentsByChannel'), {
    'Explee outbound': 1,
    'social/linkedin.com': 1,
    Unknown: 1,
  });

  assert.equal(rollup('opportunitiesByChannel')?.value, 2);
  assert.equal(rollup('opportunitiesByChannel')?.date, '2026-07-01');
  // contact-c no longer exists (404) → honest 'Unknown', not a fabricated channel.
  assert.deepEqual(dims('opportunitiesByChannel'), {
    'Explee outbound': 1,
    Unknown: 1,
  });

  // Won totals are observation-dated snapshots with per-channel variants.
  assert.equal(rollup('wonOpportunities')?.value, 1);
  assert.equal(rollup('wonOpportunities')?.date, '2026-07-02');
  assert.equal(rollup('wonValue')?.value, 1200);
  assert.equal(rollup('wonValue')?.date, '2026-07-02');
  assert.deepEqual(dims('wonByChannel'), { 'social/linkedin.com': 1 });
  assert.deepEqual(dims('wonValueByChannel'), { 'social/linkedin.com': 1200 });

  assert.equal(
    contactLookups.filter((id) => id === 'contact-a').length,
    1,
    'shared join cache fetches each contact once',
  );
});

test('GHL rejects impossible dates before making a request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network should not be called');
  });
  await assert.rejects(
    () => collect(
      { _slug: 'growth4u', locationId: 'loc-1' },
      { GROWTH4U_GHL_API_KEY: 'client-token' },
      { from: '2026-02-30', to: '2026-02-30' },
    ),
    /invalid date range/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('GHL converts a location calendar day to exact UTC bounds across timezone offsets', () => {
  assert.deepEqual(zonedDayBounds('2026-07-16', 'Europe/Madrid'), {
    timezone: 'Europe/Madrid',
    fromTs: Date.parse('2026-07-15T22:00:00.000Z'),
    toTs: Date.parse('2026-07-16T21:59:59.999Z'),
    fromIso: '2026-07-15T22:00:00.000Z',
    toIso: '2026-07-16T21:59:59.999Z',
  });
});

test('GHL discovers location timezone and applies it to contacts and calendar windows', async (t) => {
  let contactRange = null;
  let calendarEventsUrl = '';
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/locations/loc-1')) {
      assert.equal(options.headers?.Version, 'v3');
      return Response.json({ location: { timezone: 'Europe/Madrid' } });
    }
    if (value.endsWith('/contacts/search')) {
      const body = JSON.parse(String(options.body || '{}'));
      if (Array.isArray(body.filters)) {
        contactRange = body.filters[0]?.value;
        return Response.json({ contacts: [] });
      }
    }
    if (value.includes('/calendars/?')) {
      return Response.json({ calendars: [{ id: 'cal-1' }] });
    }
    if (value.includes('/calendars/events')) {
      calendarEventsUrl = value;
      return Response.json({ events: [] });
    }
    return successfulGhlResponse(url, options);
  });

  await collect(
    { _slug: 'growth4u', locationId: 'loc-1' },
    { GROWTH4U_GHL_API_KEY: 'client-token' },
    { from: '2026-07-16', to: '2026-07-16' },
  );

  assert.deepEqual(contactRange, {
    gte: '2026-07-15T22:00:00.000Z',
    lte: '2026-07-16T21:59:59.999Z',
  });
  const eventParams = new URL(calendarEventsUrl).searchParams;
  assert.equal(eventParams.get('startTime'), String(Date.parse('2026-07-15T22:00:00.000Z')));
  assert.equal(eventParams.get('endTime'), String(Date.parse('2026-07-16T21:59:59.999Z')));
});
