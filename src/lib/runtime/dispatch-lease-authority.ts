import { createHash, timingSafeEqual } from "node:crypto";
import type {
  ExecutionControlRepository,
  ExecutionLeaseReceipt,
  ExecutionRun,
  LeasableExecutionRunMode,
} from "@/lib/execution-control";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const CAPABILITY_DOMAIN = "sancho-runtime-tool-dispatch-lease-v1";

export interface RuntimeDispatchLeaseParent {
  id: string;
  status: string;
}

export interface RuntimeDispatchLeaseAuthority<
  Parent extends RuntimeDispatchLeaseParent,
  Command,
> {
  dispatchRun: ExecutionRun;
  parentRun: Parent;
  command: Command;
  lease: ExecutionLeaseReceipt;
}

export type RuntimeDispatchLeaseRepository = Pick<
  ExecutionControlRepository,
  "getRunById" | "renewRunLease"
>;

export interface RuntimeDispatchLeaseContract<
  Parent extends RuntimeDispatchLeaseParent,
  Command,
> {
  operation: string;
  mode: LeasableExecutionRunMode;
  aggregateType: string;
  leaseMs: number;
  resolveParentRun(parentRunId: string): Promise<Parent | null>;
  parseCommand(dispatchRun: ExecutionRun): Command;
  bindingMatches(input: {
    parentRun: Parent;
    dispatchRun: ExecutionRun;
    command: Command;
  }): boolean;
}

export interface RuntimeDispatchLeaseAuthorityInput {
  parentRunId: unknown;
  dispatchRunId: unknown;
  leaseToken: unknown;
  capability: unknown;
  allowTerminalParent?: boolean;
  allowCancellationRequested?: boolean;
}

function validText(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

/**
 * Derives the one-lease capability used on the runtime transport. The domain
 * and byte layout deliberately remain stable so an in-flight worker can
 * survive a rolling deploy of the authority implementation.
 */
export function runtimeDispatchLeaseCapability(input: {
  parentRunId: unknown;
  dispatchRunId: unknown;
  leaseToken: unknown;
}): string {
  if (
    !validText(input.parentRunId, RUN_ID_PATTERN) ||
    !validText(input.dispatchRunId, RUN_ID_PATTERN) ||
    !validText(input.leaseToken, LEASE_TOKEN_PATTERN)
  ) {
    throw new Error("runtime_dispatch_lease_identity_invalid");
  }
  return createHash("sha256")
    .update(
      [
        CAPABILITY_DOMAIN,
        input.parentRunId,
        input.dispatchRunId,
        input.leaseToken,
      ].join("\0"),
      "utf8",
    )
    .digest("hex");
}

function capabilityMatches(actual: unknown, expected: string): boolean {
  if (!validText(actual, CAPABILITY_PATTERN)) return false;
  const supplied = Buffer.from(actual, "hex");
  const authoritative = Buffer.from(expected, "hex");
  return (
    supplied.length === authoritative.length &&
    timingSafeEqual(supplied, authoritative)
  );
}

function dispatchMatchesScope<
  Parent extends RuntimeDispatchLeaseParent,
  Command,
>(
  run: ExecutionRun,
  input: { parentRunId: string; dispatchRunId: string },
  contract: RuntimeDispatchLeaseContract<Parent, Command>,
  tenantKey?: string,
): boolean {
  return (
    run.id === input.dispatchRunId &&
    (tenantKey === undefined || run.tenantKey === tenantKey) &&
    run.operation === contract.operation &&
    run.mode === contract.mode &&
    run.aggregateType === contract.aggregateType &&
    run.aggregateId === input.parentRunId &&
    run.status === "running"
  );
}

/**
 * Authorizes a runtime request against the exact live dispatch lease. No
 * caller-supplied tenant, operation, aggregate or parent data is trusted:
 * those values are recovered from the persisted dispatch and its parent.
 */
export async function authorizeRuntimeDispatchLease<
  Parent extends RuntimeDispatchLeaseParent,
  Command,
>(
  input: RuntimeDispatchLeaseAuthorityInput,
  dependencies: {
    repository: RuntimeDispatchLeaseRepository;
    contract: RuntimeDispatchLeaseContract<Parent, Command>;
  },
): Promise<RuntimeDispatchLeaseAuthority<Parent, Command> | null> {
  if (
    !validText(input.parentRunId, RUN_ID_PATTERN) ||
    !validText(input.dispatchRunId, RUN_ID_PATTERN) ||
    !validText(input.leaseToken, LEASE_TOKEN_PATTERN)
  ) {
    return null;
  }
  const parentRunId = input.parentRunId;
  const dispatchRunId = input.dispatchRunId;
  const leaseToken = input.leaseToken;
  const expectedCapability = runtimeDispatchLeaseCapability({
    parentRunId,
    dispatchRunId,
    leaseToken,
  });
  if (!capabilityMatches(input.capability, expectedCapability)) return null;

  const { repository, contract } = dependencies;
  const persistedDispatch = await repository.getRunById(dispatchRunId);
  if (
    !persistedDispatch ||
    !dispatchMatchesScope(
      persistedDispatch,
      { parentRunId, dispatchRunId },
      contract,
    )
  ) {
    return null;
  }

  const lease = await repository.renewRunLease({
    tenantKey: persistedDispatch.tenantKey,
    operation: contract.operation,
    mode: contract.mode,
    runId: persistedDispatch.id,
    token: leaseToken,
    leaseMs: contract.leaseMs,
  });
  if (
    !lease ||
    !dispatchMatchesScope(
      lease.run,
      { parentRunId, dispatchRunId },
      contract,
      persistedDispatch.tenantKey,
    )
  ) {
    return null;
  }
  if (
    (lease.run.cancelRequestId || lease.run.cancelRequestedAt) &&
    !input.allowCancellationRequested
  ) {
    return null;
  }

  let command: Command;
  let parentRun: Parent | null;
  try {
    command = contract.parseCommand(lease.run);
    parentRun = await contract.resolveParentRun(parentRunId);
    if (
      !parentRun ||
      parentRun.id !== parentRunId ||
      !contract.bindingMatches({ parentRun, dispatchRun: lease.run, command })
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const parentStatusAllowed = input.allowTerminalParent
    ? parentRun.status === "queued" ||
      parentRun.status === "running" ||
      parentRun.status === "completed" ||
      parentRun.status === "failed" ||
      parentRun.status === "cancelled"
    : parentRun.status === "queued" || parentRun.status === "running";
  if (!parentStatusAllowed) return null;

  return { dispatchRun: lease.run, parentRun, command, lease };
}
