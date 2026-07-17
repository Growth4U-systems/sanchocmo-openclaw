import type { ExecutionRunStatus } from "../../src/lib/execution-control/types";

const RUN_ID_PATTERN = /^xrun_[A-Za-z0-9_-]{1,100}$/;
const TENANT_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

export interface PartnershipsCancellationDrainOptions {
  tenantKey: string;
  runId: string;
  apply: boolean;
  confirmRunId?: string;
}

export interface PartnershipsCancellationDrainReportInput {
  dryRun: boolean;
  runId: string;
  status: ExecutionRunStatus;
  handlerVersion: number | null;
  cancellationRequested: boolean;
  cancellationAcknowledged: boolean;
  executionOutcome?: string;
}

function flagValue(argument: string): [string, string] {
  const equals = argument.indexOf("=");
  if (equals < 0) {
    throw new Error(`${argument} must use --name=value`);
  }
  return [argument.slice(0, equals), argument.slice(equals + 1)];
}

/** Strict parser for an exact, one-run operator mutation. */
export function parsePartnershipsCancellationDrainArgs(
  args: string[],
): PartnershipsCancellationDrainOptions {
  const values = new Map<string, string>();
  let apply = false;
  for (const argument of args) {
    if (argument === "--apply") {
      if (apply) throw new Error("--apply may be supplied only once");
      apply = true;
      continue;
    }
    const [name, value] = flagValue(argument);
    if (!["--tenant", "--run-id", "--confirm-run-id"].includes(name)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (values.has(name)) throw new Error(`${name} may be supplied only once`);
    values.set(name, value);
  }

  const tenantKey = values.get("--tenant")?.trim();
  const runId = values.get("--run-id")?.trim();
  const confirmRunId = values.get("--confirm-run-id")?.trim();
  if (!tenantKey || !TENANT_PATTERN.test(tenantKey)) {
    throw new Error("--tenant is invalid");
  }
  if (!runId || !RUN_ID_PATTERN.test(runId)) {
    throw new Error("--run-id is invalid");
  }
  if (apply && confirmRunId !== runId) {
    throw new Error("--apply requires --confirm-run-id to match --run-id");
  }
  if (!apply && confirmRunId !== undefined) {
    throw new Error("--confirm-run-id is valid only with --apply");
  }

  return {
    tenantKey,
    runId,
    apply,
    ...(confirmRunId ? { confirmRunId } : {}),
  };
}

/**
 * This command proves only the run state. Projection delivery has its own
 * durable outbox and must be inspected separately, even when the engine's
 * best-effort callback happened to succeed during this invocation.
 */
export function partnershipsCancellationDrainReport(
  input: PartnershipsCancellationDrainReportInput,
) {
  return {
    ok: input.dryRun || input.status === "cancelled",
    dryRun: input.dryRun,
    runCancellation: {
      runId: input.runId,
      status: input.status,
      terminal: input.status === "cancelled",
      requested: input.cancellationRequested,
      acknowledged: input.cancellationAcknowledged,
      handlerVersion: input.handlerVersion,
      ...(input.executionOutcome
        ? { executionOutcome: input.executionOutcome }
        : {}),
    },
    projectionDelivery: {
      verified: false,
      status: "not_verified_by_cancellation_drain" as const,
    },
  };
}
