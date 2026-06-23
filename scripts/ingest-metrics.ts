#!/usr/bin/env tsx
/**
 * Persist ONE collector daily snapshot into Neon by reusing the app's
 * `ingestDailySnapshot` — the SAME write path /api/metrics/ingest uses, but
 * in-process via getDb(). No HTTP, no admin token. Needs DATABASE_URL.
 *
 * The collector (a separate ESM script in a different deploy dir) can't import
 * the app's TS modules, so it pipes the snapshot JSON to this script's stdin:
 *   { slug, date?, collectedAt?, sources, deleteStale? }
 * (same shape /api/metrics/ingest accepts). `--file <path>` reads a file instead
 * — handy for manual re-ingest. Refs SAN-318.
 */
import fs from "fs";
import { hasDatabase } from "@/db/drizzle";
import { ensureMetricsStorage, ingestDailySnapshot, type DailySnapshotInput } from "@/lib/data/metrics-snapshots";

interface SnapshotPayload {
  slug: string;
  date?: string;
  collectedAt?: string | null;
  sources: DailySnapshotInput["sources"];
  deleteStale?: boolean;
}

/** Core (testable): delegate an already-parsed daily snapshot to ingestDailySnapshot.
 *  The optional `ingest` param is dependency injection for tests. */
export async function ingestSnapshot(args: {
  slug: string;
  date: string;
  daily: DailySnapshotInput;
  deleteStale: boolean;
  ingest?: typeof ingestDailySnapshot;
}): Promise<{ rows: number; deleted: number; configured: boolean }> {
  const ingest = args.ingest ?? ingestDailySnapshot;
  const result = await ingest(args.slug, args.date, args.daily, { deleteStale: args.deleteStale });
  return { rows: result.rows, deleted: result.deleted ?? 0, configured: result.storage.configured };
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const fileArg = arg("--file");
  const raw = fileArg ? fs.readFileSync(fileArg, "utf8") : await readStdin();
  if (!raw.trim()) {
    console.error("ingest-metrics: no snapshot on stdin (or --file)");
    process.exit(2);
  }
  const payload = JSON.parse(raw) as SnapshotPayload;
  if (!payload.slug || !payload.sources || typeof payload.sources !== "object") {
    console.error('ingest-metrics: payload needs { slug, sources }');
    process.exit(2);
  }
  const date = payload.date ?? new Date().toISOString().slice(0, 10);

  if (!hasDatabase) {
    console.warn("⚠ DATABASE_URL not set — snapshot NOT persisted to Neon");
    process.exit(1);
  }
  await ensureMetricsStorage();
  const daily: DailySnapshotInput = { slug: payload.slug, collectedAt: payload.collectedAt ?? null, sources: payload.sources };
  const r = await ingestSnapshot({ slug: payload.slug, date, daily, deleteStale: payload.deleteStale === true });
  console.log(`🗃  Neon: ${r.rows} row(s) written, ${r.deleted} stale removed (${payload.slug} ${date})`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`✗ ingest failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
