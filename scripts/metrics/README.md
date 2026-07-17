# Metrics scripts

Tooling around the `metric_snapshots` time-series (Métricas v2 · SAN-300). The DB
(Neon/Postgres) is the source of truth; these scripts seed it and let analysts
explore it without touching production.

## KPI compute runner

```bash
DATABASE_URL=... npm run compute:metric-kpis -- --slug growth4u --trigger manual
DATABASE_URL=... npm run compute:metric-kpis -- --all --trigger cron --json
DATABASE_URL=... npm run compute:metric-kpis -- --slug growth4u --dashboard-ranges --force --trigger san-366
```

Flags: `--slug <slug[,slug]>` or `--all`, `--from` / `--to` (YYYY-MM-DD,
defaults to the last 30 UTC days), `--dashboard-ranges` (runs `1d`, `7d`,
`30d`, `90d` ending on the last complete UTC day — yesterday by default),
`--as-of YYYY-MM-DD` (pin the dashboard range end date), `--force`, `--trigger`,
`--json`, `--definition-version`.

The runner writes `metric_kpi_runs` and `metric_kpi_values` through
`computeMetricKpis(slug, range)`. It is safe for cron retries at the basic
level: an existing `ok` run for the same slug/range/definition version is
skipped, and a recent `running` run is treated as in-flight unless `--force` is
passed.

For the Métricas dashboard closeout after an ingest/backfill, prefer the single
dashboard-range command:

```bash
DATABASE_URL=... npm run compute:metric-kpis -- --slug growth4u --dashboard-ranges --force --trigger san-366
```

It writes the exact ranges consumed by `/api/metrics/kpis?range=1d|7d|30d|90d`.

## Demo seed safety

The demo seed scripts (`seed:paid`, `seed:product`, `seed:web-seo`) write
`seed`/`demo` metric rows. They abort when common environment markers or
`DATABASE_URL` look production-like. Only bypass this with
`ALLOW_METRIC_SEED_PRODUCTION=1` for an intentional emergency repair.

## Backfill (one-time / repair)

```bash
DATABASE_URL=... npm run backfill:metrics
```

Re-mirrors every `brand/<slug>/metrics/<date>.json` into `metric_snapshots`.
Idempotent (upserts), and runs with delete-stale **off**, so replaying an old
partial file never removes rows a newer file already corrected.

This command imports legacy JSON for every local tenant; it does **not** call
provider APIs. Do not use it as the post-deploy provider repair unless those
files and their provenance have been audited explicitly.

## Provider API repair after deploy

Run inside the application container after the curated migrations have been
applied. Pin one tenant and exact UTC provider days; never use `--all` with an
explicit historical range. `TO` is the last complete day (normally yesterday),
while GSC must stop at its separately verified D-3 availability day.

```bash
export SLUG=growth4u
export FROM=2026-04-18
export TO=2026-07-16
export GSC_TO=2026-07-14

cd /root/.openclaw/skills/metrics-collector/scripts

for source in ga4 google-ads instantly lemlist sheets yalc; do
  node collect.js --slug "$SLUG" --source "$source" \
    --from "$FROM" --to "$TO" --replace --no-recompute-kpis
done

node collect.js --slug "$SLUG" --source gsc \
  --from "$FROM" --to "$GSC_TO" --replace --no-recompute-kpis

for source in meta-ads ghl posthog; do
  while IFS= read -r day; do
    node collect.js --slug "$SLUG" --source "$source" \
      --from "$day" --to "$day" --replace --no-recompute-kpis
  done < <(node -e '
    for (let day = Date.parse(process.env.FROM + "T00:00:00Z"), end = Date.parse(process.env.TO + "T00:00:00Z"); day <= end; day += 86400000) console.log(new Date(day).toISOString().slice(0, 10));
  ')
done

# One final routine pull supplies current-only snapshots once (GHL totals and
# pipeline, Lemlist active-campaign count, Explee lifetime/current project
# metrics, Metricool followers, PageSpeed) and converges the latest complete
# provider day.
node collect.js --slug "$SLUG" --all --no-recompute-kpis

cd /app/mc-nextjs
npm run compute:metric-kpis -- \
  --slug "$SLUG" --dashboard-ranges --force --trigger post-deploy-backfill
```

Safety notes:

- GA4 accepts at most 92 days per invocation; split longer repairs.
- Meta Ads, GHL and PostHog are intentionally day-by-day.
- Metricool historical repair is blocked: its posts endpoint returns current
  cumulative counters for posts created in the period, not activity in the
  period. It is collected only by the final routine pull until a period timeline
  adapter is validated.
- PageSpeed is point-in-time and is collected only once in that final pull.
- Explee is point-in-time: its API exposes fixed windows rather than exact
  calendar days. Sancho reads `period=all` only in the final routine pull and
  keeps those explicitly named lifetime/current metrics out of historical
  repairs and cross-provider outbound totals.
- A multi-day Sheets repair requires a valid `Date` value on every data row.
- `--no-recompute-kpis` avoids four dashboard recomputations plus one ingest
  window per source/day; the final command recomputes exactly `1d/7d/30d/90d`.

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

- **CSV** uses the Neon HTTP driver (`@neondatabase/serverless`), so the URL
  **must be a Neon endpoint** (the prod DB and its read-only roles are Neon). It
  won't connect to a plain (non-Neon) Postgres replica — use Parquet for that.
- **Parquet** shells out to the DuckDB CLI (read-only attach; works for any
  Postgres URL). If `duckdb` isn't installed it exits with a clear message — use
  `--format csv` instead.
- Prefer `METRICS_RO_URL` (read-only); the script warns if it falls back to the
  read-write `DATABASE_URL`.
```

## Lemlist collector

```bash
MC_WORKSPACE=workspace-sancho DATABASE_URL=... npm run collect:lemlist -- --slug growth4u
```

Reads `brand/<slug>/.env` for `<SLUG>_LEMLIST_API_KEY`, pulls every non-draft
campaign from Lemlist (including archived campaigns that can own real activity),
calls the batch campaign-stats endpoint for the last complete UTC day, and writes
source `lemlist` rows into `metric_snapshots`. Current active-campaign stock is
emitted only by a routine unfiltered run, never by an explicit historical date.

Useful flags:

```bash
npm run collect:lemlist -- --slug growth4u --date 2026-06-27 --no-ingest --json
npm run collect:lemlist -- --slug growth4u --campaign-ids cam_123,cam_456
```
