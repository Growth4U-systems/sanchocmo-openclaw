import { createHash } from "node:crypto";
import type { ExecutionRun } from "@/lib/execution-control";
import type {
  DurableExecutionHandler,
  DurableExecutionHandlerVersion,
} from "./runtime";
import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
  isDurableExecutionHandlerContractVersion,
  type DurableExecutionHandlerContractVersion,
} from "./contract";
import {
  durableEffectPolicyFingerprint,
  type DurableEffectMap,
  type DurableExecutionHandlerV2,
  validateDurableEffectDefinition,
} from "./effect-contract";
import type { DurableJson, DurableJsonContract } from "./json-contract";
import {
  canonicalDurableJson,
  DURABLE_JSON_GLOBAL_BOUNDS,
  validateDurableJsonContractDescriptor,
} from "./json-contract";

export type RegisteredDurableExecutionHandler =
  DurableExecutionHandler | DurableExecutionHandlerV2;

export const MAX_DURABLE_EFFECTS_PER_HANDLER = 32 as const;

export class DuplicateDurableExecutionHandlerError extends Error {
  constructor(operation: string, version: number) {
    super(
      `Durable execution handler already registered: ${operation}@${version}`,
    );
    this.name = "DuplicateDurableExecutionHandlerError";
  }
}

export class UnknownDurableExecutionHandlerError extends Error {
  constructor(operation: string, version?: number) {
    super(
      version === undefined
        ? `No durable execution handler registered for operation: ${operation}`
        : `No durable execution handler registered: ${operation}@${version}`,
    );
    this.name = "UnknownDurableExecutionHandlerError";
  }
}

export class InvalidDurableExecutionHandlerVersionError extends Error {
  readonly code = "durable_execution_handler_version_invalid" as const;

  constructor() {
    super("Durable execution run has an invalid handler version");
    this.name = "InvalidDurableExecutionHandlerVersionError";
  }
}

export class UnsupportedDurableExecutionHandlerContractError extends Error {
  constructor(readonly contractVersion: unknown) {
    super(
      `Unsupported durable execution handler contract: ${String(contractVersion)}`,
    );
    this.name = "UnsupportedDurableExecutionHandlerContractError";
  }
}

export class DurableExecutionHandlerContractMismatchError extends Error {
  readonly code = "durable_execution_handler_contract_mismatch" as const;

  constructor() {
    super("Durable execution run and handler contracts do not match");
    this.name = "DurableExecutionHandlerContractMismatchError";
  }
}

export type DurableExecutionHandlerValidationReason =
  | "operation"
  | "command_contract"
  | "checkpoint_contract"
  | "result_contract"
  | "effects"
  | "execute"
  | "classify"
  | "projection"
  | "reconciliation";

export class DurableExecutionHandlerValidationError extends Error {
  readonly code = "durable_execution_handler_invalid" as const;

  constructor(readonly reason: DurableExecutionHandlerValidationReason) {
    super(`Durable execution handler v2 is invalid (${reason})`);
    this.name = "DurableExecutionHandlerValidationError";
  }
}

export class DurableEffectPolicyDriftError extends Error {
  readonly code = "durable_effect_policy_drift" as const;

  constructor() {
    super("Registered durable effect policy changed without a new version");
    this.name = "DurableEffectPolicyDriftError";
  }
}

export class DurableExecutionHandlerPolicyDriftError extends Error {
  readonly code = "durable_execution_handler_policy_drift" as const;

  constructor() {
    super("Registered durable handler policy changed without a new version");
    this.name = "DurableExecutionHandlerPolicyDriftError";
  }
}

export class DurableExecutionPolicyMismatchError extends Error {
  readonly code = "durable_execution_policy_mismatch" as const;

  constructor() {
    super("Durable execution run and registered policy do not match");
    this.name = "DurableExecutionPolicyMismatchError";
  }
}

function normalizedOperation(operation: string): string {
  const value = operation.trim().toLowerCase();
  if (!value) throw new Error("Durable execution operation cannot be empty");
  return value;
}

function normalizedVersion(version: number): DurableExecutionHandlerVersion {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(
      "Durable execution handler version must be a positive integer",
    );
  }
  return version as DurableExecutionHandlerVersion;
}

function normalizedContractVersion(
  version: unknown,
): DurableExecutionHandlerContractVersion {
  if (!isDurableExecutionHandlerContractVersion(version)) {
    throw new UnsupportedDurableExecutionHandlerContractError(version);
  }
  return version;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface ValidatedHandlerV2Policy {
  handlerFingerprint: string;
  effectFingerprints: Map<string, string>;
}

function jsonContractPolicyDescriptor(
  contract: DurableJsonContract<DurableJson>,
) {
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
    secrets: {
      mode: contract.secrets.mode,
      credentialRefPattern: contract.secrets.credentialRefPattern
        ? {
            source: contract.secrets.credentialRefPattern.source,
            flags: [...contract.secrets.credentialRefPattern.flags]
              .sort()
              .join(""),
          }
        : null,
    },
  };
}

function handlerPolicyFingerprint(handler: DurableExecutionHandlerV2): string {
  const descriptor = {
    contractVersion: handler.contractVersion,
    operation: handler.operation,
    version: handler.version,
    command: jsonContractPolicyDescriptor(handler.command),
    checkpoint: jsonContractPolicyDescriptor(handler.checkpoint),
    result: jsonContractPolicyDescriptor(handler.result),
  } as unknown as DurableJson;
  return createHash("sha256")
    .update(
      canonicalDurableJson(descriptor, DURABLE_JSON_GLOBAL_BOUNDS.checkpoint),
      "utf8",
    )
    .digest("hex");
}

function executionPolicyFingerprintValue(
  policy: ValidatedHandlerV2Policy,
): string {
  const descriptor = {
    handler: policy.handlerFingerprint,
    effects: Object.fromEntries(
      [...policy.effectFingerprints].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  } as unknown as DurableJson;
  return createHash("sha256")
    .update(
      canonicalDurableJson(descriptor, DURABLE_JSON_GLOBAL_BOUNDS.checkpoint),
      "utf8",
    )
    .digest("hex");
}

function validateHandlerV2(
  handler: DurableExecutionHandlerV2,
): ValidatedHandlerV2Policy {
  const normalized = normalizedOperation(handler.operation);
  if (
    handler.operation !== normalized ||
    !/^[a-z][a-z0-9._-]{0,127}$/.test(handler.operation)
  ) {
    throw new DurableExecutionHandlerValidationError("operation");
  }
  try {
    validateDurableJsonContractDescriptor(handler.command, "command");
  } catch {
    throw new DurableExecutionHandlerValidationError("command_contract");
  }
  try {
    validateDurableJsonContractDescriptor(handler.checkpoint, "checkpoint");
  } catch {
    throw new DurableExecutionHandlerValidationError("checkpoint_contract");
  }
  try {
    validateDurableJsonContractDescriptor(handler.result, "checkpoint");
  } catch {
    throw new DurableExecutionHandlerValidationError("result_contract");
  }
  if (
    !isPlainRecord(handler.effects) ||
    Object.getOwnPropertySymbols(handler.effects).length > 0 ||
    Object.keys(handler.effects).length > MAX_DURABLE_EFFECTS_PER_HANDLER
  ) {
    throw new DurableExecutionHandlerValidationError("effects");
  }
  const fingerprints = new Map<string, string>();
  for (const [step, definition] of Object.entries(handler.effects)) {
    try {
      validateDurableEffectDefinition(definition, step);
      if (fingerprints.has(definition.step)) {
        throw new Error("duplicate step");
      }
      fingerprints.set(
        definition.step,
        durableEffectPolicyFingerprint(definition),
      );
    } catch {
      throw new DurableExecutionHandlerValidationError("effects");
    }
  }
  if (typeof handler.execute !== "function") {
    throw new DurableExecutionHandlerValidationError("execute");
  }
  if (typeof handler.classifyPureError !== "function") {
    throw new DurableExecutionHandlerValidationError("classify");
  }
  if (typeof handler.projectTerminal !== "function") {
    throw new DurableExecutionHandlerValidationError("projection");
  }
  if (
    handler.reconcileTerminal !== undefined &&
    typeof handler.reconcileTerminal !== "function"
  ) {
    throw new DurableExecutionHandlerValidationError("reconciliation");
  }
  return {
    handlerFingerprint: handlerPolicyFingerprint(handler),
    effectFingerprints: fingerprints,
  };
}

/**
 * Resolve the immutable command handler version. Producers should persist the
 * version in metadata; `input.schemaVersion` remains a v1 compatibility path.
 */
export function executionHandlerVersionFromRun(
  run: Pick<ExecutionRun, "metadata" | "input">,
): DurableExecutionHandlerVersion {
  const metadataVersion = run.metadata.executionHandlerVersion;
  const inputVersion =
    run.input && typeof run.input === "object"
      ? (run.input as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  const candidate = metadataVersion ?? inputVersion ?? 1;
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate < 1
  ) {
    throw new InvalidDurableExecutionHandlerVersionError();
  }
  return candidate as DurableExecutionHandlerVersion;
}

/** Runs admitted before contract metadata existed are unambiguously v1. */
export function executionHandlerContractVersionFromRun(
  run: Pick<ExecutionRun, "metadata">,
): DurableExecutionHandlerContractVersion {
  const candidate =
    run.metadata.executionContractVersion ??
    DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION;
  return normalizedContractVersion(candidate);
}

/** Versioned, product-agnostic operation registry. */
export class DurableExecutionRegistry {
  private readonly handlers = new Map<
    string,
    Map<DurableExecutionHandlerVersion, RegisteredDurableExecutionHandler>
  >();
  private readonly effectFingerprints = new Map<
    string,
    Map<DurableExecutionHandlerVersion, Map<string, string>>
  >();
  private readonly handlerFingerprints = new Map<
    string,
    Map<DurableExecutionHandlerVersion, string>
  >();
  private readonly executionFingerprints = new Map<
    string,
    Map<DurableExecutionHandlerVersion, string>
  >();

  register<Command, Result>(
    handler: DurableExecutionHandler<Command, Result>,
  ): this;
  register<
    Command extends DurableJson,
    Checkpoint extends DurableJson,
    Result extends DurableJson,
    Effects extends DurableEffectMap,
  >(
    handler: DurableExecutionHandlerV2<Command, Checkpoint, Result, Effects>,
  ): this;
  register(handler: RegisteredDurableExecutionHandler): this {
    const contractVersion = normalizedContractVersion(handler.contractVersion);
    const operation = normalizedOperation(handler.operation);
    const version = normalizedVersion(handler.version);
    const policy =
      contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
        ? validateHandlerV2(handler as DurableExecutionHandlerV2)
        : undefined;
    let versions = this.handlers.get(operation);
    if (!versions) {
      versions = new Map();
      this.handlers.set(operation, versions);
    }
    if (versions.has(version)) {
      throw new DuplicateDurableExecutionHandlerError(operation, version);
    }
    versions.set(version, handler);
    if (policy) {
      let handlerVersions = this.handlerFingerprints.get(operation);
      if (!handlerVersions) {
        handlerVersions = new Map();
        this.handlerFingerprints.set(operation, handlerVersions);
      }
      handlerVersions.set(version, policy.handlerFingerprint);
      let executionVersions = this.executionFingerprints.get(operation);
      if (!executionVersions) {
        executionVersions = new Map();
        this.executionFingerprints.set(operation, executionVersions);
      }
      executionVersions.set(version, executionPolicyFingerprintValue(policy));
      let effectVersions = this.effectFingerprints.get(operation);
      if (!effectVersions) {
        effectVersions = new Map();
        this.effectFingerprints.set(operation, effectVersions);
      }
      effectVersions.set(version, policy.effectFingerprints);
    }
    return this;
  }

  hasOperation(operation: string): boolean {
    return this.handlers.has(normalizedOperation(operation));
  }

  /** Dual-contract lookup for admission and the future v2 executor. */
  requireRegistered(
    operation: string,
    version: number,
  ): RegisteredDurableExecutionHandler {
    const normalized = normalizedOperation(operation);
    const normalizedHandlerVersion = normalizedVersion(version);
    const handler = this.handlers
      .get(normalized)
      ?.get(normalizedHandlerVersion);
    if (!handler) {
      throw new UnknownDurableExecutionHandlerError(
        normalized,
        normalizedHandlerVersion,
      );
    }
    if (
      handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
    ) {
      const frozenHandler = this.handlerFingerprints
        .get(normalized)
        ?.get(normalizedHandlerVersion);
      const frozenEffects = this.effectFingerprints
        .get(normalized)
        ?.get(normalizedHandlerVersion);
      let current: ValidatedHandlerV2Policy;
      try {
        current = validateHandlerV2(handler);
      } catch (error) {
        if (
          error instanceof DurableExecutionHandlerValidationError &&
          error.reason === "effects"
        ) {
          throw new DurableEffectPolicyDriftError();
        }
        throw new DurableExecutionHandlerPolicyDriftError();
      }
      if (!frozenHandler || frozenHandler !== current.handlerFingerprint) {
        throw new DurableExecutionHandlerPolicyDriftError();
      }
      if (
        !frozenEffects ||
        frozenEffects.size !== current.effectFingerprints.size ||
        [...frozenEffects].some(
          ([step, fingerprint]) =>
            current.effectFingerprints.get(step) !== fingerprint,
        )
      ) {
        throw new DurableEffectPolicyDriftError();
      }
    }
    return handler;
  }

  /** Existing engine view. A v2 run stays queued until its executor is wired. */
  require<Command = unknown, Result = unknown>(
    operation: string,
    version: number,
  ): DurableExecutionHandler<Command, Result> {
    const handler = this.requireRegistered(operation, version);
    if (
      handler.contractVersion !== DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
    ) {
      throw new UnsupportedDurableExecutionHandlerContractError(
        handler.contractVersion,
      );
    }
    return handler as DurableExecutionHandler<Command, Result>;
  }

  /** Resolve and verify both the handler version and contract frozen on a run. */
  resolveRegistered(run: ExecutionRun): RegisteredDurableExecutionHandler {
    if (!this.hasOperation(run.operation)) {
      throw new UnknownDurableExecutionHandlerError(run.operation);
    }
    const version = executionHandlerVersionFromRun(run);
    const handler = this.requireRegistered(run.operation, version);
    const contractVersion = executionHandlerContractVersionFromRun(run);
    if (handler.contractVersion !== contractVersion) {
      throw new DurableExecutionHandlerContractMismatchError();
    }
    if (
      handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
    ) {
      const persistedFingerprint = run.metadata.executionPolicyFingerprint;
      if (
        typeof persistedFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(persistedFingerprint) ||
        persistedFingerprint !==
          this.executionPolicyFingerprint(run.operation, version)
      ) {
        throw new DurableExecutionPolicyMismatchError();
      }
    }
    return handler;
  }

  /** Existing engine compatibility lookup; v2 is fail-closed, not legacy. */
  resolve(run: ExecutionRun): DurableExecutionHandler {
    const handler = this.resolveRegistered(run);
    if (
      handler.contractVersion !== DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION
    ) {
      throw new UnsupportedDurableExecutionHandlerContractError(
        handler.contractVersion,
      );
    }
    return handler;
  }

  /** Existing engine compatibility view. */
  handlersForOperation(operation: string): DurableExecutionHandler[] {
    return this.registeredHandlersForOperation(operation).filter(
      (handler): handler is DurableExecutionHandler =>
        handler.contractVersion === DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
    );
  }

  registeredHandlersForOperation(
    operation: string,
  ): RegisteredDurableExecutionHandler[] {
    const normalized = normalizedOperation(operation);
    const versions = this.handlers.get(normalized);
    if (!versions) {
      throw new UnknownDurableExecutionHandlerError(normalized);
    }
    return [...versions.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, handler]) => handler);
  }

  effectPolicyFingerprint(
    operation: string,
    version: number,
    step: string,
  ): string {
    const handler = this.requireRegistered(operation, version);
    if (
      handler.contractVersion !== DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
    ) {
      throw new UnsupportedDurableExecutionHandlerContractError(
        handler.contractVersion,
      );
    }
    const fingerprint = this.effectFingerprints
      .get(normalizedOperation(operation))
      ?.get(normalizedVersion(version))
      ?.get(step);
    if (!fingerprint) {
      throw new DurableExecutionHandlerValidationError("effects");
    }
    return fingerprint;
  }

  /**
   * Aggregate identity frozen on every v2 run. Unlike the process-local drift
   * checks, this detects a same-version contract/policy change across deploys.
   */
  executionPolicyFingerprint(operation: string, version: number): string {
    const handler = this.requireRegistered(operation, version);
    if (
      handler.contractVersion !== DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
    ) {
      throw new UnsupportedDurableExecutionHandlerContractError(
        handler.contractVersion,
      );
    }
    const fingerprint = this.executionFingerprints
      .get(normalizedOperation(operation))
      ?.get(normalizedVersion(version));
    if (!fingerprint) {
      throw new DurableExecutionHandlerPolicyDriftError();
    }
    return fingerprint;
  }

  descriptors(): Array<{ operation: string; version: number }> {
    return [...this.handlers.entries()]
      .flatMap(([operation, versions]) =>
        [...versions.keys()].map((version) => ({ operation, version })),
      )
      .sort(
        (left, right) =>
          left.operation.localeCompare(right.operation) ||
          left.version - right.version,
      );
  }

  contractDescriptors(): Array<{
    operation: string;
    version: number;
    contractVersion: DurableExecutionHandlerContractVersion;
  }> {
    return [...this.handlers.entries()]
      .flatMap(([operation, versions]) =>
        [...versions.entries()].map(([version, handler]) => ({
          operation,
          version,
          contractVersion: handler.contractVersion,
        })),
      )
      .sort(
        (left, right) =>
          left.operation.localeCompare(right.operation) ||
          left.version - right.version,
      );
  }
}
