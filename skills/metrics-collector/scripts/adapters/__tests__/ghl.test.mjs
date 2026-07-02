import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../ghl.js';

test('GHL adapter prefers slug-prefixed private integration token', async () => {
  const originalFetch = globalThis.fetch;
  const authHeaders = [];
  globalThis.fetch = async (_url, options = {}) => {
    authHeaders.push(options.headers?.Authorization);
    return Response.json({ statusCode: 401, message: 'Invalid token' }, { status: 401 });
  };

  try {
    await collect(
      { _slug: 'growth4u', locationId: 'loc-1' },
      {
        GHL_API_KEY: 'global-token',
        GROWTH4U_GHL_API_KEY: 'client-token',
      },
      { from: '2026-07-01', to: '2026-07-01' },
    );
    assert.ok(authHeaders.length > 0);
    assert.equal(new Set(authHeaders).size, 1);
    assert.equal(authHeaders[0], 'Bearer client-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
