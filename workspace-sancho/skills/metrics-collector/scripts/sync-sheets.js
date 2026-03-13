#!/usr/bin/env node

/**
 * sync-sheets.js — Push metrics-data.json to Google Sheets using `gog` CLI
 *
 * Usage: node sync-sheets.js --slug <client>
 *
 * Reads brand/{slug}/metrics/metrics-data.json and writes a summary
 * to the configured Google Sheet.
 */

import { readFileSync, existsSync } from 'fs';
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
const sheetsConfig = integrations['metrics-sync'] || integrations.sheets || {};
const spreadsheetId = sheetsConfig.syncSpreadsheetId || sheetsConfig.spreadsheetId;

if (!spreadsheetId) {
  console.error('No spreadsheetId configured for metrics sync in integrations.json (metrics-sync.syncSpreadsheetId or sheets.spreadsheetId)');
  process.exit(1);
}

// --- Load and flatten metrics data ---
const rollingData = JSON.parse(readFileSync(metricsPath, 'utf-8'));

// Build a flat table: Date | Source | Metric | Value | Dimensions
const rows = [['Date', 'Source', 'Metric', 'Value', 'Dimensions']];

for (const entry of rollingData) {
  const sources = entry.sources || {};
  for (const [sourceName, sourceData] of Object.entries(sources)) {
    if (sourceData.status !== 'ok') continue;
    for (const metric of sourceData.metrics || []) {
      const dims = metric.dimensions ? JSON.stringify(metric.dimensions) : '';
      rows.push([
        metric.date || entry.dateRange?.from || '',
        sourceName,
        metric.name,
        String(metric.value),
        dims,
      ]);
    }
  }
}

// --- Write to Google Sheets via gog CLI ---
const sheetName = sheetsConfig.syncSheetName || 'MetricsData';
const range = `${sheetName}!A1`;

// Create CSV-like input for gog
const csvContent = rows.map((r) => r.join('\t')).join('\n');
const tmpFile = path.join(brandDir, 'metrics', '.sync-tmp.tsv');
const { writeFileSync } = await import('fs');
writeFileSync(tmpFile, csvContent);

try {
  // Clear existing data first
  console.log(`📊 Syncing ${rows.length - 1} rows to Google Sheets...`);
  console.log(`   Sheet: ${spreadsheetId}`);
  console.log(`   Range: ${range}`);

  // Use gog sheets write
  const cmd = `gog sheets write "${spreadsheetId}" "${range}" --tsv "${tmpFile}" --clear`;
  console.log(`   Command: ${cmd}`);

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    console.log(`   ✅ Sync complete: ${output.trim()}`);
  } catch (err) {
    // Fallback: try with googleapis directly
    console.warn(`   ⚠️  gog CLI failed (${err.message}), trying direct API...`);
    await syncViaAPI(spreadsheetId, sheetName, rows);
  }
} finally {
  // Clean up temp file
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(tmpFile);
  } catch {}
}

console.log(`\n🏁 Sync complete for ${slug}`);

// --- Fallback: direct Sheets API ---
async function syncViaAPI(spreadsheetId, sheetName, rows) {
  const { GoogleAuth } = await import('google-auth-library');
  const SA_PATH = path.resolve(__dirname, '..', '..', '..', '.secrets', 'google-service-account.json');

  const auth = new GoogleAuth({
    keyFile: SA_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const range = encodeURIComponent(`${sheetName}!A1`);

  // Clear sheet
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}` },
    }
  );

  // Write data
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API ${response.status}: ${text}`);
  }

  const result = await response.json();
  console.log(`   ✅ Direct API sync: ${result.updatedRows} rows written`);
}
