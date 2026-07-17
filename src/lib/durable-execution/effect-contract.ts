import type {
  ExecutionLeaseScope,
  ExecutionRun,
} from "@/lib/execution-control";
import type {
  DurableExecutionErrorDecision,
  DurableExecutionTerminalProjectionContext,
  DurableExecutionReconciliationContext,
  DurableExecutionResult,
} from "./runtime";
import { DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 } from "./contract";
import {
  DURABLE_JSON_GLOBAL_BOUNDS,
  canonicalDurableJson,
  type DurableJson,
  type DurableJsonBounds,
  type DurableJsonContract,
  type DurableJsonObject,
  type DurableSecretPolicy,
  type ParsedDurableJsonContractValue,
  DurableJsonValidationError,
  isDurableJsonObject,
  parseDurableJsonContractValue,
  validateDurableJsonContractDescriptor,
} from "./json-contract";
import { createHash } from "node:crypto";

export type DurableEffectSafety =
  | {
      kind: "read_only";
      retry: "bounded";
    }
  | {
      kind: "target_idempotency";
      delivery: "at_least_once_attempts";
      keyPlacement: "header" | "body" | "path";
      replay: "same_key_same_payload";
    }
  | {
      kind: "reconcile_before_replay";
      delivery: "at_least_once_attempts";
      lookup: "by_effect_key";
      absenceMustBeAuthoritative: true;
    };

export type DurableReadOnlyEffectSafety = Extract<
  DurableEffectSafety,
  { kind: "read_only" }
>;

export type DurableMutatingEffectSafety = Exclude<
  DurableEffectSafety,
  DurableReadOnlyEffectSafety
>;

export interface DurableEffectRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: "full";
}

export type DurableEffectErrorClassification =
  | {
      kind: "definitive_rejection";
      code: string;
      retryable: boolean;
    }
  | {
      kind: "outcome_unknown";
      code: string;
    };

export type DurableEffectReconcileResult<Receipt extends DurableJsonObject> =
  | { kind: "found"; receipt: Receipt }
  | { kind: "not_found" }
  | { kind: "conflict"; code: string }
  | { kind: "unknown"; retryAfterMs?: number };

export interface CapabilityCredentialProvider {
  resolve(credentialRef: string): Promise<Readonly<Record<string, string>>>;
}

export interface DurableEffectInvocationContext {
  effectKey: string;
  signal: AbortSignal;
  deadlineAt: string;
  tenantKey: string;
  credentials: CapabilityCredentialProvider;
}

export type DurableEffectReconcileContext = DurableEffectInvocationContext;

interface DurableEffectDefinitionBase<
  Payload extends DurableJson,
  Receipt extends DurableJsonObject,
> {
  step: string;
  definitionVersion: number;
  capability: string;
  payload: DurableJsonContract<Payload>;
  receipt: DurableJsonContract<Receipt>;
  retry: DurableEffectRetryPolicy;
  timeoutMs: number;
  invoke(
    payload: Payload,
    context: DurableEffectInvocationContext,
  ): Promise<unknown>;
  classify(error: unknown): DurableEffectErrorClassification;
}

/**
 * Read-only effects can be retried from the request itself. Every mutating
 * effect must also declare an authoritative lookup at registration time so
 * cancellation and ambiguous outcomes never depend on process memory alone.
 */
export type DurableEffectDefinition<
  Payload extends DurableJson,
  Receipt extends DurableJsonObject,
> = DurableEffectDefinitionBase<Payload, Receipt> &
  (
    | {
        safety: DurableReadOnlyEffectSafety;
        reconcile?(
          payload: Payload,
          context: DurableEffectReconcileContext,
        ): Promise<DurableEffectReconcileResult<Receipt>>;
      }
    | {
        safety: DurableMutatingEffectSafety;
        reconcile(
          payload: Payload,
          context: DurableEffectReconcileContext,
        ): Promise<DurableEffectReconcileResult<Receipt>>;
      }
  );

export type AnyDurableEffectDefinition = DurableEffectDefinition<
  DurableJson,
  DurableJsonObject
>;

export type DurableEffectMap = Record<string, AnyDurableEffectDefinition>;

export type PayloadOf<D> =
  D extends DurableEffectDefinition<infer Payload, DurableJsonObject>
    ? Payload
    : never;

export type ReceiptOf<D> =
  D extends DurableEffectDefinition<DurableJson, infer Receipt>
    ? Receipt
    : never;

export interface DurableExecutionContextV2<
  Effects extends DurableEffectMap,
  Checkpoint extends DurableJson,
> {
  readonly contractVersion: typeof DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2;
  readonly delivery: "at_least_once_attempts";
  readonly run: ExecutionRun;
  readonly scope: ExecutionLeaseScope;
  readonly signal: AbortSignal;
  readonly deadlineAt: string;
  effect<K extends keyof Effects & string>(
    step: K,
    payload: PayloadOf<Effects[K]>,
  ): Promise<ReceiptOf<Effects[K]>>;
  checkpoint(
    currentStep: string,
    output: Checkpoint,
    event?: { type: string; data?: DurableJson },
  ): Promise<void>;
  assertLease(): Promise<void>;
  isCancellationRequested(): Promise<boolean>;
  now(): Date;
}

export interface DurableExecutionHandlerV2<
  Command extends DurableJson = DurableJson,
  Checkpoint extends DurableJson = DurableJson,
  Result extends DurableJson = DurableJson,
  Effects extends DurableEffectMap = DurableEffectMap,
> {
  contractVersion: typeof DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2;
  operation: string;
  version: number;
  command: DurableJsonContract<Command>;
  checkpoint: DurableJsonContract<Checkpoint>;
  result: DurableJsonContract<Result>;
  effects: Effects;
  execute(
    command: Command,
    context: DurableExecutionContextV2<Effects, Checkpoint>,
  ): Promise<DurableExecutionResult<Result>>;
  classifyPureError(
    error: unknown,
    phase: "command" | "checkpoint" | "projection",
  ): DurableExecutionErrorDecision;
  projectTerminal(
    run: ExecutionRun,
    command: Command,
    context: DurableExecutionTerminalProjectionContext,
  ): Promise<void> | void;
  reconcileTerminal?(
    scope: ExecutionLeaseScope,
    context: DurableExecutionReconciliationContext,
  ): Promise<number | void>;
}

export type DurableEffectDefinitionValidationReason =
  | "definition_shape"
  | "step"
  | "definition_version"
  | "capability"
  | "payload_contract"
  | "receipt_contract"
  | "safety"
  | "retry"
  | "timeout"
  | "invoke"
  | "reconcile"
  | "classify";

export class DurableEffectDefinitionValidationError extends Error {
  readonly code = "durable_effect_definition_invalid" as const;

  constructor(readonly reason: DurableEffectDefinitionValidationReason) {
    super(`Durable effect definition is invalid (${reason})`);
    this.name = "DurableEffectDefinitionValidationError";
  }
}

export interface DurableEffectPolicyDescriptor {
  step: string;
  definitionVersion: number;
  capability: string;
  payload: {
    schemaVersion: number;
    bounds: DurableJsonBounds;
    secrets: {
      mode: "reject";
      credentialRefPattern: { source: string; flags: string } | null;
    };
  };
  receipt: {
    schemaVersion: number;
    bounds: DurableJsonBounds;
    secrets: {
      mode: "reject";
      credentialRefPattern: { source: string; flags: string } | null;
    };
  };
  safety: DurableEffectSafety;
  reconciliation: {
    required: boolean;
    configured: boolean;
  };
  retry: DurableEffectRetryPolicy;
  timeoutMs: number;
}

const STEP_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const DEFINITION_KEYS = new Set([
  "step",
  "definitionVersion",
  "capability",
  "payload",
  "receipt",
  "safety",
  "retry",
  "timeoutMs",
  "invoke",
  "reconcile",
  "classify",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: unknown,
  required: readonly string[],
): value is Record<string, unknown> {
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === required.length &&
    keys.every((key) => required.includes(key))
  );
}

function positiveVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validSafety(value: unknown): value is DurableEffectSafety {
  if (!isPlainRecord(value)) return false;
  if (value.kind === "read_only") {
    return hasExactKeys(value, ["kind", "retry"]) && value.retry === "bounded";
  }
  if (value.kind === "target_idempotency") {
    return (
      hasExactKeys(value, ["kind", "delivery", "keyPlacement", "replay"]) &&
      value.delivery === "at_least_once_attempts" &&
      (value.keyPlacement === "header" ||
        value.keyPlacement === "body" ||
        value.keyPlacement === "path") &&
      value.replay === "same_key_same_payload"
    );
  }
  if (value.kind === "reconcile_before_replay") {
    return (
      hasExactKeys(value, [
        "kind",
        "delivery",
        "lookup",
        "absenceMustBeAuthoritative",
      ]) &&
      value.delivery === "at_least_once_attempts" &&
      value.lookup === "by_effect_key" &&
      value.absenceMustBeAuthoritative === true
    );
  }
  return false;
}

function validRetry(value: unknown): value is DurableEffectRetryPolicy {
  return (
    hasExactKeys(value, [
      "maxAttempts",
      "baseDelayMs",
      "maxDelayMs",
      "jitter",
    ]) &&
    Number.isSafeInteger(value.maxAttempts) &&
    (value.maxAttempts as number) >= 1 &&
    (value.maxAttempts as number) <= 10 &&
    Number.isSafeInteger(value.baseDelayMs) &&
    (value.baseDelayMs as number) >= 1_000 &&
    Number.isSafeInteger(value.maxDelayMs) &&
    (value.maxDelayMs as number) >= (value.baseDelayMs as number) &&
    (value.maxDelayMs as number) <= 3_600_000 &&
    value.jitter === "full"
  );
}

function secretDescriptor(policy: DurableSecretPolicy): {
  mode: "reject";
  credentialRefPattern: { source: string; flags: string } | null;
} {
  return {
    mode: "reject",
    credentialRefPattern: policy.credentialRefPattern
      ? {
          source: policy.credentialRefPattern.source,
          flags: [...policy.credentialRefPattern.flags].sort().join(""),
        }
      : null,
  };
}

function contractDescriptor<T extends DurableJson>(
  contract: DurableJsonContract<T>,
): DurableEffectPolicyDescriptor["payload"] {
  return {
    schemaVersion: contract.schemaVersion,
    bounds: {
      maxBytes: contract.bounds.maxBytes,
      maxDepth: contract.bounds.maxDepth,
      maxNodes: contract.bounds.maxNodes,
      maxStringBytes: contract.bounds.maxStringBytes,
      maxArrayItems: contract.bounds.maxArrayItems,
      maxObjectKeys: contract.bounds.maxObjectKeys,
    },
    secrets: secretDescriptor(contract.secrets),
  };
}

export function validateDurableEffectDefinition(
  definition: AnyDurableEffectDefinition,
  mapStep?: string,
): void {
  if (
    !isPlainRecord(definition) ||
    Object.getOwnPropertySymbols(definition).length > 0 ||
    Object.keys(definition).some((key) => !DEFINITION_KEYS.has(key))
  ) {
    throw new DurableEffectDefinitionValidationError("definition_shape");
  }
  if (
    typeof definition.step !== "string" ||
    !STEP_PATTERN.test(definition.step) ||
    (mapStep !== undefined && mapStep !== definition.step)
  ) {
    throw new DurableEffectDefinitionValidationError("step");
  }
  if (!positiveVersion(definition.definitionVersion)) {
    throw new DurableEffectDefinitionValidationError("definition_version");
  }
  if (
    typeof definition.capability !== "string" ||
    !CAPABILITY_PATTERN.test(definition.capability)
  ) {
    throw new DurableEffectDefinitionValidationError("capability");
  }
  try {
    validateDurableJsonContractDescriptor(definition.payload, "effect_payload");
  } catch {
    throw new DurableEffectDefinitionValidationError("payload_contract");
  }
  try {
    validateDurableJsonContractDescriptor(definition.receipt, "effect_receipt");
  } catch {
    throw new DurableEffectDefinitionValidationError("receipt_contract");
  }
  if (!validSafety(definition.safety)) {
    throw new DurableEffectDefinitionValidationError("safety");
  }
  if (!validRetry(definition.retry)) {
    throw new DurableEffectDefinitionValidationError("retry");
  }
  if (
    !Number.isSafeInteger(definition.timeoutMs) ||
    definition.timeoutMs < 1_000 ||
    definition.timeoutMs > 300_000
  ) {
    throw new DurableEffectDefinitionValidationError("timeout");
  }
  if (typeof definition.invoke !== "function") {
    throw new DurableEffectDefinitionValidationError("invoke");
  }
  if (
    definition.reconcile !== undefined &&
    typeof definition.reconcile !== "function"
  ) {
    throw new DurableEffectDefinitionValidationError("reconcile");
  }
  if (
    definition.safety.kind !== "read_only" &&
    typeof definition.reconcile !== "function"
  ) {
    throw new DurableEffectDefinitionValidationError("reconcile");
  }
  if (typeof definition.classify !== "function") {
    throw new DurableEffectDefinitionValidationError("classify");
  }
}

export function durableEffectPolicyDescriptor(
  definition: AnyDurableEffectDefinition,
): DurableEffectPolicyDescriptor {
  validateDurableEffectDefinition(definition);
  return {
    step: definition.step,
    definitionVersion: definition.definitionVersion,
    capability: definition.capability,
    payload: contractDescriptor(definition.payload),
    receipt: contractDescriptor(definition.receipt),
    safety: { ...definition.safety },
    reconciliation: {
      required: definition.safety.kind !== "read_only",
      configured: typeof definition.reconcile === "function",
    },
    retry: { ...definition.retry },
    timeoutMs: definition.timeoutMs,
  };
}

/**
 * Mandatory executor boundary for remote receipts. PostgreSQL accepts only a
 * closed JSON object, so a scalar/array parser result must fail before the
 * fenced completion statement rather than surfacing as a database constraint
 * error after the remote side may already have committed.
 */
export function parseDurableEffectReceipt<
  Payload extends DurableJson,
  Receipt extends DurableJsonObject,
>(
  definition: DurableEffectDefinition<Payload, Receipt>,
  rawReceipt: unknown,
): ParsedDurableJsonContractValue<Receipt> {
  const parsed = parseDurableJsonContractValue(
    definition.receipt,
    rawReceipt,
    "effect_receipt",
  );
  if (!isDurableJsonObject(parsed.value)) {
    throw new DurableJsonValidationError(
      "durable_json_schema_invalid",
      "Durable effect receipt must be a closed JSON object",
    );
  }
  return parsed;
}

/** Functions are intentionally excluded; versioning makes code changes explicit. */
export function durableEffectPolicyFingerprint(
  definition: AnyDurableEffectDefinition,
): string {
  const descriptor = durableEffectPolicyDescriptor(definition);
  return createHash("sha256")
    .update(
      canonicalDurableJson(
        descriptor as unknown as DurableJson,
        DURABLE_JSON_GLOBAL_BOUNDS.effect_payload,
      ),
      "utf8",
    )
    .digest("hex");
}

export function validateDurableEffectErrorClassification(
  value: unknown,
): value is DurableEffectErrorClassification {
  if (!isPlainRecord(value)) return false;
  if (value.kind === "definitive_rejection") {
    return (
      hasExactKeys(value, ["kind", "code", "retryable"]) &&
      typeof value.code === "string" &&
      ERROR_CODE_PATTERN.test(value.code) &&
      typeof value.retryable === "boolean"
    );
  }
  return (
    value.kind === "outcome_unknown" &&
    hasExactKeys(value, ["kind", "code"]) &&
    typeof value.code === "string" &&
    ERROR_CODE_PATTERN.test(value.code)
  );
}
