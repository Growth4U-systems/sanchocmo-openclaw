import type { AgentRun } from "@/lib/data/agent-runs";
import type {
  ExecutionOriginControlRepository,
  ExecutionRun,
  ExecutionRunStatus,
} from "@/lib/execution-control";
import { parseThreadId } from "@/lib/thread-id";
import {
  CHAT_EXTERNAL_EXECUTION_LIMIT,
  CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT,
  EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION,
  type ChatExternalExecutionProjection,
  type ChatExternalExecutionSummary,
} from "./external-execution-contract";

export {
  CHAT_EXTERNAL_EXECUTION_LIMIT,
  CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT,
  EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION,
};
export type { ChatExternalExecutionProjection, ChatExternalExecutionSummary };

const ACTIVE_EXECUTION_STATUS_FILTER = Object.freeze([
  "queued",
  "running",
  "waiting_approval",
  "blocked",
] satisfies readonly ExecutionRunStatus[]);
const ACTIVE_EXECUTION_STATUSES = new Set<ExecutionRunStatus>(
  ACTIVE_EXECUTION_STATUS_FILTER,
);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,255}$/;
const MAX_OPERATION_BYTES = 160;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SAFE_IDENTIFIER.test(normalized) ? normalized : null;
}

function safeOperation(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    Buffer.byteLength(normalized, "utf8") > MAX_OPERATION_BYTES ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function safeIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 40) return undefined;
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs)) return undefined;
  return new Date(epochMs).toISOString();
}

const PROGRESS_STAGES = new Set(["search", "enrich", "qualify", "assign"]);

function boundedProgressCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 10_000
    ? value
    : null;
}

/**
 * Fail-closed extraction of the short-step checkpoint counters. Anything that
 * does not match the closed shape exactly is omitted — the badge then falls
 * back to the plain status label; no other run output ever reaches the client.
 */
function sanitizeProgress(
  output: unknown,
): ChatExternalExecutionSummary["progress"] {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }
  const record = output as Record<string, unknown>;
  if (record.schemaVersion !== 1) return undefined;
  const stage =
    typeof record.stage === "string" && PROGRESS_STAGES.has(record.stage)
      ? (record.stage as NonNullable<
          ChatExternalExecutionSummary["progress"]
        >["stage"])
      : null;
  const searchedQueries = boundedProgressCount(record.searchedQueries);
  const poolCount = boundedProgressCount(record.poolCount);
  const attemptedCount = boundedProgressCount(record.attemptedCount);
  const candidateCount = boundedProgressCount(record.candidateCount);
  if (
    !stage ||
    searchedQueries === null ||
    poolCount === null ||
    attemptedCount === null ||
    candidateCount === null
  ) {
    return undefined;
  }
  return { stage, searchedQueries, poolCount, attemptedCount, candidateCount };
}

function sanitizeActiveExecution(
  run: ExecutionRun,
  tenantKey: string,
  parentRunId: string,
): ChatExternalExecutionSummary | null {
  if (run.tenantKey.trim().toLowerCase() !== tenantKey) return null;
  if (!ACTIVE_EXECUTION_STATUSES.has(run.status)) return null;

  const id = safeIdentifier(run.id);
  const operation = safeOperation(run.operation);
  const createdAt = safeIsoTimestamp(run.createdAt);
  const updatedAt = safeIsoTimestamp(run.updatedAt);
  if (!id || !operation || !createdAt || !updatedAt) return null;

  const startedAt = safeIsoTimestamp(run.startedAt);
  const finishedAt = safeIsoTimestamp(run.finishedAt);
  const cancelRequestedAt = safeIsoTimestamp(run.cancelRequestedAt);
  const progress = sanitizeProgress(run.output);
  return {
    id,
    parentRunId,
    operation,
    status: run.status as ChatExternalExecutionSummary["status"],
    createdAt,
    updatedAt,
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(cancelRequestedAt ? { cancelRequestedAt } : {}),
    ...(progress ? { progress } : {}),
  };
}

/**
 * Resolves the latest persisted durable chat turn. A legacy or non-durable
 * turn deliberately has no Ledger projection and must not instantiate a
 * Ledger repository merely because the thread endpoint is being polled.
 */
export function resolveExternalExecutionParent(
  runs: readonly AgentRun[],
  threadId: string,
): AgentRun | null {
  const parents = resolveExternalExecutionParents(runs, threadId);
  return parents[parents.length - 1] ?? null;
}

/**
 * Preserve every durable parent in the already-bounded AgentRun window. A
 * later legacy turn must not hide external work started by an earlier parent.
 */
export function resolveExternalExecutionParents(
  runs: readonly AgentRun[],
  threadId: string,
): AgentRun[] {
  const seen = new Set<string>();
  const parents: AgentRun[] = [];
  for (const run of runs) {
    const runId = safeIdentifier(run.id);
    if (
      run.threadId !== threadId ||
      !runId ||
      seen.has(runId) ||
      record(run.input)?.runtimeDispatchMode !== "ledger-v1"
    ) {
      continue;
    }
    seen.add(runId);
    parents.push(run);
  }
  return parents;
}

/**
 * Builds the only child-execution shape allowed across the chat API boundary.
 * The exact tenant and persisted parent are supplied server-side; arbitrary
 * client run IDs, inputs, outputs and metadata never participate in the read.
 */
export async function projectActiveExternalExecutions(
  input: {
    tenantKey: string;
    parentRuns: readonly AgentRun[];
  },
  repository: Pick<
    ExecutionOriginControlRepository,
    "listRunsByExecutionOriginPage"
  >,
): Promise<ChatExternalExecutionProjection> {
  const tenantKey = input.tenantKey.trim().toLowerCase();
  if (!tenantKey) return EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION;

  const seen = new Set<string>();
  const parents = input.parentRuns.flatMap((parentRun) => {
    const parentRunId = safeIdentifier(parentRun.id);
    const parsedThread = parseThreadId(parentRun.threadId);
    if (
      !parentRunId ||
      seen.has(parentRunId) ||
      !parsedThread ||
      parsedThread.slug !== tenantKey ||
      record(parentRun.input)?.runtimeDispatchMode !== "ledger-v1"
    ) {
      return [];
    }
    seen.add(parentRunId);
    return [{ parentRunId }];
  });
  if (parents.length === 0) return EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION;

  const projectedParents = await Promise.all(
    parents.map(async ({ parentRunId }) => {
      // Filter before limiting in PostgreSQL. This stays one bounded query per
      // parent even when thousands of older terminal children exist, while an
      // active child beyond the first unfiltered page still keeps Stop visible.
      const page = await repository.listRunsByExecutionOriginPage({
        tenantKey,
        parentAgentRunId: parentRunId,
        statuses: ACTIVE_EXECUTION_STATUS_FILTER,
        limit: CHAT_EXTERNAL_EXECUTION_LIMIT,
      });
      const activeExecutions = page.runs
        .map((run) => sanitizeActiveExecution(run, tenantKey, parentRunId))
        .filter((run): run is ChatExternalExecutionSummary => run !== null);
      return { parentRunId, activeExecutions };
    }),
  );
  const activeExecutions = projectedParents.flatMap(
    (projection) => projection.activeExecutions,
  );

  if (activeExecutions.length === 0) {
    return EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION;
  }
  const activeExecutionParentRunIds = projectedParents
    .filter((projection) => projection.activeExecutions.length > 0)
    .map((projection) => projection.parentRunId);
  return {
    activeExecutions,
    activeExecutionParentRunIds,
    activeExecutionsParentRunId:
      activeExecutionParentRunIds[activeExecutionParentRunIds.length - 1] ??
      null,
  };
}
