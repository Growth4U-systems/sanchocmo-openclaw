/**
 * Parse a human-entered number without assuming that `,` is always a thousands
 * separator. Spanish sheets commonly contain `1.234,56`, while API/exported
 * sheets often contain `1,234.56`; both must resolve to the same value.
 *
 * A single separator followed by exactly three digits is treated as grouping
 * (except for a leading zero), which preserves the long-standing `1,250`
 * interpretation while still accepting decimal values such as `12,5`.
 */
export function parseSheetNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  let normalized = value.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!normalized) return null;

  const parenthesized = /^\(.*\)$/.test(normalized);
  if (parenthesized) normalized = normalized.slice(1, -1);
  normalized = normalized.replace(/[%$€£¥]/g, '');

  if (!/^[+-]?[\d.,]+$/.test(normalized) || !/\d/.test(normalized)) return null;

  const sign = parenthesized ? -1 : 1;
  const explicitSign = normalized.startsWith('-') ? -1 : 1;
  normalized = normalized.replace(/^[+-]/, '');

  const commaPositions = [...normalized.matchAll(/,/g)].map((match) => match.index);
  const dotPositions = [...normalized.matchAll(/\./g)].map((match) => match.index);
  const allPositions = [...commaPositions, ...dotPositions].sort((a, b) => a - b);

  if (commaPositions.length && dotPositions.length) {
    const decimalAt = allPositions.at(-1);
    normalized = [...normalized]
      .map((character, index) => character === ',' || character === '.'
        ? (index === decimalAt ? '.' : '')
        : character)
      .join('');
  } else if (allPositions.length) {
    const separator = commaPositions.length ? ',' : '.';
    const groups = normalized.split(separator);
    const grouped = groups.length > 2
      ? groups.slice(1).every((group) => group.length === 3)
      : groups[1]?.length === 3 && groups[0] !== '0';
    normalized = grouped
      ? groups.join('')
      : `${groups.slice(0, -1).join('')}.${groups.at(-1)}`;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed * sign * explicitSign : null;
}

export function isIsoCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

const MAX_SHEET_PROVIDER_DAYS = 366;

function sheetDatesInRange(dateRange) {
  if (
    !isIsoCalendarDate(dateRange?.from) ||
    !isIsoCalendarDate(dateRange?.to) ||
    dateRange.from > dateRange.to
  ) {
    throw new Error(`Sheets: invalid date range ${dateRange?.from || '?'}..${dateRange?.to || '?'}`);
  }
  const start = Date.parse(`${dateRange.from}T00:00:00.000Z`);
  const end = Date.parse(`${dateRange.to}T00:00:00.000Z`);
  const dates = [];
  for (let cursor = start; cursor <= end; cursor += 86_400_000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    if (dates.length > MAX_SHEET_PROVIDER_DAYS) {
      throw new Error(`Sheets: date range cannot exceed ${MAX_SHEET_PROVIDER_DAYS} days`);
    }
  }
  return dates;
}

function normalizedSheetHeaders(rows) {
  if (!Array.isArray(rows) || !Array.isArray(rows[0]) || rows[0].length === 0) {
    throw new Error('Sheets: response is missing a header row');
  }
  const headers = rows[0].map((header) => String(header ?? '').trim().toLowerCase());
  if (headers.some((header) => !header)) {
    throw new Error('Sheets: header names must be non-empty');
  }
  if (headers.filter((header) => header === 'date').length !== 1) {
    throw new Error('Sheets: header row must contain exactly one Date column');
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('Sheets: header names must be unique');
  }
  if (headers.length === 1) {
    throw new Error('Sheets: header row must contain at least one metric column');
  }
  return headers;
}

export function sheetRestatementEvidence(rows, dateRange) {
  const headers = normalizedSheetHeaders(rows);
  const attemptedDates = sheetDatesInRange(dateRange);
  const metricNames = headers.filter((header) => header !== 'date');
  return {
    attemptedDates,
    restatedScopes: attemptedDates.flatMap((metricDate) =>
      metricNames.map((metricName) => ({ metricDate, metricName }))),
  };
}

/** Convert the configured tabular Sheet format into collector metrics. */
export function sheetRowsToMetrics(rows, dateRange) {
  sheetDatesInRange(dateRange);
  const headers = normalizedSheetHeaders(rows);
  const dateCol = headers.indexOf('date');
  const metrics = [];
  const observedCells = new Set();

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (!Array.isArray(row)) {
      throw new Error(`Sheets: data row ${index + 1} must be an array`);
    }
    if (row.every((value) => value == null || String(value).trim() === '')) continue;
    const rawRowDate = dateCol >= 0 ? row[dateCol] : null;
    const rowDate = rawRowDate == null || rawRowDate === '' ? null : String(rawRowDate).trim();

    // A present-but-invalid date is data corruption, not an out-of-range row.
    // Failing the source keeps the last verified snapshot visible as stale/error
    // instead of silently accepting a payload that can leave manual-row ghosts.
    if (rowDate && !isIsoCalendarDate(rowDate)) {
      throw new Error(`Sheets: invalid Date value on data row ${index + 1}: ${rowDate}`);
    }

    if (!rowDate && dateRange.from !== dateRange.to) {
      throw new Error(
        'Sheets: a multi-day collection requires a valid Date value on every data row',
      );
    }

    if (rowDate && (rowDate < dateRange.from || rowDate > dateRange.to)) continue;

    for (let column = 0; column < headers.length; column++) {
      if (column === dateCol) continue;
      const name = headers[column];
      const rawValue = row[column];
      if (rawValue === undefined || rawValue === '') continue;

      const metricDate = rowDate || dateRange.from;
      const cellKey = `${metricDate}\u0000${name}`;
      if (observedCells.has(cellKey)) {
        throw new Error(
          `Sheets: duplicate value for ${name} on ${metricDate}; use one populated cell per metric and day`,
        );
      }
      observedCells.add(cellKey);

      const numericValue = parseSheetNumber(rawValue);
      metrics.push({
        name,
        value: numericValue == null ? rawValue : numericValue,
        date: metricDate,
        // The ingest layer stores this as __provenance metadata, which keeps
        // dims_key empty so manual headline metrics participate in rollups.
        provenance: 'manual',
      });
    }
  }

  return metrics;
}
export function resolveSheetsConfig(config = {}, env = {}) {
  return {
    spreadsheetId:
      config.spreadsheetId ||
      config.SPREADSHEET_ID ||
      config.spreadsheet_id ||
      env.SHEETS_SPREADSHEET_ID ||
      env.SPREADSHEET_ID ||
      '',
    range:
      config.range ||
      config.RANGE ||
      config.sheetRange ||
      env.SHEETS_RANGE ||
      'Sheet1!A:Z',
  };
}
