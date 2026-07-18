import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { shouldRunNow, knownSources, eligibleBrands, utcDate } from '../autocollect-tick.mjs';

const at = (iso) => new Date(iso);

test('shouldRunNow waits until the configured UTC hour', () => {
  const d = shouldRunNow({ now: at('2026-07-18T05:59:00Z'), utcHour: 6, stamp: null });
  assert.equal(d.run, false);
  assert.match(d.reason, /before 06:00 UTC/);
});

test('shouldRunNow runs after the hour when there is no stamp', () => {
  const d = shouldRunNow({ now: at('2026-07-18T06:00:00Z'), utcHour: 6, stamp: null });
  assert.equal(d.run, true);
});

test('shouldRunNow does not repeat a day that is already stamped', () => {
  const d = shouldRunNow({ now: at('2026-07-18T09:00:00Z'), utcHour: 6, stamp: '2026-07-18' });
  assert.equal(d.run, false);
  assert.equal(d.reason, 'already ran today');
});

test('shouldRunNow runs when the stamp is from a previous day', () => {
  const d = shouldRunNow({ now: at('2026-07-18T23:59:00Z'), utcHour: 6, stamp: '2026-07-17' });
  assert.equal(d.run, true);
  assert.equal(d.reason, 'last run 2026-07-17');
});

test('utcDate formats the UTC calendar day', () => {
  assert.equal(utcDate(at('2026-07-18T23:59:59Z')), '2026-07-18');
});

test('knownSources lists adapter files without the .js suffix', () => {
  const fake = { readdirSync: () => ['ga4.js', 'explee.js', '__tests__', 'notes.md'] };
  assert.deepEqual(knownSources('/adapters', fake), ['ga4', 'explee']);
});

test('eligibleBrands picks brands referencing a known adapter and skips the rest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autocollect-'));
  const mk = (slug, content) => {
    fs.mkdirSync(path.join(root, 'brand', slug), { recursive: true });
    if (content !== undefined) {
      fs.writeFileSync(path.join(root, 'brand', slug, 'integrations.json'), content);
    }
  };
  mk('acme', JSON.stringify({ dataSources: { ga4: { status: 'connected' } } }));
  mk('zeta', JSON.stringify({ dataSources: { explee: {} } }));
  mk('no-metrics', JSON.stringify({ dataSources: { slack: { status: 'connected' } } }));
  mk('no-file');
  mk('broken', '{not json');
  mk('.hidden-bak', JSON.stringify({ dataSources: { ga4: {} } }));
  mk('_system-ish', JSON.stringify({ dataSources: { ga4: {} } }));

  const slugs = eligibleBrands(root, ['ga4', 'explee']);
  assert.deepEqual(slugs, ['acme', 'zeta']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('eligibleBrands returns empty when the brand root does not exist', () => {
  assert.deepEqual(eligibleBrands('/nope-does-not-exist', ['ga4']), []);
});
