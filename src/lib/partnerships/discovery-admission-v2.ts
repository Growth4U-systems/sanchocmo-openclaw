import type {
  CreateExecutionRunReceipt,
  ExecutionControlRepository,
  ExecutionLeaseScope,
} from "@/lib/execution-control";
import {
  DurableExecutionRegistry,
  admitDurableExecutionV2,
  type DurableCapabilityPolicy,
  type DurableExecutionOrigin,
} from "@/lib/durable-execution";
import { isValidTenantSlug } from "@/lib/thread-id";
import { resolveYalcConfig, type YalcRuntimeConfig } from "@/lib/yalc/client";
import { partnershipsYalcV2Fetch } from "./discovery-yalc-v2-transport";
import {
  DISCOVERY_EXECUTION_AGGREGATE,
  DISCOVERY_EXECUTION_OPERATION,
  DISCOVERY_LOCAL_ARTIFACT_STORE_ACK,
  discoveryExecutionAggregateId,
  type DiscoveryExecutionEnvironment,
  type DiscoveryExecutionSnapshot,
} from "./discovery-execution-policy";
import {
  PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
  PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
  PARTNERSHIPS_PREPARE_CAPABILITY,
  PARTNERSHIPS_SCRAPECREATORS_ORIGIN,
  PARTNERSHIPS_YALC_ASSIGN_CAPABILITY,
  canonicalPartnershipsTargetOrigin,
  createPartnershipsDiscoveryHandlerV2,
  isPartnershipsDiscoveryHandlerV2Version,
  partnershipsTargetBindingFingerprint,
  type PartnershipsDiscoveryCommandV2,
} from "./discovery-handler-v2";
import {
  resolvePartnershipsDiscoveryRuntimeContract,
  type PartnershipsDiscoveryRuntimeContractEnvironment,
} from "./discovery-runtime-contract";

export const PARTNERSHIPS_EFFECTS_V2_ROLLOUT_VALUE = "canary" as const;
export const PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION = 1 as const;
export const PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_PATH =
  "/api/capabilities/campaign-leads-assign-v1" as const;
export const PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT =
  "sha256:48f0356308109d75a3559a64e5c28b13c8c7958d4332465e73ab41bd17380b79" as const;

export interface PartnershipsDiscoveryV2Environment
  extends
    DiscoveryExecutionEnvironment,
    PartnershipsDiscoveryRuntimeContractEnvironment {
  /** Separate from the historical "V2" rollout, whose handler is contract-v1. */
  PARTNERSHIPS_DISCOVERY_EFFECTS_V2?: string;
}

export type PartnershipsDiscoveryV2GateReason =
  | "effects_v2_disabled"
  | "single_host_artifact_store_required"
  | "yalc_capability_unavailable"
  | "yalc_capability_invalid";

export class PartnershipsDiscoveryV2GateError extends Error {
  readonly code = "partnerships_discovery_v2_gate_closed" as const;

  constructor(readonly reason: PartnershipsDiscoveryV2GateReason) {
    super(`Partnerships discovery contract-v2 gate is closed (${reason})`);
    this.name = "PartnershipsDiscoveryV2GateError";
  }
}

export interface PartnershipsYalcAssignCapabilityReceipt {
  schemaVersion: 1;
  capability: "campaign-leads-assign-v1";
  contractVersion: typeof PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION;
  endpoints: {
    assign: "/api/campaigns/:campaignId/leads/assign-v1";
    receipt: "/api/campaigns/:campaignId/leads/assign-v1/receipt";
  };
  authentication: { required: true; scheme: "bearer" };
  idempotency: {
    required: true;
    header: "Idempotency-Key";
    requestFingerprintHeader: "Idempotency-Request-Fingerprint";
    requestFingerprint: "sha256_canonical_json_leads_body";
    maxCharacters: 256;
    scope: ["tenant", "campaign", "operation"];
    sameKeySamePayload: "frozen_response";
    sameKeyDifferentPayload: "409_idempotency_conflict";
  };
  execution: {
    atomic: true;
    maxBatchSize: 500;
    replayHeader: "Idempotency-Replayed";
    contractFingerprintHeader: "Yalc-Contract-Fingerprint";
    receiptLookup: "read_only";
  };
  contractFingerprint: typeof PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT;
  ready: true;
  checks: {
    bearerAuthentication: true;
    receiptTable: true;
    receiptColumns: true;
    uniqueCommandIndex: true;
    uniqueCommandIndexColumns: true;
  };
}

export interface PartnershipsDiscoveryV2AdmissionDependencies {
  repository: Pick<ExecutionControlRepository, "createRun">;
  env?: PartnershipsDiscoveryV2Environment;
  resolveYalc?: (slug: string) => YalcRuntimeConfig;
  verifyYalcCapability?: (
    config: YalcRuntimeConfig,
    targetBindingFingerprint: string,
  ) => Promise<PartnershipsYalcAssignCapabilityReceipt>;
  trustedOrigin?: DurableExecutionOrigin;
}

export interface PartnershipsDiscoveryV2PreflightDependencies {
  env?: PartnershipsDiscoveryV2Environment;
  resolveYalc?: (slug: string) => YalcRuntimeConfig;
  verifyYalcCapability?: (
    config: YalcRuntimeConfig,
    targetBindingFingerprint: string,
  ) => Promise<PartnershipsYalcAssignCapabilityReceipt>;
}

export interface PartnershipsDiscoveryV2PreflightReceipt {
  config: YalcRuntimeConfig;
  targetBindingFingerprint: string;
  capability: PartnershipsYalcAssignCapabilityReceipt;
}

function isV2Capability(input: {
  scope: ExecutionLeaseScope;
  handlerVersion: number;
  capability: string;
}): boolean {
  return (
    input.scope.operation === DISCOVERY_EXECUTION_OPERATION &&
    input.scope.mode === "canary" &&
    isValidTenantSlug(input.scope.tenantKey) &&
    isPartnershipsDiscoveryHandlerV2Version(input.handlerVersion) &&
    (input.capability === PARTNERSHIPS_PREPARE_CAPABILITY ||
      input.capability === PARTNERSHIPS_YALC_ASSIGN_CAPABILITY)
  );
}

/** Explicit, closed capability allowlist shared by admission and drain. */
export const partnershipsDiscoveryCapabilityPolicyV2: DurableCapabilityPolicy =
  Object.freeze({
    mayAdmit: (input: Parameters<DurableCapabilityPolicy["mayAdmit"]>[0]) =>
      isV2Capability(input) &&
      input.handlerVersion === PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
    mayDrain: (input: Parameters<DurableCapabilityPolicy["mayDrain"]>[0]) =>
      isV2Capability(input) ? "allow" : "temporarily_suspended",
  });

export function partnershipsDiscoveryRegistryV2(): DurableExecutionRegistry {
  return new DurableExecutionRegistry().register(
    createPartnershipsDiscoveryHandlerV2(),
  );
}

export function partnershipsDiscoveryEffectsV2Requested(
  env: PartnershipsDiscoveryV2Environment = process.env as PartnershipsDiscoveryV2Environment,
): boolean {
  return (
    env.PARTNERSHIPS_DISCOVERY_EFFECTS_V2?.trim().toLowerCase() ===
    PARTNERSHIPS_EFFECTS_V2_ROLLOUT_VALUE
  );
}

/**
 * The current artifact adapter is intentionally not multi-host. V2 admission
 * is impossible unless the operator explicitly declares a single persistent
 * host; removing or changing the acknowledgement closes both admission and
 * drain. A shared locator-backed artifact store is required before replicas.
 */
export function assertPartnershipsDiscoveryV2StaticGate(
  env: PartnershipsDiscoveryV2Environment = process.env as PartnershipsDiscoveryV2Environment,
): void {
  resolvePartnershipsDiscoveryRuntimeContract(env);
  if (!partnershipsDiscoveryEffectsV2Requested(env)) {
    throw new PartnershipsDiscoveryV2GateError("effects_v2_disabled");
  }
  if (
    env.PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE?.trim().toLowerCase() !==
      DISCOVERY_LOCAL_ARTIFACT_STORE_ACK ||
    DISCOVERY_LOCAL_ARTIFACT_STORE_ACK !== PARTNERSHIPS_LOCAL_ARTIFACT_STORE
  ) {
    throw new PartnershipsDiscoveryV2GateError(
      "single_host_artifact_store_required",
    );
  }
}

function exactCapabilityReceipt(
  raw: unknown,
): PartnershipsYalcAssignCapabilityReceipt {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PartnershipsDiscoveryV2GateError("yalc_capability_invalid");
  }
  const value = raw as Record<string, unknown>;
  const expectedKeys = new Set([
    "schemaVersion",
    "capability",
    "contractVersion",
    "endpoints",
    "authentication",
    "idempotency",
    "execution",
    "contractFingerprint",
    "ready",
    "checks",
  ]);
  const canonicalJson = (candidate: unknown): string => {
    if (Array.isArray(candidate)) {
      return `[${candidate.map(canonicalJson).join(",")}]`;
    }
    if (candidate && typeof candidate === "object") {
      const record = candidate as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(candidate) ?? "null";
  };
  const exact = (candidate: unknown, expected: unknown) =>
    canonicalJson(candidate) === canonicalJson(expected);
  if (
    Object.keys(value).length !== expectedKeys.size ||
    Object.keys(value).some((key) => !expectedKeys.has(key)) ||
    value.schemaVersion !== 1 ||
    value.capability !== "campaign-leads-assign-v1" ||
    value.contractVersion !== PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION ||
    !exact(value.endpoints, {
      assign: "/api/campaigns/:campaignId/leads/assign-v1",
      receipt: "/api/campaigns/:campaignId/leads/assign-v1/receipt",
    }) ||
    !exact(value.authentication, { required: true, scheme: "bearer" }) ||
    !exact(value.idempotency, {
      required: true,
      header: "Idempotency-Key",
      requestFingerprintHeader: "Idempotency-Request-Fingerprint",
      requestFingerprint: "sha256_canonical_json_leads_body",
      maxCharacters: 256,
      scope: ["tenant", "campaign", "operation"],
      sameKeySamePayload: "frozen_response",
      sameKeyDifferentPayload: "409_idempotency_conflict",
    }) ||
    !exact(value.execution, {
      atomic: true,
      maxBatchSize: 500,
      replayHeader: "Idempotency-Replayed",
      contractFingerprintHeader: "Yalc-Contract-Fingerprint",
      receiptLookup: "read_only",
    }) ||
    value.contractFingerprint !==
      PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT ||
    value.ready !== true ||
    !exact(value.checks, {
      bearerAuthentication: true,
      receiptTable: true,
      receiptColumns: true,
      uniqueCommandIndex: true,
      uniqueCommandIndexColumns: true,
    })
  ) {
    throw new PartnershipsDiscoveryV2GateError("yalc_capability_invalid");
  }
  return value as unknown as PartnershipsYalcAssignCapabilityReceipt;
}

export async function verifyPartnershipsYalcAssignCapability(
  config: YalcRuntimeConfig,
  _targetBindingFingerprint: string,
): Promise<PartnershipsYalcAssignCapabilityReceipt> {
  try {
    const response = await partnershipsYalcV2Fetch(
      config,
      PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_PATH,
      {
        method: "GET",
        signal: AbortSignal.timeout(5_000),
        expectedContractFingerprint:
          PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
      },
    );
    return exactCapabilityReceipt(response.body);
  } catch (error) {
    if (error instanceof PartnershipsDiscoveryV2GateError) throw error;
    throw new PartnershipsDiscoveryV2GateError("yalc_capability_unavailable");
  }
}

/** Read-only, bounded attestation used before any setup/product mutation. */
export async function preflightPartnershipsDiscoveryV2(
  slug: string,
  dependencies: PartnershipsDiscoveryV2PreflightDependencies = {},
): Promise<PartnershipsDiscoveryV2PreflightReceipt> {
  const env =
    dependencies.env ?? (process.env as PartnershipsDiscoveryV2Environment);
  assertPartnershipsDiscoveryV2StaticGate(env);
  const resolveYalc = dependencies.resolveYalc ?? resolveYalcConfig;
  const resolved = resolveYalc(slug);
  const baseUrl = canonicalPartnershipsTargetOrigin(resolved.baseUrl);
  const config = { ...resolved, baseUrl, slug };
  const targetBindingFingerprint =
    partnershipsTargetBindingFingerprint(baseUrl);
  const capability = await (
    dependencies.verifyYalcCapability ?? verifyPartnershipsYalcAssignCapability
  )(config, targetBindingFingerprint);
  return {
    config,
    targetBindingFingerprint,
    capability: exactCapabilityReceipt(capability),
  };
}

function commandFromSnapshot(
  snapshot: DiscoveryExecutionSnapshot,
  yalcBaseUrl: string,
): PartnershipsDiscoveryCommandV2 {
  return {
    ...(JSON.parse(
      JSON.stringify(snapshot),
    ) as unknown as PartnershipsDiscoveryCommandV2),
    setupRunId: snapshot.setupRunId ?? null,
    preparedFingerprint: snapshot.preparedFingerprint ?? null,
    modelConfigEvidence: snapshot.modelConfigEvidence
      ? (JSON.parse(
          JSON.stringify(snapshot.modelConfigEvidence),
        ) as PartnershipsDiscoveryCommandV2["modelConfigEvidence"])
      : null,
    artifactStore: PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
    scrapeCreators: {
      credentialRef: "scrapecreators://default",
      targetBindingFingerprint: partnershipsTargetBindingFingerprint(
        PARTNERSHIPS_SCRAPECREATORS_ORIGIN,
      ),
    },
    yalc: {
      credentialRef: `yalc://tenant/${snapshot.slug}`,
      targetBindingFingerprint:
        partnershipsTargetBindingFingerprint(yalcBaseUrl),
    },
  };
}

export function partnershipsDiscoveryV2IdempotencyKey(
  slug: string,
  searchId: string,
  attempt: number,
): string {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  return `partnerships.discovery:${discoveryExecutionAggregateId(slug, searchId)}:attempt:${normalizedAttempt}:canary:v${PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2}`;
}

/**
 * Pre-effect admission. The remote, read-only capability receipt is verified
 * before the Ledger row exists; a plain env flag can never attest Yalc.
 */
export async function admitPartnershipsDiscoveryV2(
  snapshot: DiscoveryExecutionSnapshot,
  dependencies: PartnershipsDiscoveryV2AdmissionDependencies,
): Promise<CreateExecutionRunReceipt> {
  const env =
    dependencies.env ?? (process.env as PartnershipsDiscoveryV2Environment);
  const { config, targetBindingFingerprint } =
    await preflightPartnershipsDiscoveryV2(snapshot.slug, {
      env,
      ...(dependencies.resolveYalc
        ? { resolveYalc: dependencies.resolveYalc }
        : {}),
      ...(dependencies.verifyYalcCapability
        ? { verifyYalcCapability: dependencies.verifyYalcCapability }
        : {}),
    });

  const command = commandFromSnapshot(snapshot, config.baseUrl);
  return admitDurableExecutionV2({
    repository: dependencies.repository,
    registry: partnershipsDiscoveryRegistryV2(),
    capabilityPolicy: partnershipsDiscoveryCapabilityPolicyV2,
    scope: {
      tenantKey: snapshot.slug,
      operation: DISCOVERY_EXECUTION_OPERATION,
      mode: "canary",
    },
    handlerVersion: PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
    aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
    aggregateId: discoveryExecutionAggregateId(
      snapshot.slug,
      snapshot.searchId,
    ),
    idempotencyKey: partnershipsDiscoveryV2IdempotencyKey(
      snapshot.slug,
      snapshot.searchId,
      snapshot.attempt,
    ),
    command,
    metadata: {
      source: "partnerships.discovery.v2",
      artifactStore: PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
      yalcCapabilityVersion: PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
      yalcTargetBindingFingerprint: targetBindingFingerprint,
    },
    ...(dependencies.trustedOrigin
      ? { trustedOrigin: dependencies.trustedOrigin }
      : {}),
  });
}
