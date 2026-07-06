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

const SA_PATH = resolveGoogleServiceAccountPath(import.meta.url);

/**
 * @param {object} config - { spreadsheetId, range }
 * @param {object} env
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const { spreadsheetId, range } = config;
  if (!spreadsheetId) {
    throw new Error('Sheets: missing spreadsheetId in integrations.json');
  }

  const sheetRange = range || 'Sheet1!A:Z';

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
  if (rows.length < 2) {
    return { source: 'sheets', date: dateRange.from, metrics: [] };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const dateCol = headers.indexOf('date');
  const metrics = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowDate = dateCol >= 0 ? row[dateCol] : null;

    // Filter by date range if date column exists
    if (rowDate) {
      if (rowDate < dateRange.from || rowDate > dateRange.to) continue;
    }

    for (let j = 0; j < headers.length; j++) {
      if (j === dateCol) continue; // Skip date column itself
      const name = headers[j];
      const rawVal = row[j];
      if (rawVal === undefined || rawVal === '') continue;

      const numVal = parseFloat(rawVal.replace?.(/[,%$€]/g, '') || rawVal);
      metrics.push({
        name,
        value: isNaN(numVal) ? rawVal : numVal,
        date: rowDate || dateRange.from,
        dimensions: { source: 'manual' },
      });
    }
  }

  return { source: 'sheets', date: dateRange.from, metrics };
}
