/**
 * Partnerships discovery · store de búsquedas (SAN-79)
 *
 * Cada búsqueda persiste como `brand/{slug}/outreach/searches/{id}.json`
 * (`DiscoverySearchRecord`): plan + campaignId de Yalc + tarea Outreach +
 * estado del runner. La tarea madre referencia este archivo vía
 * `output_files`, así el chat/MCP/UI resuelven el estado por lookup directo.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { brandDir } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";
import { isValidTenantSlug } from "@/lib/thread-id";
import type {
  DiscoveryRunnerState,
  DiscoverySearchRecord,
} from "./discovery-types";

const SEARCH_LOCK_TIMEOUT_MS = 5_000;
const SEARCH_LOCK_STALE_MS = 30_000;
const SEARCH_LOCK_WAIT_MS = 5;
const lockWaitArray = new Int32Array(new SharedArrayBuffer(4));

const DISCOVERY_SEARCH_ID_RE = /^(?:ds|search|b2b)-[a-z0-9][a-z0-9-]{0,79}$/;

export type DiscoveryStoreValidationCode =
  "invalid_slug" | "invalid_search_id" | "unsafe_path" | "identity_mismatch";

/** Stable validation error for HTTP/internal callers that must fail closed. */
export class DiscoveryStoreValidationError extends Error {
  readonly code: DiscoveryStoreValidationCode;

  constructor(code: DiscoveryStoreValidationCode, message: string) {
    super(message);
    this.name = "DiscoveryStoreValidationError";
    this.code = code;
  }
}

export function isValidDiscoverySearchId(value: unknown): value is string {
  return typeof value === "string" && DISCOVERY_SEARCH_ID_RE.test(value);
}

export function assertDiscoveryStoreSlug(
  slug: unknown,
): asserts slug is string {
  if (!isValidTenantSlug(slug)) {
    throw new DiscoveryStoreValidationError(
      "invalid_slug",
      "Invalid Partnerships tenant slug",
    );
  }
}

export function assertDiscoverySearchId(
  searchId: unknown,
): asserts searchId is string {
  if (!isValidDiscoverySearchId(searchId)) {
    throw new DiscoveryStoreValidationError(
      "invalid_search_id",
      "Invalid Partnerships discovery search ID",
    );
  }
}

export function searchesDir(slug: string): string {
  // Validate before even asking the shared paths module to interpolate input.
  assertDiscoveryStoreSlug(slug);
  return path.resolve(brandDir(slug), "outreach", "searches");
}

export function searchFile(slug: string, searchId: string): string {
  assertDiscoverySearchId(searchId);
  const configuredRoot = searchesDir(slug);
  const realRoot = fs.existsSync(configuredRoot)
    ? fs.realpathSync(configuredRoot)
    : configuredRoot;
  const destination = path.resolve(realRoot, `${searchId}.json`);
  if (!destination.startsWith(`${realRoot}${path.sep}`)) {
    throw new DiscoveryStoreValidationError(
      "unsafe_path",
      "Discovery search receipt escapes its tenant storage root",
    );
  }
  return destination;
}

/** Ruta relativa a brand/{slug}/ — para `output_files` de la tarea. */
export function searchRelativePath(searchId: string): string {
  assertDiscoverySearchId(searchId);
  return path.posix.join("outreach", "searches", `${searchId}.json`);
}

export function newSearchId(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `ds-${stamp}-${random}`;
}

function sleepForLock(): void {
  Atomics.wait(lockWaitArray, 0, 0, SEARCH_LOCK_WAIT_MS);
}

function withSearchLock<T>(
  slug: string,
  searchId: string,
  operation: () => T,
): T {
  const destination = searchFile(slug, searchId);
  const directory = path.dirname(destination);
  fs.mkdirSync(directory, { recursive: true });
  const lock = `${destination}.lock`;
  const deadline = Date.now() + SEARCH_LOCK_TIMEOUT_MS;
  while (true) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const ageMs = Date.now() - fs.statSync(lock).mtimeMs;
        if (ageMs > SEARCH_LOCK_STALE_MS) {
          fs.rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out acquiring discovery search lock: ${searchId}`,
        );
      }
      sleepForLock();
    }
  }
  try {
    return operation();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

function assertSafeReceiptEntry(file: string): boolean {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new DiscoveryStoreValidationError(
        "unsafe_path",
        "Discovery search receipt must be a regular file",
      );
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function readSearchUnlocked(
  slug: string,
  searchId: string,
): DiscoverySearchRecord | null {
  const file = searchFile(slug, searchId);
  if (!assertSafeReceiptEntry(file)) return null;
  const record = readJSON<DiscoverySearchRecord | null>(file, null);
  if (!record) return null;
  if (record.slug !== slug || record.id !== searchId) {
    throw new DiscoveryStoreValidationError(
      "identity_mismatch",
      "Discovery search receipt identity does not match its tenant path",
    );
  }
  return record;
}

function writeSearchUnlocked(
  record: DiscoverySearchRecord,
): DiscoverySearchRecord {
  assertDiscoveryStoreSlug(record.slug);
  assertDiscoverySearchId(record.id);
  const next = { ...record, updatedAt: new Date().toISOString() };
  const destination = searchFile(record.slug, record.id);
  assertSafeReceiptEntry(destination);
  const directory = path.dirname(destination);
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2));
    // rename is atomic within the same directory/filesystem: readers see the
    // previous complete receipt or the next complete receipt, never a prefix.
    fs.renameSync(temporary, destination);
  } finally {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Best-effort cleanup must not hide a successful atomic rename.
    }
  }
  return next;
}

export function searchExecutionGeneration(
  record: Pick<DiscoverySearchRecord, "executionControl">,
): number {
  if (!record.executionControl) return 0;
  const generation = record.executionControl.generation;
  return typeof generation === "number" &&
    Number.isSafeInteger(generation) &&
    generation > 0
    ? generation
    : 1;
}

function preserveNewerExecutionProjection(
  current: DiscoverySearchRecord | null,
  incoming: DiscoverySearchRecord,
): DiscoverySearchRecord {
  if (!current) return incoming;
  const currentGeneration = searchExecutionGeneration(current);
  const incomingGeneration = searchExecutionGeneration(incoming);
  const currentRunId = current.executionControl?.runId;
  const incomingRunId = incoming.executionControl?.runId;
  const currentWins =
    currentGeneration > incomingGeneration ||
    (currentGeneration === incomingGeneration &&
      Boolean(currentRunId) &&
      currentRunId !== incomingRunId);
  if (!currentWins) return incoming;
  return {
    ...incoming,
    executionControl: current.executionControl,
    executionModelConfig:
      current.executionModelConfig ?? incoming.executionModelConfig,
    runner: current.runner,
  };
}

/**
 * Full-record writer kept for legacy callers. Under the cross-process lock it
 * refuses to roll executionControl/runner back to an older generation.
 */
export function saveSearch(
  record: DiscoverySearchRecord,
): DiscoverySearchRecord {
  assertDiscoveryStoreSlug(record.slug);
  assertDiscoverySearchId(record.id);
  return withSearchLock(record.slug, record.id, () => {
    const current = readSearchUnlocked(record.slug, record.id);
    return writeSearchUnlocked(
      preserveNewerExecutionProjection(current, record),
    );
  });
}

export interface ConditionalSearchUpdateResult {
  applied: boolean;
  search: DiscoverySearchRecord;
}

export interface SetupSearchProjectionInput {
  setupRunId: string;
  preparedFingerprint: string;
  record: DiscoverySearchRecord;
}

/**
 * Persist the setup projection exactly once. A replay may refresh only the
 * same setup's record; a different setup/fingerprint cannot take ownership.
 * This lock is cross-process on one shared host, not cross-host storage.
 */
export function saveSearchForSetup(
  input: SetupSearchProjectionInput,
): ConditionalSearchUpdateResult {
  const { record, setupRunId, preparedFingerprint } = input;
  assertDiscoveryStoreSlug(record.slug);
  assertDiscoverySearchId(record.id);
  return withSearchLock(record.slug, record.id, () => {
    const current = readSearchUnlocked(record.slug, record.id);
    if (
      current &&
      (current.executionControl?.setupRunId !== setupRunId ||
        current.executionControl.preparedFingerprint !== preparedFingerprint)
    ) {
      return { applied: false, search: current };
    }
    if (current) {
      const immutableMatches =
        current.commandId === record.commandId &&
        current.commandFingerprint === record.commandFingerprint &&
        current.campaignId === record.campaignId &&
        current.title === record.title &&
        JSON.stringify(current.plan) === JSON.stringify(record.plan) &&
        JSON.stringify(current.executionModelConfig) ===
          JSON.stringify(record.executionModelConfig);
      if (!immutableMatches) {
        return { applied: false, search: current };
      }
      // Never roll mutable runner/template state back during setup recovery.
      return { applied: false, search: current };
    }
    const next = writeSearchUnlocked({
      ...record,
      slug: record.slug,
      id: record.id,
      executionControl: {
        mode: "canary",
        admittedAt:
          record.executionControl?.admittedAt ?? new Date().toISOString(),
        generation: 1,
        setupRunId,
        preparedFingerprint,
      },
    });
    return { applied: true, search: next };
  });
}

/** Attach the child only while the same setup still owns this projection. */
export function bindSearchExecutionRunForSetup(
  slug: string,
  searchId: string,
  input: {
    setupRunId: string;
    preparedFingerprint: string;
    runId: string;
    commandFingerprint?: string;
  },
): ConditionalSearchUpdateResult {
  return withSearchLock(slug, searchId, () => {
    const current = readSearchUnlocked(slug, searchId);
    if (!current) {
      throw new Error(`Discovery search not found: ${searchId} (${slug})`);
    }
    const control = current.executionControl;
    if (
      control?.mode !== "canary" ||
      control.setupRunId !== input.setupRunId ||
      control.preparedFingerprint !== input.preparedFingerprint ||
      (control.runId && control.runId !== input.runId) ||
      (control.commandFingerprint &&
        input.commandFingerprint &&
        control.commandFingerprint !== input.commandFingerprint)
    ) {
      return { applied: false, search: current };
    }
    const next = writeSearchUnlocked({
      ...current,
      executionControl: {
        ...control,
        generation: 1,
        runId: input.runId,
        ...(control.commandFingerprint || input.commandFingerprint
          ? {
              commandFingerprint:
                control.commandFingerprint ?? input.commandFingerprint,
            }
          : {}),
      },
    });
    return { applied: true, search: next };
  });
}

/** Cross-process CAS used by a leased execution's product projection. */
export function updateSearchForExecution(
  slug: string,
  searchId: string,
  expected: { runId: string; generation: number },
  update: (current: DiscoverySearchRecord) => DiscoverySearchRecord,
): ConditionalSearchUpdateResult {
  return withSearchLock(slug, searchId, () => {
    const current = readSearchUnlocked(slug, searchId);
    if (!current) {
      throw new Error(`Discovery search not found: ${searchId} (${slug})`);
    }
    if (
      current.executionControl?.runId !== expected.runId ||
      searchExecutionGeneration(current) !== expected.generation
    ) {
      return { applied: false, search: current };
    }
    const requested = update(current);
    if (requested === current) {
      return { applied: false, search: current };
    }
    const next = writeSearchUnlocked({
      ...requested,
      slug: current.slug,
      id: current.id,
      executionControl: current.executionControl,
      executionModelConfig:
        current.executionModelConfig ?? requested.executionModelConfig,
    });
    return { applied: true, search: next };
  });
}

/** Attach the Ledger run only while the same admission generation is current. */
export function bindSearchExecutionRun(
  slug: string,
  searchId: string,
  input: {
    generation: number;
    runId: string;
    commandFingerprint?: string;
  },
): ConditionalSearchUpdateResult {
  return withSearchLock(slug, searchId, () => {
    const current = readSearchUnlocked(slug, searchId);
    if (!current) {
      throw new Error(`Discovery search not found: ${searchId} (${slug})`);
    }
    if (
      searchExecutionGeneration(current) !== input.generation ||
      (current.executionControl?.runId &&
        current.executionControl.runId !== input.runId) ||
      (current.executionControl?.commandFingerprint &&
        input.commandFingerprint &&
        current.executionControl.commandFingerprint !==
          input.commandFingerprint)
    ) {
      return { applied: false, search: current };
    }
    const next = writeSearchUnlocked({
      ...current,
      executionControl: {
        mode: "canary",
        admittedAt:
          current.executionControl?.admittedAt ?? new Date().toISOString(),
        generation: input.generation,
        runId: input.runId,
        ...(current.executionControl?.commandFingerprint ||
        input.commandFingerprint
          ? {
              commandFingerprint:
                current.executionControl?.commandFingerprint ??
                input.commandFingerprint,
            }
          : {}),
      },
    });
    return { applied: true, search: next };
  });
}

/**
 * Atomically reserves exactly one next generation after a verified terminal
 * run. Losers receive the winner's projection and must reuse that generation.
 */
export function advanceSearchExecutionGeneration(
  slug: string,
  searchId: string,
  expected: {
    runId: string;
    generation: number;
    commandFingerprint: string;
  },
  update: (current: DiscoverySearchRecord) => DiscoverySearchRecord,
): ConditionalSearchUpdateResult {
  return withSearchLock(slug, searchId, () => {
    const current = readSearchUnlocked(slug, searchId);
    if (!current) {
      throw new Error(`Discovery search not found: ${searchId} (${slug})`);
    }
    if (
      current.executionControl?.runId !== expected.runId ||
      current.executionControl.commandFingerprint !==
        expected.commandFingerprint ||
      searchExecutionGeneration(current) !== expected.generation
    ) {
      return { applied: false, search: current };
    }
    const requested = update(current);
    const requestedGeneration = searchExecutionGeneration(requested);
    if (
      requested.executionControl?.mode !== "canary" ||
      requestedGeneration !== expected.generation + 1 ||
      requested.executionControl.runId
    ) {
      throw new Error("Invalid discovery execution generation advance");
    }
    const next = writeSearchUnlocked({
      ...requested,
      slug: current.slug,
      id: current.id,
      executionControl: {
        mode: "canary",
        admittedAt: requested.executionControl.admittedAt,
        generation: requestedGeneration,
      },
      executionModelConfig:
        requested.executionModelConfig ?? current.executionModelConfig,
    });
    return { applied: true, search: next };
  });
}

export function updateRunnerStateForExecution(
  slug: string,
  searchId: string,
  expected: { runId: string; generation: number },
  patch: Partial<DiscoveryRunnerState>,
): ConditionalSearchUpdateResult {
  return updateSearchForExecution(slug, searchId, expected, (current) => ({
    ...current,
    runner: { ...current.runner, ...patch },
  }));
}

export function getSearch(
  slug: string,
  searchId: string,
): DiscoverySearchRecord | null {
  return readSearchUnlocked(slug, searchId);
}

export function listSearches(slug: string): DiscoverySearchRecord[] {
  return listSearchIds(slug)
    .map((searchId) => getSearch(slug, searchId))
    .filter((record): record is DiscoverySearchRecord =>
      Boolean(record && record.id),
    )
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/** Includes corrupt receipts so the Ledger can reconstruct their projection. */
export function listSearchIds(slug: string): string[] {
  const dir = searchesDir(slug);
  if (!fs.existsSync(dir)) return [];
  const ids = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));
  for (const searchId of ids) assertDiscoverySearchId(searchId);
  return ids;
}

export function isSearchArchived(search: DiscoverySearchRecord): boolean {
  return Boolean(search.archivedAt);
}

export function archiveSearch(
  slug: string,
  searchId: string,
  reason = "Archivada desde Encuentra",
): DiscoverySearchRecord {
  const record = getSearch(slug, searchId);
  if (!record)
    throw new Error(`Discovery search not found: ${searchId} (${slug})`);
  return saveSearch({
    ...record,
    archivedAt: record.archivedAt || new Date().toISOString(),
    archiveReason: reason,
  });
}

/** Patch parcial del estado del runner (merge superficial + updatedAt). */
export function updateRunnerState(
  slug: string,
  searchId: string,
  patch: Partial<DiscoveryRunnerState>,
): DiscoverySearchRecord {
  const record = getSearch(slug, searchId);
  if (!record)
    throw new Error(`Discovery search not found: ${searchId} (${slug})`);
  record.runner = { ...record.runner, ...patch };
  return saveSearch(record);
}
