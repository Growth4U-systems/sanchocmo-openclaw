#!/usr/bin/env node

/**
 * sync-sheets.js — Push metrics-data.json to Google Sheets via gog CLI
 *
 * Usage: node sync-sheets.js --slug <client>
 *
 * Reads brand/{slug}/metrics/metrics-data.json, flattens into rows,
 * and writes to the configured Google Sheet using `gog sheets update`.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '..', '..', '..');

// --- Args ---
const args = process.argv.slice(2);
const slugIdx = args.indexOf('--slug');
const slug = slugIdx !== -1 ? args[slugIdx + 1] : null;

if (!slug) {
  console.error('Usage: node sync-sheets.js --slug <client>');
  process.exit(1);
}

const brandDir = path.join(WORKSPACE, 'brand', slug);
const metricsPath = path.join(brandDir, 'metrics', 'metrics-data.json');
const integrationsPath = path.join(brandDir, 'integrations.json');

if (!existsSync(metricsPath)) {
  console.error(`No metrics-data.json found at ${metricsPath}`);
  process.exit(1);
}

if (!existsSync(integrationsPath)) {
  console.error(`No integrations.json found at ${integrationsPath}`);
  process.exit(1);
}

const integrations = JSON.parse(readFileSync(integrationsPath, 'utf-8'));
const sheetsConfig = integrations.metricsSheet || integrations['metrics-sync'] || integrations.sheets || {};
const spreadsheetId = sheetsConfig.spreadsheetId || sheetsConfig.syncSpreadsheetId;

if (!spreadsheetId) {
  console.error('No spreadsheetId configured in integrations.json (metricsSheet.spreadsheetId)');
  process.exit(1);
}

// --- Load and flatten metrics ---
const rollingData = JSON.parse(readFileSync(metricsPath, 'utf-8'));

// Separate data by source into different sheets
const sourceRows = {};

for (const entry of rollingData) {
  const sources = entry.sources || {};
  for (const [sourceName, sourceData] of Object.entries(sources)) {
    if (sourceData.status !== 'ok') continue;
    if (!sourceRows[sourceName]) {
      sourceRows[sourceName] = [];
    }
    for (const metric of sourceData.metrics || []) {
      if (metric.name === 'postDetail') continue; // Skip per-post details for summary sheet
      const dims = metric.dimensions ? JSON.stringify(metric.dimensions) : '';
      sourceRows[sourceName].push([
        metric.date || entry.dateRange?.from || '',
        metric.name,
        metric.value,
        dims,
      ]);
    }
  }
}

// --- Build sheets ---
// Summary sheet with all high-level metrics (no dimensions)
const summaryRows = [['Date', 'Source', 'Metric', 'Value']];
for (const entry of rollingData) {
  for (const [sourceName, sourceData] of Object.entries(entry.sources || {})) {
    if (sourceData.status !== 'ok') continue;
    for (const metric of sourceData.metrics || []) {
      if (metric.dimensions || metric.name === 'postDetail') continue;
      summaryRows.push([
        metric.date || entry.dateRange?.from || '',
        sourceName,
        metric.name,
        metric.value,
      ]);
    }
  }
}

// Per-source detail sheets
const perSourceHeaders = { Date: 0, Metric: 1, Value: 2, Dimensions: 3 };

console.log(`📊 Syncing to Google Sheets: ${spreadsheetId}`);
console.log(`   Summary: ${summaryRows.length - 1} rows`);

// Write summary to Sheet1
const tmpFile = path.join(brandDir, 'metrics', '.sync-values.json');

try {
  // Clear and write summary
  try { execSync(`gog sheets clear "${spreadsheetId}" "Sheet1!A:Z"`, { timeout: 10000, stdio: 'pipe' }); } catch {}
  writeFileSync(tmpFile, JSON.stringify(summaryRows));
  execSync(`gog sheets update "${spreadsheetId}" "Sheet1!A1" --values-json '${readFileSync(tmpFile, 'utf-8')}'`, {
    timeout: 15000,
    stdio: 'pipe',
  });
  console.log(`   ✅ Summary sheet: ${summaryRows.length - 1} rows written`);

  // Write per-source details
  for (const [source, rows] of Object.entries(sourceRows)) {
    if (rows.length === 0) continue;
    const sheetRows = [['Date', 'Metric', 'Value', 'Dimensions'], ...rows];
    writeFileSync(tmpFile, JSON.stringify(sheetRows));

    // Try to write to source-named sheet; if it doesn't exist, append to Sheet1
    const sheetName = source.charAt(0).toUpperCase() + source.slice(1);
    try {
      try { execSync(`gog sheets clear "${spreadsheetId}" "${sheetName}!A:Z"`, { timeout: 10000, stdio: 'pipe' }); } catch {}
      execSync(`gog sheets update "${spreadsheetId}" "${sheetName}!A1" --values-json '${readFileSync(tmpFile, 'utf-8')}'`, {
        timeout: 15000,
        stdio: 'pipe',
      });
      console.log(`   ✅ ${sheetName}: ${rows.length} rows written`);
    } catch {
      // Sheet doesn't exist - skip per-source tabs (user can create them manually)
      console.log(`   ⏭  ${sheetName}: sheet tab doesn't exist, skipped (data in Summary)`);
    }
  }
} finally {
  try { unlinkSync(tmpFile); } catch {}
}

console.log(`\n🏁 Sync complete for ${slug}`);
