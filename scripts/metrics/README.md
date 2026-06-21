# Metrics scripts

Tooling around the `metric_snapshots` time-series (Métricas v2 · SAN-300). The DB
(Neon/Postgres) is the source of truth; these scripts seed it and let analysts
explore it without touching production.

## Backfill (one-time / repair)

```bash
DATABASE_URL=... npm run backfill:metrics
```

Re-mirrors every `brand/<slug>/metrics/<date>.json` into `metric_snapshots`.
Idempotent (upserts), and runs with delete-stale **off**, so replaying an old
partial file never removes rows a newer file already corrected.

## Ad-hoc analysis with DuckDB (read-only attach)

For heavy exploration or to "mix new tables" without loading production, attach
Neon **read-only** from DuckDB and pull once into a local table:

```sql
INSTALL postgres; LOAD postgres;
-- READ_ONLY + a SELECT-only role are the safety rails; Neon never sees a write.
ATTACH 'postgresql://analyst_ro:***@<host>/<db>?sslmode=require'
  AS neon (TYPE postgres, READ_ONLY);

-- Pull once so iterative queries hit DuckDB, not Neon:
CREATE TABLE ms AS SELECT * FROM neon.metric_snapshots;

-- …mix freely: weekly rollup, join to a local CSV of targets, pivot, window…
SELECT source, metric_name, date_trunc('week', metric_date::date) AS wk, sum(value)
FROM ms WHERE slug = 'growth4u' AND dims_key = ''
GROUP BY 1, 2, 3 ORDER BY 3;

-- Freeze an extract:
COPY ms TO 'metric_snapshots.parquet' (FORMAT parquet);
```

Provision the read-only role once and distribute its connection string
out-of-band (1Password) as `METRICS_RO_URL` — **never commit it**:

```sql
CREATE ROLE analyst_ro LOGIN PASSWORD '…';
GRANT SELECT ON metric_snapshots TO analyst_ro;
```

## Export script

```bash
METRICS_RO_URL=... npm run export:metrics -- --slug growth4u --format csv --out out.csv
```

Flags: `--slug <slug|all>` (default `all`), `--from` / `--to` (YYYY-MM-DD),
`--format csv|parquet`, `--out <path>`.

- **CSV** uses the Neon HTTP driver (works for Neon URLs) — zero extra deps.
- **Parquet** shells out to the DuckDB CLI (read-only attach; works for any
  Postgres URL). If `duckdb` isn't installed it exits with a clear message — use
  `--format csv` instead.
- Prefer `METRICS_RO_URL` (read-only); the script warns if it falls back to the
  read-write `DATABASE_URL`.
```
