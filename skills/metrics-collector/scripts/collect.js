#!/usr/bin/env node

/**
 * metrics-collector — Main collector script
 *
 * Usage:
 *   node collect.js --slug <client> --all
 *   node collect.js --slug <client> --all --due     # only sources due today (cadence)
 *   node collect.js --slug <client> --source <adapter>
 *   node collect.js --slug <client> --source ga4 --from 2024-01-01 --to 2024-01-31
 *
 * Env: METRICS_WRITE_JSON=0 skips the JSON snapshot/rolling files. NOTE: do NOT
 *   set this yet — getClientMetricsSummary (Sancho MCP report) and publishing
 *   reconciliation still read brand/<slug>/metrics/*.json with no DB fallback.
 *   Flip it only once those readers are migrated to the DB.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// MC_WORKSPACE (set by the VPS container) wins over the legacy relative walk,
// which only resolved correctly when this skill lived inside workspace-sancho/.
// Post merge with content-engine the skill moved to ~/.openclaw/skills/, leaving
// the original `..,..,..` walk pointing at a directory with no brand/.
const WORKSPACE = process.env.MC_WORKSPACE || path.resolve(__dirname, '..', '..', '..');

// --- Argument parsing ---
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const hasFlag = (name) => args.includes(`--${name}`);

const slug = getArg('slug');
const sourceFilter = getArg('source');
const collectAll = hasFlag('all');
const dueOnly = hasFlag('due'); // collect only sources whose cadence is due today (SAN-300)
const fromDate = getArg('from');
const toDate = getArg('to');

if (!slug) {
  console.error('Usage: node collect.js --slug <client> [--all | --source <name>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]');
  process.exit(1);
}

if (!sourceFilter && !collectAll) {
  console.error('Specify --all or --source <adapter>');
  process.exit(1);
}

// --- Date range ---
// Default: yesterday (most sources have 1-day lag; GSC adapter adds its own 3-day lag)
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
const yesterday = daysAgo(1);
const dateRange = {
  from: fromDate || yesterday,
  to: toDate || yesterday,
};

// --- Load integrations.json ---
const brandDir = path.join(WORKSPACE, 'brand', slug);
const integrationsPath = path.join(brandDir, 'integrations.json');

if (!existsSync(integrationsPath)) {
  console.error(`No integrations.json found at ${integrationsPath}`);
  process.exit(1);
}

const integrations = JSON.parse(readFileSync(integrationsPath, 'utf-8'));

// --- Load .env ---
// Layering: process.env (global secrets injected by the VPS deploy) is the
// base, and brand-specific brand/<slug>/.env overlays on top so per-client
// overrides win. Without process.env the VPS deploy injection of
// META_ACCESS_TOKEN / GHL_API_KEY / INSTANTLY_API_KEY would be invisible to
// the adapters, since collect.js used to read only the brand .env.
function loadEnv(slug) {
  const env = { ...process.env };
  const envPath = path.join(brandDir, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const rawEnv = loadEnv(slug);

// Strip slug prefix from env vars so adapters get generic keys
// e.g. GROWTH4U_METRICOOL_API_TOKEN → METRICOOL_API_TOKEN
const slugPrefix = slug.toUpperCase().replace(/-/g, '_') + '_';
const env = {};
for (const [key, val] of Object.entries(rawEnv)) {
  env[key] = val; // keep original
  if (key.startsWith(slugPrefix)) {
    env[key.slice(slugPrefix.length)] = val; // add without prefix
  }
}

// --- Available adapters ---
const ADAPTERS = ['ga4', 'gsc', 'metricool', 'meta-ads', 'ghl', 'instantly', 'sheets', 'posthog'];

// --- Determine which adapters to run ---
const ds = integrations.dataSources || integrations;
let toRun = collectAll
  ? ADAPTERS.filter((a) => {
      const entry = ds[a] || ds[a.replace('-', '_')];
      return entry && entry.status && entry.status !== 'not_configured';
    })
  : sourceFilter && ADAPTERS.includes(sourceFilter)
    ? [sourceFilter]
    : [];

if (toRun.length === 0) {
  console.error(`No valid adapters to run. Available: ${ADAPTERS.join(', ')}`);
  process.exit(1);
}

// --- Run collection ---
const MC_BASE = process.env.MC_BASE_URL || 'http://localhost:3000';

// Ask MC which of the candidate sources are due today (per the editable cadence).
// On any failure, fall back to collecting all candidates — better to over-collect
// than to silently miss a source (SAN-300).
async function filterDueSources(candidates) {
  try {
    const res = await fetch(
      `${MC_BASE}/api/metrics/schedule?slug=${encodeURIComponent(slug)}&due=1&sources=${encodeURIComponent(candidates.join(','))}`,
      { headers: { ...(process.env.MC_ADMIN_TOKEN ? { 'x-admin-token': process.env.MC_ADMIN_TOKEN } : {}) } },
    );
    if (!res.ok) {
      console.warn(`⚠ Due-check HTTP ${res.status}; collecting all connected sources`);
      return candidates;
    }
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.due) ? data.due : candidates;
  } catch (e) {
    console.warn(`⚠ Due-check unreachable (${e.message}); collecting all connected sources`);
    return candidates;
  }
}

// Promote drafts whose Metricool schedule fired since the last cron
// (scheduled → published). Cadence-independent and idempotent; best-effort.
async function reconcileDrafts() {
  try {
    const res = await fetch(`${MC_BASE}/api/publishing/reconcile?slug=${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const n = (data.reconciled || []).length;
      console.log(`🔁 Reconcile: ${n} draft${n === 1 ? '' : 's'} promoted to published`);
      for (const entry of data.reconciled || []) {
        console.log(`   → ${entry.ideaId}/${entry.channel}: ${entry.url}`);
      }
    } else {
      console.warn(`⚠ Reconcile endpoint returned HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn(`⚠ Reconcile skipped (MC unreachable at ${MC_BASE}): ${e.message}`);
  }
}

// delete-stale (convergence) runs ONLY on the routine full daily collection —
// never on a single --source or an explicit --from/--to re-pull, which are
// partial and would otherwise converge-delete legitimate rows (SAN-300 review).
const allowDeleteStale = collectAll && !fromDate && !toDate;

async function runCollection() {
  if (dueOnly) {
    const due = await filterDueSources(toRun);
    const notDue = toRun.filter((s) => !due.includes(s));
    toRun = toRun.filter((s) => due.includes(s));
    if (notDue.length) console.log(`⏭  No tocan hoy (cadencia): ${notDue.join(', ')}`);
    if (toRun.length === 0) {
      console.log('🟰 Nada que recoger hoy según la cadencia.');
      await reconcileDrafts(); // still promote any drafts that published overnight
      return;
    }
    console.log(`📅 Due hoy: ${toRun.join(', ')}`);
  }

  const result = {
    slug,
    collectedAt: new Date().toISOString(),
    dateRange,
    sources: {},
  };

  // Support both flat and nested (dataSources) integrations format
  const dataSources = integrations.dataSources || integrations;

  for (const adapterName of toRun) {
    const entry = dataSources[adapterName] || dataSources[adapterName.replace('-', '_')] || {};
    const config = entry.config || entry || {};
    const status = entry.status || 'not_configured';
    console.log(`\n📊 Collecting: ${adapterName}...`);

    if (status === 'not_configured' && collectAll) {
      result.sources[adapterName] = { status: 'not_configured' };
      console.log(`   ⏭  Skipped (not configured)`);
      continue;
    }

    try {
      // Dynamic import of adapter
      const adapterModule = await import(`./adapters/${adapterName}.js`);
      // GSC has ~3 day lag; override date range unless user specified explicit dates
      let adapterDateRange = dateRange;
      if (adapterName === 'gsc' && !fromDate) {
        adapterDateRange = { from: daysAgo(4), to: daysAgo(3) };
      }
      const data = await adapterModule.collect(config, env, adapterDateRange);
      result.sources[adapterName] = {
        status: 'ok',
        collectedAt: new Date().toISOString(),
        metrics: data.metrics || [],
      };
      console.log(`   ✅ ${(data.metrics || []).length} metrics collected`);
    } catch (err) {
      result.sources[adapterName] = {
        status: 'error',
        error: err.message,
      };
      console.error(`   ❌ Error: ${err.message}`);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  // --- Save daily snapshot + rolling history (JSON) ---
  // Optional once the DB is the source of truth: set METRICS_WRITE_JSON=0 to skip
  // writing files entirely (DB ingest below still runs) (SAN-300).
  const writeJson = process.env.METRICS_WRITE_JSON !== '0';
  if (writeJson) {
    const metricsDir = path.join(brandDir, 'metrics');
    mkdirSync(metricsDir, { recursive: true });

    const snapshotPath = path.join(metricsDir, `${today}.json`);
    writeFileSync(snapshotPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Daily snapshot saved: ${snapshotPath}`);

    // --- Append to rolling metrics-data.json (90 days) ---
    const rollingPath = path.join(metricsDir, 'metrics-data.json');
    let rolling = [];
    if (existsSync(rollingPath)) {
      try {
        rolling = JSON.parse(readFileSync(rollingPath, 'utf-8'));
      } catch {
        rolling = [];
      }
    }

    // Remove entries older than 90 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString();
    rolling = rolling.filter((entry) => entry.collectedAt >= cutoffStr);

    // Remove existing entry for today (idempotent)
    rolling = rolling.filter((entry) => {
      const entryDate = entry.collectedAt?.split('T')[0];
      return entryDate !== today;
    });

    rolling.push(result);
    writeFileSync(rollingPath, JSON.stringify(rolling, null, 2));
    console.log(`📈 Rolling data updated: ${rollingPath} (${rolling.length} entries)`);
  } else {
    console.log('\n🗄  JSON snapshot/rolling skipped (METRICS_WRITE_JSON=0); DB is source of truth.');
  }

  // Summary
  const okCount = Object.values(result.sources).filter((s) => s.status === 'ok').length;
  const errCount = Object.values(result.sources).filter((s) => s.status === 'error').length;
  console.log(`\n🏁 Done: ${okCount} ok, ${errCount} errors, ${Object.keys(result.sources).length} total`);

  // Reconcile runs regardless of what was collected (it's cadence-independent).
  await reconcileDrafts();

  // --- Write the daily snapshot into the metric_snapshots time-series ---
  // SAN-300: the DB is the source of truth. `deleteStale` converges the DB to
  // this payload (stale rows for the restated dates removed, GSC-lagged dates
  // untouched). It's gated to the routine FULL daily collection — a single
  // --source or an explicit --from/--to re-pull is partial, so it must NOT
  // converge-delete. Best-effort — never fails the collection.
  try {
    const ingestRes = await fetch(`${MC_BASE}/api/metrics/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.MC_ADMIN_TOKEN ? { 'x-admin-token': process.env.MC_ADMIN_TOKEN } : {}),
      },
      body: JSON.stringify({ slug, date: today, collectedAt: result.collectedAt, sources: result.sources, deleteStale: allowDeleteStale }),
    });
    if (ingestRes.ok) {
      const data = await ingestRes.json().catch(() => ({}));
      console.log(`🗃  Ingest: ${data.rows ?? 0} row(s) written, ${data.deleted ?? 0} stale removed`);
    } else {
      console.warn(`⚠ Ingest endpoint returned HTTP ${ingestRes.status}`);
    }
  } catch (e) {
    console.warn(`⚠ Ingest skipped (MC unreachable at ${MC_BASE}): ${e.message}`);
  }
}

runCollection().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
