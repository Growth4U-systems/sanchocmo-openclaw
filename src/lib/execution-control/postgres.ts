import crypto from "node:crypto";
import { and, asc, desc, eq, sql as drizzleSql, type SQL } from "drizzle-orm";
import { db, type Db } from "@/db/drizzle";
import {
  executionEvents as eventsTable,
  executionRuns as runsTable,
  executionSteps as stepsTable,
} from "@/db/schema";
import {
  createTraceContext,
  getTraceId,
  normalizeTraceId,
} from "@/lib/trace-context";
import type {
  AppendExecutionEventInput,
  CreateExecutionRunInput,
  CreateExecutionRunReceipt,
  ExecutionAggregateRef,
  ExecutionControlRepository,
  ExecutionEvent,
  ExecutionRun,
  ExecutionRunStatus,
  ExecutionStep,
  TransitionExecutionRunInput,
} from "./types";

type RunRow = typeof runsTable.$inferSelect;
type StepRow = typeof stepsTable.$inferSelect;
type EventRow = typeof eventsTable.$inferSelect;

const TERMINAL_STATUSES = new Set<ExecutionRunStatus>([
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

function id(prefix: "xrun" | "xevt"): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function dateIso(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function jsonValue(value: unknown): SQL {
  return value === undefined
    ? drizzleSql`NULL::jsonb`
    : drizzleSql`${JSON.stringify(value)}::jsonb`;
}

// Raw SQL fragments have no Drizzle column encoder. Explicit strings behave
// identically in neon-http and postgres-js.
function timestampValue(value: Date): SQL {
  return drizzleSql`${value.toISOString()}::timestamp`;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`execution_control: ${field} is required`);
  return normalized;
}

function runTraceId(value: unknown): string {
  return (
    normalizeTraceId(value) ?? getTraceId() ?? createTraceContext().traceId
  );
}

function eventTraceId(value: unknown): string | undefined {
  return normalizeTraceId(value) ?? getTraceId();
}

/** Exported for contract tests and explicit migration/backfill tooling. */
export function executionRunFromDatabaseRow(row: RunRow): ExecutionRun {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    operation: row.operation,
    mode: row.mode as ExecutionRun["mode"],
    status: row.status as ExecutionRunStatus,
    ...(row.currentStep ? { currentStep: row.currentStep } : {}),
    ...(row.traceId ? { traceId: row.traceId } : {}),
    ...(row.input !== null ? { input: row.input } : {}),
    ...(row.output !== null ? { output: row.output } : {}),
    ...(row.error ? { error: row.error } : {}),
    metadata: row.metadata,
    createdAt: dateIso(row.createdAt) as string,
    ...(row.startedAt ? { startedAt: dateIso(row.startedAt) } : {}),
    ...(row.finishedAt ? { finishedAt: dateIso(row.finishedAt) } : {}),
    updatedAt: dateIso(row.updatedAt) as string,
  };
}

/** Exported even though shadow mode does not mutate steps yet. */
export function executionStepFromDatabaseRow(row: StepRow): ExecutionStep {
  return {
    id: row.id,
    runId: row.runId,
    stepKey: row.stepKey,
    status: row.status as ExecutionStep["status"],
    attempt: row.attempt,
    ...(row.input !== null ? { input: row.input } : {}),
    ...(row.output !== null ? { output: row.output } : {}),
    ...(row.error ? { error: row.error } : {}),
    createdAt: dateIso(row.createdAt) as string,
    ...(row.startedAt ? { startedAt: dateIso(row.startedAt) } : {}),
    ...(row.finishedAt ? { finishedAt: dateIso(row.finishedAt) } : {}),
    updatedAt: dateIso(row.updatedAt) as string,
  };
}

/** Exported for contract tests and explicit migration/backfill tooling. */
export function executionEventFromDatabaseRow(row: EventRow): ExecutionEvent {
  return {
    sequence: row.sequence,
    id: row.id,
    runId: row.runId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    ...(row.traceId ? { traceId: row.traceId } : {}),
    type: row.type,
    ts: dateIso(row.ts) as string,
    ...(row.data !== null ? { data: row.data } : {}),
  };
}

/**
 * Monotonic lifecycle guard. Approval may resume to running, but active runs
 * never return to queued and terminal runs are immutable.
 */
export function canTransitionExecutionRun(
  from: ExecutionRunStatus,
  to: ExecutionRunStatus,
): boolean {
  if (TERMINAL_STATUSES.has(from)) return false;
  if (to === "queued") return from === "queued";
  return true;
}

/**
 * Postgres source of truth for generic product executions.
 *
 * Mutations intentionally use one CTE statement rather than interactive
 * transactions: neon-http cannot hold an interactive transaction, while both
 * supported drivers execute a statement atomically.
 */
export class PostgresExecutionControlRepository implements ExecutionControlRepository {
  constructor(private readonly database: Db = db) {}

  async createRun(
    input: CreateExecutionRunInput,
  ): Promise<CreateExecutionRunReceipt> {
    const aggregateType = requiredText(input.aggregateType, "aggregateType");
    const aggregateId = requiredText(input.aggregateId, "aggregateId");
    const operation = requiredText(input.operation, "operation");
    const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey");
    const now = input.now ?? new Date();
    const runId = id("xrun");
    const eventId = id("xevt");
    const traceId = runTraceId(input.traceId);
    const mode = input.mode ?? "shadow";
    const metadata = input.metadata ?? {};

    await this.database.execute(drizzleSql`
      WITH inserted_run AS (
        INSERT INTO "execution_runs" (
          "id", "idempotency_key", "aggregate_type", "aggregate_id",
          "operation", "mode", "status", "trace_id", "input", "metadata",
          "created_at", "updated_at"
        ) VALUES (
          ${runId}, ${idempotencyKey}, ${aggregateType}, ${aggregateId},
          ${operation}, ${mode}, 'queued', ${traceId}, ${jsonValue(input.input)},
          ${jsonValue(metadata)}, ${timestampValue(now)}, ${timestampValue(now)}
        )
        ON CONFLICT (
          "aggregate_type", "aggregate_id", "operation", "idempotency_key"
        ) DO NOTHING
        RETURNING "id", "aggregate_type", "aggregate_id", "trace_id"
      )
      INSERT INTO "execution_events" (
        "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
        "type", "ts", "data"
      )
      SELECT ${eventId}, "id", "aggregate_type", "aggregate_id", "trace_id",
             'run.created', ${timestampValue(now)}, ${jsonValue({ operation, mode })}
      FROM inserted_run
    `);

    const created = await this.getRunById(runId);
    if (created) return { run: created, created: true };

    const winner = await this.getIdempotencyWinner({
      aggregateType,
      aggregateId,
      operation,
      idempotencyKey,
    });
    if (winner) return { run: winner, created: false };

    // Never fabricate an in-memory run or silently downgrade to another store.
    throw new Error(
      "execution_control: create did not persist or resolve an idempotent run",
    );
  }

  async appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent> {
    const runId = requiredText(input.runId, "runId");
    const type = requiredText(input.type, "event type");
    const eventId = id("xevt");
    const now = input.now ?? new Date();
    const traceId = eventTraceId(input.traceId);

    await this.database.execute(drizzleSql`
      INSERT INTO "execution_events" (
        "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
        "type", "ts", "data"
      )
      SELECT ${eventId}, "id", "aggregate_type", "aggregate_id",
             COALESCE("trace_id", ${traceId ?? null}), ${type},
             ${timestampValue(now)}, ${jsonValue(input.data)}
      FROM "execution_runs"
      WHERE "id" = ${runId}
    `);

    const event = await this.getEventById(eventId);
    if (!event)
      throw new Error(`execution_control: run ${runId} was not found`);
    return event;
  }

  async transitionRun(
    runIdValue: string,
    input: TransitionExecutionRunInput,
    eventTypeValue: string,
    eventData?: unknown,
  ): Promise<ExecutionRun> {
    const runId = requiredText(runIdValue, "runId");
    const eventType = requiredText(eventTypeValue, "event type");
    const now = input.now ?? new Date();
    const eventId = id("xevt");
    const hasCurrentStep = Object.prototype.hasOwnProperty.call(
      input,
      "currentStep",
    );
    const hasOutput = Object.prototype.hasOwnProperty.call(input, "output");
    const hasError = Object.prototype.hasOwnProperty.call(input, "error");
    const terminal = TERMINAL_STATUSES.has(input.status);

    await this.database.execute(drizzleSql`
      WITH transitioned_run AS (
        UPDATE "execution_runs"
        SET
          "status" = ${input.status},
          "current_step" = CASE WHEN ${hasCurrentStep}
            THEN ${input.currentStep ?? null} ELSE "current_step" END,
          "output" = CASE WHEN ${hasOutput}
            THEN ${jsonValue(input.output)} ELSE "output" END,
          "error" = CASE WHEN ${hasError}
            THEN ${input.error ?? null} ELSE "error" END,
          "started_at" = CASE WHEN ${input.status === "running"}
            THEN COALESCE("started_at", ${timestampValue(now)}) ELSE "started_at" END,
          "finished_at" = CASE WHEN ${terminal}
            THEN COALESCE("finished_at", ${timestampValue(now)}) ELSE "finished_at" END,
          "updated_at" = ${timestampValue(now)}
        WHERE "id" = ${runId}
          AND (${input.expectedStatus === undefined}
            OR "status" = ${input.expectedStatus ?? null})
          AND (
            (${input.status === "queued"} AND "status" = 'queued')
            OR (${input.status !== "queued"} AND "status" IN (
              'queued', 'running', 'waiting_approval'
            ))
          )
        RETURNING "id", "aggregate_type", "aggregate_id", "trace_id"
      )
      INSERT INTO "execution_events" (
        "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
        "type", "ts", "data"
      )
      SELECT ${eventId}, "id", "aggregate_type", "aggregate_id", "trace_id",
             ${eventType}, ${timestampValue(now)}, ${jsonValue(eventData)}
      FROM transitioned_run
    `);

    const event = await this.getEventById(eventId);
    if (!event) {
      const current = await this.getRunById(runId);
      if (!current)
        throw new Error(`execution_control: run ${runId} was not found`);
      throw new Error(
        `execution_control: invalid or stale transition ${current.status} -> ${input.status} for run ${runId}`,
      );
    }

    const run = await this.getRunById(runId);
    if (!run)
      throw new Error(
        `execution_control: transitioned run ${runId} was not found`,
      );
    return run;
  }

  async getRunById(runIdValue: string): Promise<ExecutionRun | null> {
    const runId = runIdValue.trim();
    if (!runId) return null;
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(eq(runsTable.id, runId))
      .limit(1);
    return row ? executionRunFromDatabaseRow(row) : null;
  }

  async getRunByAggregate(
    input: ExecutionAggregateRef,
  ): Promise<ExecutionRun | null> {
    const aggregateType = input.aggregateType.trim();
    const aggregateId = input.aggregateId.trim();
    if (!aggregateType || !aggregateId) return null;
    const operation = input.operation?.trim();
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.aggregateType, aggregateType),
          eq(runsTable.aggregateId, aggregateId),
          operation ? eq(runsTable.operation, operation) : undefined,
        ),
      )
      .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
      .limit(1);
    return row ? executionRunFromDatabaseRow(row) : null;
  }

  async listEvents(runIdValue: string): Promise<ExecutionEvent[]> {
    const runId = runIdValue.trim();
    if (!runId) return [];
    const rows = await this.database
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.runId, runId))
      .orderBy(asc(eventsTable.sequence));
    return rows.map(executionEventFromDatabaseRow);
  }

  private async getEventById(eventId: string): Promise<ExecutionEvent | null> {
    const [row] = await this.database
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId))
      .limit(1);
    return row ? executionEventFromDatabaseRow(row) : null;
  }

  private async getIdempotencyWinner(input: {
    aggregateType: string;
    aggregateId: string;
    operation: string;
    idempotencyKey: string;
  }): Promise<ExecutionRun | null> {
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.aggregateType, input.aggregateType),
          eq(runsTable.aggregateId, input.aggregateId),
          eq(runsTable.operation, input.operation),
          eq(runsTable.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    return row ? executionRunFromDatabaseRow(row) : null;
  }
}
