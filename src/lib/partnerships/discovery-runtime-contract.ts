export const PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS_DEFAULT = 270_000;
export const PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS = 300_000;
export const PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS = 30_000;
export const PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_DEFAULT = 360_000;
export const PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS = 30_000;
export const PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_MAX = 3_600_000;

const MIN_TIMEOUT_MS = 1_000;
const DECIMAL_INTEGER_PATTERN = /^[1-9][0-9]*$/;

export interface PartnershipsDiscoveryRuntimeContractEnvironment {
  PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS?: string;
  PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS?: string;
}

export interface PartnershipsDiscoveryRuntimeContract {
  liveDiscoveryTimeoutMs: number;
  prepareEffectTimeoutMs: typeof PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS;
  yalcAssignEffectTimeoutMs: typeof PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS;
  effectTimeoutBudgetMs: number;
  handlerTimeoutMs: number;
  minimumMarginMs: typeof PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS;
}

export type PartnershipsDiscoveryRuntimeContractErrorReason =
  | "live_timeout_invalid"
  | "live_timeout_margin_too_small"
  | "handler_timeout_invalid"
  | "handler_timeout_margin_too_small";

export class PartnershipsDiscoveryRuntimeContractError extends Error {
  readonly code = "partnerships_discovery_runtime_contract_invalid" as const;

  constructor(
    readonly reason: PartnershipsDiscoveryRuntimeContractErrorReason,
  ) {
    super(`Partnerships discovery runtime contract is invalid (${reason})`);
    this.name = "PartnershipsDiscoveryRuntimeContractError";
  }
}

function strictTimeoutMs(
  raw: string | undefined,
  fallback: number,
  maximum: number,
  reason: PartnershipsDiscoveryRuntimeContractErrorReason,
): number {
  if (raw === undefined) return fallback;
  if (
    raw.length > 16 ||
    !DECIMAL_INTEGER_PATTERN.test(raw) ||
    raw.trim() !== raw
  ) {
    throw new PartnershipsDiscoveryRuntimeContractError(reason);
  }
  const parsed = Number(raw);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_TIMEOUT_MS ||
    parsed > maximum
  ) {
    throw new PartnershipsDiscoveryRuntimeContractError(reason);
  }
  return parsed;
}

/**
 * Resolves the closed timeout envelope for one Partnerships discovery pass.
 *
 * The live provider deadline must settle before the prepare effect deadline,
 * and the outer handler must outlive the sum of both sequential effect
 * deadlines. Environment overrides are accepted only as exact base-10
 * integers and may tighten neither safety margin.
 */
export function resolvePartnershipsDiscoveryRuntimeContract(
  env: PartnershipsDiscoveryRuntimeContractEnvironment = process.env as PartnershipsDiscoveryRuntimeContractEnvironment,
): Readonly<PartnershipsDiscoveryRuntimeContract> {
  const liveDiscoveryTimeoutMs = strictTimeoutMs(
    env.PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS,
    PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS_DEFAULT,
    PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS,
    "live_timeout_invalid",
  );
  const effectTimeoutBudgetMs =
    PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS +
    PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS;
  const handlerTimeoutMs = strictTimeoutMs(
    env.PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS,
    PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_DEFAULT,
    PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_MAX,
    "handler_timeout_invalid",
  );

  if (
    PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS - liveDiscoveryTimeoutMs <
    PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS
  ) {
    throw new PartnershipsDiscoveryRuntimeContractError(
      "live_timeout_margin_too_small",
    );
  }
  if (
    handlerTimeoutMs - effectTimeoutBudgetMs <
    PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS
  ) {
    throw new PartnershipsDiscoveryRuntimeContractError(
      "handler_timeout_margin_too_small",
    );
  }

  return Object.freeze({
    liveDiscoveryTimeoutMs,
    prepareEffectTimeoutMs: PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS,
    yalcAssignEffectTimeoutMs: PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS,
    effectTimeoutBudgetMs,
    handlerTimeoutMs,
    minimumMarginMs: PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS,
  });
}
