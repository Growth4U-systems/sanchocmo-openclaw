import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isIsoCalendarDate,
  parseSheetNumber,
  resolveSheetsConfig,
  sheetRestatementEvidence,
  sheetRowsToMetrics,
} from '../../adapter-normalizers.js';

test('Sheets accepts the API catalog and environment aliases used by connection setup', () => {
  assert.deepEqual(resolveSheetsConfig({ SPREADSHEET_ID: 'sheet-1', RANGE: 'Data!A:F' }), {
    spreadsheetId: 'sheet-1',
    range: 'Data!A:F',
  });
  assert.deepEqual(resolveSheetsConfig({}, { SHEETS_SPREADSHEET_ID: 'sheet-2' }), {
    spreadsheetId: 'sheet-2',
    range: 'Sheet1!A:Z',
  });
});

test('Sheets parses Spanish and exported numeric formats without changing magnitude', () => {
  assert.equal(parseSheetNumber('1.234,56 €'), 1234.56);
  assert.equal(parseSheetNumber('$1,234.56'), 1234.56);
  assert.equal(parseSheetNumber('1 234,5'), 1234.5);
  assert.equal(parseSheetNumber('1,250'), 1250);
  assert.equal(parseSheetNumber('0,125'), 0.125);
  assert.equal(parseSheetNumber('(2.500,00 €)'), -2500);
  assert.equal(parseSheetNumber('verified'), null);
});

test('Sheets rejects impossible calendar dates', () => {
  assert.equal(isIsoCalendarDate('2024-02-29'), true);
  assert.equal(isIsoCalendarDate('2026-02-29'), false);
  assert.equal(isIsoCalendarDate('2026-13-01'), false);
});

test('Sheets metrics keep manual origin as metadata without a rollup dimension', () => {
  const metrics = sheetRowsToMetrics([
    ['Date', 'Pipeline Value', 'Notes'],
    ['2026-07-13', '€1,250', 'verified'],
    ['2026-07-14', '900', 'outside'],
  ], { from: '2026-07-13', to: '2026-07-13' });

  assert.deepEqual(metrics, [
    { name: 'pipeline value', value: 1250, date: '2026-07-13', provenance: 'manual' },
    { name: 'notes', value: 'verified', date: '2026-07-13', provenance: 'manual' },
  ]);
  assert.ok(metrics.every((metric) => metric.dimensions === undefined));
});

test('Sheets fails closed when a populated row has a malformed or impossible date', () => {
  for (const invalidDate of ['2026-02-31', 'not-a-date']) {
    assert.throws(
      () => sheetRowsToMetrics([
        ['Date', 'Revenue'],
        [invalidDate, '1000'],
        ['2026-02-28', '3000'],
      ], { from: '2026-02-01', to: '2026-02-28' }),
      /invalid Date value on data row 2/,
    );
  }
});

test('Sheets emits exact header scopes so a blanked cell or removed row can converge', () => {
  const range = { from: '2026-02-27', to: '2026-02-28' };
  const evidence = sheetRestatementEvidence([
    ['Date', 'Revenue'],
  ], range);
  assert.deepEqual(evidence, {
    attemptedDates: ['2026-02-27', '2026-02-28'],
    restatedScopes: [
      { metricDate: '2026-02-27', metricName: 'revenue' },
      { metricDate: '2026-02-28', metricName: 'revenue' },
    ],
  });

  const previouslyEmitted = sheetRowsToMetrics([
    ['Date', 'Revenue'],
    ['2026-02-28', '3000'],
  ], { from: '2026-02-28', to: '2026-02-28' });
  const afterBlankingCell = sheetRowsToMetrics([
    ['Date', 'Revenue'],
    ['2026-02-28', ''],
  ], { from: '2026-02-28', to: '2026-02-28' });
  const afterRemovingRow = sheetRowsToMetrics([
    ['Date', 'Revenue'],
  ], { from: '2026-02-28', to: '2026-02-28' });

  assert.equal(previouslyEmitted[0]?.value, 3000);
  assert.deepEqual(afterBlankingCell, []);
  assert.deepEqual(afterRemovingRow, []);
  assert.deepEqual(
    sheetRestatementEvidence([['Date', 'Revenue']], {
      from: '2026-02-28',
      to: '2026-02-28',
    }).restatedScopes,
    [{ metricDate: '2026-02-28', metricName: 'revenue' }],
  );
});

test('Sheets refuses missing or ambiguous headers before authorizing restatement', () => {
  const range = { from: '2026-02-28', to: '2026-02-28' };
  for (const rows of [
    [],
    [['']],
    [['Revenue']],
    [['Date']],
    [['Date', 'Revenue', 'Revenue']],
  ]) {
    assert.throws(() => sheetRestatementEvidence(rows, range), /Sheets:.*header/i);
  }
});

test('Sheets bounds attempted provider dates to 366 days', () => {
  assert.throws(
    () => sheetRestatementEvidence([['Date', 'Revenue']], {
      from: '2025-01-01',
      to: '2026-01-02',
    }),
    /cannot exceed 366 days/,
  );
});

test('Sheets refuses to attribute an undated row to the first day of a multi-day repair', () => {
  assert.throws(
    () => sheetRowsToMetrics([
      ['Date', 'Revenue'],
      ['', '3000'],
    ], { from: '2026-02-01', to: '2026-02-28' }),
    /multi-day collection requires a valid Date value/,
  );

  assert.deepEqual(
    sheetRowsToMetrics([
      ['Date', 'Revenue'],
      ['', '3000'],
    ], { from: '2026-02-28', to: '2026-02-28' }),
    [{ name: 'revenue', value: 3000, date: '2026-02-28', provenance: 'manual' }],
  );
});

test('Sheets rejects two populated values for the same metric and day', () => {
  assert.throws(
    () => sheetRowsToMetrics([
      ['Date', 'Revenue', 'Leads'],
      ['2026-02-28', '1000', ''],
      ['2026-02-28', '2000', '4'],
    ], { from: '2026-02-28', to: '2026-02-28' }),
    /duplicate value for revenue on 2026-02-28/,
  );

  assert.deepEqual(
    sheetRowsToMetrics([
      ['Date', 'Revenue', 'Leads'],
      ['2026-02-28', '1000', ''],
      ['2026-02-28', '', '4'],
    ], { from: '2026-02-28', to: '2026-02-28' }),
    [
      { name: 'revenue', value: 1000, date: '2026-02-28', provenance: 'manual' },
      { name: 'leads', value: 4, date: '2026-02-28', provenance: 'manual' },
    ],
  );
});
