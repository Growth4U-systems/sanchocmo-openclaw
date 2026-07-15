import type { DiscoveryPlan, DiscoverySearchRecord } from "./discovery-types";

export const DISCOVERY_EXECUTION_OPERATION = "partnerships.discovery";
export const DISCOVERY_EXECUTION_AGGREGATE = "partnerships.search";
export const DISCOVERY_EXECUTION_SNAPSHOT_VERSION = 1;

export type DiscoveryExecutionRolloutMode = "off" | "shadow" | "canary";

export interface DiscoveryExecutionEnvironment {
  PARTNERSHIPS_DISCOVERY_EXECUTION_V2?: string;
  PARTNERSHIPS_DISCOVERY_V2_SLUGS?: string;
}

export interface DiscoveryExecutionPolicy {
  mode: DiscoveryExecutionRolloutMode;
  enabled: boolean;
  reason: "disabled" | "invalid_mode" | "slug_not_allowlisted" | "enabled";
}

export interface DiscoveryExecutionSnapshot {
  schemaVersion: typeof DISCOVERY_EXECUTION_SNAPSHOT_VERSION;
  slug: string;
  searchId: string;
  attempt: number;
  title: string;
  campaignId: string;
  projectId: string | null;
  taskId: string | null;
  plan: DiscoveryPlan;
  observedRunner: {
    status: DiscoverySearchRecord["runner"]["status"];
    mode: DiscoverySearchRecord["runner"]["mode"];
    jobId: string | null;
  };
  createdAt: string;
}

function normalizedSlug(value: string): string {
  return value.trim().toLowerCase();
}

function allowlistedSlugs(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map(normalizedSlug).filter(Boolean));
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
  return `partnerships.discovery:${discoveryExecutionAggregateId(slug, searchId)}:attempt:${normalizedAttempt}:v1`;
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
    title: search.title,
    campaignId: search.campaignId,
    projectId: search.projectId ?? null,
    taskId: search.taskId,
    plan: JSON.parse(JSON.stringify(search.plan)) as DiscoveryPlan,
    observedRunner: {
      status: search.runner.status,
      mode: search.runner.mode,
      jobId: search.runner.jobId ?? null,
    },
    createdAt: search.createdAt,
  };
}
