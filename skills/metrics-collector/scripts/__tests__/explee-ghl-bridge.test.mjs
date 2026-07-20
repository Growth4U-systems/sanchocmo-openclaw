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

test('state round-trips processed ids + field ids and tolerates a missing file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-state-'));
  assert.deepEqual(readState(root, 'acme'), { processedIds: [], fieldIds: {} });
  writeState(root, 'acme', { processedIds: ['1', '2'], fieldIds: { summary: 'f1', status: 'f2' } });
  assert.deepEqual(readState(root, 'acme'), {
    processedIds: ['1', '2'],
    fieldIds: { summary: 'f1', status: 'f2' },
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test('readState upgrades the v1 shape (bare processedIds)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-state-v1-'));
  fs.mkdirSync(path.join(root, '_system'), { recursive: true });
  fs.writeFileSync(path.join(root, '_system', 'explee-ghl-bridge.acme.json'), '{"processedIds":["9"]}');
  assert.deepEqual(readState(root, 'acme'), { processedIds: ['9'], fieldIds: {} });
  fs.rmSync(root, { recursive: true, force: true });
});
