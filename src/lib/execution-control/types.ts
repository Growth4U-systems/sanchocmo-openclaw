export type ExecutionRunMode = "shadow" | "canary" | "active";

export type ExecutionRunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type ExecutionStepStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export interface ExecutionAggregateRef {
  tenantKey: string;
  aggregateType: string;
  aggregateId: string;
  operation?: string;
}

export interface ExecutionRun {
  id: string;
  /** Explicit product tenant boundary. Use `system` for global executions. */
  tenantKey: string;
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode: ExecutionRunMode;
  status: ExecutionRunStatus;
  currentStep?: string;
  traceId?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export interface ExecutionStep {
  id: string;
  runId: string;
  stepKey: string;
  status: ExecutionStepStatus;
  attempt: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export interface ExecutionEvent {
  sequence: number;
  id: string;
  runId: string;
  aggregateType: string;
  aggregateId: string;
  traceId?: string;
  /** Open event namespace, for example `run.created` or `search.persisted`. */
  type: string;
  ts: string;
  data?: unknown;
}

export interface CreateExecutionRunInput {
  /** Explicit product tenant boundary. Never infer authorization from payloads. */
  tenantKey: string;
  /**
   * Stable within aggregate + operation. Callers should include tenant slug and
   * aggregate id, and must never embed credentials or other secrets.
   */
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  mode?: ExecutionRunMode;
  traceId?: string;
  /** Immutable, sanitized command snapshot. Never persist credentials here. */
  input?: unknown;
  /** Non-sensitive correlation tags only. */
  metadata?: Record<string, unknown>;
  now?: Date;
}

export interface CreateExecutionRunReceipt {
  run: ExecutionRun;
  /** False when the same aggregate + operation + idempotency key already won. */
  created: boolean;
}

export interface AppendExecutionEventInput {
  runId: string;
  type: string;
  traceId?: string;
  data?: unknown;
  now?: Date;
}

export interface TransitionExecutionRunInput {
  status: ExecutionRunStatus;
  /** Optional compare-and-set guard for callers that read before mutating. */
  expectedStatus?: ExecutionRunStatus;
  currentStep?: string | null;
  output?: unknown;
  error?: string | null;
  now?: Date;
}

export interface ExecutionRunCursor {
  createdAt: string;
  id: string;
}

export interface ListExecutionRunsInput {
  /** Required authorization and query boundary. */
  tenantKey: string;
  aggregateType?: string;
  operation?: string;
  status?: ExecutionRunStatus;
  mode?: ExecutionRunMode;
  before?: ExecutionRunCursor;
  limit: number;
}

export interface ExecutionRunPage {
  runs: ExecutionRun[];
  nextBefore?: ExecutionRunCursor;
}

export interface ListExecutionStepsPageInput {
  tenantKey: string;
  runId: string;
  limit: number;
}

export interface ExecutionStepPage {
  steps: ExecutionStep[];
  truncated: boolean;
}

export interface ListExecutionEventsPageInput {
  tenantKey: string;
  runId: string;
  afterSequence?: number;
  limit: number;
}

export interface ExecutionEventPage {
  events: ExecutionEvent[];
  nextAfterSequence?: number;
}

export interface ExecutionControlRepository {
  createRun(input: CreateExecutionRunInput): Promise<CreateExecutionRunReceipt>;
  appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent>;
  transitionRun(
    runId: string,
    input: TransitionExecutionRunInput,
    eventType: string,
    eventData?: unknown,
  ): Promise<ExecutionRun>;
  getRunById(runId: string): Promise<ExecutionRun | null>;
  getRunByAggregate(input: ExecutionAggregateRef): Promise<ExecutionRun | null>;
  listEvents(runId: string): Promise<ExecutionEvent[]>;
}

/**
 * Bounded, tenant-scoped reads for inspectors and future machine evidence APIs.
 * Kept separate so command-path adapters only depend on mutation primitives.
 */
export interface ExecutionControlReadRepository {
  listRuns(input: ListExecutionRunsInput): Promise<ExecutionRunPage>;
  getRunByIdForTenant(
    tenantKey: string,
    runId: string,
  ): Promise<ExecutionRun | null>;
  listStepsPage(input: ListExecutionStepsPageInput): Promise<ExecutionStepPage>;
  listEventsPage(
    input: ListExecutionEventsPageInput,
  ): Promise<ExecutionEventPage>;
}
