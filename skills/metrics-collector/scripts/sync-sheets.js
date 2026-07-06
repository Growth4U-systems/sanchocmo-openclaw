#!/usr/bin/env node

/**
 * Legacy placeholder.
 *
 * Metrics runtime is DB-only (`metric_snapshots`). The old sync-sheets script
 * depended on brand/<slug>/metrics/metrics-data.json, which is no longer written
 * by the collector. Export rows from the DB instead:
 *
 *   METRICS_RO_URL=... npm run export:metrics -- --slug <client> --format csv
 */

console.error("sync-sheets.js is disabled: metrics-data.json is no longer a runtime source. Use npm run export:metrics against metric_snapshots.");
process.exit(1);
