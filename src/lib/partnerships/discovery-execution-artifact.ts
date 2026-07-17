import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { brandDir } from "@/lib/data/paths";
import {
  assertDiscoverySearchId,
  assertDiscoveryStoreSlug,
} from "./discovery-store";
import type { DiscoveryLeadPayload } from "./discovery-types";

/**
 * Local canary adapter only. This directory is shared by processes on one
 * host, not by replicas on different hosts. Policy requires an explicit
 * `local-persistent-single-host` acknowledgement before a worker may start.
 */
const ARTIFACT_SCHEMA_VERSION = 2;
const ARTIFACT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export class DiscoveryExecutionArtifactError extends Error {
  constructor(
    readonly code: "artifact_corrupt" | "artifact_conflict",
    message: string,
  ) {
    super(message);
    this.name = "DiscoveryExecutionArtifactError";
  }
}

export interface DiscoveryAssignmentArtifactRef {
  slug: string;
  runId: string;
  effectKey: string;
  searchId: string;
  campaignId: string;
}

export interface DiscoveryAssignmentArtifactData {
  /** Exact body sent to Yalc; may contain lead PII and stays private on disk. */
  assignmentBody: { leads: DiscoveryLeadPayload[] };
  /** Aggregate-only scoring evidence; avoids duplicating candidate/lead PII. */
  qualifiedCount: number;
  totalQuality: number;
  invalid: number;
  filtered: number;
}

interface StoredDiscoveryAssignmentArtifact {
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  runIdHash: string;
  effectKeyHash: string;
  searchId: string;
  campaignId: string;
  createdAt: string;
  expiresAt: string;
  dataHash: string;
  data: DiscoveryAssignmentArtifactData;
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

/**
 * Public, value-free identity for the exact private assignment payload.
 * Contract-v2 effects persist only this digest in the Ledger; lead PII stays
 * in the single-host private artifact store acknowledged by rollout policy.
 */
export function discoveryAssignmentArtifactFingerprint(
  data: DiscoveryAssignmentArtifactData,
): string {
  return sha256(canonicalJson(assertArtifactData(data)));
}

function privateRoot(slug: string): string {
  assertDiscoveryStoreSlug(slug);
  return path.resolve(
    brandDir(slug),
    ".private",
    "execution-artifacts",
    "partnerships-discovery",
  );
}

function ensurePrivateArtifactTree(slug: string): void {
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

function artifactFile(ref: DiscoveryAssignmentArtifactRef): string {
  assertDiscoveryStoreSlug(ref.slug);
  assertDiscoverySearchId(ref.searchId);
  return path.join(
    privateRoot(ref.slug),
    sha256(ref.runId),
    `${sha256(ref.effectKey)}.json`,
  );
}

function ensurePrivateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Existing directories retain their old mode after mkdir({recursive:true}).
  fs.chmodSync(directory, 0o700);
}

function expectedHashes(ref: DiscoveryAssignmentArtifactRef): {
  runIdHash: string;
  effectKeyHash: string;
} {
  return {
    runIdHash: sha256(ref.runId),
    effectKeyHash: sha256(ref.effectKey),
  };
}

function assertArtifactData(value: unknown): DiscoveryAssignmentArtifactData {
  if (!value || typeof value !== "object") {
    throw new DiscoveryExecutionArtifactError(
      "artifact_corrupt",
      "Durable discovery assignment artifact has invalid data",
    );
  }
  const data = value as Partial<DiscoveryAssignmentArtifactData>;
  if (
    !data.assignmentBody ||
    typeof data.assignmentBody !== "object" ||
    !Array.isArray(data.assignmentBody.leads) ||
    typeof data.qualifiedCount !== "number" ||
    !Number.isSafeInteger(data.qualifiedCount) ||
    data.qualifiedCount < 0 ||
    data.qualifiedCount !== data.assignmentBody.leads.length ||
    typeof data.totalQuality !== "number" ||
    !Number.isSafeInteger(data.totalQuality) ||
    data.totalQuality < 0 ||
    data.totalQuality > data.qualifiedCount * 100 ||
    typeof data.invalid !== "number" ||
    !Number.isSafeInteger(data.invalid) ||
    data.invalid < 0 ||
    typeof data.filtered !== "number" ||
    !Number.isSafeInteger(data.filtered) ||
    data.filtered < 0
  ) {
    throw new DiscoveryExecutionArtifactError(
      "artifact_corrupt",
      "Durable discovery assignment artifact has invalid payload fields",
    );
  }
  return data as DiscoveryAssignmentArtifactData;
}

export function loadDiscoveryAssignmentArtifact(
  ref: DiscoveryAssignmentArtifactRef,
): DiscoveryAssignmentArtifactData | null {
  const file = artifactFile(ref);
  if (!fs.existsSync(file)) return null;
  let stored: StoredDiscoveryAssignmentArtifact;
  try {
    const metadata = fs.lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error("not a regular file");
    fs.chmodSync(file, 0o600);
    stored = JSON.parse(
      fs.readFileSync(file, "utf8"),
    ) as StoredDiscoveryAssignmentArtifact;
  } catch {
    throw new DiscoveryExecutionArtifactError(
      "artifact_corrupt",
      "Durable discovery assignment artifact is unreadable",
    );
  }
  const hashes = expectedHashes(ref);
  if (
    stored.schemaVersion !== ARTIFACT_SCHEMA_VERSION ||
    stored.runIdHash !== hashes.runIdHash ||
    stored.effectKeyHash !== hashes.effectKeyHash ||
    stored.searchId !== ref.searchId ||
    stored.campaignId !== ref.campaignId ||
    typeof stored.dataHash !== "string"
  ) {
    throw new DiscoveryExecutionArtifactError(
      "artifact_corrupt",
      "Durable discovery assignment artifact identity does not match the run",
    );
  }
  const data = assertArtifactData(stored.data);
  if (sha256(canonicalJson(data)) !== stored.dataHash) {
    throw new DiscoveryExecutionArtifactError(
      "artifact_corrupt",
      "Durable discovery assignment artifact checksum does not match",
    );
  }
  return data;
}

/** First valid payload wins atomically; a different reclaim payload is fatal. */
export function persistDiscoveryAssignmentArtifact(
  ref: DiscoveryAssignmentArtifactRef,
  data: DiscoveryAssignmentArtifactData,
  now: Date = new Date(),
): DiscoveryAssignmentArtifactData {
  const existing = loadDiscoveryAssignmentArtifact(ref);
  const requestedHash = discoveryAssignmentArtifactFingerprint(data);
  if (existing) {
    if (discoveryAssignmentArtifactFingerprint(existing) !== requestedHash) {
      throw new DiscoveryExecutionArtifactError(
        "artifact_conflict",
        "A different durable discovery assignment payload already exists",
      );
    }
    return existing;
  }

  const file = artifactFile(ref);
  const directory = path.dirname(file);
  ensurePrivateArtifactTree(ref.slug);
  ensurePrivateDirectory(directory);
  const hashes = expectedHashes(ref);
  const stored: StoredDiscoveryAssignmentArtifact = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    ...hashes,
    searchId: ref.searchId,
    campaignId: ref.campaignId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ARTIFACT_RETENTION_MS).toISOString(),
    dataHash: requestedHash,
    data,
  };
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, canonicalJson(stored), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      // link is atomic and does not replace a first writer like rename would.
      fs.linkSync(temporary, file);
      fs.chmodSync(file, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }

  const persisted = loadDiscoveryAssignmentArtifact(ref);
  if (!persisted) {
    throw new DiscoveryExecutionArtifactError(
      "artifact_corrupt",
      "Durable discovery assignment artifact was not persisted",
    );
  }
  if (sha256(canonicalJson(persisted)) !== requestedHash) {
    throw new DiscoveryExecutionArtifactError(
      "artifact_conflict",
      "A different durable discovery assignment payload won persistence",
    );
  }
  return persisted;
}

export function deleteDiscoveryAssignmentArtifact(
  ref: DiscoveryAssignmentArtifactRef,
): void {
  const file = artifactFile(ref);
  fs.rmSync(file, { force: true });
  try {
    fs.rmdirSync(path.dirname(file));
  } catch {
    // Other effect artifacts or a concurrent reader still use the run folder.
  }
}

/** Bounded retention for abandoned, non-terminal artifacts. */
export function cleanupExpiredDiscoveryAssignmentArtifacts(
  slug: string,
  now: Date = new Date(),
): number {
  const root = privateRoot(slug);
  if (!fs.existsSync(root)) return 0;
  let removed = 0;
  for (const runDirectory of fs.readdirSync(root)) {
    const absoluteRunDirectory = path.join(root, runDirectory);
    let entries: string[];
    try {
      const metadata = fs.lstatSync(absoluteRunDirectory);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
      entries = fs.readdirSync(absoluteRunDirectory);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(absoluteRunDirectory, entry);
      try {
        const metadata = fs.lstatSync(file);
        if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
        if (!entry.endsWith(".json")) {
          if (now.getTime() - metadata.mtimeMs > ARTIFACT_RETENTION_MS) {
            fs.rmSync(file, { force: true });
            removed += 1;
          }
          continue;
        }
        const value = JSON.parse(fs.readFileSync(file, "utf8")) as {
          expiresAt?: unknown;
        };
        const expiresAt =
          typeof value.expiresAt === "string"
            ? Date.parse(value.expiresAt)
            : Number.NaN;
        const staleCorrupt =
          !Number.isFinite(expiresAt) &&
          now.getTime() - metadata.mtimeMs > ARTIFACT_RETENTION_MS;
        if (
          (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) ||
          staleCorrupt
        ) {
          fs.rmSync(file, { force: true });
          removed += 1;
        }
      } catch {
        try {
          if (
            now.getTime() - fs.statSync(file).mtimeMs >
            ARTIFACT_RETENTION_MS
          ) {
            fs.rmSync(file, { force: true });
            removed += 1;
          }
        } catch {
          // Concurrent cleanup already removed the entry.
        }
      }
    }
    try {
      fs.rmdirSync(absoluteRunDirectory);
    } catch {
      // Non-empty run directory is still retained.
    }
  }
  return removed;
}

export const discoveryExecutionArtifactInternals = {
  artifactFile,
  canonicalJson,
  retentionMs: ARTIFACT_RETENTION_MS,
};
