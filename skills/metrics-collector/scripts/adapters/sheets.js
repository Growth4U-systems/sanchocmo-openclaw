/**
 * Sheets Adapter — Read manual/custom data from a Google Sheet
 *
 * Uses service account to read a configured spreadsheet.
 * Expected sheet format: Header row with metric names, then data rows.
 * First column should be "date" (YYYY-MM-DD).
 *
 * Config: { spreadsheetId: "1ABC...", range: "ManualData!A:Z" }
 */

import { GoogleAuth } from 'google-auth-library';
import { resolveGoogleServiceAccountPath } from './google-auth-path.js';
import {
  resolveSheetsConfig,
  sheetRestatementEvidence,
  sheetRowsToMetrics,
} from '../adapter-normalizers.js';

const SA_PATH = resolveGoogleServiceAccountPath(import.meta.url);

/**
 * @param {object} config - { spreadsheetId, range }
 * @param {object} env
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const { spreadsheetId, range } = resolveSheetsConfig(config, env);
  if (!spreadsheetId) {
    throw new Error('Sheets: missing spreadsheetId in integrations.json');
  }

  const sheetRange = range;

  const auth = new GoogleAuth({
    keyFile: SA_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const encodedRange = encodeURIComponent(sheetRange);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API ${response.status}: ${text}`);
  }

  const data = await response.json();
  const rows = data.values || [];
  const metrics = sheetRowsToMetrics(rows, dateRange);
  const evidence = sheetRestatementEvidence(rows, dateRange);

  return { source: 'sheets', date: dateRange.from, metrics, ...evidence };
}
