#!/usr/bin/env tsx
/**
 * Backfill `metric_snapshots` from existing brand/<slug>/metrics/<date>.json
 * files. Idempotent (upserts) — safe to re-run as a repair. (SAN-263 · PR-1.)
 *
 *   DATABASE_URL=... npm run backfill:metrics
 *   DATABASE_URL=... npm run backfill:metrics -- --seed
 *   DATABASE_URL=... npm run backfill:metrics -- --provenance seed --quality demo
 *   DATABASE_URL=... npm run backfill:metrics -- --no-recompute-kpis
 */
import fs from "fs";
import path from "path";
import { hasDatabase } from "@/db/drizzle";
import { BASE } from "@/lib/data/paths";
import {
  formatMetricKpiAutoRecomputeSummary,
  metricDatesFromSources,
  recomputeMetricKpisAfterIngests,
} from "@/lib/data/metric-kpi-autorecompute";
import { ensureMetricsStorage, ingestDailySnapshot, type DailySnapshotInput } from "@/lib/data/metrics-snapshots";

const DATE_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  if (!hasDatabase) {
    console.error("DATABASE_URL is not set — nothing to backfill.");
    process.exit(1);
  }
  await ensureMetricsStorage();
  const provenanceArg =
    arg("--provenance") ??
    (hasFlag("--seed") ? "seed" : hasFlag("--demo") ? "demo" : undefined);
  const qualityArg =
    arg("--quality") ??
    (provenanceArg === "seed" || provenanceArg === "demo"
      ? "demo"
      : undefined);

  const brandRoot = path.join(BASE, "brand");
  if (!fs.existsSync(brandRoot)) {
    console.error(`No brand directory at ${brandRoot}.`);
    process.exit(1);
  }

  const slugs = fs
    .readdirSync(brandRoot)
    .filter((entry) => !entry.startsWith(".") && fs.statSync(path.join(brandRoot, entry)).isDirectory());

  let totalRows = 0;
  let totalFiles = 0;
  let clientsWithData = 0;

  for (const slug of slugs) {
    const metricsDir = path.join(brandRoot, slug, "metrics");
    if (!fs.existsSync(metricsDir)) continue;
    const files = fs.readdirSync(metricsDir).filter((file) => DATE_FILE_RE.test(file)).sort();
    if (!files.length) continue;

    let slugRows = 0;
    const slugIngests: Array<{
      date: string;
      ingest: Awaited<ReturnType<typeof ingestDailySnapshot>>;
      metricDates: string[];
    }> = [];
    for (const file of files) {
      const dateKey = file.replace(".json", "");
      let daily: DailySnapshotInput;
      try {
        daily = JSON.parse(fs.readFileSync(path.join(metricsDir, file), "utf8")) as DailySnapshotInput;
      } catch {
        console.warn(`  ! ${slug}/${file}: invalid JSON, skipped`);
        continue;
      }
      const dailyWithMetadata =
        provenanceArg || qualityArg
          ? {
              ...daily,
              provenance: provenanceArg ?? daily.provenance,
              quality: qualityArg ?? daily.quality,
            }
          : daily;
      const result = await ingestDailySnapshot(slug, dateKey, dailyWithMetadata);
      slugRows += result.rows;
      slugIngests.push({
        date: dateKey,
        ingest: result,
        metricDates: metricDatesFromSources(dailyWithMetadata.sources, dateKey),
      });
      totalFiles += 1;
    }

    if (slugRows) {
      clientsWithData += 1;
      console.log(`  ${slug}: ${slugRows} metric rows from ${files.length} daily file(s)`);
      const recompute = await recomputeMetricKpisAfterIngests({
        slug,
        ingests: slugIngests,
        enabled: !hasFlag("--no-recompute-kpis"),
        trigger: "backfill-metrics:script",
      });
      console.log(`  ${slug}: ${formatMetricKpiAutoRecomputeSummary(recompute)}`);
    }
    totalRows += slugRows;
  }

  console.log(
    `\n✅ Backfill done: ${totalRows} metric rows from ${totalFiles} files across ${clientsWithData}/${slugs.length} client(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
