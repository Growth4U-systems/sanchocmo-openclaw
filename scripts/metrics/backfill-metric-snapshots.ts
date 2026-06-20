#!/usr/bin/env tsx
/**
 * Backfill `metric_snapshots` from existing brand/<slug>/metrics/<date>.json
 * files. Idempotent (upserts) — safe to re-run as a repair. (SAN-263 · PR-1.)
 *
 *   DATABASE_URL=... npm run backfill:metrics
 */
import fs from "fs";
import path from "path";
import { hasDatabase } from "@/db/drizzle";
import { BASE } from "@/lib/data/paths";
import { ensureMetricsStorage, ingestDailySnapshot, type DailySnapshotInput } from "@/lib/data/metrics-snapshots";

const DATE_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

async function main() {
  if (!hasDatabase) {
    console.error("DATABASE_URL is not set — nothing to backfill.");
    process.exit(1);
  }
  await ensureMetricsStorage();

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
    for (const file of files) {
      const dateKey = file.replace(".json", "");
      let daily: DailySnapshotInput;
      try {
        daily = JSON.parse(fs.readFileSync(path.join(metricsDir, file), "utf8")) as DailySnapshotInput;
      } catch {
        console.warn(`  ! ${slug}/${file}: invalid JSON, skipped`);
        continue;
      }
      const result = await ingestDailySnapshot(slug, dateKey, daily);
      slugRows += result.rows;
      totalFiles += 1;
    }

    if (slugRows) {
      clientsWithData += 1;
      console.log(`  ${slug}: ${slugRows} metric rows from ${files.length} daily file(s)`);
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
