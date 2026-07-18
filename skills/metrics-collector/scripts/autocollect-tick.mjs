#!/usr/bin/env node
/**
 * autocollect-tick.mjs — one tick of the daily metrics auto-collection (SAN-300).
 *
 * The per-client collection cadence (edited in Métricas → cadencia, served by
 * /api/metrics/schedule) never had a deterministic executor: the morning_metrics
 * agent cron was the de-facto runner and when it silently stopped, every source
 * went stale until someone collected by hand. This script is the executor. It is
 * invoked on an interval by docker/entrypoint.sh and:
 *
 *   1. no-ops until METRICS_AUTOCOLLECT_UTC_HOUR (default 06:00 UTC);
 *   2. no-ops if the stamp file says today's run already happened — so the
 *      interval/restarts never double-collect;
 *   3. otherwise runs `collect.js --slug <brand> --all --due` sequentially for
 *      every brand whose integrations.json references at least one collector
 *      adapter. `--due` delegates the cadence decision to Mission Control, so
 *      this script schedules *when* to try, never *what* is due.
 *
 * The stamp is written after the brand loop completes (at-least-once on a
 * mid-run crash; collect.js upserts, so repeats are safe). Per-source failures
 * (e.g. a 403 from a provider) are collect.js's business: they are logged and
 * never block the remaining brands.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BRAND_TIMEOUT_MS = 20 * 60_000;

export function utcDate(now) {
  return now.toISOString().slice(0, 10);
}

/**
 * Decide whether this tick should run today's collection.
 * @param {{ now: Date, utcHour: number, stamp: string|null }} input
 */
export function shouldRunNow({ now, utcHour, stamp }) {
  if (now.getUTCHours() < utcHour) {
    return { run: false, reason: `before ${String(utcHour).padStart(2, '0')}:00 UTC` };
  }
  if (stamp === utcDate(now)) {
    return { run: false, reason: 'already ran today' };
  }
  return { run: true, reason: stamp ? `last run ${stamp}` : 'no previous run' };
}

/** Adapter source names = adapter filenames; keeps this list single-sourced. */
export function knownSources(adaptersDir, fsImpl = fs) {
  return fsImpl
    .readdirSync(adaptersDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.slice(0, -3));
}

/**
 * Brands worth invoking the collector for: a readable integrations.json whose
 * dataSources mention at least one known adapter. Hidden/backup dirs (leading
 * "." or "_") are ignored.
 */
export function eligibleBrands(workspaceDir, known, fsImpl = fs) {
  const brandRoot = path.join(workspaceDir, 'brand');
  let entries;
  try {
    entries = fsImpl.readdirSync(brandRoot);
  } catch {
    return [];
  }
  const knownSet = new Set(known);
  const slugs = [];
  for (const entry of entries) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    const intPath = path.join(brandRoot, entry, 'integrations.json');
    let sources;
    try {
      sources = JSON.parse(fsImpl.readFileSync(intPath, 'utf-8')).dataSources || {};
    } catch {
      continue;
    }
    if (Object.keys(sources).some((s) => knownSet.has(s))) slugs.push(entry);
  }
  return slugs.sort();
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function collectBrand(slug, workspaceDir) {
  const result = spawnSync(
    process.execPath,
    ['collect.js', '--slug', slug, '--all', '--due'],
    {
      cwd: SCRIPTS_DIR,
      env: { ...process.env, MC_WORKSPACE: workspaceDir },
      timeout: BRAND_TIMEOUT_MS,
      encoding: 'utf-8',
    },
  );
  if (result.error) {
    log(`${slug}: spawn failed — ${result.error.message}`);
    return;
  }
  const doneLine = (result.stdout || '')
    .split('\n')
    .find((line) => line.includes('Done:'));
  log(`${slug}: exit=${result.status} ${doneLine ? doneLine.trim() : '(no summary line)'}`);
  if (result.status !== 0) {
    const stderrTail = (result.stderr || '').trim().split('\n').slice(-3).join(' | ');
    if (stderrTail) log(`${slug}: stderr tail — ${stderrTail}`);
  }
}

function main() {
  const workspaceDir = process.env.MC_WORKSPACE;
  if (!workspaceDir) {
    console.error('autocollect-tick: MC_WORKSPACE is required');
    process.exit(1);
  }
  const utcHour = Number.parseInt(process.env.METRICS_AUTOCOLLECT_UTC_HOUR || '6', 10);
  const stampPath = path.join(workspaceDir, '_system', 'metrics-autocollect.last');

  let stamp = null;
  try {
    stamp = fs.readFileSync(stampPath, 'utf-8').trim() || null;
  } catch {
    /* first run */
  }

  const now = new Date();
  const decision = shouldRunNow({ now, utcHour, stamp });
  if (!decision.run) {
    log(`tick: skip (${decision.reason})`);
    return;
  }

  const known = knownSources(path.join(SCRIPTS_DIR, 'adapters'));
  const slugs = eligibleBrands(workspaceDir, known);
  log(`tick: run for ${slugs.length} brand(s) [${decision.reason}]: ${slugs.join(', ')}`);
  for (const slug of slugs) collectBrand(slug, workspaceDir);

  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(stampPath, `${utcDate(now)}\n`);
  log(`tick: done, stamped ${utcDate(now)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
