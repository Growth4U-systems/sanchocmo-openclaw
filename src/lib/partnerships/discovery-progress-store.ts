import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { brandDir } from "@/lib/data/paths";
import {
  assertDiscoverySearchId,
  assertDiscoveryStoreSlug,
} from "./discovery-store";
import type { RawDiscoveryCandidate } from "./discovery-types";

/**
 * Incremental single-host scrape progress for the durable short-step discovery
 * loop (SAN-480 v5). The Ledger checkpoint carries only cursors/counters; the
 * growing pool and enriched candidates live here, next to the final assignment
 * artifact and under the same `local-persistent-single-host` acknowledgement.
 *
 * Writes are union-merges keyed by query/handle, so progress is monotonic by
 * construction: an at-least-once retry of a step can only re-contribute the
 * same entries, never regress or reorder previously persisted ones.
 */
const PROGRESS_SCHEMA_VERSION = 1;
const PROGRESS_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const LOCK_STALE_MS = 2_000;
const MAX_PAGES_PER_QUERY = 8;
const MAX_CURSOR_LENGTH = 512;
const MAX_POOL_ENTRIES = 200;
const MAX_TRACKED_QUERIES = 64;
const MAX_CANDIDATES = 500;

export class DiscoveryProgressStoreError extends Error {
  constructor(
    readonly code: "progress_corrupt" | "progress_lock_timeout",
    message: string,
  ) {
    super(message);
    this.name = "DiscoveryProgressStoreError";
  }
}

export interface DiscoveryScrapeProgressRef {
  slug: string;
  runId: string;
  searchId: string;
}

export interface DiscoveryScrapePoolEntry {
  handle: string;
  seq: number;
  name?: string;
  followers?: number;
}

export interface DiscoveryScrapeProgress {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  /** Query keys whose pagination is exhausted (no more pages will be fetched). */
  searchedQueries: string[];
  /** Pages fetched so far per query key (monotonic; max-wins on merge). */
  queryPages: Record<string, number>;
  /** Next page cursor per query key; null once the provider is exhausted. */
  queryCursors: Record<string, string | null>;
  /** Deduped candidate pool in first-seen order (`seq` ascending). */
  pool: DiscoveryScrapePoolEntry[];
  /** Handles whose enrichment finished (accepted or rejected). */
  attempted: string[];
  /** Accepted raw candidates in acceptance order. */
  candidates: RawDiscoveryCandidate[];
}

interface StoredDiscoveryScrapeProgress {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  runIdHash: string;
  searchId: string;
  updatedAt: string;
  expiresAt: string;
  dataHash: string;
  data: DiscoveryScrapeProgress;
}

export function emptyDiscoveryScrapeProgress(): DiscoveryScrapeProgress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    searchedQueries: [],
    queryPages: {},
    queryCursors: {},
    pool: [],
    attempted: [],
    candidates: [],
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((child) => canonicalJson(child)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function privateRoot(slug: string): string {
  assertDiscoveryStoreSlug(slug);
  return path.resolve(
    brandDir(slug),
    ".private",
    "execution-artifacts",
    "partnerships-discovery-progress",
  );
}

function ensurePrivateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

function ensurePrivateTree(slug: string): void {
  const privateDirectory = path.join(brandDir(slug), ".private");
  const artifactDirectory = path.join(privateDirectory, "execution-artifacts");
  for (const directory of [
    privateDirectory,
    artifactDirectory,
    privateRoot(slug),
  ]) {
    ensurePrivateDirectory(directory);
  }
}

function progressFile(ref: DiscoveryScrapeProgressRef): string {
  assertDiscoveryStoreSlug(ref.slug);
  assertDiscoverySearchId(ref.searchId);
  return path.join(privateRoot(ref.slug), `${sha256(ref.runId)}.json`);
}

function corrupt(message: string): DiscoveryProgressStoreError {
  return new DiscoveryProgressStoreError("progress_corrupt", message);
}

function stringArray(value: unknown, max: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw corrupt(`Scrape progress ${label} list is invalid`);
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !item || item.length > 512) {
      throw corrupt(`Scrape progress ${label} entry is invalid`);
    }
    if (seen.has(item)) throw corrupt(`Scrape progress ${label} has duplicates`);
    seen.add(item);
  }
  return value as string[];
}

function assertProgressData(value: unknown): DiscoveryScrapeProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw corrupt("Scrape progress data is not an object");
  }
  const data = value as Partial<DiscoveryScrapeProgress>;
  if (data.schemaVersion !== PROGRESS_SCHEMA_VERSION) {
    throw corrupt("Scrape progress schema version is unsupported");
  }
  const searchedQueries = stringArray(
    data.searchedQueries,
    MAX_TRACKED_QUERIES,
    "searchedQueries",
  );
  const attempted = stringArray(data.attempted, MAX_POOL_ENTRIES, "attempted");
  const queryPages = data.queryPages;
  if (
    !queryPages ||
    typeof queryPages !== "object" ||
    Array.isArray(queryPages) ||
    Object.keys(queryPages).length > MAX_TRACKED_QUERIES ||
    Object.entries(queryPages).some(
      ([key, pages]) =>
        !key ||
        key.length > 512 ||
        typeof pages !== "number" ||
        !Number.isSafeInteger(pages) ||
        pages < 1 ||
        pages > MAX_PAGES_PER_QUERY,
    )
  ) {
    throw corrupt("Scrape progress queryPages map is invalid");
  }
  const queryCursors = data.queryCursors;
  if (
    !queryCursors ||
    typeof queryCursors !== "object" ||
    Array.isArray(queryCursors) ||
    Object.keys(queryCursors).length > MAX_TRACKED_QUERIES ||
    Object.entries(queryCursors).some(
      ([key, cursor]) =>
        !key ||
        key.length > 512 ||
        !(
          cursor === null ||
          (typeof cursor === "string" &&
            cursor.length > 0 &&
            cursor.length <= MAX_CURSOR_LENGTH)
        ),
    )
  ) {
    throw corrupt("Scrape progress queryCursors map is invalid");
  }
  if (!Array.isArray(data.pool) || data.pool.length > MAX_POOL_ENTRIES) {
    throw corrupt("Scrape progress pool is invalid");
  }
  const seenHandles = new Set<string>();
  data.pool.forEach((entry, index) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.handle !== "string" ||
      !entry.handle.startsWith("@") ||
      entry.handle.length > 120 ||
      typeof entry.seq !== "number" ||
      !Number.isSafeInteger(entry.seq) ||
      entry.seq !== index
    ) {
      throw corrupt("Scrape progress pool entry is invalid");
    }
    const key = entry.handle.toLowerCase();
    if (seenHandles.has(key)) throw corrupt("Scrape progress pool duplicates");
    seenHandles.add(key);
  });
  if (
    !Array.isArray(data.candidates) ||
    data.candidates.length > MAX_CANDIDATES ||
    data.candidates.some(
      (candidate) =>
        !candidate ||
        typeof candidate !== "object" ||
        typeof candidate.handle !== "string" ||
        candidate.network !== "instagram",
    )
  ) {
    throw corrupt("Scrape progress candidates are invalid");
  }
  return data as DiscoveryScrapeProgress;
}

function readStored(
  ref: DiscoveryScrapeProgressRef,
): DiscoveryScrapeProgress | null {
  const file = progressFile(ref);
  if (!fs.existsSync(file)) return null;
  let stored: StoredDiscoveryScrapeProgress;
  try {
    const metadata = fs.lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("not a regular file");
    }
    stored = JSON.parse(
      fs.readFileSync(file, "utf8"),
    ) as StoredDiscoveryScrapeProgress;
  } catch {
    throw corrupt("Scrape progress file is unreadable");
  }
  if (
    stored.schemaVersion !== PROGRESS_SCHEMA_VERSION ||
    stored.runIdHash !== sha256(ref.runId) ||
    stored.searchId !== ref.searchId ||
    typeof stored.dataHash !== "string"
  ) {
    throw corrupt("Scrape progress identity does not match the run");
  }
  const data = assertProgressData(stored.data);
  if (sha256(canonicalJson(data)) !== stored.dataHash) {
    throw corrupt("Scrape progress checksum does not match");
  }
  return data;
}

function withProgressLock<T>(ref: DiscoveryScrapeProgressRef, fn: () => T): T {
  ensurePrivateTree(ref.slug);
  const lockDir = `${progressFile(ref)}.lock`;
  const deadline = Date.now() + LOCK_STALE_MS;
  for (;;) {
    try {
      fs.mkdirSync(lockDir, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let stale = false;
      try {
        stale = Date.now() - fs.statSync(lockDir).mtimeMs > LOCK_STALE_MS;
      } catch {
        continue; // Lock released between mkdir and stat; retry immediately.
      }
      if (stale) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new DiscoveryProgressStoreError(
          "progress_lock_timeout",
          "Scrape progress lock was not released in time",
        );
      }
      // Synchronous short spin: writers hold the lock for one small file write.
      const waitUntil = Date.now() + 25;
      while (Date.now() < waitUntil) {
        // busy-wait; contention is at most two single-host worker processes
      }
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

function writeStored(
  ref: DiscoveryScrapeProgressRef,
  data: DiscoveryScrapeProgress,
  now: Date,
): void {
  const file = progressFile(ref);
  const stored: StoredDiscoveryScrapeProgress = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    runIdHash: sha256(ref.runId),
    searchId: ref.searchId,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PROGRESS_RETENTION_MS).toISOString(),
    dataHash: sha256(canonicalJson(data)),
    data,
  };
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, canonicalJson(stored), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function mergeInto(
  existing: DiscoveryScrapeProgress,
  update: Partial<DiscoveryScrapeProgress>,
): DiscoveryScrapeProgress {
  const searchedQueries = [...existing.searchedQueries];
  for (const query of update.searchedQueries ?? []) {
    if (!searchedQueries.includes(query)) searchedQueries.push(query);
  }
  // Pagination cursors advance monotonically: the writer that has fetched more
  // pages for a query wins that query's cursor; ties keep the existing value.
  const queryPages = { ...existing.queryPages };
  const queryCursors = { ...existing.queryCursors };
  for (const [key, pages] of Object.entries(update.queryPages ?? {})) {
    if ((queryPages[key] ?? 0) < pages) {
      queryPages[key] = pages;
      const cursor = (update.queryCursors ?? {})[key];
      if (cursor !== undefined) queryCursors[key] = cursor;
    }
  }
  const pool = existing.pool.map((entry) => ({ ...entry }));
  const poolKeys = new Set(pool.map((entry) => entry.handle.toLowerCase()));
  for (const entry of update.pool ?? []) {
    const key = entry.handle.toLowerCase();
    if (poolKeys.has(key)) continue;
    if (pool.length >= MAX_POOL_ENTRIES) break;
    poolKeys.add(key);
    pool.push({ ...entry, seq: pool.length });
  }
  const attempted = [...existing.attempted];
  for (const handle of update.attempted ?? []) {
    if (!attempted.includes(handle)) attempted.push(handle);
  }
  const candidates = existing.candidates.map((candidate) => ({ ...candidate }));
  const candidateKeys = new Set(
    candidates.map((candidate) => candidate.handle.toLowerCase()),
  );
  for (const candidate of update.candidates ?? []) {
    const key = candidate.handle.toLowerCase();
    if (candidateKeys.has(key)) continue;
    if (candidates.length >= MAX_CANDIDATES) break;
    candidateKeys.add(key);
    candidates.push(candidate);
  }
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    searchedQueries,
    queryPages,
    queryCursors,
    pool,
    attempted,
    candidates,
  };
}

export function loadDiscoveryScrapeProgress(
  ref: DiscoveryScrapeProgressRef,
): DiscoveryScrapeProgress | null {
  return withProgressLock(ref, () => readStored(ref));
}

/**
 * Union-merges `update` into the persisted progress and returns the merged
 * state. First writer wins per query/handle; later contributions for the same
 * key are ignored, so at-least-once step retries stay idempotent.
 */
export function mergeDiscoveryScrapeProgress(
  ref: DiscoveryScrapeProgressRef,
  update: Partial<DiscoveryScrapeProgress>,
  now: Date = new Date(),
): DiscoveryScrapeProgress {
  return withProgressLock(ref, () => {
    const existing = readStored(ref) ?? emptyDiscoveryScrapeProgress();
    const merged = assertProgressData(mergeInto(existing, update));
    writeStored(ref, merged, now);
    return merged;
  });
}

export function deleteDiscoveryScrapeProgress(
  ref: DiscoveryScrapeProgressRef,
): void {
  fs.rmSync(progressFile(ref), { force: true });
}
