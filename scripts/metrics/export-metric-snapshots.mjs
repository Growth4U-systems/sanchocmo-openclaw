#!/usr/bin/env node
/**
 * Export `metric_snapshots` to CSV or Parquet for ad-hoc analysis (SAN-300).
 *
 * Uses a READ-ONLY connection: METRICS_RO_URL is preferred; it falls back to
 * DATABASE_URL with a warning. See scripts/metrics/README.md for the DuckDB
 * attach pattern that lets you "mix new tables" without touching production.
 *
 *   METRICS_RO_URL=... npm run export:metrics -- \
 *     --slug growth4u --from 2026-01-01 --to 2026-06-30 --format csv --out out.csv
 *   --slug all  → every client.
 */
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  const val = i !== -1 ? args[i + 1] : undefined;
  // Don't swallow the next flag as this one's value (e.g. `--to --format csv`).
  return val && !val.startsWith("--") ? val : def;
};

const slug = getArg("slug", "all");
const from = getArg("from");
const to = getArg("to");
const format = (getArg("format", "csv") || "csv").toLowerCase();
const out = getArg("out", `metric_snapshots.${format === "parquet" ? "parquet" : "csv"}`);

const url = process.env.METRICS_RO_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set METRICS_RO_URL (preferred, read-only) or DATABASE_URL.");
  process.exit(1);
}
if (!process.env.METRICS_RO_URL) {
  console.warn("⚠ Using DATABASE_URL (read-write). Prefer a read-only METRICS_RO_URL for analysis.");
}

const COLS = ["id", "slug", "metric_date", "source", "metric_name", "value", "value_text", "dims_key", "grain", "collected_at"];

if (format === "parquet") {
  exportParquet();
} else {
  await exportCsv();
}

async function exportCsv() {
  const where = [];
  const params = [];
  if (slug && slug !== "all") { params.push(slug); where.push(`slug = $${params.length}`); }
  if (from) { params.push(from); where.push(`metric_date >= $${params.length}`); }
  if (to) { params.push(to); where.push(`metric_date <= $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = neon(url);
  const rows = await sql.query(
    `SELECT ${COLS.join(", ")} FROM metric_snapshots ${whereSql} ORDER BY slug, metric_date, source, metric_name`,
    params,
  );
  const lines = [COLS.join(",")];
  for (const row of rows) lines.push(COLS.map((c) => csvCell(row[c])).join(","));
  await fs.writeFile(out, `${lines.join("\n")}\n`, "utf8");
  console.log(`✅ ${rows.length} rows → ${out} (csv)`);
}

function csvCell(value) {
  if (value == null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportParquet() {
  // DuckDB attaches Neon READ-ONLY and COPYs straight to Parquet — zero npm deps,
  // and the heavy scan stays on the analyst's machine.
  const esc = (v) => v.replace(/'/g, "''");
  const filters = [
    slug && slug !== "all" ? `slug = '${esc(slug)}'` : null,
    from ? `metric_date >= '${esc(from)}'` : null,
    to ? `metric_date <= '${esc(to)}'` : null,
  ].filter(Boolean);
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const ddl =
    `INSTALL postgres; LOAD postgres; ` +
    `ATTACH '${esc(url)}' AS neon (TYPE postgres, READ_ONLY); ` +
    `COPY (SELECT ${COLS.join(", ")} FROM neon.metric_snapshots ${whereSql}) TO '${esc(out)}' (FORMAT parquet);`;
  const res = spawnSync("duckdb", ["-c", ddl], { stdio: ["ignore", "inherit", "inherit"] });
  if (res.error) {
    console.error(`⚠ duckdb CLI not found (${res.error.message}). Install DuckDB (https://duckdb.org) or use --format csv.`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status || 1);
  console.log(`✅ → ${out} (parquet, via DuckDB)`);
}
