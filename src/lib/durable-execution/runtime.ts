import { randomUUID } from "node:crypto";
import type {
  ExecutionCancellationControlRepository,
  ExecutionControlRepository,
  ExecutionEffectControlRepository,
  ExecutionLeaseReceipt,
  ExecutionLeaseScope,
  ExecutionRun,
  ExecutionRunBlockReasonCode,
  ExecutionTerminalProjection,
  ExecutionTerminalProjectionControlRepository,
  ExecutionTerminalProjectionLeaseReceipt,
} from "@/lib/execution-control";
import { sanitizeSupportBundle } from "@/lib/support/redaction";
import {
  ExecutionLeaseLostError,
  type ExecutionHeartbeatScheduler,
  exponentialRetryDelayMs,
  FencedExecutionLease,
} from "./leased-worker";
import {
  DurableEffectPolicyDriftError,
  DurableExecutionHandlerContractMismatchError,
  DurableExecutionHandlerPolicyDriftError,
  DurableExecutionPolicyMismatchError,
  DurableExecutionRegistry,
  InvalidDurableExecutionHandlerVersionError,
  UnknownDurableExecutionHandlerError,
  UnsupportedDurableExecutionHandlerContractError,
  type RegisteredDurableExecutionHandler,
} from "./registry";
import {
  ExecutionTerminalProjectionLeaseLostError,
  FencedTerminalProjectionLease,
} from "./terminal-projection";
import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
  type DurableExecutionHandlerContractVersion,
} from "./contract";
import {
  DurableCancellationPendingError,
  DurableCancellationStopError,
  DurableEffectExecutor,
  DurableEffectRetryScheduledError,
  DurableEffectRuntimeUnavailableError,
  DurableEffectTerminalError,
  type DurableCapabilityPolicy,
} from "./effect-executor";
import type {
  CapabilityCredentialProvider,
  DurableExecutionContextV2,
  DurableExecutionHandlerV2,
} from "./effect-contract";
import {
  DURABLE_JSON_GLOBAL_BOUNDS,
  parseDurableJsonContractValue,
  validateDurableJson,
  type DurableJson,
  type DurableJsonObject,
} from "./json-contract";
import {
  isDurableExecutionWorkerCapacityError,
  isDurableExecutionWorkerScopeReservedError,
  processDurableExecutionWorkerCapacityLimiter,
  type DurableExecutionWorkerCapacityLimiter,
  type DurableExecutionWorkerCapacityReport,
  type DurableExecutionWorkerCapacityReservation,
} from "./worker-capacity";

export {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  type DurableExecutionHandlerContractVersion,
} from "./contract";

export type DurableExecutionHandlerVersion = number;
export type DurableExecutionDelivery = "at-least-once";

const DEFAULT_HANDLER_TIMEOUT_MS = 120_000;
const MAX_HANDLER_TIMEOUT_MS = 3_600_000;
export const MAX_TERMINAL_PROJECTION_DELIVERY_CLAIMS = 100 as const;

export class DurableExecutionDeadlineExceededError extends Error {
  readonly code = "durable_execution_deadline_exceeded";

  constructor(readonly deadlineAt: string) {
    super("Durable execution handler exceeded its bounded deadline");
    this.name = "DurableExecutionDeadlineExceededError";
  }
}

export class DurableExecutionInterruptedError extends Error {
  readonly code = "durable_execution_interrupted";

  constructor() {
    super("Durable execution handler was interrupted by worker shutdown");
    this.name = "DurableExecutionInterruptedError";
  }
}

export class DurableExecutionCommandMismatchError extends Error {
  readonly code = "durable_execution_command_mismatch" as const;

  constructor() {
    super("Durable execution command does not match its admitted contract");
    this.name = "DurableExecutionCommandMismatchError";
  }
}

export class DurableExecutionBlockAuthorityUnavailableError extends Error {
  readonly code = "durable_execution_block_authority_unavailable" as const;

  constructor() {
    super("Durable execution block authority is unavailable");
    this.name = "DurableExecutionBlockAuthorityUnavailableError";
  }
}

export class DurableExecutionBlockedError extends Error {
  readonly code = "durable_execution_blocked" as const;

  constructor(readonly reasonCode: ExecutionRunBlockReasonCode) {
    super(`Durable execution is blocked (${reasonCode})`);
    this.name = "DurableExecutionBlockedError";
  }
}

export interface DurableExecutionResult<Result = unknown> {
  status?: "completed" | "partial";
  currentStep?: string;
  output?: Result;
  eventType?: string;
  eventData?: unknown;
}

export interface DurableExecutionErrorDecision {
  code: string;
  retryable: boolean;
  /**
   * `retry_until_cancelled` is reserved for durable infrastructure/dependency
   * work that must remain recoverable until an operator cancels the queued run.
   * Product/command errors should use the default bounded `fail` behavior.
   */
  exhaustion?: "fail" | "retry_until_cancelled";
  message: string;
  /** Optional bounded, non-secret terminal diagnostic projection. */
  output?: unknown;
  eventData?: unknown;
}

export interface DurableExecutionCheckpoint {
  output?: unknown;
  eventType?: string;
  eventData?: unknown;
}

export interface DurableExecutionContext {
  readonly contractVersion: typeof DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION;
  readonly delivery: DurableExecutionDelivery;
  readonly run: ExecutionRun;
  readonly scope: ExecutionLeaseScope;
  readonly recovered: boolean;
  /** Effect-bearing handler attempts; excludes unsupported-version claims. */
  readonly attempt: number;
  /** Raw lease claims, retained only as infrastructure diagnostics. */
  readonly claimCount: number;
  /**
   * Cooperative cancellation boundary. Adapters must pass this signal to
   * external clients and stop local phases when it aborts. The runtime also
   * races execute() against it, so a non-cooperating Promise cannot pin a
   * worker drain or process shutdown indefinitely.
   */
  readonly signal: AbortSignal;
  /** Absolute application-clock deadline paired with `signal`. */
  readonly deadlineAt: string;
  /** Stable for one immutable run + logical effect step across every retry. */
  effectKey(step: string): string;
  /** Fenced Ledger checkpoint. A stale owner receives ExecutionLeaseLostError. */
  checkpoint(
    currentStep: string,
    checkpoint?: DurableExecutionCheckpoint,
  ): Promise<void>;
  /** Explicit fence check for long product-side phases. */
  assertLease(): Promise<void>;
  now(): Date;
}

export interface DurableExecutionClassificationContext<Command = unknown> {
  run: ExecutionRun;
  command?: Command;
  phase: "decode" | "execute";
}

export interface DurableExecutionProjectionContext {
  readonly delivery: DurableExecutionDelivery;
  readonly scope: ExecutionLeaseScope;
  /** Projection/reconciliation lifecycle boundary; external I/O is forbidden. */
  readonly signal: AbortSignal;
  readonly deadlineAt: string;
  effectKey(run: Pick<ExecutionRun, "id" | "operation">, step: string): string;
  now(): Date;
}

/** Fenced delivery context. Reconciliation is read-only and has no lease. */
export interface DurableExecutionTerminalProjectionContext extends DurableExecutionProjectionContext {
  /** Revalidate database ownership immediately before each product mutation. */
  assertLease(): Promise<void>;
}

export interface DurableExecutionReconciliationContext extends DurableExecutionProjectionContext {
  /** Read-only, tenant + operation scoped Ledger lookup. */
  getRunByAggregate(input: {
    aggregateType: string;
    aggregateId: string;
  }): Promise<ExecutionRun | null>;
  getRunById(runId: string): Promise<ExecutionRun | null>;
}

/**
 * Product adapter. It never receives the mutable Ledger repository or lease
 * token: every command-side Ledger mutation must pass through fenced context.
 */
export interface DurableExecutionHandler<Command = unknown, Result = unknown> {
  contractVersion: typeof DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION;
  operation: string;
  version: DurableExecutionHandlerVersion;
  decode(run: ExecutionRun): Command;
  execute(
    command: Command,
    context: DurableExecutionContext,
  ): Promise<DurableExecutionResult<Result>>;
  classifyError(
    error: unknown,
    context: DurableExecutionClassificationContext<Command>,
  ): DurableExecutionErrorDecision;
  /** Called only after the fenced terminal Ledger mutation succeeds. */
  projectTerminal(
    run: ExecutionRun,
    command: Command,
    context: DurableExecutionProjectionContext,
  ): Promise<void> | void;
  /** Repair terminal product projections without re-running external effects. */
  reconcileTerminal?(
    scope: ExecutionLeaseScope,
    context: DurableExecutionReconciliationContext,
  ): Promise<number | void>;
}

export type DurableExecutionOutcomeKind =
  | "idle"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "cancellation_pending"
  | "requeued"
  | "handler_unavailable"
  | "blocked"
  | "lease_lost"
  | "projection_pending"
  | "projection_blocked";

export interface DurableExecutionOutcome {
  kind: DurableExecutionOutcomeKind;
  runId?: string;
  blockReasonCode?: ExecutionRunBlockReasonCode;
  blockedAt?: string;
  error?: SanitizedDurableExecutionError;
}

export interface SanitizedDurableExecutionError {
  name: string;
  message: string;
  at: string;
}

export interface DurableExecutionScheduler {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
  queueMicrotask(callback: () => void): void;
}

export interface DurableExecutionDeadlineScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Optional, synchronous authority checked before a worker starts or continues
 * a drain. A false/throwing decision only suspends new claims; it never aborts
 * a handler that already started.
 */
export interface DurableExecutionDrainPolicy {
  mayDrain(scope: Readonly<ExecutionLeaseScope>): boolean;
}

const defaultScheduler: DurableExecutionScheduler = {
  setInterval: (callback, delayMs) => {
    const timer = setInterval(callback, delayMs);
    timer.unref?.();
    return timer;
  },
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
  queueMicrotask,
};

const defaultDeadlineScheduler: DurableExecutionDeadlineScheduler = {
  setTimeout: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.();
    return timer;
  },
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface DurableExecutionEngineOptions {
  repository: ExecutionControlRepository;
  /** Explicit contract-v2 authority. Missing capabilities fail closed. */
  effectRepository?: ExecutionEffectControlRepository;
  /** Exact-scope cooperative cancellation authority required by contract v2. */
  cancellationRepository?: ExecutionCancellationControlRepository;
  /** Durable terminal callback delivery; inferred from repository when present. */
  projectionRepository?: ExecutionTerminalProjectionControlRepository;
  /** No implicit allow policy exists for contract-v2 capabilities. */
  capabilityPolicy?: DurableCapabilityPolicy;
  /** Dynamic process authority for starting new claims. */
  drainPolicy?: DurableExecutionDrainPolicy;
  credentialProvider?: CapabilityCredentialProvider;
  registry: DurableExecutionRegistry;
  scope: ExecutionLeaseScope;
  workerId: string;
  leaseMs: number;
  maxAttempts: number;
  retryBaseMs?: number;
  retryMaximumMs?: number;
  /** Retry base for projection callbacks; defaults to the command retry base. */
  projectionRetryBaseMs?: number;
  /** Retry cap for projection callbacks; defaults to the command retry cap. */
  projectionRetryMaximumMs?: number;
  /** Hard wall-clock bound for one handler.execute invocation. */
  handlerTimeoutMs?: number;
  heartbeatScheduler?: ExecutionHeartbeatScheduler;
  deadlineScheduler?: DurableExecutionDeadlineScheduler;
  effectRandom?: () => number;
  capabilityRetryMs?: number;
  now?: () => Date;
}

function normalizedScope(scope: ExecutionLeaseScope): ExecutionLeaseScope {
  const tenantKey = scope.tenantKey.trim().toLowerCase();
  const operation = scope.operation.trim().toLowerCase();
  if (!tenantKey || !operation) {
    throw new Error("Durable execution scope requires tenantKey and operation");
  }
  return { tenantKey, operation, mode: scope.mode };
}

function boundedDrainBudget(
  value: number | undefined,
  field: "maxClaimsPerDrain" | "maxProjectionClaimsPerDrain",
): number {
  const candidate = value ?? 10;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > 100) {
    throw new Error(`${field} must be an integer from 1 to 100`);
  }
  return candidate;
}

export function durableExecutionScopeKey(scope: ExecutionLeaseScope): string {
  const value = normalizedScope(scope);
  return `${value.tenantKey}\u0000${value.operation}\u0000${value.mode}`;
}

function normalizedEffectStep(step: string): string {
  const value = step
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!value) throw new Error("Durable effect step cannot be empty");
  return value;
}

export function durableExecutionEffectKey(input: {
  operation: string;
  runId: string;
  handlerVersion: number;
  step: string;
}): string {
  return `${input.operation.trim().toLowerCase()}:run:${input.runId}:step:${normalizedEffectStep(input.step)}:v${input.handlerVersion}`;
}

function safeValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  return sanitizeSupportBundle(value, { destination: "internal" }).value;
}

/**
 * Durable product state must round-trip exactly as JSON. Redaction is for
 * diagnostics/events; applying it to checkpoints changes undefined fields and
 * breaks replay integrity.
 */
function durableJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Durable execution output must be JSON serializable");
  }
  return JSON.parse(serialized) as unknown;
}

const V2_RESULT_KEYS = new Set([
  "status",
  "currentStep",
  "output",
  "eventType",
  "eventData",
]);
const V2_LABEL_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function v2RuntimeLabel(value: unknown, field: string): string {
  if (typeof value !== "string" || !V2_LABEL_PATTERN.test(value)) {
    throw new Error(`Durable execution v2 ${field} is invalid`);
  }
  return value;
}

function validateV2Result(
  handler: DurableExecutionHandlerV2,
  rawResult: unknown,
): DurableExecutionResult<DurableJson> {
  if (
    !rawResult ||
    typeof rawResult !== "object" ||
    Array.isArray(rawResult) ||
    Object.getPrototypeOf(rawResult) !== Object.prototype ||
    Object.getOwnPropertySymbols(rawResult).length > 0 ||
    Object.keys(rawResult).some((key) => !V2_RESULT_KEYS.has(key))
  ) {
    throw new Error("Durable execution v2 result envelope is invalid");
  }
  const candidate = rawResult as Record<string, unknown>;
  if (
    hasOwn(candidate, "status") &&
    candidate.status !== "completed" &&
    candidate.status !== "partial"
  ) {
    throw new Error("Durable execution v2 result status is invalid");
  }
  const result: DurableExecutionResult<DurableJson> = {};
  if (candidate.status === "completed" || candidate.status === "partial") {
    result.status = candidate.status;
  }
  if (hasOwn(candidate, "currentStep")) {
    result.currentStep = v2RuntimeLabel(candidate.currentStep, "currentStep");
  }
  if (hasOwn(candidate, "eventType")) {
    result.eventType = v2RuntimeLabel(candidate.eventType, "eventType");
  }
  if (hasOwn(candidate, "output")) {
    result.output = parseDurableJsonContractValue(
      handler.result,
      candidate.output,
      "checkpoint",
    ).value;
  }
  if (hasOwn(candidate, "eventData")) {
    result.eventData = validateDurableJson(candidate.eventData, {
      bounds: DURABLE_JSON_GLOBAL_BOUNDS.event_data,
      secrets: { mode: "reject" },
    }).value;
  }
  return result;
}

function sanitizedMessage(value: unknown): string {
  return String(safeValue(value));
}

function sanitizedError(
  error: unknown,
  now: Date,
): SanitizedDurableExecutionError {
  const name =
    error instanceof Error && error.name ? error.name : "UnknownError";
  const message =
    error instanceof Error ? error.message : "Durable execution failed";
  return {
    name: sanitizedMessage(name),
    message: sanitizedMessage(message),
    at: now.toISOString(),
  };
}

function safeDecision(
  decision: DurableExecutionErrorDecision,
): DurableExecutionErrorDecision {
  let code = sanitizedMessage(decision.code)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (code && !/^[a-z]/.test(code)) code = `error_${code}`;
  code = code.slice(0, 128);
  return {
    code: code || "execution_failed",
    retryable: decision.retryable === true,
    exhaustion:
      decision.exhaustion === "retry_until_cancelled"
        ? "retry_until_cancelled"
        : "fail",
    message: sanitizedMessage(decision.message || "Durable execution failed"),
    ...(Object.prototype.hasOwnProperty.call(decision, "output")
      ? { output: safeValue(decision.output) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(decision, "eventData")
      ? { eventData: safeValue(decision.eventData) }
      : {}),
  };
}

function receiptMatchesScope(
  receipt: ExecutionLeaseReceipt,
  scope: ExecutionLeaseScope,
): boolean {
  return runMatchesScope(receipt.run, scope);
}

function runMatchesScope(
  run: ExecutionRun,
  scope: ExecutionLeaseScope,
): boolean {
  return (
    run.tenantKey.trim().toLowerCase() === scope.tenantKey &&
    run.operation.trim().toLowerCase() === scope.operation &&
    run.mode === scope.mode
  );
}

function projectionMatchesScope(
  receipt: ExecutionTerminalProjectionLeaseReceipt,
  scope: ExecutionLeaseScope,
): boolean {
  const projection = receipt.projection;
  return (
    projection.tenantKey.trim().toLowerCase() === scope.tenantKey &&
    projection.operation.trim().toLowerCase() === scope.operation &&
    projection.mode === scope.mode &&
    projection.runId === receipt.run.id &&
    runMatchesScope(receipt.run, scope)
  );
}

function isTerminalExecutionRun(run: ExecutionRun): run is ExecutionRun & {
  status: "completed" | "partial" | "failed" | "cancelled";
} {
  return (
    run.status === "completed" ||
    run.status === "partial" ||
    run.status === "failed" ||
    run.status === "cancelled"
  );
}

function isManagedV2Run(run: ExecutionRun): boolean {
  return (
    run.metadata.authority === "execution_ledger_v2" &&
    run.metadata.executionContractVersion ===
      DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 &&
    (run.mode === "canary" || run.mode === "active")
  );
}

function isUnknownHandlerError(
  error: unknown,
): error is UnknownDurableExecutionHandlerError {
  return (
    error instanceof UnknownDurableExecutionHandlerError ||
    (error instanceof Error &&
      error.name === "UnknownDurableExecutionHandlerError")
  );
}

function executionRunBlockReason(
  error: unknown,
): ExecutionRunBlockReasonCode | null {
  const name = error instanceof Error ? error.name : undefined;
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  // Test/runtime loaders can materialize the registry through different module
  // specifiers. Stable error names/codes are part of the internal contract, so
  // do not make durable state classification depend only on class identity.
  if (
    error instanceof InvalidDurableExecutionHandlerVersionError ||
    name === "InvalidDurableExecutionHandlerVersionError" ||
    code === "durable_execution_handler_version_invalid"
  ) {
    return "handler_version_invalid";
  }
  if (
    error instanceof UnsupportedDurableExecutionHandlerContractError ||
    name === "UnsupportedDurableExecutionHandlerContractError"
  ) {
    return "handler_contract_unsupported";
  }
  if (
    error instanceof DurableExecutionHandlerContractMismatchError ||
    name === "DurableExecutionHandlerContractMismatchError" ||
    code === "durable_execution_handler_contract_mismatch"
  ) {
    return "handler_contract_mismatch";
  }
  if (
    error instanceof DurableExecutionPolicyMismatchError ||
    error instanceof DurableEffectPolicyDriftError ||
    error instanceof DurableExecutionHandlerPolicyDriftError ||
    name === "DurableExecutionPolicyMismatchError" ||
    name === "DurableEffectPolicyDriftError" ||
    name === "DurableExecutionHandlerPolicyDriftError" ||
    code === "durable_execution_policy_mismatch" ||
    code === "durable_effect_policy_drift" ||
    code === "durable_execution_handler_policy_drift"
  ) {
    return "execution_policy_mismatch";
  }
  if (
    error instanceof DurableExecutionCommandMismatchError ||
    name === "DurableExecutionCommandMismatchError" ||
    code === "durable_execution_command_mismatch"
  ) {
    return "command_contract_mismatch";
  }
  if (
    error instanceof DurableEffectRuntimeUnavailableError ||
    name === "DurableEffectRuntimeUnavailableError"
  ) {
    return "runtime_authority_unavailable";
  }
  return null;
}

function terminalOutcomeKind(
  projection: Pick<ExecutionTerminalProjection, "terminalStatus">,
): Extract<
  DurableExecutionOutcomeKind,
  "completed" | "partial" | "failed" | "cancelled"
> {
  return projection.terminalStatus;
}

export class DurableTerminalProjectionCorruptionError extends Error {
  constructor(readonly code: string) {
    super(`Durable terminal projection is blocked (${code})`);
    this.name = "DurableTerminalProjectionCorruptionError";
  }
}

export class DurableTerminalProjectionMissingError extends Error {
  readonly code = "terminal_projection_missing" as const;

  constructor() {
    super("Managed terminal run has no durable projection obligation");
    this.name = "DurableTerminalProjectionMissingError";
  }
}

/** One exact-scope claim engine; it has no product-specific polling policy. */
export class DurableExecutionEngine {
  readonly scope: ExecutionLeaseScope;
  private readonly now: () => Date;
  private readonly handlerTimeoutMs: number;
  private readonly deadlineScheduler: DurableExecutionDeadlineScheduler;

  constructor(private readonly options: DurableExecutionEngineOptions) {
    this.scope = normalizedScope(options.scope);
    if (!options.registry.hasOperation(this.scope.operation)) {
      throw new UnknownDurableExecutionHandlerError(this.scope.operation);
    }
    if (
      options.registry
        .registeredHandlersForOperation(this.scope.operation)
        .some(
          (handler) =>
            handler.contractVersion ===
            DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
        ) &&
      typeof options.repository.blockRun !== "function"
    ) {
      throw new DurableExecutionBlockAuthorityUnavailableError();
    }
    if (!options.workerId.trim()) throw new Error("workerId cannot be empty");
    if (!Number.isFinite(options.leaseMs) || options.leaseMs < 1_000) {
      throw new Error("leaseMs must be at least 1000");
    }
    if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1) {
      throw new Error("maxAttempts must be a positive integer");
    }
    const handlerTimeoutMs =
      options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
    if (
      !Number.isSafeInteger(handlerTimeoutMs) ||
      handlerTimeoutMs < 1_000 ||
      handlerTimeoutMs > MAX_HANDLER_TIMEOUT_MS
    ) {
      throw new Error(
        `handlerTimeoutMs must be an integer from 1000 to ${MAX_HANDLER_TIMEOUT_MS}`,
      );
    }
    this.handlerTimeoutMs = handlerTimeoutMs;
    this.deadlineScheduler =
      options.deadlineScheduler ?? defaultDeadlineScheduler;
    this.now = options.now ?? (() => new Date());
  }

  async reconcileTerminal(parentSignal?: AbortSignal): Promise<number> {
    const hasProjectionOutbox = this.projectionRepository() !== null;
    let reconciled = 0;
    for (const handler of this.options.registry.registeredHandlersForOperation(
      this.scope.operation,
    )) {
      // The outbox is the sole v2 recovery authority once available. V1
      // handlers retain their compatibility reconciler during migration.
      if (
        hasProjectionOutbox &&
        handler.contractVersion ===
          DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
      ) {
        continue;
      }
      if (!handler.reconcileTerminal) continue;
      const abortScope = this.createHandlerAbortScope(parentSignal);
      let count: number | void;
      try {
        count = await this.awaitHandler(
          () =>
            handler.reconcileTerminal!(
              this.scope,
              this.reconciliationContext(
                handler.version,
                abortScope.signal,
                abortScope.deadlineAt,
              ),
            ),
          abortScope.signal,
        );
      } finally {
        abortScope.dispose();
      }
      if (typeof count === "number" && Number.isFinite(count)) {
        reconciled += Math.max(0, Math.floor(count));
      }
    }
    return reconciled;
  }

  async processNext(signal?: AbortSignal): Promise<DurableExecutionOutcome> {
    if (!this.mayDrain()) return { kind: "idle" };
    const claimedLocallyAt = this.now();
    const receipt = await this.options.repository.claimNextRun({
      ...this.scope,
      workerId: this.options.workerId,
      leaseMs: this.options.leaseMs,
    });
    if (!receipt) return { kind: "idle" };
    if (!this.mayDrain()) {
      return this.requeueSuspendedClaim(receipt, claimedLocallyAt);
    }
    return this.processReceipt(receipt, signal);
  }

  /** Claim and deliver the next terminal callback in this exact scope. */
  async processNextProjection(
    signal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    const repository = this.projectionRepository();
    if (!repository) return { kind: "idle" };
    const receipt = await repository.claimNextTerminalProjection({
      ...this.scope,
      workerId: `${this.options.workerId}:projection`,
      leaseMs: this.options.leaseMs,
    });
    if (!receipt) return { kind: "idle" };
    return this.processProjectionReceipt(repository, receipt, signal);
  }

  /** Best-effort fast path for the obligation created by one terminal write. */
  async processRunProjection(
    runId: string,
    signal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) throw new Error("runId cannot be empty");
    const repository = this.projectionRepository();
    if (!repository) return { kind: "idle", runId: normalizedRunId };
    const receipt = await repository.claimTerminalProjection({
      ...this.scope,
      runId: normalizedRunId,
      workerId: `${this.options.workerId}:projection`,
      leaseMs: this.options.leaseMs,
    });
    if (receipt) {
      return this.processProjectionReceipt(repository, receipt, signal);
    }
    const projection = await repository.getTerminalProjectionForScope({
      ...this.scope,
      runId: normalizedRunId,
    });
    if (!projection) {
      return {
        kind: "projection_pending",
        runId: normalizedRunId,
        error: sanitizedError(
          new DurableTerminalProjectionMissingError(),
          this.now(),
        ),
      };
    }
    if (projection.state === "succeeded") {
      return { kind: terminalOutcomeKind(projection), runId: normalizedRunId };
    }
    if (projection.state === "blocked") {
      return {
        kind: "projection_blocked",
        runId: normalizedRunId,
        error: sanitizedError(
          new DurableTerminalProjectionCorruptionError(
            projection.lastErrorCode ?? "terminal_projection_blocked",
          ),
          this.now(),
        ),
      };
    }
    return { kind: "projection_pending", runId: normalizedRunId };
  }

  /** Read-only operational evidence. Blocked rows are never made runnable. */
  async getBlockedProjection(): Promise<ExecutionTerminalProjection | null> {
    const repository = this.projectionRepository();
    return repository
      ? repository.getBlockedTerminalProjectionForScope(this.scope)
      : null;
  }

  /**
   * Best-effort low-latency processing for one explicit run in this engine's
   * exact tenant + operation + mode scope. PostgreSQL remains the authority:
   * a null receipt means the run is terminal, not yet available, or already
   * leased by another owner.
   */
  async processRun(
    runId: string,
    signal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) throw new Error("runId cannot be empty");
    if (!this.mayDrain()) return { kind: "idle", runId: normalizedRunId };
    const claimedLocallyAt = this.now();
    const receipt = await this.options.repository.claimRun({
      ...this.scope,
      runId: normalizedRunId,
      workerId: this.options.workerId,
      leaseMs: this.options.leaseMs,
    });
    if (!receipt) return { kind: "idle", runId: normalizedRunId };
    if (!this.mayDrain()) {
      return this.requeueSuspendedClaim(receipt, claimedLocallyAt);
    }
    return this.processReceipt(receipt, signal);
  }

  private mayDrain(): boolean {
    const policy = this.options.drainPolicy;
    if (!policy) return true;
    try {
      return policy.mayDrain(this.scope) === true;
    } catch {
      return false;
    }
  }

  private async requeueSuspendedClaim(
    receipt: ExecutionLeaseReceipt,
    claimedLocallyAt: Date,
  ): Promise<DurableExecutionOutcome> {
    if (!receiptMatchesScope(receipt, this.scope)) {
      return { kind: "lease_lost", runId: receipt.run.id };
    }
    const lease = new FencedExecutionLease(
      this.options.repository,
      receipt,
      this.scope,
      this.options.leaseMs,
      this.options.heartbeatScheduler,
    );
    const requeued = await lease.requeue({
      // The policy itself prevents a hot loop while authority is absent. Once
      // restored, the exact same receipt is immediately claimable again.
      availableAt: this.retryAvailableAt(receipt.run, claimedLocallyAt, 0),
      currentStep: "awaiting_runtime_authority",
      error: "Durable execution is temporarily suspended",
      eventData: {
        errorCode: "runtime_authority_suspended",
        delayMs: 0,
      },
    });
    return requeued
      ? { kind: "requeued", runId: receipt.run.id }
      : { kind: "lease_lost", runId: receipt.run.id };
  }

  private async processProjectionReceipt(
    repository: ExecutionTerminalProjectionControlRepository,
    receipt: ExecutionTerminalProjectionLeaseReceipt,
    parentSignal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    if (!projectionMatchesScope(receipt, this.scope)) {
      // Never mutate a row returned outside the caller's authorization scope.
      return {
        kind: "lease_lost",
        runId: receipt.projection.runId,
        error: sanitizedError(
          new Error("Repository returned an out-of-scope projection"),
          this.now(),
        ),
      };
    }

    const lease = new FencedTerminalProjectionLease(
      repository,
      receipt,
      this.scope,
      this.options.leaseMs,
      this.options.heartbeatScheduler,
    );
    const run = receipt.run;
    if (
      receipt.projection.state !== "running" ||
      !isTerminalExecutionRun(run) ||
      receipt.projection.terminalStatus !== run.status
    ) {
      return this.blockProjection(lease, "terminal_projection_status_mismatch");
    }
    if (
      receipt.projection.claimCount >= MAX_TERMINAL_PROJECTION_DELIVERY_CLAIMS
    ) {
      return this.blockProjection(
        lease,
        "terminal_projection_claims_exhausted",
      );
    }
    if (!isManagedV2Run(run)) {
      return this.blockProjection(
        lease,
        "terminal_projection_authority_invalid",
      );
    }

    let handler: RegisteredDurableExecutionHandler;
    try {
      handler = this.options.registry.resolveRegistered(run);
    } catch (error) {
      if (isUnknownHandlerError(error)) {
        return this.requeueProjection(
          lease,
          "terminal_projection_handler_unavailable",
          error,
        );
      }
      return this.blockProjection(
        lease,
        "terminal_projection_contract_invalid",
        error,
      );
    }
    if (
      handler.contractVersion !== DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
    ) {
      return this.blockProjection(
        lease,
        "terminal_projection_contract_invalid",
      );
    }

    let command: DurableJson;
    try {
      const parsed = parseDurableJsonContractValue(
        handler.command,
        run.input,
        "command",
      );
      if (
        run.metadata.executionCommandFingerprint !== parsed.fingerprint ||
        run.metadata.executionCommandSchemaVersion !== parsed.schemaVersion
      ) {
        throw new DurableExecutionCommandMismatchError();
      }
      command = parsed.value;
    } catch (error) {
      return this.blockProjection(
        lease,
        "terminal_projection_command_mismatch",
        error,
      );
    }

    const abortScope = this.createHandlerAbortScope(parentSignal);
    const stopListeningForLeaseLoss = lease.onLost((error) => {
      abortScope.abort(error);
    });
    try {
      try {
        // A process may have been paused after the claim. Revalidate against
        // the database clock before allowing any product projection work.
        await lease.renew();
        lease.startHeartbeat();
        await this.awaitHandler(
          () =>
            Promise.resolve(
              handler.projectTerminal(
                run,
                command,
                this.terminalProjectionContext(
                  handler.version,
                  abortScope.signal,
                  abortScope.deadlineAt,
                  () => lease.renew(),
                ),
              ),
            ),
          abortScope.signal,
        );
      } catch (error) {
        if (error instanceof ExecutionTerminalProjectionLeaseLostError) {
          return { kind: "lease_lost", runId: run.id };
        }
        const errorCode =
          error instanceof DurableExecutionDeadlineExceededError
            ? "terminal_projection_deadline_exceeded"
            : error instanceof DurableExecutionInterruptedError
              ? "terminal_projection_interrupted"
              : "terminal_projection_callback_failed";
        return this.requeueProjection(lease, errorCode, error);
      }

      const acknowledged = await lease.acknowledge();
      return acknowledged
        ? { kind: terminalOutcomeKind(acknowledged), runId: run.id }
        : { kind: "lease_lost", runId: run.id };
    } catch (error) {
      if (error instanceof ExecutionTerminalProjectionLeaseLostError) {
        return { kind: "lease_lost", runId: run.id };
      }
      throw error;
    } finally {
      stopListeningForLeaseLoss();
      abortScope.dispose();
      lease.stopHeartbeat();
    }
  }

  private async requeueProjection(
    lease: FencedTerminalProjectionLease,
    errorCode: string,
    error?: unknown,
  ): Promise<DurableExecutionOutcome> {
    const delayMs = Math.max(
      1_000,
      exponentialRetryDelayMs(lease.projection.claimCount, {
        baseMs: this.options.projectionRetryBaseMs ?? this.options.retryBaseMs,
        maximumMs:
          this.options.projectionRetryMaximumMs ?? this.options.retryMaximumMs,
      }),
    );
    try {
      const requeued = await lease.requeue(delayMs, errorCode);
      return requeued
        ? {
            kind: "projection_pending",
            runId: lease.projection.runId,
            ...(error ? { error: sanitizedError(error, this.now()) } : {}),
          }
        : { kind: "lease_lost", runId: lease.projection.runId };
    } catch (caughtError) {
      if (caughtError instanceof ExecutionTerminalProjectionLeaseLostError) {
        return { kind: "lease_lost", runId: lease.projection.runId };
      }
      throw caughtError;
    }
  }

  private async blockProjection(
    lease: FencedTerminalProjectionLease,
    errorCode: string,
    cause?: unknown,
  ): Promise<DurableExecutionOutcome> {
    try {
      const blocked = await lease.block(errorCode);
      return blocked
        ? {
            kind: "projection_blocked",
            runId: lease.projection.runId,
            error: sanitizedError(
              cause ?? new DurableTerminalProjectionCorruptionError(errorCode),
              this.now(),
            ),
          }
        : { kind: "lease_lost", runId: lease.projection.runId };
    } catch (error) {
      if (error instanceof ExecutionTerminalProjectionLeaseLostError) {
        return { kind: "lease_lost", runId: lease.projection.runId };
      }
      throw error;
    }
  }

  private async processReceipt(
    receipt: ExecutionLeaseReceipt,
    parentSignal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    const claimedLocallyAt = this.now();
    if (!receiptMatchesScope(receipt, this.scope)) {
      return {
        kind: "lease_lost",
        runId: receipt.run.id,
        error: sanitizedError(
          new Error("Repository returned an out-of-scope run"),
          this.now(),
        ),
      };
    }

    let handler: RegisteredDurableExecutionHandler;
    try {
      handler = this.options.registry.resolveRegistered(receipt.run);
    } catch (error) {
      if (isUnknownHandlerError(error)) {
        return this.finishUnknownHandler(receipt, error, claimedLocallyAt);
      }
      const reasonCode = executionRunBlockReason(error);
      if (reasonCode) return this.blockReceipt(receipt, reasonCode);
      throw error;
    }
    let verifiedV2Command: DurableJson | undefined;
    if (
      handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
    ) {
      try {
        const parsed = parseDurableJsonContractValue(
          handler.command,
          receipt.run.input,
          "command",
        );
        if (
          receipt.run.metadata.executionCommandFingerprint !==
            parsed.fingerprint ||
          receipt.run.metadata.executionCommandSchemaVersion !==
            parsed.schemaVersion
        ) {
          throw new DurableExecutionCommandMismatchError();
        }
        verifiedV2Command = parsed.value;
      } catch {
        return this.blockReceipt(receipt, "command_contract_mismatch");
      }
    }
    if (
      handler.contractVersion ===
        DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 &&
      (!this.effectRepository() ||
        !this.cancellationRepository() ||
        !this.projectionRepository() ||
        !this.options.capabilityPolicy)
    ) {
      return this.blockReceipt(receipt, "runtime_authority_unavailable");
    }

    const lease = new FencedExecutionLease(
      this.options.repository,
      receipt,
      this.scope,
      this.options.leaseMs,
      this.options.heartbeatScheduler,
    );
    let command: unknown = verifiedV2Command;
    let cancellationDrain = false;
    lease.startHeartbeat();
    try {
      if (
        handler.contractVersion ===
          DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 &&
        this.cancellationRequested(lease)
      ) {
        const cancellationScope = this.createHandlerAbortScope(parentSignal);
        try {
          const executor = this.createEffectExecutor(
            receipt,
            handler,
            lease,
            cancellationScope.signal,
            cancellationScope.deadlineAt,
          );
          if (!(await executor.hasRecordedEffects())) {
            return this.acknowledgeCancellation(
              lease,
              handler,
              undefined,
              "before_handler",
              parentSignal,
            );
          }
          cancellationDrain = true;
        } finally {
          cancellationScope.dispose();
        }
      }
      try {
        if (
          handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
        ) {
          command = handler.decode(receipt.run);
        } else if (verifiedV2Command === undefined) {
          throw new DurableExecutionCommandMismatchError();
        }
      } catch (error) {
        const decision = safeDecision(
          handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
            ? handler.classifyError(error, {
                run: receipt.run,
                phase: "decode",
              })
            : handler.classifyPureError(error, "command"),
        );
        return this.finishFailure(
          lease,
          receipt,
          handler,
          command,
          { ...decision, retryable: false },
          "validate",
          parentSignal,
        );
      }

      const expectedAttempt = receipt.run.handlerAttempt + 1;
      const attemptRun = await lease.checkpoint({
        currentStep: "claimed",
        incrementHandlerAttempt: true,
        eventType: `${handler.operation}.claimed`,
        eventData: {
          handlerContractVersion: handler.contractVersion,
          handlerVersion: handler.version,
          recovered: receipt.recovered,
          attempt: expectedAttempt,
        },
      });
      if (attemptRun.handlerAttempt !== expectedAttempt) {
        throw new Error(
          "Durable handler attempt counter did not advance atomically",
        );
      }
      const attempt = attemptRun.handlerAttempt;
      let result: DurableExecutionResult;
      const abortScope = this.createHandlerAbortScope(parentSignal);
      const effectExecutor =
        handler.contractVersion ===
        DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
          ? this.createEffectExecutor(
              { ...receipt, run: attemptRun },
              handler,
              lease,
              abortScope.signal,
              abortScope.deadlineAt,
            )
          : undefined;
      const context =
        handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
          ? this.executionContext(
              { ...receipt, run: attemptRun },
              handler.version,
              lease,
              attempt,
              abortScope.signal,
              abortScope.deadlineAt,
            )
          : this.executionContextV2(
              { ...receipt, run: attemptRun },
              handler,
              lease,
              abortScope.signal,
              abortScope.deadlineAt,
              effectExecutor!,
            );
      try {
        result = await this.awaitHandler(async () => {
          let handlerResult: DurableExecutionResult | undefined;
          let handlerFailed = false;
          let handlerFailure: unknown;
          try {
            handlerResult =
              handler.contractVersion ===
              DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
                ? await handler.execute(
                    command,
                    context as DurableExecutionContext,
                  )
                : await handler.execute(
                    command as DurableJson,
                    context as DurableExecutionContextV2<
                      typeof handler.effects,
                      DurableJson
                    >,
                  );
          } catch (error) {
            handlerFailed = true;
            handlerFailure = error;
          }
          let effectFailure: unknown;
          if (effectExecutor) {
            try {
              await effectExecutor.closeAndSettleTrackedEffects();
            } catch (error) {
              effectFailure = error;
            }
          }
          if (effectFailure !== undefined) throw effectFailure;
          if (handlerFailed) throw handlerFailure;
          return handlerResult as DurableExecutionResult;
        }, abortScope.signal);
      } catch (caughtError) {
        let error = caughtError;
        if (effectExecutor) {
          try {
            await effectExecutor.closeAndSettleTrackedEffects();
          } catch (effectError) {
            error = effectError;
          }
        }
        if (error instanceof ExecutionLeaseLostError) {
          return { kind: "lease_lost", runId: receipt.run.id };
        }
        if (error instanceof DurableCancellationPendingError) {
          return {
            kind: "cancellation_pending",
            runId: receipt.run.id,
            error: sanitizedError(error, this.now()),
          };
        }
        if (
          error instanceof DurableCancellationStopError &&
          handler.contractVersion ===
            DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
        ) {
          return this.finishCancellationAtBoundary(
            lease,
            handler,
            command,
            error.safePoint,
            parentSignal,
          );
        }
        if (error instanceof DurableEffectRetryScheduledError) {
          await lease.renew();
          if (
            handler.contractVersion ===
              DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 &&
            this.cancellationRequested(lease)
          ) {
            return this.finishCancellationAtBoundary(
              lease,
              handler,
              command,
              "before_requeue",
              parentSignal,
            );
          }
          const delayMs = Math.max(
            0,
            error.availableAt.getTime() - this.now().getTime(),
          );
          const requeued = await lease.requeue({
            availableAt: error.availableAt,
            currentStep: error.currentStep,
            error: error.message,
            eventData: { errorCode: error.reasonCode, delayMs },
          });
          if (
            !requeued &&
            handler.contractVersion ===
              DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
          ) {
            await lease.renew();
            if (this.cancellationRequested(lease)) {
              return this.finishCancellationAtBoundary(
                lease,
                handler,
                command,
                "requeue_race",
                parentSignal,
              );
            }
          }
          return requeued
            ? { kind: "requeued", runId: receipt.run.id }
            : { kind: "lease_lost", runId: receipt.run.id };
        }
        if (error instanceof DurableEffectRuntimeUnavailableError) {
          await lease.renew();
          if (
            handler.contractVersion ===
              DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 &&
            this.cancellationRequested(lease)
          ) {
            return this.finishCancellationAtBoundary(
              lease,
              handler,
              command,
              "runtime_authority_unavailable",
              parentSignal,
            );
          }
          return this.blockLease(lease, "runtime_authority_unavailable");
        }
        if (error instanceof DurableEffectTerminalError) {
          await lease.renew();
          if (
            handler.contractVersion ===
              DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 &&
            this.cancellationRequested(lease)
          ) {
            return this.finishCancellationAtBoundary(
              lease,
              handler,
              command,
              "effect_terminal",
              parentSignal,
            );
          }
          return this.finishFailure(
            lease,
            receipt,
            handler,
            command,
            {
              code: error.code,
              retryable: false,
              message: error.message,
              eventData: { errorCode: error.code },
            },
            "failed",
            parentSignal,
          );
        }
        const decision = safeDecision(
          error instanceof DurableExecutionDeadlineExceededError
            ? {
                code: error.code,
                retryable: true,
                message: error.message,
                eventData: { errorCode: error.code },
              }
            : error instanceof DurableExecutionInterruptedError
              ? {
                  code: error.code,
                  retryable: true,
                  exhaustion: "retry_until_cancelled",
                  message: error.message,
                  eventData: { errorCode: error.code },
                }
              : handler.contractVersion ===
                  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
                ? handler.classifyError(error, {
                    run: receipt.run,
                    command,
                    phase: "execute",
                  })
                : handler.classifyPureError(error, "checkpoint"),
        );
        await lease.renew();
        if (
          handler.contractVersion ===
            DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 &&
          this.cancellationRequested(lease)
        ) {
          return this.finishCancellationAtBoundary(
            lease,
            handler,
            command,
            cancellationDrain ? "cancellation_drain" : "handler_stopped",
            parentSignal,
          );
        }
        if (
          decision.retryable &&
          (attempt < this.options.maxAttempts ||
            decision.exhaustion === "retry_until_cancelled")
        ) {
          const delayMs = exponentialRetryDelayMs(attempt, {
            baseMs: this.options.retryBaseMs,
            maximumMs: this.options.retryMaximumMs,
          });
          if (
            handler.contractVersion ===
            DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
          ) {
            await (context as DurableExecutionContext).checkpoint(
              "retry_wait",
              {
                eventType: `${handler.operation}.retry_prepared`,
                eventData: { errorCode: decision.code, delayMs },
              },
            );
          }
          const requeued = await lease.requeue({
            availableAt: this.retryAvailableAt(
              receipt.run,
              claimedLocallyAt,
              delayMs,
            ),
            currentStep: "retry_wait",
            error: decision.message,
            eventData: { errorCode: decision.code, delayMs },
          });
          if (
            !requeued &&
            handler.contractVersion ===
              DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
          ) {
            await lease.renew();
            if (this.cancellationRequested(lease)) {
              return this.finishCancellationAtBoundary(
                lease,
                handler,
                command,
                "requeue_race",
                parentSignal,
              );
            }
          }
          return requeued
            ? { kind: "requeued", runId: receipt.run.id }
            : { kind: "lease_lost", runId: receipt.run.id };
        }
        return this.finishFailure(
          lease,
          receipt,
          handler,
          command,
          decision,
          "failed",
          parentSignal,
        );
      } finally {
        abortScope.dispose();
      }

      await lease.renew();
      if (
        handler.contractVersion ===
          DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 &&
        this.cancellationRequested(lease)
      ) {
        return this.finishCancellationAtBoundary(
          lease,
          handler,
          command,
          cancellationDrain ? "cancellation_drain" : "before_finish",
          parentSignal,
        );
      }
      if (
        handler.contractVersion ===
        DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
      ) {
        try {
          result = validateV2Result(handler, result);
        } catch (error) {
          const decision = safeDecision(
            handler.classifyPureError(error, "checkpoint"),
          );
          return this.finishFailure(
            lease,
            receipt,
            handler,
            command,
            { ...decision, retryable: false },
            "validate_result",
            parentSignal,
          );
        }
      }
      const terminalStatus = result.status ?? "completed";
      const finished = await lease.finish({
        status: terminalStatus,
        currentStep: result.currentStep ?? "completed",
        ...(Object.prototype.hasOwnProperty.call(result, "output")
          ? { output: durableJsonValue(result.output) }
          : {}),
        error: null,
        eventType: result.eventType ?? `${handler.operation}.${terminalStatus}`,
        ...(Object.prototype.hasOwnProperty.call(result, "eventData")
          ? { eventData: safeValue(result.eventData) }
          : {}),
      });
      if (!finished) {
        if (
          handler.contractVersion ===
          DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
        ) {
          await lease.renew();
          if (this.cancellationRequested(lease)) {
            return this.finishCancellationAtBoundary(
              lease,
              handler,
              command,
              "finish_race",
              parentSignal,
            );
          }
        }
        return { kind: "lease_lost", runId: receipt.run.id };
      }
      lease.stopHeartbeat();
      return this.projectFinished(
        handler,
        command,
        finished,
        terminalStatus,
        parentSignal,
      );
    } catch (error) {
      if (error instanceof ExecutionLeaseLostError) {
        return { kind: "lease_lost", runId: receipt.run.id };
      }
      throw error;
    } finally {
      lease.stopHeartbeat();
    }
  }

  private async finishCancellationAtBoundary(
    lease: FencedExecutionLease,
    handler: DurableExecutionHandlerV2,
    command: unknown,
    safePoint: string,
    parentSignal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    await lease.renew();
    if (!this.cancellationRequested(lease)) {
      return { kind: "lease_lost", runId: lease.run.id };
    }
    const abortScope = this.createHandlerAbortScope(parentSignal);
    let safe = false;
    try {
      const executor = this.createEffectExecutor(
        { ...lease.receipt, run: lease.run },
        handler,
        lease,
        abortScope.signal,
        abortScope.deadlineAt,
      );
      safe = await executor.cancellationCanAcknowledge();
    } finally {
      abortScope.dispose();
    }
    if (!safe) {
      const pending = new DurableCancellationPendingError(
        "effect_outcome_ambiguous",
      );
      return {
        kind: "cancellation_pending",
        runId: lease.run.id,
        error: sanitizedError(pending, this.now()),
      };
    }
    return this.acknowledgeCancellation(
      lease,
      handler,
      command,
      safePoint,
      parentSignal,
    );
  }

  private async acknowledgeCancellation(
    lease: FencedExecutionLease,
    handler: DurableExecutionHandlerV2,
    command: unknown,
    safePoint: string,
    parentSignal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    const repository = this.cancellationRepository();
    const cancellationId = lease.run.cancelRequestId;
    if (!repository || !cancellationId || !this.cancellationRequested(lease)) {
      return {
        kind: "handler_unavailable",
        runId: lease.run.id,
        error: sanitizedError(
          new DurableEffectRuntimeUnavailableError(),
          this.now(),
        ),
      };
    }
    const acknowledged = await repository.acknowledgeRunCancellation({
      ...this.scope,
      runId: lease.run.id,
      token: lease.token,
      cancellationId,
      safePoint: v2RuntimeLabel(safePoint, "cancellation safePoint"),
    });
    if (!acknowledged) {
      return { kind: "lease_lost", runId: lease.run.id };
    }
    lease.stopHeartbeat();
    let projectionCommand = command;
    if (projectionCommand === undefined) {
      try {
        projectionCommand = parseDurableJsonContractValue(
          handler.command,
          acknowledged.run.input,
          "command",
        ).value;
      } catch (error) {
        return {
          kind: "projection_pending",
          runId: acknowledged.run.id,
          error: sanitizedError(error, this.now()),
        };
      }
    }
    return this.projectFinished(
      handler,
      projectionCommand,
      acknowledged.run,
      "cancelled",
      parentSignal,
    );
  }

  private async finishFailure(
    lease: FencedExecutionLease,
    receipt: ExecutionLeaseReceipt,
    handler: RegisteredDurableExecutionHandler,
    command: unknown,
    decision: DurableExecutionErrorDecision,
    currentStep: string,
    parentSignal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    const isV2 =
      handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2;
    if (isV2) {
      await lease.renew();
      if (this.cancellationRequested(lease)) {
        return this.finishCancellationAtBoundary(
          lease,
          handler as DurableExecutionHandlerV2,
          command,
          "before_failure",
          parentSignal,
        );
      }
    }
    const output = isV2
      ? { errorCode: decision.code }
      : {
          errorCode: decision.code,
          ...(decision.output && typeof decision.output === "object"
            ? (decision.output as Record<string, unknown>)
            : decision.output === undefined
              ? {}
              : { detail: decision.output }),
        };
    const finished = await lease.finish({
      status: "failed",
      currentStep,
      output,
      error: isV2
        ? `Durable execution failed (${decision.code})`
        : decision.message,
      eventType: `${handler.operation}.failed`,
      eventData: isV2
        ? { errorCode: decision.code }
        : (decision.eventData ?? { errorCode: decision.code }),
    });
    if (!finished) {
      if (isV2) {
        await lease.renew();
        if (this.cancellationRequested(lease)) {
          return this.finishCancellationAtBoundary(
            lease,
            handler as DurableExecutionHandlerV2,
            command,
            "failure_race",
            parentSignal,
          );
        }
      }
      return { kind: "lease_lost", runId: receipt.run.id };
    }
    if (command === undefined) {
      return { kind: "failed", runId: receipt.run.id };
    }
    lease.stopHeartbeat();
    return this.projectFinished(
      handler,
      command,
      finished,
      "failed",
      parentSignal,
    );
  }

  private async finishUnknownHandler(
    receipt: ExecutionLeaseReceipt,
    error: unknown,
    claimedLocallyAt: Date,
  ): Promise<DurableExecutionOutcome> {
    const lease = new FencedExecutionLease(
      this.options.repository,
      receipt,
      this.scope,
      this.options.leaseMs,
      this.options.heartbeatScheduler,
    );
    const failure = sanitizedError(error, this.now());
    // During a rolling deploy an old worker can claim a command produced by a
    // newer schema. Preserve it for the compatible worker; terminal failure
    // here would destroy a valid, not-yet-attempted command.
    const delayMs = Math.max(5_000, this.options.retryMaximumMs ?? 60_000);
    const requeued = await lease.requeue({
      availableAt: this.retryAvailableAt(
        receipt.run,
        claimedLocallyAt,
        delayMs,
      ),
      currentStep: "awaiting_handler",
      error: failure.message,
      eventData: { errorCode: "handler_unavailable", delayMs },
    });
    return requeued
      ? { kind: "handler_unavailable", runId: receipt.run.id, error: failure }
      : { kind: "lease_lost", runId: receipt.run.id };
  }

  private async blockReceipt(
    receipt: ExecutionLeaseReceipt,
    reasonCode: ExecutionRunBlockReasonCode,
  ): Promise<DurableExecutionOutcome> {
    const lease = new FencedExecutionLease(
      this.options.repository,
      receipt,
      this.scope,
      this.options.leaseMs,
      this.options.heartbeatScheduler,
    );
    return this.blockLease(lease, reasonCode);
  }

  private async blockLease(
    lease: FencedExecutionLease,
    reasonCode: ExecutionRunBlockReasonCode,
  ): Promise<DurableExecutionOutcome> {
    await lease.renew();
    // The repository resolves a concurrent cancellation in the same fenced
    // statement as the attempted block. Keeping this as one CAS avoids a
    // running(cancel_requested) -> pending -> reclaim loop when the handler
    // can never become executable. Cancellation is terminal bookkeeping; it
    // does not claim to compensate or revert any prior remote effect.
    const blocked = await lease.block({ reasonCode });
    if (!blocked) return { kind: "lease_lost", runId: lease.run.id };
    if (blocked.status === "cancelled") {
      // The managed-v2 terminal projection obligation was inserted atomically.
      // A compatible projection worker may deliver it independently; this
      // command worker must not retry the permanently incompatible command.
      return { kind: "projection_pending", runId: blocked.id };
    }
    const error = new DurableExecutionBlockedError(reasonCode);
    return {
      kind: "blocked",
      runId: blocked.id,
      blockReasonCode: reasonCode,
      ...(blocked.blockedAt ? { blockedAt: blocked.blockedAt } : {}),
      error: sanitizedError(error, this.now()),
    };
  }

  private async projectFinished(
    handler: RegisteredDurableExecutionHandler,
    command: unknown,
    finished: ExecutionRun,
    kind: "completed" | "partial" | "failed" | "cancelled",
    parentSignal?: AbortSignal,
  ): Promise<DurableExecutionOutcome> {
    if (
      handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
    ) {
      const repository = this.projectionRepository();
      if (isManagedV2Run(finished) && repository) {
        return this.processRunProjection(finished.id, parentSignal);
      }
      // Contract-v2 never falls back to an ephemeral callback. A missing
      // atomic obligation is infrastructure corruption, not legacy behavior.
      return {
        kind: "projection_pending",
        runId: finished.id,
        error: sanitizedError(
          new DurableTerminalProjectionMissingError(),
          this.now(),
        ),
      };
    }
    const abortScope = this.createHandlerAbortScope(parentSignal);
    try {
      await this.awaitHandler(
        () =>
          Promise.resolve(
            handler.projectTerminal(
              finished,
              command,
              this.projectionContext(
                handler.version,
                abortScope.signal,
                abortScope.deadlineAt,
              ),
            ),
          ),
        abortScope.signal,
      );
      return { kind, runId: finished.id };
    } catch (error) {
      // Never requeue a terminal run because its external effect may already
      // have succeeded. The next poll invokes reconcileTerminal instead.
      return {
        kind: "projection_pending",
        runId: finished.id,
        error: sanitizedError(error, this.now()),
      };
    } finally {
      abortScope.dispose();
    }
  }

  private executionContext(
    receipt: ExecutionLeaseReceipt,
    version: number,
    lease: FencedExecutionLease,
    attempt: number,
    signal: AbortSignal,
    deadlineAt: string,
  ): DurableExecutionContext {
    return {
      contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
      delivery: "at-least-once",
      run: receipt.run,
      scope: this.scope,
      recovered: receipt.recovered,
      attempt,
      claimCount: receipt.run.claimCount,
      signal,
      deadlineAt,
      effectKey: (step) =>
        durableExecutionEffectKey({
          operation: receipt.run.operation,
          runId: receipt.run.id,
          handlerVersion: version,
          step,
        }),
      checkpoint: async (currentStep, checkpoint = {}) => {
        await lease.checkpoint({
          currentStep,
          eventType:
            checkpoint.eventType ?? `${receipt.run.operation}.step_started`,
          ...(Object.prototype.hasOwnProperty.call(checkpoint, "output")
            ? { output: durableJsonValue(checkpoint.output) }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(checkpoint, "eventData")
            ? { eventData: safeValue(checkpoint.eventData) }
            : {}),
        });
      },
      assertLease: () => lease.renew(),
      now: this.now,
    };
  }

  private executionContextV2(
    receipt: ExecutionLeaseReceipt,
    handler: DurableExecutionHandlerV2,
    lease: FencedExecutionLease,
    signal: AbortSignal,
    deadlineAt: string,
    executor: DurableEffectExecutor,
  ): DurableExecutionContextV2<typeof handler.effects, DurableJson> {
    return {
      contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
      delivery: "at_least_once_attempts",
      run: receipt.run,
      scope: this.scope,
      signal,
      deadlineAt,
      effect: (step, payload) => executor.effect(step, payload),
      checkpoint: async (currentStep, output, event) => {
        const checkedCurrentStep = v2RuntimeLabel(
          currentStep,
          "checkpoint currentStep",
        );
        const parsedOutput = parseDurableJsonContractValue(
          handler.checkpoint,
          output,
          "checkpoint",
        );
        const hasEventData = event !== undefined && hasOwn(event, "data");
        const eventData = hasEventData
          ? validateDurableJson(event!.data, {
              bounds: DURABLE_JSON_GLOBAL_BOUNDS.event_data,
              secrets: { mode: "reject" },
            }).value
          : undefined;
        const eventType = event
          ? v2RuntimeLabel(event.type, "checkpoint eventType")
          : `${receipt.run.operation}.step_started`;
        await lease.checkpoint({
          currentStep: checkedCurrentStep,
          output: parsedOutput.value,
          eventType,
          ...(hasEventData ? { eventData } : {}),
        });
      },
      assertLease: () => lease.renew(),
      isCancellationRequested: async () => {
        await lease.renew();
        return this.cancellationRequested(lease);
      },
      now: this.now,
    };
  }

  private createEffectExecutor(
    receipt: ExecutionLeaseReceipt,
    handler: DurableExecutionHandlerV2,
    lease: FencedExecutionLease,
    signal: AbortSignal,
    deadlineAt: string,
  ): DurableEffectExecutor {
    const effectRepository = this.effectRepository();
    const capabilityPolicy = this.options.capabilityPolicy;
    if (!effectRepository || !capabilityPolicy) {
      throw new DurableEffectRuntimeUnavailableError();
    }
    return new DurableEffectExecutor({
      repository: effectRepository,
      capabilityPolicy,
      credentialProvider: this.options.credentialProvider,
      handler,
      run: receipt.run,
      scope: this.scope,
      lease,
      signal,
      deadlineAt,
      deadlineScheduler: this.options.deadlineScheduler,
      now: this.now,
      random: this.options.effectRandom,
      capabilityRetryMs: this.options.capabilityRetryMs,
    });
  }

  private cancellationRequested(lease: FencedExecutionLease): boolean {
    const run = lease.run;
    return Boolean(
      run.status === "running" &&
      run.cancelRequestId &&
      run.cancelRequestedAt &&
      !run.cancelAcknowledgedAt,
    );
  }

  private effectRepository(): ExecutionEffectControlRepository | null {
    if (this.options.effectRepository) return this.options.effectRepository;
    const repository = this.options.repository;
    if (
      typeof repository.prepareEffect !== "function" ||
      typeof repository.completeEffect !== "function" ||
      typeof repository.recordEffectFailure !== "function" ||
      typeof repository.recordEffectReconcile !== "function" ||
      typeof repository.getEffectForScope !== "function"
    ) {
      return null;
    }
    return {
      prepareEffect: (input) => repository.prepareEffect!(input),
      completeEffect: (input) => repository.completeEffect!(input),
      recordEffectFailure: (input) => repository.recordEffectFailure!(input),
      recordEffectReconcile: (input) =>
        repository.recordEffectReconcile!(input),
      getEffectForScope: (input) => repository.getEffectForScope!(input),
    };
  }

  private cancellationRepository(): ExecutionCancellationControlRepository | null {
    if (this.options.cancellationRepository) {
      return this.options.cancellationRepository;
    }
    const repository = this.options.repository;
    if (
      typeof repository.requestRunCancellation !== "function" ||
      typeof repository.acknowledgeRunCancellation !== "function"
    ) {
      return null;
    }
    return {
      requestRunCancellation: (input) =>
        repository.requestRunCancellation!(input),
      acknowledgeRunCancellation: (input) =>
        repository.acknowledgeRunCancellation!(input),
    };
  }

  private projectionRepository(): ExecutionTerminalProjectionControlRepository | null {
    if (this.options.projectionRepository) {
      return this.options.projectionRepository;
    }
    const repository = this.options.repository;
    if (
      typeof repository.claimTerminalProjection !== "function" ||
      typeof repository.claimNextTerminalProjection !== "function" ||
      typeof repository.renewTerminalProjectionLease !== "function" ||
      typeof repository.acknowledgeTerminalProjection !== "function" ||
      typeof repository.requeueTerminalProjection !== "function" ||
      typeof repository.blockTerminalProjection !== "function" ||
      typeof repository.getTerminalProjectionForScope !== "function" ||
      typeof repository.getBlockedTerminalProjectionForScope !== "function"
    ) {
      return null;
    }
    return {
      claimTerminalProjection: (input) =>
        repository.claimTerminalProjection!(input),
      claimNextTerminalProjection: (input) =>
        repository.claimNextTerminalProjection!(input),
      renewTerminalProjectionLease: (input) =>
        repository.renewTerminalProjectionLease!(input),
      acknowledgeTerminalProjection: (input) =>
        repository.acknowledgeTerminalProjection!(input),
      requeueTerminalProjection: (input) =>
        repository.requeueTerminalProjection!(input),
      blockTerminalProjection: (input) =>
        repository.blockTerminalProjection!(input),
      getTerminalProjectionForScope: (input) =>
        repository.getTerminalProjectionForScope!(input),
      getBlockedTerminalProjectionForScope: (input) =>
        repository.getBlockedTerminalProjectionForScope!(input),
    };
  }

  private createHandlerAbortScope(parentSignal?: AbortSignal): {
    signal: AbortSignal;
    deadlineAt: string;
    abort(reason: Error): void;
    dispose(): void;
  } {
    const controller = new AbortController();
    const deadlineAt = new Date(
      this.now().getTime() + this.handlerTimeoutMs,
    ).toISOString();
    const abortFromParent = () => {
      if (!controller.signal.aborted) {
        controller.abort(
          parentSignal?.reason instanceof DurableExecutionInterruptedError
            ? parentSignal.reason
            : new DurableExecutionInterruptedError(),
        );
      }
    };
    if (parentSignal?.aborted) {
      abortFromParent();
    } else {
      parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    }
    const timeout = this.deadlineScheduler.setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new DurableExecutionDeadlineExceededError(deadlineAt));
      }
    }, this.handlerTimeoutMs);
    return {
      signal: controller.signal,
      deadlineAt,
      abort: (reason) => {
        if (!controller.signal.aborted) controller.abort(reason);
      },
      dispose: () => {
        this.deadlineScheduler.clearTimeout(timeout);
        parentSignal?.removeEventListener("abort", abortFromParent);
      },
    };
  }

  private async awaitHandler<Result>(
    execute: () => Promise<Result>,
    signal: AbortSignal,
  ): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () => {
        finish(() =>
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new DurableExecutionInterruptedError(),
          ),
        );
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }
      Promise.resolve()
        .then(() => {
          if (signal.aborted) {
            throw signal.reason instanceof Error
              ? signal.reason
              : new DurableExecutionInterruptedError();
          }
          return execute();
        })
        .then(
          (value) => finish(() => resolve(value)),
          (error) => finish(() => reject(error)),
        );
    });
  }

  /**
   * `run.updatedAt` is stamped by PostgreSQL in the atomic claim. Advancing
   * that anchor by locally observed elapsed time avoids absolute app/DB clock
   * skew while the repository contract still accepts a concrete Date.
   */
  private retryAvailableAt(
    run: ExecutionRun,
    claimedLocallyAt: Date,
    delayMs: number,
  ): Date {
    const databaseClaimedAtMs = Date.parse(run.updatedAt);
    const localNowMs = this.now().getTime();
    const elapsedMs = Math.max(0, localNowMs - claimedLocallyAt.getTime());
    const estimatedDatabaseNowMs = Number.isFinite(databaseClaimedAtMs)
      ? databaseClaimedAtMs + elapsedMs
      : localNowMs;
    return new Date(estimatedDatabaseNowMs + delayMs);
  }

  private projectionContext(
    version: number,
    signal: AbortSignal,
    deadlineAt: string,
  ): DurableExecutionProjectionContext {
    return {
      delivery: "at-least-once",
      scope: this.scope,
      signal,
      deadlineAt,
      effectKey: (run, step) =>
        durableExecutionEffectKey({
          operation: run.operation,
          runId: run.id,
          handlerVersion: version,
          step,
        }),
      now: this.now,
    };
  }

  private terminalProjectionContext(
    version: number,
    signal: AbortSignal,
    deadlineAt: string,
    assertLease: () => Promise<void>,
  ): DurableExecutionTerminalProjectionContext {
    return {
      ...this.projectionContext(version, signal, deadlineAt),
      assertLease,
    };
  }

  private reconciliationContext(
    version: number,
    signal: AbortSignal,
    deadlineAt: string,
  ): DurableExecutionReconciliationContext {
    return {
      ...this.projectionContext(version, signal, deadlineAt),
      getRunByAggregate: async ({ aggregateType, aggregateId }) => {
        const scopedLookup = this.options.repository.getRunByAggregateForScope;
        if (!scopedLookup) {
          throw new Error(
            "Durable execution reconciliation requires exact-scope aggregate reads",
          );
        }
        const run = await scopedLookup.call(this.options.repository, {
          tenantKey: this.scope.tenantKey,
          operation: this.scope.operation,
          mode: this.scope.mode,
          aggregateType,
          aggregateId,
        });
        if (
          !run ||
          !runMatchesScope(run, this.scope) ||
          run.aggregateType !== aggregateType ||
          run.aggregateId !== aggregateId
        ) {
          return null;
        }
        return run;
      },
      getRunById: async (runId) => {
        const scopedLookup = this.options.repository.getRunByIdForScope;
        if (!scopedLookup) {
          throw new Error(
            "Durable execution reconciliation requires exact-scope run reads",
          );
        }
        const run = await scopedLookup.call(this.options.repository, {
          tenantKey: this.scope.tenantKey,
          operation: this.scope.operation,
          mode: this.scope.mode,
          runId,
        });
        if (!run || run.id !== runId || !runMatchesScope(run, this.scope)) {
          return null;
        }
        return run;
      },
    };
  }
}

export interface DurableExecutionWorkerCounters {
  polls: number;
  claims: number;
  terminal: number;
  retries: number;
  handlerUnavailable: number;
  blocked: number;
  leaseLost: number;
  projectionPending: number;
  projectionClaims: number;
  projectionSucceeded: number;
  projectionRetries: number;
  projectionBlocked: number;
  cancellationPending: number;
  reconciled: number;
}

export interface DurableExecutionWorkerReadiness {
  scope: ExecutionLeaseScope;
  workerId: string;
  started: boolean;
  state: "stopped" | "starting" | "ready" | "degraded";
  startedAt?: string;
  lastPollAt?: string;
  lastSuccessAt?: string;
  lastError?: SanitizedDurableExecutionError;
  /** Stable evidence only; blocked work is not part of runnable discovery. */
  blockedProjection?: Pick<
    ExecutionTerminalProjection,
    "runId" | "lastErrorCode" | "lastAttemptAt" | "updatedAt"
  >;
  blockedRun?: {
    runId: string;
    reasonCode: ExecutionRunBlockReasonCode;
    blockedAt?: string;
  };
  counters: DurableExecutionWorkerCounters;
}

export interface DurableExecutionWorkerOptions extends DurableExecutionEngineOptions {
  pollMs: number;
  maxClaimsPerDrain?: number;
  maxProjectionClaimsPerDrain?: number;
  scheduler?: DurableExecutionScheduler;
  logError?: (message: string) => void;
}

export class DurableExecutionWorkerRestartError extends Error {
  readonly code = "durable_execution_worker_restart_forbidden" as const;

  constructor() {
    super("Durable execution workers are one-shot and cannot restart");
    this.name = "DurableExecutionWorkerRestartError";
  }
}

/** Poll/wake lifecycle for one exact tenant + operation + mode scope. */
export class DurableExecutionWorker {
  readonly scope: ExecutionLeaseScope;
  readonly workerId: string;
  private readonly engine: DurableExecutionEngine;
  private readonly scheduler: DurableExecutionScheduler;
  private readonly maxClaimsPerDrain: number;
  private readonly maxProjectionClaimsPerDrain: number;
  private readonly now: () => Date;
  private timer: unknown;
  private draining: Promise<void> | null = null;
  private wakeRequested = false;
  private started = false;
  private everStarted = false;
  private terminated = false;
  private startedAt?: string;
  private lastPollAt?: string;
  private lastSuccessAt?: string;
  private lastError?: SanitizedDurableExecutionError;
  private blockedProjection?: DurableExecutionWorkerReadiness["blockedProjection"];
  private blockedRun?: DurableExecutionWorkerReadiness["blockedRun"];
  private healthy = false;
  private hasPolledSuccessfully = false;
  private lifecycleController: AbortController | null = null;
  private counters: DurableExecutionWorkerCounters = {
    polls: 0,
    claims: 0,
    terminal: 0,
    retries: 0,
    handlerUnavailable: 0,
    blocked: 0,
    leaseLost: 0,
    projectionPending: 0,
    projectionClaims: 0,
    projectionSucceeded: 0,
    projectionRetries: 0,
    projectionBlocked: 0,
    cancellationPending: 0,
    reconciled: 0,
  };

  constructor(private readonly options: DurableExecutionWorkerOptions) {
    this.engine = new DurableExecutionEngine({
      ...options,
      heartbeatScheduler: options.heartbeatScheduler ?? options.scheduler,
    });
    this.scope = this.engine.scope;
    this.workerId = options.workerId;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.now = options.now ?? (() => new Date());
    if (!Number.isFinite(options.pollMs) || options.pollMs < 1) {
      throw new Error("pollMs must be positive");
    }
    this.maxClaimsPerDrain = boundedDrainBudget(
      options.maxClaimsPerDrain,
      "maxClaimsPerDrain",
    );
    this.maxProjectionClaimsPerDrain = boundedDrainBudget(
      options.maxProjectionClaimsPerDrain,
      "maxProjectionClaimsPerDrain",
    );
  }

  start(): this {
    if (this.started) return this;
    if (this.everStarted || this.terminated) {
      throw new DurableExecutionWorkerRestartError();
    }
    this.everStarted = true;
    this.started = true;
    this.lifecycleController = new AbortController();
    this.startedAt = this.now().toISOString();
    try {
      this.timer = this.scheduler.setInterval(() => {
        void this.poll().catch((error) => this.recordFailure(error));
      }, this.options.pollMs);
      this.wake();
    } catch (error) {
      this.started = false;
      this.terminated = true;
      this.lifecycleController.abort(new DurableExecutionInterruptedError());
      if (this.timer !== undefined) {
        try {
          this.scheduler.clearInterval(this.timer);
        } catch {
          // Preserve the startup error while still making the worker one-shot.
        }
      }
      this.timer = undefined;
      throw error;
    }
    return this;
  }

  /** Latency hint only; durable polling remains authoritative. */
  wake(): void {
    if (!this.started) return;
    this.wakeRequested = true;
    this.scheduler.queueMicrotask(() => {
      void this.poll().catch((error) => this.recordFailure(error));
    });
  }

  async poll(): Promise<void> {
    if (!this.started) return;
    if (this.draining) {
      this.wakeRequested = true;
      return this.draining;
    }
    this.draining = this.drain().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  async stop(): Promise<void> {
    // Shutdown is abortive, including escalation of an in-flight cooperative
    // retirement. The fenced engine requeues interrupted work before drain.
    this.terminated = true;
    this.started = false;
    this.wakeRequested = false;
    this.lifecycleController?.abort(new DurableExecutionInterruptedError());
    let clearError: unknown;
    if (this.timer !== undefined) {
      try {
        this.scheduler.clearInterval(this.timer);
      } catch (error) {
        clearError = error;
      }
    }
    this.timer = undefined;
    await this.draining;
    if (clearError) throw clearError;
  }

  /**
   * Fairness/absence retirement is cooperative: stop accepting new claims and
   * wait for the current drain without aborting its handler or projection.
   */
  async retire(): Promise<void> {
    if (this.terminated) {
      await this.draining;
      return;
    }
    this.terminated = true;
    this.started = false;
    this.wakeRequested = false;
    let clearError: unknown;
    if (this.timer !== undefined) {
      try {
        this.scheduler.clearInterval(this.timer);
      } catch (error) {
        clearError = error;
      }
    }
    this.timer = undefined;
    await this.draining;
    if (clearError) throw clearError;
  }

  readiness(): DurableExecutionWorkerReadiness {
    return {
      scope: { ...this.scope },
      workerId: this.workerId,
      started: this.started,
      state: !this.started
        ? "stopped"
        : !this.healthy && this.lastError
          ? "degraded"
          : this.hasPolledSuccessfully
            ? "ready"
            : "starting",
      ...(this.startedAt ? { startedAt: this.startedAt } : {}),
      ...(this.lastPollAt ? { lastPollAt: this.lastPollAt } : {}),
      ...(this.lastSuccessAt ? { lastSuccessAt: this.lastSuccessAt } : {}),
      ...(this.lastError ? { lastError: { ...this.lastError } } : {}),
      ...(this.blockedProjection
        ? { blockedProjection: { ...this.blockedProjection } }
        : {}),
      ...(this.blockedRun ? { blockedRun: { ...this.blockedRun } } : {}),
      counters: { ...this.counters },
    };
  }

  private async drain(): Promise<void> {
    do {
      this.wakeRequested = false;
      this.lastPollAt = this.now().toISOString();
      this.counters.polls += 1;
      if (!this.mayDrain()) {
        this.lastSuccessAt = this.now().toISOString();
        this.hasPolledSuccessfully = true;
        this.healthy = true;
        this.lastError = undefined;
        return;
      }
      let pollSucceeded = true;
      try {
        const reconciled = await this.engine.reconcileTerminal(
          this.lifecycleController?.signal,
        );
        this.counters.reconciled += reconciled;
      } catch (error) {
        pollSucceeded = false;
        this.recordFailure(error);
      }

      let projectionClaims = 0;
      let commandClaims = 0;
      let projectionsDrained = false;
      let commandsDrained = false;
      // Alternate the two independently bounded queues. A slow projection
      // backlog cannot consume the full drain before command work gets a turn,
      // and command traffic cannot postpone crash recovery indefinitely.
      while (
        this.started &&
        this.mayDrain() &&
        ((!projectionsDrained &&
          projectionClaims < this.maxProjectionClaimsPerDrain) ||
          (!commandsDrained && commandClaims < this.maxClaimsPerDrain))
      ) {
        if (
          this.mayDrain() &&
          !projectionsDrained &&
          projectionClaims < this.maxProjectionClaimsPerDrain
        ) {
          try {
            const outcome = await this.engine.processNextProjection(
              this.lifecycleController?.signal,
            );
            if (outcome.kind === "idle") {
              projectionsDrained = true;
            } else {
              projectionClaims += 1;
              pollSucceeded =
                this.observeProjectionOutcome(outcome) && pollSucceeded;
            }
          } catch (error) {
            projectionsDrained = true;
            pollSucceeded = false;
            this.recordFailure(error);
          }
        }

        // Shutdown aborts an in-flight handler through its contract, then
        // waits for the fenced requeue before this drain resolves. A hard
        // process kill is still recovered by lease expiry in another worker.
        if (
          this.started &&
          this.mayDrain() &&
          !commandsDrained &&
          commandClaims < this.maxClaimsPerDrain
        ) {
          try {
            const outcome = await this.engine.processNext(
              this.lifecycleController?.signal,
            );
            if (outcome.kind === "idle") {
              commandsDrained = true;
            } else {
              commandClaims += 1;
              pollSucceeded =
                this.observeCommandOutcome(outcome) && pollSucceeded;
            }
          } catch (error) {
            commandsDrained = true;
            pollSucceeded = false;
            this.recordFailure(error);
          }
        }
      }
      try {
        const blocked = await this.engine.getBlockedProjection();
        this.blockedProjection = blocked
          ? {
              runId: blocked.runId,
              ...(blocked.lastErrorCode
                ? { lastErrorCode: blocked.lastErrorCode }
                : {}),
              ...(blocked.lastAttemptAt
                ? { lastAttemptAt: blocked.lastAttemptAt }
                : {}),
              updatedAt: blocked.updatedAt,
            }
          : undefined;
        if (blocked) {
          pollSucceeded = false;
          this.healthy = false;
          this.lastError = sanitizedError(
            new DurableTerminalProjectionCorruptionError(
              blocked.lastErrorCode ?? "terminal_projection_blocked",
            ),
            this.now(),
          );
        }
      } catch (error) {
        pollSucceeded = false;
        this.recordFailure(error);
      }
      if (pollSucceeded) {
        this.lastSuccessAt = this.now().toISOString();
        this.hasPolledSuccessfully = true;
        this.healthy = true;
        this.lastError = undefined;
      }
    } while (this.started && this.wakeRequested);
  }

  private mayDrain(): boolean {
    const policy = this.options.drainPolicy;
    if (!policy) return true;
    try {
      return policy.mayDrain(this.scope) === true;
    } catch {
      return false;
    }
  }

  private observeProjectionOutcome(outcome: DurableExecutionOutcome): boolean {
    this.counters.projectionClaims += 1;
    if (
      outcome.kind === "completed" ||
      outcome.kind === "partial" ||
      outcome.kind === "failed" ||
      outcome.kind === "cancelled"
    ) {
      this.counters.projectionSucceeded += 1;
    }
    if (outcome.kind === "projection_pending") {
      this.counters.projectionPending += 1;
      this.counters.projectionRetries += 1;
      if (outcome.error) this.recordFailure(outcome.error);
      return false;
    }
    if (outcome.kind === "projection_blocked") {
      this.counters.projectionBlocked += 1;
      if (outcome.error) this.recordFailure(outcome.error);
      return false;
    }
    if (outcome.kind === "lease_lost") this.counters.leaseLost += 1;
    return true;
  }

  private observeCommandOutcome(outcome: DurableExecutionOutcome): boolean {
    this.counters.claims += 1;
    if (outcome.kind === "requeued") this.counters.retries += 1;
    if (outcome.kind === "handler_unavailable") {
      this.counters.handlerUnavailable += 1;
      if (outcome.error) this.recordFailure(outcome.error);
      return false;
    }
    if (outcome.kind === "blocked") {
      this.counters.blocked += 1;
      if (outcome.runId && outcome.blockReasonCode) {
        this.blockedRun = {
          runId: outcome.runId,
          reasonCode: outcome.blockReasonCode,
          ...(outcome.blockedAt ? { blockedAt: outcome.blockedAt } : {}),
        };
      }
      if (outcome.error) this.recordFailure(outcome.error);
      return false;
    }
    if (outcome.kind === "lease_lost") this.counters.leaseLost += 1;
    if (outcome.kind === "projection_pending") {
      this.counters.terminal += 1;
      this.counters.projectionPending += 1;
      if (outcome.error) this.recordFailure(outcome.error);
      return false;
    }
    if (outcome.kind === "projection_blocked") {
      this.counters.terminal += 1;
      this.counters.projectionBlocked += 1;
      if (outcome.error) this.recordFailure(outcome.error);
      return false;
    }
    if (outcome.kind === "cancellation_pending") {
      this.counters.cancellationPending += 1;
      if (outcome.error) this.recordFailure(outcome.error);
      return false;
    }
    if (
      outcome.kind === "completed" ||
      outcome.kind === "partial" ||
      outcome.kind === "failed" ||
      outcome.kind === "cancelled"
    ) {
      this.counters.terminal += 1;
    }
    return true;
  }

  private recordFailure(error: unknown): void {
    const safe =
      error &&
      typeof error === "object" &&
      "name" in error &&
      "message" in error &&
      "at" in error
        ? (error as SanitizedDurableExecutionError)
        : sanitizedError(error, this.now());
    this.lastError = { ...safe };
    this.healthy = false;
    try {
      (this.options.logError ?? console.error)(
        `[durable-execution] ${this.scope.operation} poll failed for ${this.scope.tenantKey} (${safe.name})`,
      );
    } catch {
      // Health reporting must never become an execution failure path.
    }
  }
}

export class DuplicateDurableExecutionWorkerError extends Error {
  readonly code = "durable_execution_worker_scope_reserved" as const;

  constructor(scope: ExecutionLeaseScope) {
    super(
      `Durable execution worker already started for ${durableExecutionScopeKey(scope)}`,
    );
    this.name = "DuplicateDurableExecutionWorkerError";
  }
}

export function isDuplicateDurableExecutionWorkerError(
  error: unknown,
): error is DuplicateDurableExecutionWorkerError {
  return (
    error instanceof DuplicateDurableExecutionWorkerError ||
    (!!error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "durable_execution_worker_scope_reserved")
  );
}

export interface DurableExecutionRuntimeOptions {
  repository: ExecutionControlRepository;
  effectRepository?: ExecutionEffectControlRepository;
  cancellationRepository?: ExecutionCancellationControlRepository;
  projectionRepository?: ExecutionTerminalProjectionControlRepository;
  capabilityPolicy?: DurableCapabilityPolicy;
  drainPolicy?: DurableExecutionDrainPolicy;
  credentialProvider?: CapabilityCredentialProvider;
  registry: DurableExecutionRegistry;
  leaseMs?: number;
  pollMs?: number;
  maxAttempts?: number;
  maxClaimsPerDrain?: number;
  maxProjectionClaimsPerDrain?: number;
  retryBaseMs?: number;
  retryMaximumMs?: number;
  projectionRetryBaseMs?: number;
  projectionRetryMaximumMs?: number;
  handlerTimeoutMs?: number;
  deadlineScheduler?: DurableExecutionDeadlineScheduler;
  effectRandom?: () => number;
  capabilityRetryMs?: number;
  scheduler?: DurableExecutionScheduler;
  now?: () => Date;
  logError?: (message: string) => void;
  workerIdPrefix?: string;
  /** Defaults to the process-shared 32-slot authority. Inject in tests. */
  capacityLimiter?: DurableExecutionWorkerCapacityLimiter;
}

interface DurableExecutionRuntimeWorkerEntry {
  worker: DurableExecutionWorker;
  reservation: DurableExecutionWorkerCapacityReservation;
  demandOwnerId: string;
  demandId: string;
}

interface DurableExecutionStoppingWorkerEntry {
  worker: DurableExecutionWorker;
  workerId: string;
  reservation: DurableExecutionWorkerCapacityReservation;
  stopped: Promise<void>;
}

/** Process-local coordinator. PostgreSQL leasing remains the cross-process lock. */
export class DurableExecutionRuntime {
  private readonly workers = new Map<
    string,
    DurableExecutionRuntimeWorkerEntry
  >();
  private readonly stoppingWorkers = new Map<
    string,
    DurableExecutionStoppingWorkerEntry
  >();
  private readonly capacityLimiter: DurableExecutionWorkerCapacityLimiter;
  private readonly runtimeId = randomUUID();
  private readonly pendingDemands = new Map<
    string,
    { scope: ExecutionLeaseScope; demandOwnerId: string }
  >();
  private state: "running" | "shutting_down" | "shutdown" = "running";
  private shutdownInFlight: Promise<void> | null = null;

  constructor(private readonly options: DurableExecutionRuntimeOptions) {
    this.capacityLimiter =
      options.capacityLimiter ?? processDurableExecutionWorkerCapacityLimiter();
  }

  startWorker(
    scope: ExecutionLeaseScope,
    demandOwnerId = this.runtimeId,
  ): DurableExecutionWorker {
    if (this.state !== "running") {
      throw new DurableExecutionRuntimeShutdownError();
    }
    const normalized = normalizedScope(scope);
    const key = durableExecutionScopeKey(normalized);
    if (this.workers.has(key) || this.stoppingWorkers.has(key)) {
      throw new DuplicateDurableExecutionWorkerError(normalized);
    }
    const demand = this.workerDemand(key, demandOwnerId);
    const workerId = `${this.options.workerIdPrefix ?? "sancho"}-${process.pid}-${randomUUID().slice(0, 8)}`;
    let reservation: DurableExecutionWorkerCapacityReservation;
    try {
      reservation = this.capacityLimiter.reserve(workerId, key, demand.id);
      this.pendingDemands.delete(demand.id);
    } catch (error) {
      if (isDurableExecutionWorkerScopeReservedError(error)) {
        this.capacityLimiter.cancelDemand(demand.id);
        this.pendingDemands.delete(demand.id);
        throw new DuplicateDurableExecutionWorkerError(normalized);
      }
      if (isDurableExecutionWorkerCapacityError(error)) {
        this.pendingDemands.set(demand.id, {
          scope: { ...normalized },
          demandOwnerId: demand.ownerId,
        });
      }
      throw error;
    }
    try {
      const worker = new DurableExecutionWorker({
        repository: this.options.repository,
        effectRepository: this.options.effectRepository,
        cancellationRepository: this.options.cancellationRepository,
        projectionRepository: this.options.projectionRepository,
        capabilityPolicy: this.options.capabilityPolicy,
        drainPolicy: this.options.drainPolicy,
        credentialProvider: this.options.credentialProvider,
        registry: this.options.registry,
        scope: normalized,
        workerId,
        leaseMs: this.options.leaseMs ?? 60_000,
        pollMs: this.options.pollMs ?? 5_000,
        maxAttempts: this.options.maxAttempts ?? 3,
        maxClaimsPerDrain: this.options.maxClaimsPerDrain,
        maxProjectionClaimsPerDrain: this.options.maxProjectionClaimsPerDrain,
        retryBaseMs: this.options.retryBaseMs,
        retryMaximumMs: this.options.retryMaximumMs,
        projectionRetryBaseMs: this.options.projectionRetryBaseMs,
        projectionRetryMaximumMs: this.options.projectionRetryMaximumMs,
        handlerTimeoutMs: this.options.handlerTimeoutMs,
        heartbeatScheduler: this.options.scheduler,
        deadlineScheduler: this.options.deadlineScheduler,
        effectRandom: this.options.effectRandom,
        capabilityRetryMs: this.options.capabilityRetryMs,
        scheduler: this.options.scheduler,
        now: this.options.now,
        logError: this.options.logError,
      });
      this.workers.set(key, {
        worker,
        reservation,
        demandOwnerId: demand.ownerId,
        demandId: demand.id,
      });
      try {
        worker.start();
      } catch (error) {
        this.workers.delete(key);
        throw error;
      }
      return worker;
    } catch (error) {
      this.capacityLimiter.release(reservation);
      throw error;
    }
  }

  getWorker(scope: ExecutionLeaseScope): DurableExecutionWorker | undefined {
    return this.workers.get(durableExecutionScopeKey(scope))?.worker;
  }

  wake(scope: ExecutionLeaseScope): boolean {
    if (this.state !== "running") return false;
    const worker = this.getWorker(scope);
    if (!worker) return false;
    worker.wake();
    return true;
  }

  async stopWorker(
    scope: ExecutionLeaseScope,
    expectedWorkerId: string,
  ): Promise<boolean> {
    const key = durableExecutionScopeKey(scope);
    const entry = this.workers.get(key);
    if (!entry) {
      const stopping = this.stoppingWorkers.get(key);
      if (!stopping || stopping.workerId !== expectedWorkerId) return false;
      // Abortive shutdown escalates an in-flight cooperative retirement.
      await stopping.worker.stop();
      await stopping.stopped;
      return true;
    }
    if (entry.worker.workerId !== expectedWorkerId) {
      return false;
    }
    return this.transitionWorker(key, entry, "abortive", false);
  }

  /** Owner-fenced cooperative retirement for absence, never shutdown. */
  async retireWorker(
    scope: ExecutionLeaseScope,
    expectedWorkerId: string,
  ): Promise<boolean> {
    const key = durableExecutionScopeKey(scope);
    const entry = this.workers.get(key);
    if (!entry || entry.worker.workerId !== expectedWorkerId) return false;
    return this.transitionWorker(key, entry, "cooperative", false);
  }

  /**
   * Claim the single global fairness handoff, enqueue this runnable scope at
   * the FIFO tail, and retire it cooperatively.
   */
  async yieldWorker(
    scope: ExecutionLeaseScope,
    expectedWorkerId: string,
  ): Promise<boolean> {
    const key = durableExecutionScopeKey(scope);
    const entry = this.workers.get(key);
    if (!entry || entry.worker.workerId !== expectedWorkerId) return false;
    if (!this.capacityLimiter.claimFairnessYield(entry.reservation)) {
      return false;
    }
    this.pendingDemands.set(entry.demandId, {
      scope: { ...entry.worker.scope },
      demandOwnerId: entry.demandOwnerId,
    });
    return this.transitionWorker(key, entry, "cooperative", true);
  }

  cancelWorkerDemand(
    scope: ExecutionLeaseScope,
    demandOwnerId = this.runtimeId,
  ): boolean {
    const key = durableExecutionScopeKey(scope);
    const demand = this.workerDemand(key, demandOwnerId);
    this.pendingDemands.delete(demand.id);
    return this.capacityLimiter.cancelDemand(demand.id);
  }

  capacity(): DurableExecutionWorkerCapacityReport {
    return this.capacityLimiter.report();
  }

  readiness(): DurableExecutionWorkerReadiness[] {
    return [...this.workers.values()]
      .map(({ worker }) => worker.readiness())
      .sort((left, right) =>
        durableExecutionScopeKey(left.scope).localeCompare(
          durableExecutionScopeKey(right.scope),
        ),
      );
  }

  shutdown(): Promise<void> {
    if (this.shutdownInFlight) return this.shutdownInFlight;
    if (this.state === "shutdown") return Promise.resolve();
    this.state = "shutting_down";
    for (const demandId of this.pendingDemands.keys()) {
      this.capacityLimiter.cancelDemand(demandId);
    }
    this.pendingDemands.clear();
    const active = [...this.workers.values()].map(({ worker }) => ({
      scope: worker.scope,
      workerId: worker.workerId,
    }));
    const alreadyStopping = [...this.stoppingWorkers.values()];
    this.shutdownInFlight = (async () => {
      const settled = await Promise.allSettled([
        ...alreadyStopping.map(async ({ worker, stopped }) => {
          await worker.stop();
          await stopped;
        }),
        ...active.map(({ scope, workerId }) =>
          this.stopWorker(scope, workerId).then(() => undefined),
        ),
      ]);
      const rejected = settled.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (rejected) throw rejected.reason;
    })().finally(() => {
      this.state = "shutdown";
    });
    return this.shutdownInFlight;
  }

  private workerDemand(
    scopeKey: string,
    demandOwnerId: string,
  ): { id: string; ownerId: string } {
    const ownerId = demandOwnerId.trim();
    if (!ownerId) {
      throw new Error("Durable worker demand owner cannot be empty");
    }
    return { ownerId, id: `${ownerId.length}:${ownerId}${scopeKey}` };
  }

  private async transitionWorker(
    key: string,
    entry: DurableExecutionRuntimeWorkerEntry,
    mode: "cooperative" | "abortive",
    fairnessClaimed: boolean,
  ): Promise<boolean> {
    if (this.workers.get(key) !== entry) return false;
    this.workers.delete(key);
    if (!fairnessClaimed) {
      this.capacityLimiter.markStopping(entry.reservation);
    }
    const stopped = (
      mode === "cooperative" ? entry.worker.retire() : entry.worker.stop()
    ).finally(() => {
      const current = this.stoppingWorkers.get(key);
      if (current?.workerId === entry.worker.workerId) {
        this.stoppingWorkers.delete(key);
      }
      this.capacityLimiter.release(entry.reservation);
    });
    this.stoppingWorkers.set(key, {
      worker: entry.worker,
      workerId: entry.worker.workerId,
      reservation: entry.reservation,
      stopped,
    });
    await stopped;
    return true;
  }
}

export class DurableExecutionRuntimeShutdownError extends Error {
  constructor() {
    super("Durable execution runtime cannot start workers after shutdown");
    this.name = "DurableExecutionRuntimeShutdownError";
  }
}
