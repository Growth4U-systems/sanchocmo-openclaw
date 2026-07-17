import type {
  CreateExecutionRunReceipt,
  ExecutionControlRepository,
  ExecutionOriginControlRepository,
  ExecutionLeaseScope,
} from "@/lib/execution-control";
import { DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 } from "./contract";
import type { DurableCapabilityPolicy } from "./effect-executor";
import type { DurableExecutionHandlerV2 } from "./effect-contract";
import {
  DURABLE_JSON_GLOBAL_BOUNDS,
  findDurableSecret,
  isDurableJsonObject,
  parseDurableJsonContractValue,
  validateDurableJson,
  type DurableJson,
  type DurableJsonObject,
} from "./json-contract";
import { isSafeDurableExecutionTenantKey } from "./scope-discovery";
import {
  DurableExecutionRegistry,
  UnsupportedDurableExecutionHandlerContractError,
} from "./registry";
import {
  parseDurableExecutionOrigin,
  type DurableExecutionOrigin,
} from "./execution-origin";

const RESERVED_METADATA_KEYS = new Set([
  "authority",
  "executionContractVersion",
  "executionHandlerVersion",
  "executionPolicyFingerprint",
  "executionCommandFingerprint",
  "executionCommandSchemaVersion",
  "executionOrigin",
]);

export type DurableExecutionAdmissionErrorCode =
  | "durable_handler_contract_unsupported"
  | "durable_capability_denied"
  | "durable_capability_policy_unavailable"
  | "durable_scope_invalid"
  | "durable_identity_invalid"
  | "durable_metadata_invalid"
  | "durable_metadata_reserved"
  | "durable_origin_authority_unavailable";

/** Stable and value-free: adapters may map this to their transport errors. */
export class DurableExecutionAdmissionError extends Error {
  constructor(readonly code: DurableExecutionAdmissionErrorCode) {
    super(`Durable execution admission failed (${code})`);
    this.name = "DurableExecutionAdmissionError";
  }
}

export interface AdmitDurableExecutionV2Input {
  repository: Pick<ExecutionControlRepository, "createRun"> &
    Partial<
      Pick<ExecutionOriginControlRepository, "createRunWithTrustedOrigin">
    >;
  registry: DurableExecutionRegistry;
  capabilityPolicy: Pick<DurableCapabilityPolicy, "mayAdmit">;
  scope: ExecutionLeaseScope;
  handlerVersion: number;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  command: unknown;
  traceId?: string;
  /** Non-sensitive correlation data. Runtime-owned fields are reserved. */
  metadata?: unknown;
  /** Server-attested origin. Never populate this from model/public JSON. */
  trustedOrigin?: DurableExecutionOrigin;
}

export interface DurableExecutionAdmissionReceipt extends CreateExecutionRunReceipt {
  command: DurableJson;
  commandFingerprint: string;
  policyFingerprint: string;
}

export type PrepareDurableExecutionAdmissionV2Input = Omit<
  AdmitDurableExecutionV2Input,
  "repository"
>;

export interface PreparedDurableExecutionAdmissionV2 {
  createInput: Parameters<ExecutionControlRepository["createRun"]>[0];
  command: DurableJson;
  commandFingerprint: string;
  policyFingerprint: string;
}

const OPERATION_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;

interface CanonicalAdmissionIdentity {
  scope: Readonly<ExecutionLeaseScope>;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  traceId?: string;
}

function safeOpaqueIdentifier(
  value: unknown,
  maxLength: number,
  lowercase = false,
): string {
  if (typeof value !== "string") {
    throw new DurableExecutionAdmissionError("durable_identity_invalid");
  }
  const trimmed = value.trim();
  const canonical = lowercase ? trimmed.toLowerCase() : trimmed;
  if (
    canonical.length < 1 ||
    canonical.length > maxLength ||
    !OPAQUE_ID_PATTERN.test(canonical) ||
    findDurableSecret(canonical)
  ) {
    throw new DurableExecutionAdmissionError("durable_identity_invalid");
  }
  return canonical;
}

function canonicalAdmissionIdentity(
  input: PrepareDurableExecutionAdmissionV2Input,
): CanonicalAdmissionIdentity {
  if (!input.scope || typeof input.scope !== "object") {
    throw new DurableExecutionAdmissionError("durable_scope_invalid");
  }
  const tenantKey =
    typeof input.scope.tenantKey === "string"
      ? input.scope.tenantKey.trim().toLowerCase()
      : "";
  const operation =
    typeof input.scope.operation === "string"
      ? input.scope.operation.trim().toLowerCase()
      : "";
  if (
    !isSafeDurableExecutionTenantKey(tenantKey) ||
    !OPERATION_PATTERN.test(operation) ||
    (input.scope.mode !== "canary" && input.scope.mode !== "active")
  ) {
    throw new DurableExecutionAdmissionError("durable_scope_invalid");
  }
  const scope = Object.freeze({
    tenantKey,
    operation,
    mode: input.scope.mode,
  });
  const aggregateType = safeOpaqueIdentifier(input.aggregateType, 128, true);
  const aggregateId = safeOpaqueIdentifier(input.aggregateId, 256);
  const idempotencyKey = safeOpaqueIdentifier(input.idempotencyKey, 256);
  const traceId =
    input.traceId === undefined
      ? undefined
      : safeOpaqueIdentifier(input.traceId, 256);
  return Object.freeze({
    scope,
    aggregateType,
    aggregateId,
    idempotencyKey,
    ...(traceId ? { traceId } : {}),
  });
}

function admissionMetadata(value: unknown): DurableJsonObject {
  const raw = value ?? {};
  let validated: DurableJson;
  try {
    validated = validateDurableJson(raw, {
      bounds: DURABLE_JSON_GLOBAL_BOUNDS.metadata,
      secrets: { mode: "reject" },
    }).value;
  } catch {
    throw new DurableExecutionAdmissionError("durable_metadata_invalid");
  }
  if (!isDurableJsonObject(validated)) {
    throw new DurableExecutionAdmissionError("durable_metadata_invalid");
  }
  if (Object.keys(validated).some((key) => RESERVED_METADATA_KEYS.has(key))) {
    throw new DurableExecutionAdmissionError("durable_metadata_reserved");
  }
  return validated;
}

function requireV2Handler(
  registry: DurableExecutionRegistry,
  operation: string,
  version: number,
): DurableExecutionHandlerV2 {
  const handler = registry.requireRegistered(operation, version);
  if (
    handler.contractVersion !== DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2
  ) {
    throw new DurableExecutionAdmissionError(
      "durable_handler_contract_unsupported",
    );
  }
  return handler;
}

/**
 * Single generic admission boundary for contract-v2 commands. Validation and
 * capability authorization complete before the first database mutation.
 */
export function prepareDurableExecutionAdmissionV2(
  input: PrepareDurableExecutionAdmissionV2Input,
): PreparedDurableExecutionAdmissionV2 {
  const identity = canonicalAdmissionIdentity(input);
  let handler: DurableExecutionHandlerV2;
  try {
    handler = requireV2Handler(
      input.registry,
      identity.scope.operation,
      input.handlerVersion,
    );
  } catch (error) {
    if (error instanceof UnsupportedDurableExecutionHandlerContractError) {
      throw new DurableExecutionAdmissionError(
        "durable_handler_contract_unsupported",
      );
    }
    throw error;
  }
  if (handler.operation !== identity.scope.operation) {
    throw new DurableExecutionAdmissionError("durable_scope_invalid");
  }
  const command = parseDurableJsonContractValue(
    handler.command,
    input.command,
    "command",
  );
  const callerMetadata = admissionMetadata(input.metadata);
  const executionOrigin =
    input.trustedOrigin === undefined
      ? undefined
      : parseDurableExecutionOrigin(input.trustedOrigin);
  if (input.trustedOrigin !== undefined && !executionOrigin) {
    throw new DurableExecutionAdmissionError("durable_metadata_invalid");
  }
  const policyFingerprint = input.registry.executionPolicyFingerprint(
    handler.operation,
    handler.version,
  );
  const capabilities = [
    ...new Set(
      Object.values(handler.effects).map((effect) => effect.capability),
    ),
  ].sort();
  for (const capability of capabilities) {
    let admitted: boolean;
    try {
      admitted =
        input.capabilityPolicy.mayAdmit({
          scope: identity.scope,
          handlerVersion: handler.version,
          capability,
        }) === true;
    } catch {
      throw new DurableExecutionAdmissionError(
        "durable_capability_policy_unavailable",
      );
    }
    if (!admitted) {
      throw new DurableExecutionAdmissionError("durable_capability_denied");
    }
  }

  let metadata: DurableJsonObject;
  try {
    const checked = validateDurableJson(
      {
        ...callerMetadata,
        authority: "execution_ledger_v2",
        executionContractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
        executionHandlerVersion: handler.version,
        executionPolicyFingerprint: policyFingerprint,
        executionCommandFingerprint: command.fingerprint,
        executionCommandSchemaVersion: command.schemaVersion,
        ...(executionOrigin ? { executionOrigin } : {}),
      },
      {
        bounds: DURABLE_JSON_GLOBAL_BOUNDS.metadata,
        secrets: { mode: "reject" },
      },
    ).value;
    if (!isDurableJsonObject(checked)) throw new Error("invalid metadata");
    metadata = checked;
  } catch {
    throw new DurableExecutionAdmissionError("durable_metadata_invalid");
  }

  const createInput = Object.freeze({
    tenantKey: identity.scope.tenantKey,
    aggregateType: identity.aggregateType,
    aggregateId: identity.aggregateId,
    operation: identity.scope.operation,
    idempotencyKey: identity.idempotencyKey,
    mode: identity.scope.mode,
    input: command.value,
    metadata,
    ...(identity.traceId ? { traceId: identity.traceId } : {}),
  });
  return {
    createInput,
    command: command.value,
    commandFingerprint: command.fingerprint,
    policyFingerprint,
  };
}

export async function admitDurableExecutionV2(
  input: AdmitDurableExecutionV2Input,
): Promise<DurableExecutionAdmissionReceipt> {
  const prepared = prepareDurableExecutionAdmissionV2(input);
  const trustedOrigin =
    input.trustedOrigin === undefined
      ? undefined
      : parseDurableExecutionOrigin(input.trustedOrigin);
  if (input.trustedOrigin !== undefined && !trustedOrigin) {
    throw new DurableExecutionAdmissionError("durable_metadata_invalid");
  }
  if (
    trustedOrigin &&
    typeof input.repository.createRunWithTrustedOrigin !== "function"
  ) {
    // Never downgrade an origin-bearing admission to public metadata. An
    // in-memory/test adapter must implement the explicit capability or fail.
    throw new DurableExecutionAdmissionError(
      "durable_origin_authority_unavailable",
    );
  }
  const receipt = trustedOrigin
    ? await input.repository.createRunWithTrustedOrigin!({
        command: prepared.createInput,
        origin: trustedOrigin,
      })
    : await input.repository.createRun(prepared.createInput);
  return {
    ...receipt,
    command: prepared.command,
    commandFingerprint: prepared.commandFingerprint,
    policyFingerprint: prepared.policyFingerprint,
  };
}
