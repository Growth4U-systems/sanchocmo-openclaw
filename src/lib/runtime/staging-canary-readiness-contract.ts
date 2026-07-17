export const STAGING_CANARY_READINESS_SCHEMA =
  "staging-canary-surface-readiness.v1" as const;

export type StagingCanaryReadinessSurface = "leads" | "partnerships";

export interface StagingCanaryReadinessResponse {
  schemaVersion: typeof STAGING_CANARY_READINESS_SCHEMA;
  surface: StagingCanaryReadinessSurface;
  ready: boolean;
}
