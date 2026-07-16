import { createHash } from "node:crypto";
import type {
  ExecutionCancellationControlRepository,
  ExecutionCancellationReasonCode,
  ExecutionOriginCancellationReceipt,
  ExecutionOriginControlRepository,
  ExecutionRun,
} from "@/lib/execution-control";

const TERMINAL = new Set(["completed", "partial", "failed", "cancelled"]);
const ORIGIN_CHILD_PAGE_SIZE = 100;

export type ExecutionOriginCancellationRepository =
  ExecutionOriginControlRepository & ExecutionCancellationControlRepository;

export interface ExecutionOriginCancellationResult {
  originCancellation: ExecutionOriginCancellationReceipt;
  children: ExecutionRun[];
  requestedRunIds: string[];
  pendingRunIds: string[];
}

function cancellationId(parentAgentRunId: string, childRunId: string): string {
  return `cancel_${createHash("sha256")
    .update(`mc-chat-origin-cancel-v1\0${parentAgentRunId}\0${childRunId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function originCancellationId(parentAgentRunId: string): string {
  return `cancel_${createHash("sha256")
    .update(`mc-chat-origin-tombstone-v1\0${parentAgentRunId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

/**
 * Request cancellation for every non-terminal durable child that was admitted
 * from one server-attested MC Chat parent. The bounded reverse lookup must fail
 * rather than truncate: silently missing child 101 would violate Stop.
 */
export async function requestExecutionOriginCancellation(
  input: {
    tenantKey: string;
    parentAgentRunId: string;
    actor: { type: "user" | "service" | "system"; id: string };
    reasonCode?: ExecutionCancellationReasonCode;
  },
  repository: ExecutionOriginCancellationRepository,
): Promise<ExecutionOriginCancellationResult> {
  const reasonCode = input.reasonCode ?? "user_requested";
  // This monotonic write is deliberately first. It serializes against trusted
  // child creation, so every child is either visible in the pages below or was
  // rejected before admission.
  const originCancellation = await repository.requestOriginCancellation({
    tenantKey: input.tenantKey,
    origin: {
      schemaVersion: 1,
      kind: "mc_chat_parent_run",
      parentAgentRunId: input.parentAgentRunId,
    },
    cancellationId: originCancellationId(input.parentAgentRunId),
    actor: input.actor,
    reasonCode,
  });
  const children: ExecutionRun[] = [];
  const requestedRunIds: string[] = [];
  const pendingRunIds: string[] = [];

  let afterRunId: string | undefined;
  do {
    const page = await repository.listRunsByExecutionOriginPage({
      tenantKey: input.tenantKey,
      parentAgentRunId: input.parentAgentRunId,
      ...(afterRunId ? { afterRunId } : {}),
      limit: ORIGIN_CHILD_PAGE_SIZE,
    });
    children.push(...page.runs);
    for (const child of page.runs) {
      if (TERMINAL.has(child.status)) continue;
      if (child.cancelRequestId) {
        // Another exact-scope cancellation already owns the child receipt.
        // It is still pending work for the root Stop, but no conflicting
        // second receipt should be attempted.
        if (child.status === "running") pendingRunIds.push(child.id);
        continue;
      }
      const receipt = await repository.requestRunCancellation({
        tenantKey: child.tenantKey,
        operation: child.operation,
        mode: child.mode,
        runId: child.id,
        cancellationId: cancellationId(input.parentAgentRunId, child.id),
        actor: input.actor,
        reasonCode,
      });
      if (!receipt) {
        throw new Error("execution_origin_child_cancellation_unavailable");
      }
      requestedRunIds.push(child.id);
      if (receipt.disposition === "requested") pendingRunIds.push(child.id);
    }
    afterRunId = page.nextAfterRunId;
  } while (afterRunId);

  return {
    originCancellation,
    children,
    requestedRunIds,
    pendingRunIds,
  };
}
