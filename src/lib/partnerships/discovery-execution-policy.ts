import type { DiscoveryPlan, DiscoverySearchRecord } from "./discovery-types";
import {
  DEFAULT_CREATOR_MODEL_CONFIG,
  type CreatorModelConfig,
} from "@/lib/calc-creator-core";
import { isDurableWorkerBootEnabled } from "@/lib/runtime/durable-worker-boot-plan";

export const DISCOVERY_EXECUTION_OPERATION = "partnerships.discovery";
export const DISCOVERY_SETUP_OPERATION = "partnerships.discovery.setup";
export const DISCOVERY_SETUP_HANDLER_VERSION = 1;
export const DISCOVERY_DEFERRED_EXECUTION_OPERATION =
  "partnerships.discovery.deferred";
export const DISCOVERY_EXECUTION_AGGREGATE = "partnerships.search";
export const DISCOVERY_EXECUTION_SNAPSHOT_VERSION = 2;
export const DISCOVERY_LOCAL_ARTIFACT_STORE_ACK =
  "local-persistent-single-host";

export type DiscoveryExecutionRolloutMode = "off" | "shadow" | "canary";

export interface DiscoveryExecutionEnvironment {
  PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED?: string;
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2?: string;
  PARTNERSHIPS_DISCOVERY_V2_SLUGS?: string;
  /**
   * Explicit canary-only acknowledgement: artifacts live in MC_WORKSPACE and
   * therefore require one host/replica with persistent storage.
   */
  PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE?: string;
}

/** Default process execution authority; injected repositories remain isolated. */
export function isPartnershipsDurableWorkerBootEnabled(
  env: DiscoveryExecutionEnvironment = process.env as DiscoveryExecutionEnvironment,
): boolean {
  return isDurableWorkerBootEnabled(
    env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED,
  );
}

export interface DiscoveryExecutionPolicy {
  mode: DiscoveryExecutionRolloutMode;
  enabled: boolean;
  reason:
    | "disabled"
    | "invalid_mode"
    | "slug_not_allowlisted"
    | "artifact_store_not_acknowledged"
    | "enabled";
}

export function isDiscoverySingleHostStoreAcknowledged(
  env: DiscoveryExecutionEnvironment = process.env as DiscoveryExecutionEnvironment,
): boolean {
  return (
    env.PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE?.trim().toLowerCase() ===
    DISCOVERY_LOCAL_ARTIFACT_STORE_ACK
  );
}

/**
 * A generation that was admitted to the Ledger keeps that authority forever.
 * Rollout flags only decide whether a new command may be admitted; they are not
 * a fallback switch for an already-durable command.
 */
export function isDiscoveryLedgerAuthoritative(
  search: Pick<DiscoverySearchRecord, "executionControl">,
): boolean {
  const control = search.executionControl;
  return Boolean(
    control?.mode === "canary" ||
    (typeof control?.runId === "string" && control.runId.trim()),
  );
}

export class DiscoveryDurableAuthorityError extends Error {
  readonly code = "DISCOVERY_DURABLE_AUTHORITY_UNAVAILABLE";
  readonly status = 503;

  constructor(
    message = "This discovery command belongs to the durable Ledger, but its execution path is unavailable",
  ) {
    super(message);
    this.name = "DiscoveryDurableAuthorityError";
  }
}

export interface DiscoveryExecutionSnapshot {
  schemaVersion: typeof DISCOVERY_EXECUTION_SNAPSHOT_VERSION;
  slug: string;
  searchId: string;
  attempt: number;
  executionGeneration: number;
  modelConfig: CreatorModelConfig;
  /** Present on commands created through durable pre-effect setup. */
  setupRunId?: string;
  preparedFingerprint?: string;
  modelConfigEvidence?: DiscoveryModelConfigEvidence;
  title: string;
  campaignId: string;
  projectId: string | null;
  taskId: string | null;
  executionIntent: NonNullable<DiscoverySearchRecord["executionIntent"]>;
  plan: DiscoveryPlan;
  createdAt: string;
}

export interface DiscoveryModelConfigEvidence {
  source: "yalc" | "defaults";
  updatedAt: string | null;
  hash: string;
  /** Why defaults won when the settings dependency was not usable. */
  fallbackReason?: "model_config_timeout" | "model_config_unavailable";
}

export type DiscoveryCampaignRequest = ReturnType<
  typeof import("./discovery-plan").buildCampaignPayload
>;

export interface DiscoverySetupCommandV1 {
  schemaVersion: typeof DISCOVERY_SETUP_HANDLER_VERSION;
  slug: string;
  searchId: string;
  commandId: string;
  commandHash: string;
  requestFingerprint: string;
  /** Frozen caller payload. Product defaults are resolved only after admission. */
  rawPlan: unknown;
  threadId: string | null;
  executionIntent: "auto" | "live" | "fixtures";
  createdAt: string;
}

export interface DiscoverySetupPreparedV1 {
  preparedFingerprint: string;
  plan: DiscoveryPlan;
  campaignRequest: DiscoveryCampaignRequest;
  modelConfig: CreatorModelConfig;
  modelConfigEvidence: DiscoveryModelConfigEvidence;
}

export interface DiscoverySetupProgressV1 {
  schemaVersion: typeof DISCOVERY_SETUP_HANDLER_VERSION;
  /** First fenced checkpoint; every later effect consumes this frozen value. */
  prepared?: DiscoverySetupPreparedV1;
  campaign?: { id: string; payloadHash: string };
  workspace?: {
    projectId: string | null;
    taskId: string | null;
    taskSetup: "created" | "unavailable";
  };
  searchProjectedAt?: string;
  discoveryRunId?: string;
}

function normalizedSlug(value: string): string {
  return value.trim().toLowerCase();
}

function allowlistedSlugs(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map(normalizedSlug).filter(Boolean));
}

/** Exact tenant scopes that may start a canary worker in this process. */
export function configuredDiscoveryExecutionSlugs(
  env: DiscoveryExecutionEnvironment = process.env as DiscoveryExecutionEnvironment,
): string[] {
  return [...allowlistedSlugs(env.PARTNERSHIPS_DISCOVERY_V2_SLUGS)].filter(
    (slug) => {
      const policy = resolveDiscoveryExecutionPolicy(slug, env);
      return policy.enabled && policy.mode === "canary";
    },
  );
}

/**
 * Resolve the rollout fail-closed. Even shadow writes require an explicit slug
 * allowlist so a production env typo cannot silently capture every tenant.
 */
export function resolveDiscoveryExecutionPolicy(
  slug: string,
  env: DiscoveryExecutionEnvironment = process.env as DiscoveryExecutionEnvironment,
): DiscoveryExecutionPolicy {
  const rawMode = env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2?.trim().toLowerCase();
  if (!rawMode || rawMode === "off") {
    return { mode: "off", enabled: false, reason: "disabled" };
  }

  const mode = rawMode === "on" ? "canary" : rawMode;
  if (mode !== "shadow" && mode !== "canary") {
    return { mode: "off", enabled: false, reason: "invalid_mode" };
  }

  const allowed = allowlistedSlugs(env.PARTNERSHIPS_DISCOVERY_V2_SLUGS);
  if (!allowed.has(normalizedSlug(slug))) {
    return { mode, enabled: false, reason: "slug_not_allowlisted" };
  }

  if (mode === "canary" && !isDiscoverySingleHostStoreAcknowledged(env)) {
    return {
      mode,
      enabled: false,
      reason: "artifact_store_not_acknowledged",
    };
  }

  return { mode, enabled: true, reason: "enabled" };
}

export function discoveryExecutionAggregateId(
  slug: string,
  searchId: string,
): string {
  return `${normalizedSlug(slug)}:${searchId.trim()}`;
}

export function discoveryExecutionIdempotencyKey(
  slug: string,
  searchId: string,
  attempt = 1,
): string {
  const normalizedAttempt = Number.isFinite(attempt)
    ? Math.max(1, Math.floor(attempt))
    : 1;
  return `partnerships.discovery:${discoveryExecutionAggregateId(slug, searchId)}:attempt:${normalizedAttempt}:v${DISCOVERY_EXECUTION_SNAPSHOT_VERSION}`;
}

/**
 * Canary commands deliberately use a separate receipt from historical shadow
 * observations. This lets a tenant move from shadow to canary without an old,
 * unclaimable shadow row winning the idempotency race.
 */
export function discoveryCanaryExecutionIdempotencyKey(
  slug: string,
  searchId: string,
  attempt = 1,
): string {
  const normalizedAttempt = Number.isFinite(attempt)
    ? Math.max(1, Math.floor(attempt))
    : 1;
  return `partnerships.discovery:${discoveryExecutionAggregateId(slug, searchId)}:attempt:${normalizedAttempt}:canary:v${DISCOVERY_EXECUTION_SNAPSHOT_VERSION}`;
}

export function discoveryExecutionAttempt(
  search: Pick<DiscoverySearchRecord, "runner">,
): number {
  const attempt = search.runner.attempts;
  return typeof attempt === "number" && Number.isFinite(attempt)
    ? Math.max(1, Math.floor(attempt))
    : 1;
}

/**
 * Freeze only execution-relevant product data. Deliberately excludes threadId,
 * assigned templates, chat history and every credential-bearing surface.
 */
export function buildDiscoveryExecutionSnapshot(
  search: DiscoverySearchRecord,
): DiscoveryExecutionSnapshot {
  return {
    schemaVersion: DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
    slug: search.slug,
    searchId: search.id,
    attempt: discoveryExecutionAttempt(search),
    executionGeneration:
      typeof search.executionControl?.generation === "number" &&
      Number.isSafeInteger(search.executionControl.generation) &&
      search.executionControl.generation > 0
        ? search.executionControl.generation
        : 1,
    modelConfig: JSON.parse(
      JSON.stringify(
        search.executionModelConfig ?? DEFAULT_CREATOR_MODEL_CONFIG,
      ),
    ) as CreatorModelConfig,
    ...(search.executionControl?.setupRunId
      ? { setupRunId: search.executionControl.setupRunId }
      : {}),
    ...(search.executionControl?.preparedFingerprint
      ? {
          preparedFingerprint: search.executionControl.preparedFingerprint,
        }
      : {}),
    title: search.title,
    campaignId: search.campaignId,
    projectId: search.projectId ?? null,
    taskId: search.taskId,
    executionIntent: search.executionIntent ?? "auto",
    plan: JSON.parse(JSON.stringify(search.plan)) as DiscoveryPlan,
    createdAt: search.createdAt,
  };
}
