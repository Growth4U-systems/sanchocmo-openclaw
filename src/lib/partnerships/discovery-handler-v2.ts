import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
  durableExecutionEffectKey,
  type DurableEffectDefinition,
  type DurableEffectMap,
  type DurableExecutionHandlerV2,
  type DurableJson,
  type DurableJsonBounds,
  type DurableJsonContract,
  type DurableJsonObject,
} from "@/lib/durable-execution";
import {
  mergeCreatorModelConfig,
  type CreatorModelConfig,
} from "@/lib/calc-creator-core";
import type { ExecutionRun } from "@/lib/execution-control";
import { createHash } from "node:crypto";
import { parseDiscoveryPlan } from "./discovery-plan";
import {
  DISCOVERY_EXECUTION_OPERATION,
  DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
  type DiscoveryExecutionSnapshot,
} from "./discovery-execution-policy";
import type { DiscoveryRunnerStats } from "./discovery-types";

export const PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2 = 3 as const;
export const PARTNERSHIPS_PREPARE_EFFECT_STEP =
  "provider.prepare_assignment" as const;
export const PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP =
  "yalc.assign_leads" as const;
export const PARTNERSHIPS_PREPARE_CAPABILITY =
  "partnerships.discovery.prepare" as const;
export const PARTNERSHIPS_YALC_ASSIGN_CAPABILITY =
  "yalc.partnerships.leads.assign.v2" as const;
export const PARTNERSHIPS_LOCAL_ARTIFACT_STORE =
  "local-persistent-single-host" as const;
export const PARTNERSHIPS_SCRAPECREATORS_ORIGIN =
  "https://api.scrapecreators.com" as const;
export const PARTNERSHIPS_CREDENTIAL_REF_PATTERN =
  /^(?:scrapecreators:\/\/default|yalc:\/\/tenant\/[a-z0-9][a-z0-9-]{0,119})$/;

const COMMAND_BOUNDS: DurableJsonBounds = Object.freeze({
  maxBytes: 128 * 1024,
  maxDepth: 24,
  maxNodes: 5_000,
  maxStringBytes: 32 * 1024,
  maxArrayItems: 500,
  maxObjectKeys: 500,
});
const RECEIPT_BOUNDS: DurableJsonBounds = Object.freeze({
  maxBytes: 8 * 1024,
  maxDepth: 10,
  maxNodes: 160,
  maxStringBytes: 1_024,
  maxArrayItems: 16,
  maxObjectKeys: 40,
});
const CHECKPOINT_BOUNDS: DurableJsonBounds = Object.freeze({
  maxBytes: 16 * 1024,
  maxDepth: 12,
  maxNodes: 256,
  maxStringBytes: 2_048,
  maxArrayItems: 32,
  maxObjectKeys: 64,
});

export interface PartnershipsCapabilityBindingV2 extends DurableJsonObject {
  credentialRef: string;
  targetBindingFingerprint: string;
}

export interface PartnershipsDiscoveryCommandV2 extends DurableJsonObject {
  schemaVersion: typeof DISCOVERY_EXECUTION_SNAPSHOT_VERSION;
  slug: string;
  searchId: string;
  attempt: number;
  executionGeneration: number;
  modelConfig: DurableJsonObject;
  title: string;
  campaignId: string;
  projectId: string | null;
  taskId: string | null;
  executionIntent: "auto" | "live" | "fixtures";
  plan: DurableJsonObject;
  createdAt: string;
  artifactStore: typeof PARTNERSHIPS_LOCAL_ARTIFACT_STORE;
  scrapeCreators: PartnershipsCapabilityBindingV2;
  yalc: PartnershipsCapabilityBindingV2;
  setupRunId: string | null;
  preparedFingerprint: string | null;
  modelConfigEvidence: DurableJsonObject | null;
}

export interface PartnershipsPrepareAssignmentPayloadV2 extends DurableJsonObject {
  executionRunId: string;
  assignmentEffectKey: string;
  command: PartnershipsDiscoveryCommandV2;
}

export interface PartnershipsPrepareAssignmentReceiptV2 extends DurableJsonObject {
  schemaVersion: 1;
  artifactStore: typeof PARTNERSHIPS_LOCAL_ARTIFACT_STORE;
  artifactFingerprint: string;
  qualifiedCount: number;
  totalQuality: number;
  invalid: number;
  filtered: number;
}

export interface PartnershipsYalcAssignPayloadV2 extends DurableJsonObject {
  executionRunId: string;
  assignmentEffectKey: string;
  slug: string;
  searchId: string;
  campaignId: string;
  credentialRef: string;
  targetBindingFingerprint: string;
  artifactStore: typeof PARTNERSHIPS_LOCAL_ARTIFACT_STORE;
  artifactFingerprint: string;
  qualifiedCount: number;
  totalQuality: number;
  invalid: number;
  filtered: number;
}

export interface PartnershipsDiscoveryStatsV2 extends DurableJsonObject {
  candidates: number;
  invalid: number;
  filtered: number;
  inserted: number;
  sourced: number;
  disqualified: number;
  dropped: number;
  avgQuality: number | null;
}

export interface PartnershipsYalcAssignReceiptV2 extends DurableJsonObject {
  schemaVersion: 1;
  campaignId: string;
  stats: PartnershipsDiscoveryStatsV2;
}

export interface PartnershipsDiscoveryResultV2 extends DurableJsonObject {
  completionBoundary: "partnerships_discovery_completed";
  stats: PartnershipsDiscoveryStatsV2;
}

export interface PartnershipsDiscoveryCheckpointV2 extends DurableJsonObject {
  stage: "assignment_prepared" | "assignment_completed";
  artifactFingerprint: string;
}

export type PartnershipsPrepareAssignmentEffectV2 = DurableEffectDefinition<
  PartnershipsPrepareAssignmentPayloadV2,
  PartnershipsPrepareAssignmentReceiptV2
>;
export type PartnershipsYalcAssignEffectV2 = DurableEffectDefinition<
  PartnershipsYalcAssignPayloadV2,
  PartnershipsYalcAssignReceiptV2
>;
type PartnershipsDiscoveryEffectsV2 = DurableEffectMap & {
  [PARTNERSHIPS_PREPARE_EFFECT_STEP]: PartnershipsPrepareAssignmentEffectV2;
  [PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP]: PartnershipsYalcAssignEffectV2;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("object required");
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const expected = new Set(allowed);
  if (Object.keys(input).some((key) => !expected.has(key))) {
    throw new Error("unknown property");
  }
}

function exactKeys(input: Record<string, unknown>, keys: readonly string[]) {
  assertOnlyKeys(input, keys);
  if (Object.keys(input).length !== keys.length) {
    throw new Error("missing property");
  }
}

function text(value: unknown, max: number, pattern?: RegExp): string {
  if (typeof value !== "string") throw new Error("string required");
  const result = value.trim();
  if (
    !result ||
    Buffer.byteLength(result, "utf8") > max ||
    (pattern && !pattern.test(result))
  ) {
    throw new Error("invalid string");
  }
  return result;
}

function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error("integer required");
  }
  return value;
}

function nullableId(value: unknown): string | null {
  return value === null
    ? null
    : text(value, 256, /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/);
}

function isoTimestamp(value: unknown): string {
  const result = text(value, 64);
  if (!Number.isFinite(Date.parse(result)))
    throw new Error("invalid timestamp");
  return result;
}

function jsonObject(value: unknown): DurableJsonObject {
  return JSON.parse(JSON.stringify(record(value))) as DurableJsonObject;
}

function parseBinding(
  value: unknown,
  expectedRef: string | RegExp,
): PartnershipsCapabilityBindingV2 {
  const input = record(value);
  exactKeys(input, ["credentialRef", "targetBindingFingerprint"]);
  const credentialRef = text(
    input.credentialRef,
    160,
    PARTNERSHIPS_CREDENTIAL_REF_PATTERN,
  );
  if (
    (typeof expectedRef === "string" && credentialRef !== expectedRef) ||
    (expectedRef instanceof RegExp && !expectedRef.test(credentialRef))
  ) {
    throw new Error("credential reference mismatch");
  }
  return {
    credentialRef,
    targetBindingFingerprint: text(
      input.targetBindingFingerprint,
      64,
      /^[a-f0-9]{64}$/,
    ),
  };
}

function parseModelEvidence(value: unknown): DurableJsonObject {
  const input = record(value);
  assertOnlyKeys(input, ["source", "updatedAt", "hash", "fallbackReason"]);
  if (input.source !== "yalc" && input.source !== "defaults") {
    throw new Error("invalid model evidence source");
  }
  const output: DurableJsonObject = {
    source: input.source,
    updatedAt: input.updatedAt === null ? null : isoTimestamp(input.updatedAt),
    hash: text(input.hash, 64, /^[a-f0-9]{64}$/),
  };
  if (input.fallbackReason !== undefined) {
    if (
      input.fallbackReason !== "model_config_timeout" &&
      input.fallbackReason !== "model_config_unavailable"
    ) {
      throw new Error("invalid model evidence fallback");
    }
    output.fallbackReason = input.fallbackReason;
  }
  return output;
}

export function parsePartnershipsDiscoveryCommandV2(
  value: unknown,
): PartnershipsDiscoveryCommandV2 {
  const input = record(value);
  assertOnlyKeys(input, [
    "schemaVersion",
    "slug",
    "searchId",
    "attempt",
    "executionGeneration",
    "modelConfig",
    "setupRunId",
    "preparedFingerprint",
    "modelConfigEvidence",
    "title",
    "campaignId",
    "projectId",
    "taskId",
    "executionIntent",
    "plan",
    "createdAt",
    "artifactStore",
    "scrapeCreators",
    "yalc",
  ]);
  if (input.schemaVersion !== DISCOVERY_EXECUTION_SNAPSHOT_VERSION) {
    throw new Error("unsupported snapshot version");
  }
  const slug = text(input.slug, 120, /^[a-z0-9][a-z0-9-]{0,119}$/);
  const modelConfig = mergeCreatorModelConfig(
    record(input.modelConfig),
  ) as CreatorModelConfig;
  const plan = parseDiscoveryPlan(input.plan, modelConfig);
  if (
    input.executionIntent !== "auto" &&
    input.executionIntent !== "live" &&
    input.executionIntent !== "fixtures"
  ) {
    throw new Error("unsupported execution intent");
  }
  if (input.artifactStore !== PARTNERSHIPS_LOCAL_ARTIFACT_STORE) {
    throw new Error("unsupported artifact store");
  }
  const output: PartnershipsDiscoveryCommandV2 = {
    schemaVersion: DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
    slug,
    searchId: text(input.searchId, 256, /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/),
    attempt: integer(input.attempt, 1, 100),
    executionGeneration: integer(input.executionGeneration, 1, 1_000_000),
    modelConfig: jsonObject(modelConfig),
    title: text(input.title, 512),
    campaignId: text(
      input.campaignId,
      256,
      /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/,
    ),
    projectId: nullableId(input.projectId),
    taskId: nullableId(input.taskId),
    executionIntent: input.executionIntent,
    plan: jsonObject(plan),
    createdAt: isoTimestamp(input.createdAt),
    artifactStore: PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
    scrapeCreators: parseBinding(
      input.scrapeCreators,
      "scrapecreators://default",
    ),
    yalc: parseBinding(input.yalc, new RegExp(`^yalc://tenant/${slug}$`)),
    setupRunId:
      input.setupRunId === undefined || input.setupRunId === null
        ? null
        : text(input.setupRunId, 256),
    preparedFingerprint:
      input.preparedFingerprint === undefined ||
      input.preparedFingerprint === null
        ? null
        : text(input.preparedFingerprint, 128),
    modelConfigEvidence:
      input.modelConfigEvidence === undefined ||
      input.modelConfigEvidence === null
        ? null
        : parseModelEvidence(input.modelConfigEvidence),
  };
  return output;
}

function parsePreparePayload(
  value: unknown,
): PartnershipsPrepareAssignmentPayloadV2 {
  const input = record(value);
  exactKeys(input, ["executionRunId", "assignmentEffectKey", "command"]);
  return {
    executionRunId: text(input.executionRunId, 256),
    assignmentEffectKey: text(input.assignmentEffectKey, 512),
    command: parsePartnershipsDiscoveryCommandV2(input.command),
  };
}

function parsePrepareReceipt(
  value: unknown,
): PartnershipsPrepareAssignmentReceiptV2 {
  const input = record(value);
  exactKeys(input, [
    "schemaVersion",
    "artifactStore",
    "artifactFingerprint",
    "qualifiedCount",
    "totalQuality",
    "invalid",
    "filtered",
  ]);
  if (
    input.schemaVersion !== 1 ||
    input.artifactStore !== PARTNERSHIPS_LOCAL_ARTIFACT_STORE
  ) {
    throw new Error("invalid preparation receipt");
  }
  const qualifiedCount = integer(input.qualifiedCount, 1, 500);
  return {
    schemaVersion: 1,
    artifactStore: PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
    artifactFingerprint: text(input.artifactFingerprint, 64, /^[a-f0-9]{64}$/),
    qualifiedCount,
    totalQuality: integer(input.totalQuality, 0, qualifiedCount * 100),
    invalid: integer(input.invalid, 0, 100_000),
    filtered: integer(input.filtered, 0, 100_000),
  };
}

function parseYalcPayload(value: unknown): PartnershipsYalcAssignPayloadV2 {
  const input = record(value);
  exactKeys(input, [
    "executionRunId",
    "assignmentEffectKey",
    "slug",
    "searchId",
    "campaignId",
    "credentialRef",
    "targetBindingFingerprint",
    "artifactStore",
    "artifactFingerprint",
    "qualifiedCount",
    "totalQuality",
    "invalid",
    "filtered",
  ]);
  const slug = text(input.slug, 120, /^[a-z0-9][a-z0-9-]{0,119}$/);
  const credentialRef = text(
    input.credentialRef,
    160,
    PARTNERSHIPS_CREDENTIAL_REF_PATTERN,
  );
  if (
    credentialRef !== `yalc://tenant/${slug}` ||
    input.artifactStore !== PARTNERSHIPS_LOCAL_ARTIFACT_STORE
  ) {
    throw new Error("invalid Yalc assignment binding");
  }
  const qualifiedCount = integer(input.qualifiedCount, 1, 500);
  return {
    executionRunId: text(input.executionRunId, 256),
    assignmentEffectKey: text(input.assignmentEffectKey, 512),
    slug,
    searchId: text(input.searchId, 256),
    campaignId: text(input.campaignId, 256),
    credentialRef,
    targetBindingFingerprint: text(
      input.targetBindingFingerprint,
      64,
      /^[a-f0-9]{64}$/,
    ),
    artifactStore: PARTNERSHIPS_LOCAL_ARTIFACT_STORE,
    artifactFingerprint: text(input.artifactFingerprint, 64, /^[a-f0-9]{64}$/),
    qualifiedCount,
    totalQuality: integer(input.totalQuality, 0, qualifiedCount * 100),
    invalid: integer(input.invalid, 0, 100_000),
    filtered: integer(input.filtered, 0, 100_000),
  };
}

function parseStats(value: unknown): PartnershipsDiscoveryStatsV2 {
  const input = record(value);
  exactKeys(input, [
    "candidates",
    "invalid",
    "filtered",
    "inserted",
    "sourced",
    "disqualified",
    "dropped",
    "avgQuality",
  ]);
  const candidates = integer(input.candidates, 0, 500);
  const inserted = integer(input.inserted, 0, 500);
  const sourced = integer(input.sourced, 0, inserted);
  const disqualified = integer(input.disqualified, 0, inserted);
  if (sourced + disqualified !== inserted) {
    throw new Error("incoherent assignment stats");
  }
  const avgQuality =
    input.avgQuality === null ? null : integer(input.avgQuality, 0, 100);
  return {
    candidates,
    invalid: integer(input.invalid, 0, 100_000),
    filtered: integer(input.filtered, 0, 100_000),
    inserted,
    sourced,
    disqualified,
    dropped: integer(input.dropped, 0, 500),
    avgQuality,
  };
}

function parseYalcReceipt(value: unknown): PartnershipsYalcAssignReceiptV2 {
  const input = record(value);
  exactKeys(input, ["schemaVersion", "campaignId", "stats"]);
  if (input.schemaVersion !== 1) throw new Error("invalid receipt version");
  return {
    schemaVersion: 1,
    campaignId: text(input.campaignId, 256),
    stats: parseStats(input.stats),
  };
}

function parseCheckpoint(value: unknown): PartnershipsDiscoveryCheckpointV2 {
  const input = record(value);
  exactKeys(input, ["stage", "artifactFingerprint"]);
  if (
    input.stage !== "assignment_prepared" &&
    input.stage !== "assignment_completed"
  ) {
    throw new Error("invalid checkpoint stage");
  }
  return {
    stage: input.stage,
    artifactFingerprint: text(input.artifactFingerprint, 64, /^[a-f0-9]{64}$/),
  };
}

function parseResult(value: unknown): PartnershipsDiscoveryResultV2 {
  const input = record(value);
  exactKeys(input, ["completionBoundary", "stats"]);
  if (input.completionBoundary !== "partnerships_discovery_completed") {
    throw new Error("invalid completion boundary");
  }
  return {
    completionBoundary: "partnerships_discovery_completed",
    stats: parseStats(input.stats),
  };
}

function contract<T extends DurableJson>(
  schemaVersion: number,
  bounds: DurableJsonBounds,
  parse: (value: unknown) => T,
  credentialRefs = false,
): DurableJsonContract<T> {
  return {
    schemaVersion,
    bounds,
    secrets: {
      mode: "reject",
      ...(credentialRefs
        ? { credentialRefPattern: PARTNERSHIPS_CREDENTIAL_REF_PATTERN }
        : {}),
    },
    parse,
  };
}

export const partnershipsDiscoveryCommandContractV2 = contract(
  PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
  COMMAND_BOUNDS,
  parsePartnershipsDiscoveryCommandV2,
  true,
);
export const partnershipsPrepareAssignmentPayloadContractV2 = contract(
  1,
  COMMAND_BOUNDS,
  parsePreparePayload,
  true,
);
export const partnershipsPrepareAssignmentReceiptContractV2 = contract(
  1,
  RECEIPT_BOUNDS,
  parsePrepareReceipt,
);
export const partnershipsYalcAssignPayloadContractV2 = contract(
  1,
  CHECKPOINT_BOUNDS,
  parseYalcPayload,
  true,
);
export const partnershipsYalcAssignReceiptContractV2 = contract(
  1,
  RECEIPT_BOUNDS,
  parseYalcReceipt,
);
export const partnershipsDiscoveryCheckpointContractV2 = contract(
  1,
  CHECKPOINT_BOUNDS,
  parseCheckpoint,
);
export const partnershipsDiscoveryResultContractV2 = contract(
  1,
  RECEIPT_BOUNDS,
  parseResult,
);

export function canonicalPartnershipsTargetOrigin(value: string): string {
  const parsed = new URL(value);
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error("capability target must be a credential-free origin");
  }
  return parsed.origin;
}

export function partnershipsTargetBindingFingerprint(value: string): string {
  return createHash("sha256")
    .update(canonicalPartnershipsTargetOrigin(value), "utf8")
    .digest("hex");
}

const policyPrepareEffect: PartnershipsPrepareAssignmentEffectV2 = {
  step: PARTNERSHIPS_PREPARE_EFFECT_STEP,
  definitionVersion: 1,
  capability: PARTNERSHIPS_PREPARE_CAPABILITY,
  payload: partnershipsPrepareAssignmentPayloadContractV2,
  receipt: partnershipsPrepareAssignmentReceiptContractV2,
  safety: { kind: "read_only", retry: "bounded" },
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 30_000,
    jitter: "full",
  },
  timeoutMs: 300_000,
  async invoke() {
    throw new Error("Partnerships preparation capability is not bound");
  },
  classify: () => ({
    kind: "definitive_rejection",
    code: "partnerships_prepare_unbound",
    retryable: false,
  }),
};

const policyYalcEffect: PartnershipsYalcAssignEffectV2 = {
  step: PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
  definitionVersion: 1,
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
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 30_000,
    jitter: "full",
  },
  timeoutMs: 30_000,
  async invoke() {
    throw new Error("Partnerships Yalc capability is not bound");
  },
  async reconcile() {
    return { kind: "unknown" };
  },
  classify: () => ({
    kind: "outcome_unknown",
    code: "partnerships_yalc_outcome_unknown",
  }),
};

/** Policy-only definitions used to fingerprint/admit before runtime binding. */
export const partnershipsDiscoveryEffectPolicyV2 = Object.freeze({
  [PARTNERSHIPS_PREPARE_EFFECT_STEP]: policyPrepareEffect,
  [PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP]: policyYalcEffect,
});

export interface PartnershipsDiscoveryHandlerV2Dependencies {
  projectTerminal?(
    run: ExecutionRun,
    command: PartnershipsDiscoveryCommandV2,
  ): Promise<void> | void;
}

export function createPartnershipsDiscoveryHandlerV2(
  effects: {
    prepare: PartnershipsPrepareAssignmentEffectV2;
    assign: PartnershipsYalcAssignEffectV2;
  } = {
    prepare: policyPrepareEffect,
    assign: policyYalcEffect,
  },
  dependencies: PartnershipsDiscoveryHandlerV2Dependencies = {},
): DurableExecutionHandlerV2<
  PartnershipsDiscoveryCommandV2,
  PartnershipsDiscoveryCheckpointV2,
  PartnershipsDiscoveryResultV2,
  PartnershipsDiscoveryEffectsV2
> {
  const effectMap = {
    [PARTNERSHIPS_PREPARE_EFFECT_STEP]: effects.prepare,
    [PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP]: effects.assign,
  } as unknown as PartnershipsDiscoveryEffectsV2;
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
    operation: DISCOVERY_EXECUTION_OPERATION,
    version: PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
    command: partnershipsDiscoveryCommandContractV2,
    checkpoint: partnershipsDiscoveryCheckpointContractV2,
    result: partnershipsDiscoveryResultContractV2,
    effects: effectMap,
    async execute(command, context) {
      const assignmentEffectKey = durableExecutionEffectKey({
        operation: DISCOVERY_EXECUTION_OPERATION,
        runId: context.run.id,
        handlerVersion: PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
        step: PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
      });
      const prepared = await context.effect(PARTNERSHIPS_PREPARE_EFFECT_STEP, {
        executionRunId: context.run.id,
        assignmentEffectKey,
        command,
      });
      const assigned = await context.effect(
        PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
        {
          executionRunId: context.run.id,
          assignmentEffectKey,
          slug: command.slug,
          searchId: command.searchId,
          campaignId: command.campaignId,
          credentialRef: command.yalc.credentialRef,
          targetBindingFingerprint: command.yalc.targetBindingFingerprint,
          artifactStore: prepared.artifactStore,
          artifactFingerprint: prepared.artifactFingerprint,
          qualifiedCount: prepared.qualifiedCount,
          totalQuality: prepared.totalQuality,
          invalid: prepared.invalid,
          filtered: prepared.filtered,
        },
      );
      return {
        status: "completed",
        currentStep: "verify",
        output: {
          completionBoundary: "partnerships_discovery_completed",
          stats: assigned.stats,
        },
        eventType: "partnerships.discovery.completed",
        eventData: {
          completionBoundary: "partnerships_discovery_completed",
          executionVersion: 2,
        },
      };
    },
    classifyPureError(error) {
      return {
        code:
          error instanceof Error && "code" in error
            ? String((error as Error & { code: unknown }).code)
            : "partnerships_discovery_v2_contract_invalid",
        retryable: false,
        message: "Partnerships discovery failed closed at a pure boundary",
      };
    },
    projectTerminal(run, command) {
      return dependencies.projectTerminal?.(run, command);
    },
  };
}

export function partnershipsCommandSnapshot(
  command: PartnershipsDiscoveryCommandV2,
): DiscoveryExecutionSnapshot {
  return command as unknown as DiscoveryExecutionSnapshot;
}

export function partnershipsStatsFromV2(
  stats: PartnershipsDiscoveryStatsV2,
): DiscoveryRunnerStats {
  return stats as unknown as DiscoveryRunnerStats;
}
