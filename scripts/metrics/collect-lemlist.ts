#!/usr/bin/env tsx
/**
 * Collect Lemlist campaign performance into metric_snapshots.
 *
 * Usage:
 *   MC_WORKSPACE=workspace-sancho DATABASE_URL=... npm run collect:lemlist -- --slug growth4u
 *   npm run collect:lemlist -- --slug growth4u --date 2026-06-27 --no-ingest
 *   npm run collect:lemlist -- --slug growth4u --no-recompute-kpis
 */
import fs from "fs";
import path from "path";
import { hasDatabase } from "@/db/drizzle";
import { BASE, brandDir } from "@/lib/data/paths";
import {
  formatMetricKpiAutoRecomputeSummary,
  recomputeMetricKpisAfterIngest,
} from "@/lib/data/metric-kpi-autorecompute";
import { ensureMetricsStorage, ingestSourceMetrics } from "@/lib/data/metrics-snapshots";
import { collectLemlistMetrics } from "@/lib/metrics/connectors/lemlist";

interface IntegrationEntry {
  config?: Record<string, unknown>;
}

interface IntegrationState {
  dataSources?: Record<string, IntegrationEntry>;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function positionalSlug(): string | undefined {
  const valueFlags = new Set(["--slug", "--date", "--campaign-ids"]);
  for (let i = 2; i < process.argv.length; i += 1) {
    const item = process.argv[i];
    if (valueFlags.has(item)) {
      i += 1;
      continue;
    }
    if (!item.startsWith("--")) return item;
  }
  return undefined;
}

function loadEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const vars: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function readIntegrations(slug: string): IntegrationState {
  const file = path.join(brandDir(slug), "integrations.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as IntegrationState;
}

function csv(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(csv);
  if (typeof value !== "string") return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const slug = arg("--slug") || positionalSlug();
  if (!slug) {
    console.error("collect-lemlist: provide --slug <client-slug>");
    process.exit(2);
  }

  const brandPath = brandDir(slug);
  const env = { ...process.env, ...loadEnvFile(path.join(brandPath, ".env")) } as Record<string, string | undefined>;
  const slugEnv = slug.toUpperCase().replace(/-/g, "_");
  const apiKey = env[`${slugEnv}_LEMLIST_API_KEY`] || env.LEMLIST_API_KEY;
  if (!apiKey) {
    console.error(`collect-lemlist: missing ${slugEnv}_LEMLIST_API_KEY in ${path.join(brandPath, ".env")} or process env`);
    process.exit(2);
  }

  const integrations = readIntegrations(slug);
  const configuredCampaignIds = csv(integrations.dataSources?.lemlist?.config?.CAMPAIGN_IDS);
  const cliCampaignIds = csv(arg("--campaign-ids"));
  const collection = await collectLemlistMetrics({
    apiKey,
    date: arg("--date"),
    campaignIds: cliCampaignIds.length ? cliCampaignIds : configuredCampaignIds,
  });

  const noIngest = hasFlag("--no-ingest") || hasFlag("--dry");
  if (hasFlag("--json")) {
    console.log(JSON.stringify(collection, null, 2));
  } else {
    console.log(
      `lemlist ${slug} ${collection.date}: ${collection.metrics.length} metric row(s), ` +
      `${collection.campaignCount} campaign(s), ${collection.errors.length} batch error(s)`,
    );
    if (collection.errors.length) console.warn(`Lemlist batch errors: ${JSON.stringify(collection.errors.slice(0, 3))}`);
  }

  if (noIngest) return;
  if (!hasDatabase) {
    console.error(`DATABASE_URL is not set; collected from Lemlist but did not persist. MC_WORKSPACE=${BASE}`);
    process.exit(1);
  }

  await ensureMetricsStorage();
  const result = await ingestSourceMetrics(slug, "lemlist", collection.metrics, collection.date, {
    collectedAt: collection.collectedAt,
    deleteStale: collection.errors.length === 0,
  });
  console.log(`ingested lemlist: ${result.rows} row(s), ${result.deleted ?? 0} stale removed`);
  const recompute = await recomputeMetricKpisAfterIngest({
    slug,
    date: collection.date,
    ingest: result,
    metricDates: [collection.date],
    enabled: !hasFlag("--no-recompute-kpis"),
    trigger: "lemlist:auto",
  });
  console.log(formatMetricKpiAutoRecomputeSummary(recompute));
}

main().catch((err) => {
  console.error(`collect-lemlist failed: ${(err as Error).message}`);
  process.exit(1);
});
