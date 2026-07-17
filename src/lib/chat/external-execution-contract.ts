import type { ExecutionRunStatus } from "@/lib/execution-control";

/** Maximum children accepted for one durable chat origin. */
export const CHAT_EXTERNAL_EXECUTION_LIMIT = 100;

/** Recent AgentRun window inspected by each thread poll. */
export const CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT = 20;

export interface ChatExternalExecutionSummary {
  id: string;
  parentRunId: string;
  operation: string;
  status: Extract<
    ExecutionRunStatus,
    "queued" | "running" | "waiting_approval" | "blocked"
  >;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  cancelRequestedAt?: string;
}

export interface ChatExternalExecutionProjection {
  activeExecutions: ChatExternalExecutionSummary[];
  activeExecutionParentRunIds: string[];
  /** Rolling-deploy compatibility for clients that can cancel only one parent. */
  activeExecutionsParentRunId: string | null;
}

export const EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION = Object.freeze({
  activeExecutions: [],
  activeExecutionParentRunIds: [],
  activeExecutionsParentRunId: null,
}) satisfies ChatExternalExecutionProjection;
