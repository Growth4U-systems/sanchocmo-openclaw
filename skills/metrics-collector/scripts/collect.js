#!/usr/bin/env node

/**
 * metrics-collector — Main collector script
 *
 * Usage:
 *   node collect.js --slug <client> --all
 *   node collect.js --slug <client> --all --due     # only sources due today (cadence)
 *   node collect.js --slug <client> --source <adapter>
 *   node collect.js --slug <client> --source ga4 --from 2024-01-01 --to 2024-01-31
 *   node collect.js --slug <client> --source gsc --from 2024-01-01 --to 2024-03-31 --replace
 *   node collect.js --slug <client> --source ga4 --from 2024-01-01 --to 2024-01-31 --replace --no-recompute-kpis
 *
 * Runtime storage is DB-only: metrics are ingested into `metric_snapshots`.
 * Historical JSON import/export remains in scripts/metrics, but the collector no
 * longer writes brand/<slug>/metrics/YYYY-MM-DD.json or metrics-data.json.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';
import {
  isoDateDaysAgo,
  resolveCollectionObservationDate,
  shouldDeleteStale,
  validateReplaceOptions,
} from './adapter-date-range.js';
import {
  buildCollectedSourcePayload,
  buildFailedSourcePayload,
  resolveProviderCollectionAttempt,
} from './adapter-result.js';

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
const replaceExisting = hasFlag('replace');
const recomputeKpis = !hasFlag('no-recompute-kpis');
const fromDate = getArg('from');
const toDate = getArg('to');
const explicitRange = Boolean(fromDate || toDate);

if (!slug) {
  console.error('Usage: node collect.js --slug <client> [--all | --source <name>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]');
  process.exit(1);
}

if (!sourceFilter && !collectAll) {
  console.error('Specify --all or --source <adapter>');
  process.exit(1);
}

try {
  validateReplaceOptions({ replace: replaceExisting, sourceFilter, collectAll, fromDate, toDate });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// --- Date range ---
// Default: yesterday (most sources have 1-day lag; GSC adapter adds its own 3-day lag)
const yesterday = isoDateDaysAgo(1);
const dateRange = {
  from: fromDate || yesterday,
  to: toDate || yesterday,
};
const collectionStartedAt = new Date().toISOString();
const pointInTimeDate = resolveCollectionObservationDate(dateRange, {
  explicitRange,
  collectedAt: collectionStartedAt,
});

// --- Load integrations.json ---
const brandDir = path.join(WORKSPACE, 'brand', slug);
const integrationsPath = path.join(brandDir, 'integrations.json');
const clientsPath = path.join(WORKSPACE, 'clients.json');

if (!existsSync(integrationsPath)) {
  console.error(`No integrations.json found at ${integrationsPath}`);
  process.exit(1);
}

const integrations = JSON.parse(readFileSync(integrationsPath, 'utf-8'));

function loadClientsData() {
  if (!existsSync(clientsPath)) return {};
  try {
    return JSON.parse(readFileSync(clientsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function clientConfigForSlug(slug) {
  const data = loadClientsData();
  if (data && typeof data === 'object') {
    if (data[slug] && typeof data[slug] === 'object') return data[slug];
    const clients = Array.isArray(data.clients) ? data.clients : [];
    const match = clients.find((client) => client?.slug === slug);
    if (match) return match;
  }
  return {};
}

function getAdminToken() {
  if (process.env.MC_ADMIN_TOKEN) return process.env.MC_ADMIN_TOKEN;
  if (!existsSync(clientsPath)) return '';
  try {
    const data = loadClientsData();
    return typeof data.adminToken === 'string' ? data.adminToken : '';
  } catch {
    return '';
  }
}

const adminToken = getAdminToken();
if (!adminToken) {
  console.warn(`⚠ No admin token found in MC_ADMIN_TOKEN or ${clientsPath}; due-check/reconcile may fail`);
}

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

const clientConfig = clientConfigForSlug(slug);

function hasAnyEnv(...keys) {
  return keys.some((key) => typeof env[key] === 'string' && env[key].trim() !== '');
}

// --- Available adapters ---
const ADAPTERS = ['ga4', 'gsc', 'metricool', 'meta-ads', 'google-ads', 'ghl', 'instantly', 'lemlist', 'sheets', 'posthog', 'pagespeed', 'yalc'];

// --- Determine which adapters to run ---
const ds = integrations.dataSources || integrations;

function sourceEntryFor(adapterName) {
  const explicit = ds[adapterName] || ds[adapterName.replace('-', '_')];
  if (explicit) return explicit;

  if (adapterName === 'pagespeed') {
    const url =
      clientConfig.url ||
      clientConfig.website ||
      clientConfig.siteUrl ||
      env.PAGESPEED_URL ||
      env.CLIENT_URL ||
      env.SITE_URL ||
      env.WEBSITE_URL;
    // An API key alone cannot identify the site to analyse. Do not schedule a
    // guaranteed failure as a seemingly connected source.
    if (url) {
      return { status: 'connected', config: { url } };
    }
  }

  if (adapterName === 'yalc') {
    if (hasAnyEnv('YALC_BASE_URL', 'YALC_API_TOKEN')) {
      return { status: 'connected', config: {} };
    }
  }

  return null;
}

let toRun = collectAll
  ? ADAPTERS.filter((a) => {
      const entry = sourceEntryFor(a);
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
      { headers: { ...(adminToken ? { 'x-admin-token': adminToken } : {}) } },
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

// Convergence is automatic for routine full daily collection. An operator may
// also request it for one source over an explicit range with --replace, which is
// useful for repairing a GSC backfill without touching any other provider.
const allowDeleteStale = shouldDeleteStale({
  replace: replaceExisting,
  sourceFilter,
  collectAll,
  fromDate,
  toDate,
});

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
    collectedAt: collectionStartedAt,
    dateRange,
    sources: {},
  };

  // Support both flat and nested (dataSources) integrations format
  const dataSources = integrations.dataSources || integrations;

  for (const adapterName of toRun) {
    const entry = sourceEntryFor(adapterName) || dataSources[adapterName] || dataSources[adapterName.replace('-', '_')] || {};
    const config = {
      ...(entry.config || entry || {}),
      _adminToken: adminToken,
      _client: clientConfig,
      _mcBaseUrl: MC_BASE,
      _slug: slug,
      // Current-state measurements (followers, CRM totals/pipeline, PageSpeed,
      // etc.) use the real collection day. `_explicitRange` lets mixed adapters
      // omit current-state calls during a historical flow repair.
      _pointInTimeDate: pointInTimeDate,
      _explicitRange: explicitRange,
    };
    const status = entry.status || 'not_configured';
    console.log(`\n📊 Collecting: ${adapterName}...`);

    if (status === 'not_configured' && collectAll) {
      result.sources[adapterName] = { status: 'not_configured' };
      console.log(`   ⏭  Skipped (not configured)`);
      continue;
    }

    let attempt;
    try {
      // Resolve the exact provider window before even importing the adapter.
      // If import/collection fails, the error ledger still points at that same
      // provider day (not the generic CLI default such as yesterday for GSC).
      attempt = resolveProviderCollectionAttempt(adapterName, dateRange, {
        explicitRange,
      });
      // Dynamic import of adapter
      const adapterModule = await import(`./adapters/${adapterName}.js`);
      const data = await adapterModule.collect(config, env, attempt.dateRange);
      result.sources[adapterName] = buildCollectedSourcePayload(
        data,
        result.collectedAt,
        attempt.attemptedDates,
      );
      console.log(`   ✅ ${(data.metrics || []).length} metrics collected`);
    } catch (err) {
      // Resolver failures are caught too; only then do we fall back to the
      // validated CLI range because no provider-specific attempt existed.
      result.sources[adapterName] = buildFailedSourcePayload(
        err,
        attempt?.attemptedDates,
        dateRange,
      );
      console.error(`   ❌ Error: ${err.message}`);
    }
  }

  const today = result.collectedAt.slice(0, 10);

  console.log('\n🗄  JSON snapshot/rolling skipped; metric_snapshots DB is source of truth.');

  // Summary
  const okCount = Object.values(result.sources).filter((s) => s.status === 'ok').length;
  const errCount = Object.values(result.sources).filter((s) => s.status === 'error').length;
  console.log(`\n🏁 Done: ${okCount} ok, ${errCount} errors, ${Object.keys(result.sources).length} total`);

  // Reconcile runs regardless of what was collected (it's cadence-independent).
  await reconcileDrafts();

  // --- Write the daily snapshot into the metric_snapshots time-series ---
  // SAN-300: the DB is the source of truth. `deleteStale` converges the DB to
  // this payload (stale rows for the restated dates removed, GSC-lagged dates
  // untouched). It's gated to the routine FULL daily collection or an explicit,
  // single-source --replace backfill. DB ingest is required now that the
  // collector no longer writes JSON snapshots.
  // SAN-318: persist via the app's ingestDailySnapshot (getDb, no HTTP, no admin
  // token). The Next app (tsconfig/node_modules/@/ aliases/scripts) lives in a
  // SEPARATE deploy dir from this collector, so run tsx FROM the app dir and pipe
  // the in-memory snapshot to its stdin (no temp file — DB is the source of truth).
  try {
    const appDir = process.env.MC_NEXTJS_DIR || '/app/mc-nextjs';
    const ingestScript = path.join(appDir, 'scripts', 'ingest-metrics.ts');
    const payload = JSON.stringify({
      slug,
      date: today,
      collectedAt: result.collectedAt,
      sources: result.sources,
      deleteStale: allowDeleteStale,
      recomputeKpis,
    });
    const out = execFileSync('npx', ['tsx', ingestScript], {
      cwd: appDir, input: payload, encoding: 'utf-8', timeout: 60000, env: { ...process.env },
    });
    process.stdout.write(out);
  } catch (e) {
    console.error(`❌ Neon persist failed: ${e.stderr || e.message}`);
    process.exitCode = 1;
  }

  // Persist every successful source first, but never report a partially failed
  // provider run as a successful shell command. Backfill loops can now stop on
  // the exact day/source that needs operator attention.
  if (errCount > 0) process.exitCode = 1;
}

runCollection().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
