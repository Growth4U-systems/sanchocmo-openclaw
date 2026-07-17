# metrics-collector

Unified metrics collector that pulls data from connected APIs for each client and ingests standardized rows into the `metric_snapshots` DB.

## Trigger
Use when: collecting metrics, pulling analytics data, syncing client KPIs, running daily/weekly data pulls, or when user says "collect metrics", "pull data", "sync metrics", "run metrics collector", "update metrics".

Do NOT use for: setting up tracking (use analytics-tracking), designing metrics plans (use acquisition-metrics-plan), or connecting APIs (use connect-api).

## Architecture
```
scripts/
├── collect.js              # Main collector
├── adapters/
│   ├── ga4.js              # Google Analytics 4
│   ├── gsc.js              # Google Search Console
│   ├── metricool.js        # Metricool social analytics
│   ├── meta-ads.js         # Meta Ads (Facebook/Instagram)
│   ├── google-ads.js       # Google Ads
│   ├── ghl.js              # GoHighLevel CRM
│   ├── instantly.js        # Instantly.ai cold email
│   ├── lemlist.js          # Lemlist cold email
│   └── sheets.js           # Manual data from Google Sheets
├── sync-sheets.js          # Legacy JSON-to-Sheets helper (not runtime source)
└── package.json
schemas/
└── metrics-schema.json     # Standard output format
```

## Usage

### Collect all sources for a client
```bash
cd skills/metrics-collector/scripts
node collect.js --slug <client-slug> --all
```

### Collect specific source
```bash
node collect.js --slug <client-slug> --source ga4
node collect.js --slug <client-slug> --source gsc
node collect.js --slug <client-slug> --source metricool
node collect.js --slug <client-slug> --source meta-ads
node collect.js --slug <client-slug> --source google-ads
node collect.js --slug <client-slug> --source ghl
node collect.js --slug <client-slug> --source instantly
node collect.js --slug <client-slug> --source lemlist
node collect.js --slug <client-slug> --source sheets
node collect.js --slug <client-slug> --source posthog
```

### Custom date range
```bash
node collect.js --slug <client-slug> --source ga4 --from 2024-01-01 --to 2024-01-31
node collect.js --slug <client-slug> --source gsc --from 2024-01-01 --to 2024-01-31
```

Meta Ads, PostHog, and GoHighLevel must be collected one day at a time; their
adapters reject multi-day ranges rather than storing a period aggregate under
the first date. Metricool supports routine collection only: explicit historical
repairs fail closed because its posts endpoint exposes current cumulative post
counters, not activity that occurred on the requested day.

Explicit `--from`/`--to` runs are treated as repairs. Provider values that are
only observable now are never copied onto those historical days: GHL all-time
totals/pipeline/conversations and Lemlist's current campaign count are omitted
and must be collected once in a final routine run without a date range. Their
event or daily measurements keep the exact provider day requested. Metricool
historical repairs fail closed because the posts endpoint returns current
cumulative counters for posts created in the requested period, not activity on
that day. PageSpeed is stored on the UTC observation day and therefore needs
only one point-in-time run, not a historical loop. A multi-day Sheets repair
requires a valid `Date` on every data row.

### Replace one explicit source range
```bash
node collect.js --slug <client-slug> --source gsc \
  --from 2024-01-01 --to 2024-03-31 --replace --no-recompute-kpis
```

`--replace` is deliberately restricted to one `--source` and a complete
explicit range. It removes stale rows only for that source and the dates emitted
by the new payload, making it suitable for a controlled GSC repair without
touching other providers.

Use `--no-recompute-kpis` on every step of a multi-provider repair, then run one
final `compute:metric-kpis -- --slug <slug> --dashboard-ranges --force ...` after
all sources have landed. Without it, each source/day invocation recomputes four
dashboard ranges plus the ingest window.

### Due-only scheduled collection
```bash
node collect.js --slug <client-slug> --all --due
```

## Prerequisites

### Per client
- `brand/{slug}/integrations.json` — declares which sources are connected + config
- `brand/{slug}/.env` — environment variables with API keys/tokens

### System
- `.secrets/google-service-account.json` — Google service account for GA4/GSC
- `npm install` in `scripts/` directory

## Output
- Runtime source of truth: `metric_snapshots` DB table
- Persistence (SAN-318): the collector pipes its in-memory daily snapshot to `scripts/ingest-metrics.ts` (run via `tsx` from `MC_NEXTJS_DIR`), which writes to Neon through the app's `ingestDailySnapshot()` (`getDb()`, in-process — no HTTP, no admin token). Needs `DATABASE_URL` in the env.
- Historical JSON files can be backfilled with `npm run backfill:metrics`, but the collector no longer writes `brand/{slug}/metrics/YYYY-MM-DD.json` or `metrics-data.json`.
- Row format: see `schemas/metrics-schema.json` for adapter payloads before ingest.

## Auth Reference
| Source | Auth Method | Config Key |
|--------|-------------|------------|
| GA4 | Service account | `ga4.propertyId` in integrations.json |
| GSC | Service account | `gsc.siteUrl` in integrations.json |
| Metricool | X-Mc-Auth header | `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID` in .env |
| Meta Ads | Bearer token | `{SLUG}_META_ADS_ACCESS_TOKEN` in .env, `meta-ads.accountId` in integrations.json or `{SLUG}_META_ADS_ACCOUNT_ID` env override |
| Google Ads | OAuth refresh token + developer token | `{SLUG}_GOOGLE_ADS_REFRESH_TOKEN`, `{SLUG}_GOOGLE_ADS_CLIENT_ID`, `{SLUG}_GOOGLE_ADS_CLIENT_SECRET`, `{SLUG}_GOOGLE_ADS_DEVELOPER_TOKEN` in .env, `google-ads.customerId` in integrations.json or `{SLUG}_GOOGLE_ADS_CUSTOMER_ID` env override |
| GHL | Bearer token | `{SLUG}_GHL_API_KEY` in .env, `ghl.locationId` in integrations.json or `{SLUG}_GHL_LOCATION_ID` env override; `ghl.timezone` IANA (auto-read from location when token scope allows) |
| Instantly | API key | `{SLUG}_INSTANTLY_API_KEY` in .env |
| Lemlist | API key (Basic auth) | `{SLUG}_LEMLIST_API_KEY` in .env |
| Sheets | Service account | `sheets.spreadsheetId`, `sheets.range` in integrations.json |
| PostHog | Personal API key (Bearer) | `{SLUG}_POSTHOG_API_KEY` in .env, `posthog.projectId` (+ optional `posthog.host`, `posthog.activationEvent`, `posthog.funnelSteps`) in integrations.json |

## integrations.json Example
```json
{
  "ga4": { "enabled": true, "propertyId": "123456789" },
  "gsc": { "enabled": true, "siteUrl": "https://example.com" },
  "metricool": { "enabled": true },
  "meta-ads": { "enabled": true, "accountId": "act_123456" },
  "google-ads": { "enabled": true, "customerId": "1234567890", "loginCustomerId": "9876543210" },
  "ghl": { "enabled": true, "locationId": "loc_abc123", "timezone": "Europe/Madrid" },
  "instantly": { "enabled": true },
  "sheets": { "enabled": true, "spreadsheetId": "1ABC...", "range": "ManualData!A:Z" },
  "posthog": { "enabled": true, "projectId": "12345", "host": "https://us.posthog.com", "activationEvent": "user signed up", "funnelSteps": ["$pageview", "signed up", "activated"] }
}
```
