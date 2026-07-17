import type {
  ExecutionScopedRunRef,
  ExecutionTerminalProjection,
  ResumeBlockedExecutionTerminalProjectionInput,
} from "../../src/lib/execution-control/types";

export interface TerminalProjectionRepairOptions {
  tenantKey: string;
  operation: string;
  mode: "canary" | "active";
  runId: string;
  expectedErrorCode: string;
  apply: boolean;
  confirmRunId?: string;
}

export interface TerminalProjectionRepairRepository {
  getTerminalProjectionForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionTerminalProjection | null>;
  resumeBlockedTerminalProjection(
    input: ResumeBlockedExecutionTerminalProjectionInput,
  ): Promise<ExecutionTerminalProjection | null>;
}

export interface TerminalProjectionRepairSummary {
  runId: string;
  tenantKey: string;
  operation: string;
  mode: "canary" | "active";
  terminalStatus: string;
  state: string;
  claimCount: number;
  lastErrorCode?: string;
  updatedAt: string;
}

export type TerminalProjectionRepairResult =
  | {
      kind: "ready" | "resumed";
      projection: TerminalProjectionRepairSummary;
    }
  | {
      kind: "not_found" | "not_blocked" | "stale_incident" | "cas_lost";
      projection?: TerminalProjectionRepairSummary;
    };

const TENANT_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const OPERATION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,159}$/;
const RUN_ID_PATTERN = /^xrun_[a-z0-9_-]{1,180}$/i;
const ERROR_CODE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/;

function requiredValue(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${flag} is required`);
  return normalized;
}

function flagValue(args: string[], index: number): [string, number] {
  const argument = args[index]!;
  const equals = argument.indexOf("=");
  if (equals >= 0) return [argument.slice(equals + 1), index];
  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`${argument} requires a value`);
  }
  return [next, index + 1];
}

export function parseTerminalProjectionRepairArgs(
  args: string[],
): TerminalProjectionRepairOptions {
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const name = equals >= 0 ? argument.slice(0, equals) : argument;
    if (
      ![
        "--tenant",
        "--operation",
        "--mode",
        "--run-id",
        "--expected-error-code",
        "--confirm-run-id",
      ].includes(name)
    ) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const [value, consumedIndex] = flagValue(args, index);
    if (values.has(name)) throw new Error(`${name} may be supplied only once`);
    values.set(name, value);
    index = consumedIndex;
  }

  const tenantKey = requiredValue(values.get("--tenant"), "--tenant");
  const operation = requiredValue(values.get("--operation"), "--operation");
  const mode = requiredValue(values.get("--mode"), "--mode");
  const runId = requiredValue(values.get("--run-id"), "--run-id");
  const expectedErrorCode = requiredValue(
    values.get("--expected-error-code"),
    "--expected-error-code",
  );
  const confirmRunId = values.get("--confirm-run-id")?.trim();

  if (!TENANT_PATTERN.test(tenantKey)) throw new Error("--tenant is invalid");
  if (!OPERATION_PATTERN.test(operation)) {
    throw new Error("--operation is invalid");
  }
  if (mode !== "canary" && mode !== "active") {
    throw new Error("--mode must be canary or active");
  }
  if (!RUN_ID_PATTERN.test(runId)) throw new Error("--run-id is invalid");
  if (!ERROR_CODE_PATTERN.test(expectedErrorCode)) {
    throw new Error("--expected-error-code is invalid");
  }
  if (apply && confirmRunId !== runId) {
    throw new Error(
      "--apply requires --confirm-run-id to exactly match --run-id",
    );
  }
  if (!apply && confirmRunId) {
    throw new Error("--confirm-run-id is valid only with --apply");
  }

  return {
    tenantKey,
    operation,
    mode,
    runId,
    expectedErrorCode,
    apply,
    ...(confirmRunId ? { confirmRunId } : {}),
  };
}

function summary(
  projection: ExecutionTerminalProjection,
): TerminalProjectionRepairSummary {
  return {
    runId: projection.runId,
    tenantKey: projection.tenantKey,
    operation: projection.operation,
    mode: projection.mode,
    terminalStatus: projection.terminalStatus,
    state: projection.state,
    claimCount: projection.claimCount,
    ...(projection.lastErrorCode
      ? { lastErrorCode: projection.lastErrorCode }
      : {}),
    updatedAt: projection.updatedAt,
  };
}

export async function inspectOrResumeTerminalProjection(
  repository: TerminalProjectionRepairRepository,
  options: TerminalProjectionRepairOptions,
): Promise<TerminalProjectionRepairResult> {
  const scope = {
    tenantKey: options.tenantKey,
    operation: options.operation,
    mode: options.mode,
    runId: options.runId,
  } as const;
  const current = await repository.getTerminalProjectionForScope(scope);
  if (!current) return { kind: "not_found" };
  const currentSummary = summary(current);
  if (current.state !== "blocked") {
    return { kind: "not_blocked", projection: currentSummary };
  }
  if (current.lastErrorCode !== options.expectedErrorCode) {
    return { kind: "stale_incident", projection: currentSummary };
  }
  if (!options.apply) return { kind: "ready", projection: currentSummary };

  const resumed = await repository.resumeBlockedTerminalProjection({
    ...scope,
    expectedErrorCode: options.expectedErrorCode,
  });
  return resumed
    ? { kind: "resumed", projection: summary(resumed) }
    : { kind: "cas_lost", projection: currentSummary };
}
