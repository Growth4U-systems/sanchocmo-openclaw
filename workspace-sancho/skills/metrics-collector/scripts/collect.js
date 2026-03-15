#!/usr/bin/env node

/**
 * metrics-collector — Main collector script
 *
 * Usage:
 *   node collect.js --slug <client> --all
 *   node collect.js --slug <client> --source <adapter>
 *   node collect.js --slug <client> --source ga4 --from 2024-01-01 --to 2024-01-31
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(__dirname, '..', '..', '..');

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
function loadEnv(slug) {
  const envPath = path.join(brandDir, '.env');
  const env = {};
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
const ADAPTERS = ['ga4', 'gsc', 'metricool', 'meta-ads', 'ghl', 'instantly', 'sheets'];

// --- Determine which adapters to run ---
const ds = integrations.dataSources || integrations;
const toRun = collectAll
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
async function runCollection() {
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

  // --- Save daily snapshot ---
  const metricsDir = path.join(brandDir, 'metrics');
  mkdirSync(metricsDir, { recursive: true });

  const today = new Date().toISOString().split('T')[0];
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

  // Summary
  const okCount = Object.values(result.sources).filter((s) => s.status === 'ok').length;
  const errCount = Object.values(result.sources).filter((s) => s.status === 'error').length;
  console.log(`\n🏁 Done: ${okCount} ok, ${errCount} errors, ${Object.keys(result.sources).length} total`);
}

runCollection().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
