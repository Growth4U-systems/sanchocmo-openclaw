import type {
  CapabilityCredentialProvider,
  DurableEffectErrorClassification,
  DurableEffectReconcileResult,
} from "@/lib/durable-execution";
import { durableExecutionEffectKey } from "@/lib/durable-execution/runtime";
import {
  resolveYalcConfig,
  YalcClientError,
  type YalcRuntimeConfig,
} from "@/lib/yalc/client";
import type { CreatorModelConfig } from "@/lib/calc-creator-core";
import { createHash } from "node:crypto";
import { PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT } from "./discovery-admission-v2";
import { DISCOVERY_EXECUTION_OPERATION } from "./discovery-execution-policy";
import {
  discoveryAssignmentArtifactFingerprint,
  loadDiscoveryAssignmentArtifact,
  persistDiscoveryAssignmentArtifact,
  type DiscoveryAssignmentArtifactData,
} from "./discovery-execution-artifact";
import { normalizeCandidates } from "./discovery-normalize";
import { loadFixtureCandidates } from "./fixtures";
import { qualifyCandidates } from "./qualify-enrich";
import { applyDiscoveryPlanGates } from "./discovery-runner";
import {
  scrapeLiveDiscoveryCandidates,
  supportsLiveDiscovery,
} from "./scrapecreators-live";
import type { DiscoveryPlan } from "./discovery-types";
import {
  PARTNERSHIPS_YALC_ASSIGN_V2_PATH_PREFIX,
  partnershipsYalcV2Fetch,
  type PartnershipsYalcV2Response,
} from "./discovery-yalc-v2-transport";
import {
  PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
  PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
  PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2_LEGACY_V3,
  PARTNERSHIPS_PREPARE_CAPABILITY,
  PARTNERSHIPS_PREPARE_EFFECT_STEP,
  PARTNERSHIPS_SCRAPECREATORS_ORIGIN,
  PARTNERSHIPS_YALC_ASSIGN_CAPABILITY,
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  canonicalPartnershipsTargetOrigin,
  partnershipsPrepareAssignmentPayloadContractV2,
  partnershipsPrepareAssignmentReceiptContractV2,
  partnershipsTargetBindingFingerprint,
  partnershipsYalcAssignPayloadContractV2,
  partnershipsYalcAssignReceiptContractV2,
  type PartnershipsDiscoveryStatsV2,
  type PartnershipsDiscoveryHandlerVersionV2,
  type PartnershipsPrepareAssignmentEffectV2,
  type PartnershipsPrepareAssignmentPayloadV2,
  type PartnershipsYalcAssignEffectV2,
  type PartnershipsYalcAssignPayloadV2,
  type PartnershipsYalcAssignReceiptV2,
} from "./discovery-handler-v2";
import {
  PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS,
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS,
} from "./discovery-runtime-contract";

type YalcAssignTransport = (
  config: YalcRuntimeConfig,
  path: string,
  input: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: unknown;
    signal: AbortSignal;
    expectedContractFingerprint: string;
  },
) => Promise<PartnershipsYalcV2Response>;

export interface PartnershipsPrepareEffectDependencies {
  scrape?: typeof scrapeLiveDiscoveryCandidates;
  loadFixtures?: typeof loadFixtureCandidates;
}

export interface PartnershipsYalcAssignEffectDependencies {
  transport?: YalcAssignTransport;
  /**
   * Optional read-only target lookup. Production currently leaves this
   * unbound until Yalc exposes campaign-operation lookup by effect key.
   */
  reconcile?(
    payload: PartnershipsYalcAssignPayloadV2,
    context: Parameters<
      NonNullable<PartnershipsYalcAssignEffectV2["reconcile"]>
    >[1],
  ): Promise<DurableEffectReconcileResult<PartnershipsYalcAssignReceiptV2>>;
}

function requiredCredential(
  credentials: Readonly<Record<string, string>>,
  key: string,
): string {
  const value = credentials[key]?.trim();
  if (!value) throw new Error("Partnerships capability binding is unavailable");
  return value;
}

function statusFromError(error: unknown): number {
  if (!error || typeof error !== "object" || !("status" in error)) return 0;
  const value = Number((error as { status?: unknown }).status);
  return Number.isSafeInteger(value) ? value : 0;
}

function classifyPrepareError(
  error: unknown,
): DurableEffectErrorClassification {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("no está configurada") ||
    message.includes("clave inválida") ||
    message.includes("sin créditos") ||
    message.includes("unsupported") ||
    message.includes("solo soporta") ||
    message.includes("no candidates") ||
    message.includes("no candidatos")
  ) {
    return {
      kind: "definitive_rejection",
      code: "partnerships_provider_rejected",
      retryable: false,
    };
  }
  return {
    kind: "definitive_rejection",
    code: "partnerships_provider_unavailable",
    retryable: true,
  };
}

function classifyYalcError(error: unknown): DurableEffectErrorClassification {
  const status = statusFromError(error);
  if (status === 409) {
    return {
      kind: "definitive_rejection",
      code: "partnerships_yalc_idempotency_conflict",
      retryable: false,
    };
  }
  if (status >= 400 && status < 500 && ![408, 425, 429].includes(status)) {
    return {
      kind: "definitive_rejection",
      code: "partnerships_yalc_rejected",
      retryable: false,
    };
  }
  return {
    kind: "outcome_unknown",
    code: "partnerships_yalc_outcome_unknown",
  };
}

function expectedAssignmentEffectKey(
  payload: Pick<
    PartnershipsPrepareAssignmentPayloadV2,
    "assignmentEffectKey" | "executionRunId"
  >,
  handlerVersion: PartnershipsDiscoveryHandlerVersionV2,
): string {
  const expected = durableExecutionEffectKey({
    operation: DISCOVERY_EXECUTION_OPERATION,
    runId: payload.executionRunId,
    handlerVersion,
    step: PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  });
  if (payload.assignmentEffectKey !== expected) {
    throw new Error("assignment effect identity mismatch");
  }
  return expected;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function partnershipsYalcAssignmentRequestFingerprint(
  assignmentBody: unknown,
): string {
  return createHash("sha256")
    .update(canonicalJson(assignmentBody), "utf8")
    .digest("hex");
}

function artifactRef(payload: {
  executionRunId: string;
  assignmentEffectKey: string;
  slug: string;
  searchId: string;
  campaignId: string;
}) {
  return {
    slug: payload.slug,
    runId: payload.executionRunId,
    effectKey: payload.assignmentEffectKey,
    searchId: payload.searchId,
    campaignId: payload.campaignId,
  };
}

async function validateScrapeBinding(
  payload: PartnershipsPrepareAssignmentPayloadV2,
  credentials: CapabilityCredentialProvider,
): Promise<string> {
  const binding = payload.command.scrapeCreators;
  const resolved = await credentials.resolve(binding.credentialRef);
  const baseUrl = canonicalPartnershipsTargetOrigin(
    requiredCredential(resolved, "baseUrl"),
  );
  const fingerprint = partnershipsTargetBindingFingerprint(baseUrl);
  if (
    baseUrl !== PARTNERSHIPS_SCRAPECREATORS_ORIGIN ||
    requiredCredential(resolved, "targetBindingFingerprint") !== fingerprint ||
    binding.targetBindingFingerprint !== fingerprint
  ) {
    throw new Error("ScrapeCreators target binding changed after admission");
  }
  return requiredCredential(resolved, "apiKey");
}

function assignmentData(
  payload: PartnershipsPrepareAssignmentPayloadV2,
  rawCandidates: unknown,
): DiscoveryAssignmentArtifactData {
  const command = payload.command;
  const plan = command.plan as unknown as DiscoveryPlan;
  const normalized = normalizeCandidates(rawCandidates);
  const gated = applyDiscoveryPlanGates(normalized.candidates, plan);
  if (gated.candidates.length === 0) {
    throw new Error("No candidates met the frozen Partnerships plan");
  }
  const qualified = qualifyCandidates(gated.candidates, {
    searchId: command.searchId,
    config: command.modelConfig as unknown as CreatorModelConfig,
  });
  return {
    assignmentBody: {
      leads: qualified.map((item) => ({
        ...item.lead,
        provenance: {
          provider: "scrapecreators",
          operation: "creator_discovery",
          searchId: command.searchId,
          jobId: payload.assignmentEffectKey,
          source: "sancho_partnerships_discovery",
        },
        scoreProvenance: {
          provider: "calc-creator-core",
          operation: "creator_quality_score",
          searchId: command.searchId,
          jobId: payload.assignmentEffectKey,
        },
      })),
    },
    qualifiedCount: qualified.length,
    totalQuality: qualified.reduce((sum, item) => sum + item.score.total, 0),
    invalid: normalized.invalid,
    filtered: gated.filtered,
  };
}

function createPartnershipsPrepareAssignmentEffectV2ForVersion(
  handlerVersion: PartnershipsDiscoveryHandlerVersionV2,
  definitionVersion: number,
  maxAttempts: number,
  dependencies: PartnershipsPrepareEffectDependencies,
): PartnershipsPrepareAssignmentEffectV2 {
  const scrape = dependencies.scrape ?? scrapeLiveDiscoveryCandidates;
  const loadFixtures = dependencies.loadFixtures ?? loadFixtureCandidates;
  return {
    step: PARTNERSHIPS_PREPARE_EFFECT_STEP,
    definitionVersion,
    capability: PARTNERSHIPS_PREPARE_CAPABILITY,
    payload: partnershipsPrepareAssignmentPayloadContractV2,
    receipt: partnershipsPrepareAssignmentReceiptContractV2,
    safety: { kind: "read_only", retry: "bounded" },
    retry: {
      maxAttempts,
      baseDelayMs: 1_000,
      maxDelayMs: 30_000,
      jitter: "full",
    },
    timeoutMs: PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS,
    async invoke(payload, context) {
      expectedAssignmentEffectKey(payload, handlerVersion);
      if (payload.command.artifactStore !== PARTNERSHIPS_LOCAL_ARTIFACT_STORE) {
        throw new Error("shared artifact store is not configured");
      }
      const fixtures = payload.command.executionIntent === "fixtures";
      const plan = payload.command.plan as unknown as DiscoveryPlan;
      if (!fixtures && !supportsLiveDiscovery(plan)) {
        throw new Error(
          "Partnerships contract-v2 live discovery currently supports Instagram only",
        );
      }
      const rawCandidates = fixtures
        ? loadFixtures()
        : await scrape(plan, {
            signal: context.signal,
            apiKey: await validateScrapeBinding(payload, context.credentials),
          });
      const data = assignmentData(payload, rawCandidates);
      const persisted = persistDiscoveryAssignmentArtifact(
        artifactRef({
          executionRunId: payload.executionRunId,
          assignmentEffectKey: payload.assignmentEffectKey,
          slug: payload.command.slug,
          searchId: payload.command.searchId,
          campaignId: payload.command.campaignId,
        }),
        data,
      );
      return {
        schemaVersion: 1,
        artifactStore: PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
        artifactFingerprint: discoveryAssignmentArtifactFingerprint(persisted),
        qualifiedCount: persisted.qualifiedCount,
        totalQuality: persisted.totalQuality,
        invalid: persisted.invalid,
        filtered: persisted.filtered,
      };
    },
    classify: classifyPrepareError,
  };
}

export function createPartnershipsPrepareAssignmentEffectV2(
  dependencies: PartnershipsPrepareEffectDependencies = {},
): PartnershipsPrepareAssignmentEffectV2 {
  return createPartnershipsPrepareAssignmentEffectV2ForVersion(
    PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
    2,
    1,
    dependencies,
  );
}

export function createPartnershipsPrepareAssignmentEffectV2LegacyV3(
  dependencies: PartnershipsPrepareEffectDependencies = {},
): PartnershipsPrepareAssignmentEffectV2 {
  return createPartnershipsPrepareAssignmentEffectV2ForVersion(
    PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2_LEGACY_V3,
    1,
    3,
    dependencies,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function statsFromResponse(
  payload: PartnershipsYalcAssignPayloadV2,
  response: unknown,
): PartnershipsDiscoveryStatsV2 {
  const body = asRecord(response);
  if (body.ok !== true || body.campaignId !== payload.campaignId) {
    throw new Error("Yalc returned an invalid assignment receipt");
  }
  if (!Array.isArray(body.leads) || !Array.isArray(body.dropped)) {
    throw new Error("Yalc returned incomplete assignment statistics");
  }
  const leads = body.leads.map(asRecord);
  const dropped = body.dropped;
  const disqualified = leads.filter(
    (lead) => lead.lifecycleStatus === "Disqualified",
  ).length;
  const inserted = leads.length;
  const avgQuality =
    payload.qualifiedCount > 0
      ? Math.round(payload.totalQuality / payload.qualifiedCount)
      : null;
  return {
    candidates: payload.qualifiedCount,
    invalid: payload.invalid,
    filtered: payload.filtered,
    inserted,
    sourced: inserted - disqualified,
    disqualified,
    dropped: dropped.length,
    avgQuality,
  };
}

async function yalcConfigFor(
  payload: PartnershipsYalcAssignPayloadV2,
  credentials: CapabilityCredentialProvider,
): Promise<YalcRuntimeConfig> {
  const resolved = await credentials.resolve(payload.credentialRef);
  const slug = requiredCredential(resolved, "slug");
  if (slug !== payload.slug) throw new Error("cross-tenant Yalc binding");
  const baseUrl = canonicalPartnershipsTargetOrigin(
    requiredCredential(resolved, "baseUrl"),
  );
  const fingerprint = partnershipsTargetBindingFingerprint(baseUrl);
  if (
    requiredCredential(resolved, "targetBindingFingerprint") !== fingerprint ||
    payload.targetBindingFingerprint !== fingerprint
  ) {
    throw new Error("Yalc target binding changed after admission");
  }
  const token = resolved.token?.trim();
  return { baseUrl, slug, ...(token ? { token } : {}) };
}

async function defaultYalcTransport(
  config: YalcRuntimeConfig,
  path: string,
  input: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: unknown;
    signal: AbortSignal;
    expectedContractFingerprint: string;
  },
): Promise<PartnershipsYalcV2Response> {
  return partnershipsYalcV2Fetch(config, path, input);
}

function exactArtifact(payload: PartnershipsYalcAssignPayloadV2) {
  const artifact = loadDiscoveryAssignmentArtifact(artifactRef(payload));
  if (
    !artifact ||
    discoveryAssignmentArtifactFingerprint(artifact) !==
      payload.artifactFingerprint ||
    artifact.qualifiedCount !== payload.qualifiedCount ||
    artifact.totalQuality !== payload.totalQuality ||
    artifact.invalid !== payload.invalid ||
    artifact.filtered !== payload.filtered
  ) {
    throw new Error("frozen assignment artifact is missing or changed");
  }
  return artifact;
}

function receiptFromReconciliation(
  payload: PartnershipsYalcAssignPayloadV2,
  response: PartnershipsYalcV2Response,
  requestFingerprint: string,
): PartnershipsYalcAssignReceiptV2 | null {
  const body = asRecord(response.body);
  if (
    response.status !== 200 ||
    body.ok !== true ||
    body.campaignId !== payload.campaignId ||
    body.operation !== "leads.assign" ||
    body.requestFingerprint !== requestFingerprint
  ) {
    return null;
  }
  if (body.status === "completed") {
    return {
      schemaVersion: 1,
      campaignId: payload.campaignId,
      stats: statsFromResponse(payload, body.responseBody),
    };
  }
  if (body.status === "effects_committed") {
    const effects = asRecord(body.effectResult);
    if (!Array.isArray(effects.inserted) || !Array.isArray(effects.dropped)) {
      return null;
    }
    return {
      schemaVersion: 1,
      campaignId: payload.campaignId,
      stats: statsFromResponse(payload, {
        ok: true,
        campaignId: payload.campaignId,
        leads: effects.inserted,
        dropped: effects.dropped,
      }),
    };
  }
  return null;
}

function authoritativeReceiptAbsence(
  error: Pick<YalcClientError, "status" | "body">,
  payload: PartnershipsYalcAssignPayloadV2,
): boolean {
  const body = asRecord(error.body);
  return (
    error.status === 404 &&
    body.ok === false &&
    body.campaignId === payload.campaignId &&
    body.operation === "leads.assign" &&
    body.status === "not_found" &&
    body.code === "IDEMPOTENCY_RECEIPT_NOT_FOUND"
  );
}

function yalcClientFailure(
  error: unknown,
): Pick<YalcClientError, "status" | "body"> | null {
  if (error instanceof YalcClientError) return error;
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; body?: unknown };
  return typeof candidate.status === "number" &&
    Number.isSafeInteger(candidate.status)
    ? { status: candidate.status, body: candidate.body }
    : null;
}

function createPartnershipsYalcAssignEffectV2ForVersion(
  handlerVersion: PartnershipsDiscoveryHandlerVersionV2,
  definitionVersion: number,
  maxAttempts: number,
  dependencies: PartnershipsYalcAssignEffectDependencies,
): PartnershipsYalcAssignEffectV2 {
  const transport = dependencies.transport ?? defaultYalcTransport;
  return {
    step: PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
    definitionVersion,
    capability: PARTNERSHIPS_YALC_ASSIGN_CAPABILITY,
    payload: partnershipsYalcAssignPayloadContractV2,
    receipt: partnershipsYalcAssignReceiptContractV2,
    safety: {
      kind: "reconcile_before_replay",
      delivery: "at_least_once_attempts",
      lookup: "by_effect_key",
      absenceMustBeAuthoritative: true,
    },
    retry: {
      maxAttempts,
      baseDelayMs: 1_000,
      maxDelayMs: 30_000,
      jitter: "full",
    },
    timeoutMs: PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS,
    async invoke(payload, context) {
      if (
        payload.assignmentEffectKey !== context.effectKey ||
        expectedAssignmentEffectKey(payload, handlerVersion) !==
          context.effectKey ||
        payload.artifactStore !== PARTNERSHIPS_LOCAL_ARTIFACT_STORE
      ) {
        throw new Error("Yalc assignment effect identity mismatch");
      }
      const artifact = exactArtifact(payload);
      const requestFingerprint = partnershipsYalcAssignmentRequestFingerprint(
        artifact.assignmentBody,
      );
      const response = await transport(
        await yalcConfigFor(payload, context.credentials),
        `${PARTNERSHIPS_YALC_ASSIGN_V2_PATH_PREFIX}/${encodeURIComponent(payload.campaignId)}/leads/assign-v1`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": context.effectKey,
            "Idempotency-Request-Fingerprint": requestFingerprint,
          },
          body: artifact.assignmentBody,
          signal: context.signal,
          expectedContractFingerprint:
            PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
        },
      );
      return {
        schemaVersion: 1,
        campaignId: payload.campaignId,
        stats: statsFromResponse(payload, response.body),
      };
    },
    async reconcile(payload, context) {
      if (dependencies.reconcile) {
        return dependencies.reconcile(payload, context);
      }
      let artifact;
      try {
        artifact = exactArtifact(payload);
      } catch {
        return {
          kind: "conflict",
          code: "partnerships_yalc_artifact_conflict",
        };
      }
      const requestFingerprint = partnershipsYalcAssignmentRequestFingerprint(
        artifact.assignmentBody,
      );
      try {
        const response = await transport(
          await yalcConfigFor(payload, context.credentials),
          `${PARTNERSHIPS_YALC_ASSIGN_V2_PATH_PREFIX}/${encodeURIComponent(payload.campaignId)}/leads/assign-v1/receipt`,
          {
            method: "GET",
            headers: {
              "Idempotency-Key": context.effectKey,
              "Idempotency-Request-Fingerprint": requestFingerprint,
            },
            signal: context.signal,
            expectedContractFingerprint:
              PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
          },
        );
        const body = asRecord(response.body);
        if (
          (response.status === 200 || response.status === 202) &&
          body.requestFingerprint !== requestFingerprint
        ) {
          return {
            kind: "conflict",
            code: "partnerships_yalc_receipt_fingerprint_conflict",
          };
        }
        const receipt = receiptFromReconciliation(
          payload,
          response,
          requestFingerprint,
        );
        if (receipt) return { kind: "found", receipt };
        if (
          response.status === 202 &&
          body.ok === true &&
          body.campaignId === payload.campaignId &&
          body.operation === "leads.assign" &&
          body.status === "processing" &&
          body.requestFingerprint === requestFingerprint
        ) {
          return { kind: "unknown", retryAfterMs: 1_000 };
        }
        return { kind: "unknown" };
      } catch (error) {
        const failure = yalcClientFailure(error);
        if (failure) {
          if (authoritativeReceiptAbsence(failure, payload)) {
            return { kind: "not_found" };
          }
          if (failure.status === 409) {
            return {
              kind: "conflict",
              code: "partnerships_yalc_idempotency_conflict",
            };
          }
        }
        return { kind: "unknown" };
      }
    },
    classify: classifyYalcError,
  };
}

export function createPartnershipsYalcAssignEffectV2(
  dependencies: PartnershipsYalcAssignEffectDependencies = {},
): PartnershipsYalcAssignEffectV2 {
  return createPartnershipsYalcAssignEffectV2ForVersion(
    PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
    2,
    1,
    dependencies,
  );
}

export function createPartnershipsYalcAssignEffectV2LegacyV3(
  dependencies: PartnershipsYalcAssignEffectDependencies = {},
): PartnershipsYalcAssignEffectV2 {
  return createPartnershipsYalcAssignEffectV2ForVersion(
    PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2_LEGACY_V3,
    1,
    3,
    dependencies,
  );
}

export const partnershipsPrepareAssignmentEffectV2 =
  createPartnershipsPrepareAssignmentEffectV2();
export const partnershipsYalcAssignEffectV2 =
  createPartnershipsYalcAssignEffectV2();

function tenantFromYalcRef(value: string): string {
  const prefix = "yalc://tenant/";
  const slug = value.startsWith(prefix) ? value.slice(prefix.length) : "";
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) {
    throw new Error("invalid Yalc credential reference");
  }
  return slug;
}

export function createPartnershipsCredentialProvider(
  dependencies: {
    env?: NodeJS.ProcessEnv;
    resolveYalc?: (slug: string) => YalcRuntimeConfig;
  } = {},
): CapabilityCredentialProvider {
  const env = dependencies.env ?? process.env;
  const resolveYalc = dependencies.resolveYalc ?? resolveYalcConfig;
  return {
    async resolve(credentialRef) {
      if (credentialRef === "scrapecreators://default") {
        const apiKey = env.SCRAPECREATORS_API_KEY?.trim();
        if (!apiKey)
          throw new Error("SCRAPECREATORS_API_KEY no está configurada");
        return Object.freeze({
          apiKey,
          baseUrl: PARTNERSHIPS_SCRAPECREATORS_ORIGIN,
          targetBindingFingerprint: partnershipsTargetBindingFingerprint(
            PARTNERSHIPS_SCRAPECREATORS_ORIGIN,
          ),
        });
      }
      const slug = tenantFromYalcRef(credentialRef);
      const config = resolveYalc(slug);
      const resolvedSlug = config.slug?.trim().toLowerCase() || slug;
      if (resolvedSlug !== slug) throw new Error("cross-tenant Yalc config");
      const baseUrl = canonicalPartnershipsTargetOrigin(config.baseUrl);
      return Object.freeze({
        slug,
        baseUrl,
        targetBindingFingerprint: partnershipsTargetBindingFingerprint(baseUrl),
        ...(config.token ? { token: config.token } : {}),
      });
    },
  };
}

export const partnershipsCredentialProvider =
  createPartnershipsCredentialProvider();
