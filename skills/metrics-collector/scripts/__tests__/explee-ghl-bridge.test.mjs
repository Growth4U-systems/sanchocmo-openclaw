import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  bridgeConfig,
  splitName,
  toGhlContact,
  selectNewLeads,
  slugEnvPrefix,
  loadBrandEnv,
  readState,
  writeState,
  syncConversationNote,
} from '../explee-ghl-bridge.mjs';

test('bridgeConfig requires both explee and ghl and reads the opt-in flag', () => {
  assert.equal(bridgeConfig({ dataSources: { explee: {} } }), null);
  assert.equal(bridgeConfig({ dataSources: { ghl: {} } }), null);
  const both = bridgeConfig({
    dataSources: {
      explee: { config: { PUSH_HOT_LEADS_TO_GHL: true } },
      ghl: { config: { locationId: 'loc1' } },
    },
  });
  assert.deepEqual(both, { apply: true, ghlLocationId: 'loc1' });
  const dry = bridgeConfig({ dataSources: { explee: {}, ghl: { config: { LOCATION_ID: 'loc2' } } } });
  assert.deepEqual(dry, { apply: false, ghlLocationId: 'loc2' });
});

test('bridgeConfig treats a non-boolean opt-in as dry-run', () => {
  const cfg = bridgeConfig({
    dataSources: { explee: { config: { PUSH_HOT_LEADS_TO_GHL: 'yes' } }, ghl: { config: { locationId: 'x' } } },
  });
  assert.equal(cfg.apply, false);
});

test('splitName splits first word from the rest', () => {
  assert.deepEqual(splitName('Ada Lovelace King'), { firstName: 'Ada', lastName: 'Lovelace King' });
  assert.deepEqual(splitName('  Cher '), { firstName: 'Cher', lastName: '' });
  assert.deepEqual(splitName(null), { firstName: '', lastName: '' });
});

test('toGhlContact maps lead fields and normalizes the email', () => {
  const payload = toGhlContact(
    {
      name: 'Ana Pérez',
      email: ' Ana@ACME.com ',
      phone: '+34 600 000 000',
      company_name: 'ACME',
      company_domain: 'acme.com',
      campaign_id: 7,
    },
    'loc1',
  );
  assert.deepEqual(payload, {
    locationId: 'loc1',
    email: 'ana@acme.com',
    firstName: 'Ana',
    lastName: 'Pérez',
    source: 'Explee',
    tags: ['explee'],
    phone: '+34 600 000 000',
    companyName: 'ACME',
  });
});

test('toGhlContact falls back to company_domain and omits empty optionals', () => {
  const payload = toGhlContact({ name: 'X', email: 'x@y.z', company_domain: 'y.z' }, 'loc1');
  assert.equal(payload.companyName, 'y.z');
  assert.equal('phone' in payload, false);
});

test('selectNewLeads skips processed ids, leads without email, and sorts by became_hot_at', () => {
  const leads = [
    { person_id: 3, email: 'c@x.com', became_hot_at: '2026-07-03' },
    { person_id: 1, email: 'a@x.com', became_hot_at: '2026-07-01' },
    { person_id: 2, email: '', became_hot_at: '2026-07-02' },
    { person_id: 4, email: 'd@x.com', became_hot_at: '2026-07-04' },
  ];
  const fresh = selectNewLeads(leads, ['4']);
  assert.deepEqual(fresh.map((l) => l.person_id), [1, 3]);
});

test('slugEnvPrefix uppercases and replaces dashes', () => {
  assert.equal(slugEnvPrefix('hospital-capilar'), 'HOSPITAL_CAPILAR');
});

test('loadBrandEnv layers brand .env over process.env and ignores comments', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
  fs.mkdirSync(path.join(root, 'brand', 'acme'), { recursive: true });
  fs.writeFileSync(path.join(root, 'brand', 'acme', '.env'), '# c\nACME_EXPLEE_API_KEY=k1\nBAD LINE\n');
  const env = loadBrandEnv(root, 'acme');
  assert.equal(env.ACME_EXPLEE_API_KEY, 'k1');
  fs.rmSync(root, { recursive: true, force: true });
});

test('state round-trips contacts + field ids + sweep day and tolerates a missing file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-state-'));
  assert.deepEqual(readState(root, 'acme'), { contacts: {}, fieldIds: {}, lastSweepDay: null });
  writeState(root, 'acme', {
    contacts: { 1: { threadHash: 'h1', status: 'hot_lead', noteId: 'n1' }, 2: { threadHash: 'h2', status: 'meeting_request' } },
    fieldIds: { summary: 'f1', status: 'f2', hotSince: 'f3' },
    lastSweepDay: '2026-07-20',
  });
  assert.deepEqual(readState(root, 'acme'), {
    contacts: { 1: { threadHash: 'h1', status: 'hot_lead', noteId: 'n1' }, 2: { threadHash: 'h2', status: 'meeting_request' } },
    fieldIds: { summary: 'f1', status: 'f2', hotSince: 'f3' },
    lastSweepDay: '2026-07-20',
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test('writeState mirrors contacts into processedIds for pre-v3 rollback safety', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-state-compat-'));
  writeState(root, 'acme', { contacts: { 7: { threadHash: 'h' } }, fieldIds: {} });
  const raw = JSON.parse(fs.readFileSync(path.join(root, '_system', 'explee-ghl-bridge.acme.json'), 'utf-8'));
  assert.deepEqual(raw.processedIds, ['7']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('readState upgrades the pre-v3 shape (bare processedIds) into hash-less contacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-state-v1-'));
  fs.mkdirSync(path.join(root, '_system'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '_system', 'explee-ghl-bridge.acme.json'),
    '{"processedIds":["9","10"],"fieldIds":{"summary":"f1","status":"f2"}}',
  );
  const state = readState(root, 'acme');
  // Known (not re-pushed as new) but without threadHash/noteId, so the first
  // daily sweep re-fetches the thread and adopts the existing [Explee] note.
  assert.deepEqual(state, {
    contacts: { 9: {}, 10: {} },
    fieldIds: { summary: 'f1', status: 'f2' },
    lastSweepDay: null,
  });
  fs.rmSync(root, { recursive: true, force: true });
});

function fakeFetchJson(routes, calls) {
  return async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ method, url, body: options.body ? JSON.parse(options.body) : null });
    const route = routes.find((r) => r.method === method && url.endsWith(r.suffix));
    if (!route) throw new Error(`unexpected ${method} ${url}`);
    if (route.error) throw new Error(route.error);
    return route.response;
  };
}

test('syncConversationNote updates the known note in place via PUT', async () => {
  const calls = [];
  const impl = fakeFetchJson([{ method: 'PUT', suffix: '/contacts/c1/notes/n1', response: {} }], calls);
  const noteId = await syncConversationNote('key', 'c1', '[Explee] cuerpo', 'n1', impl);
  assert.equal(noteId, 'n1');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { body: '[Explee] cuerpo' });
  assert.equal(calls[0].method, 'PUT');
});

test('syncConversationNote adopts an existing [Explee] note when the id is unknown or stale', async () => {
  const calls = [];
  const impl = fakeFetchJson([
    { method: 'PUT', suffix: '/contacts/c1/notes/gone', error: 'GHL note update HTTP 404' },
    { method: 'GET', suffix: '/contacts/c1/notes', response: { notes: [{ id: 'other', body: 'manual' }, { id: 'n9', body: '[Explee] viejo' }] } },
    { method: 'PUT', suffix: '/contacts/c1/notes/n9', response: {} },
  ], calls);
  const noteId = await syncConversationNote('key', 'c1', '[Explee] nuevo', 'gone', impl);
  assert.equal(noteId, 'n9');
  assert.deepEqual(calls.map((c) => c.method), ['PUT', 'GET', 'PUT']);
  assert.deepEqual(calls[2].body, { body: '[Explee] nuevo' });
});

test('syncConversationNote creates the note when none exists yet', async () => {
  const calls = [];
  const impl = fakeFetchJson([
    { method: 'GET', suffix: '/contacts/c1/notes', response: { notes: [{ id: 'other', body: 'manual' }] } },
    { method: 'POST', suffix: '/contacts/c1/notes', response: { note: { id: 'nuevo1' } } },
  ], calls);
  const noteId = await syncConversationNote('key', 'c1', '[Explee] primero', null, impl);
  assert.equal(noteId, 'nuevo1');
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST']);
});
