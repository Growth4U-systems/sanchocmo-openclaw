export const STAGING_CANARY_ORIGIN = "https://staging.sanchocmo.ai" as const;

export type StagingCanaryPreflightCode =
  | "invalid_arguments"
  | "flags_not_exact"
  | "single_host_unverified"
  | "runtime_not_openclaw"
  | "yalc_image_not_immutable"
  | "sancho_origin_invalid"
  | "credentials_missing"
  | "openclaw_version_unavailable"
  | "openclaw_version_unsupported"
  | "model_cap_unavailable"
  | "model_cap_unsafe"
  | "model_credential_missing"
  | "deployment_identity_unavailable"
  | "deployment_identity_mismatch"
  | "readiness_unavailable"
  | "readiness_not_ready"
  | "yalc_capability_unavailable";

export class StagingCanaryPreflightError extends Error {
  constructor(readonly code: StagingCanaryPreflightCode) {
    super(`Staging canary preflight failed (${code})`);
    this.name = "StagingCanaryPreflightError";
  }
}

export function validateCanonicalStagingOrigin(
  value: string | undefined,
): typeof STAGING_CANARY_ORIGIN {
  if (value !== STAGING_CANARY_ORIGIN) {
    throw new StagingCanaryPreflightError("sancho_origin_invalid");
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== STAGING_CANARY_ORIGIN ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("not canonical");
    }
  } catch {
    throw new StagingCanaryPreflightError("sancho_origin_invalid");
  }
  return STAGING_CANARY_ORIGIN;
}
