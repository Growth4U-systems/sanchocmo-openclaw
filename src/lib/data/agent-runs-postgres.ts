import crypto from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  notInArray,
  sql as drizzleSql,
  type SQL,
} from "drizzle-orm";
import { db, type Db } from "@/db/drizzle";
import { agentRunEvents as eventsTable, agentRuns as runsTable } from "@/db/schema";
import { createTraceContext, getTraceId, normalizeTraceId } from "@/lib/trace-context";
import { TERMINAL_CALLBACK_CLAIM_LEASE_MS } from "./agent-run-callback-claim";
import {
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE,
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR,
} from "./agent-run-synthetic-runtime-loss";
import {
  AgentRunParentInactiveError,
  type AgentRun,
  type AgentRunEvent,
  type AgentRunEventType,
  type AgentRunsRepository,
  type AgentRunsSnapshot,
  type AppendAgentRunEventInput,
  type CreateAgentRunInput,
  type CreateAgentRunReceipt,
  type RecoverSyntheticRuntimeLossInput,
  type UpdateAgentRunInput,
} from "./agent-runs";

const ACTIVE_STATUSES = ["queued", "running"] as const;
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;
const IDEMPOTENCY_CONFLICT_STATUSES = ["queued", "running", "completed"] as const;
const SNAPSHOT_RUN_LIMIT = 2_000;
const SNAPSHOT_EVENT_LIMIT = 10_000;
const TERMINAL_CALLBACK_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const AGENT_RUN_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;

type RunRow = typeof runsTable.$inferSelect;
type EventRow = typeof eventsTable.$inferSelect;
type StatementRow = Record<string, unknown>;

function statementRows(result: unknown): StatementRow[] {
  if (Array.isArray(result)) return result as StatementRow[];
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: StatementRow[] }).rows;
  }
  return [];
}

function id(prefix: "run" | "evt"): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function dateIso(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonValue(value: unknown): SQL {
  return value === undefined
    ? drizzleSql`NULL::jsonb`
    : drizzleSql`${JSON.stringify(value)}::jsonb`;
}

// Raw SQL fragments do not carry a Drizzle column encoder, so postgres-js
// would receive a Date object directly. Encode explicitly for both drivers.
function timestampValue(value: Date | undefined): SQL {
  return value
    ? drizzleSql`${value.toISOString()}::timestamp`
    : drizzleSql`NULL::timestamp`;
}

function traceIdForRun(value: unknown): string {
  return normalizeTraceId(value) ?? getTraceId() ?? createTraceContext().traceId;
}

function traceIdForEvent(value: unknown): string | undefined {
  return normalizeTraceId(value) ?? getTraceId();
}

/** Kept exported for repository contract tests and explicit backfill tooling. */
export function agentRunFromDatabaseRow(row: RunRow): AgentRun {
  const status = row.status as AgentRun["status"];
  const skillMode = row.skillMode === "auto" || row.skillMode === "pinned"
    ? row.skillMode
    : undefined;
  return {
    id: row.id,
    ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}),
    threadId: row.threadId,
    ...(row.traceId ? { traceId: row.traceId } : {}),
    runtime: row.runtime,
    ...(row.agent ? { agent: row.agent } : {}),
    ...(row.skill ? { skill: row.skill } : {}),
    ...(Array.isArray(row.skills) ? { skills: row.skills } : {}),
    ...(skillMode ? { skillMode } : {}),
    ...(row.taskId ? { taskId: row.taskId } : {}),
    ...(row.taskContract && typeof row.taskContract === "object"
      ? { taskContract: row.taskContract as unknown as AgentRun["taskContract"] }
      : {}),
    status,
    ...(row.input !== null ? { input: row.input } : {}),
    ...(row.output !== null ? { output: row.output } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(Array.isArray(row.callbackFingerprints) && row.callbackFingerprints.length > 0
      ? { callbackFingerprints: row.callbackFingerprints }
      : {}),
    createdAt: dateIso(row.createdAt) as string,
    ...(row.startedAt ? { startedAt: dateIso(row.startedAt) } : {}),
    ...(row.finishedAt ? { finishedAt: dateIso(row.finishedAt) } : {}),
    updatedAt: dateIso(row.updatedAt) as string,
  };
}

/** Kept exported for repository contract tests and explicit backfill tooling. */
export function agentRunEventFromDatabaseRow(row: EventRow): AgentRunEvent {
  return {
    id: row.id,
    runId: row.runId,
    threadId: row.threadId,
    ...(row.traceId ? { traceId: row.traceId } : {}),
    type: row.type as AgentRunEventType,
    ts: dateIso(row.ts) as string,
    ...(row.data !== null ? { data: row.data } : {}),
  };
}

interface TransitionInput {
  runId: string;
  threadId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  eventType: AgentRunEventType;
  eventData?: unknown;
  traceId?: string;
  now: Date;
  output?: unknown;
  hasOutput?: boolean;
  error?: string;
  hasError?: boolean;
  startedAt?: Date;
  finishedAt?: Date;
}

/**
 * Postgres source of truth for agent runs.
 *
 * Run creation and lifecycle transitions use one CTE statement each. That is
 * important for neon-http, which does not support interactive transactions,
 * and guarantees a process cannot persist a transition without its receipt
 * event (or vice versa).
 */
export class PostgresAgentRunsRepository implements AgentRunsRepository {
  readonly backend = "postgres" as const;
  readonly retention = Object.freeze({
    storage: "postgres" as const,
    maxRuns: null,
    maxEvents: null,
    durable: true,
    snapshotRunLimit: SNAPSHOT_RUN_LIMIT,
    snapshotEventLimit: SNAPSHOT_EVENT_LIMIT,
  });

  constructor(private readonly database: Db = db) {}

  async create(input: CreateAgentRunInput): Promise<AgentRun> {
    return (await this.createWithReceipt(input)).run;
  }

  async createWithReceipt(input: CreateAgentRunInput): Promise<CreateAgentRunReceipt> {
    const now = input.now ?? new Date();
    const runId = id("run");
    const eventId = id("evt");
    const traceId = traceIdForRun(input.traceId);
    const eventData = {
      runtime: input.runtime,
      idempotencyKey: input.idempotencyKey,
      agent: input.agent,
      skill: input.skill,
      skills: input.skills,
      skillMode: input.skillMode,
      taskId: input.taskId,
      traceId,
    };
    const parentGate = input.activeParent
      ? drizzleSql`
          SELECT 1 AS "allowed"
          FROM "agent_runs"
          WHERE "id" = ${input.activeParent.runId}
            AND "thread_id" = ${input.activeParent.threadId}
            AND "status" IN ('queued', 'running')
          FOR UPDATE
        `
      : drizzleSql`SELECT 1 AS "allowed"`;

    await this.database.execute(drizzleSql`
      WITH parent_gate AS (${parentGate}), inserted_run AS (
        INSERT INTO "agent_runs" (
          "id", "idempotency_key", "thread_id", "trace_id", "runtime",
          "agent", "skill", "skills", "skill_mode", "task_id",
          "task_contract", "status", "input", "callback_fingerprints",
          "created_at", "updated_at"
        ) SELECT
          ${runId}, ${input.idempotencyKey ?? null}, ${input.threadId}, ${traceId}, ${input.runtime},
          ${input.agent ?? null}, ${input.skill ?? null}, ${jsonValue(input.skills)},
          ${input.skillMode ?? null}, ${input.taskId ?? null}, ${jsonValue(input.taskContract)},
          'queued', ${jsonValue(input.input)}, '[]'::jsonb, ${timestampValue(now)}, ${timestampValue(now)}
        FROM parent_gate
        ON CONFLICT DO NOTHING
        RETURNING "id", "thread_id", "trace_id"
      )
      INSERT INTO "agent_run_events" (
        "id", "run_id", "thread_id", "trace_id", "type", "ts", "data"
      )
      SELECT ${eventId}, "id", "thread_id", "trace_id", 'run_created', ${timestampValue(now)}, ${jsonValue(eventData)}
      FROM inserted_run
    `);

    const created = await this.getById(runId);
    if (created) return { run: created, created: true };
    if (input.idempotencyKey) {
      // The partial unique index only treats queued/running/completed runs as
      // idempotency winners. Keep conflict resolution aligned with that index:
      // a newer failed/cancelled attempt must never mask the actual winner.
      const existing = await this.getIdempotencyConflictWinner(
        input.threadId,
        input.idempotencyKey,
      );
      if (existing) return { run: existing, created: false };
    }
    if (input.activeParent) throw new AgentRunParentInactiveError();
    throw new Error("agent_runs: create did not persist or resolve an idempotent run");
  }

  async readSnapshot(): Promise<AgentRunsSnapshot> {
    const [runRows, eventRows] = await Promise.all([
      this.database
        .select()
        .from(runsTable)
        .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
        .limit(SNAPSHOT_RUN_LIMIT),
      this.database
        .select()
        .from(eventsTable)
        .orderBy(desc(eventsTable.sequence))
        .limit(SNAPSHOT_EVENT_LIMIT),
    ]);
    return {
      runs: runRows.reverse().map(agentRunFromDatabaseRow),
      events: eventRows.reverse().map(agentRunEventFromDatabaseRow),
    };
  }

  async appendEvent(input: AppendAgentRunEventInput): Promise<AgentRunEvent> {
    const eventId = id("evt");
    const now = input.now ?? new Date();
    const traceId = traceIdForEvent(input.traceId);
    await this.database.execute(drizzleSql`
      INSERT INTO "agent_run_events" (
        "id", "run_id", "thread_id", "trace_id", "type", "ts", "data"
      )
      SELECT ${eventId}, "id", "thread_id", COALESCE("trace_id", ${traceId ?? null}),
             ${input.type}, ${timestampValue(now)}, ${jsonValue(input.data)}
      FROM "agent_runs"
      WHERE "id" = ${input.runId} AND "thread_id" = ${input.threadId}
    `);
    const [row] = await this.database
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId))
      .limit(1);
    if (!row) throw new Error(`agent_runs: run ${input.runId} was not found in thread ${input.threadId}`);
    return agentRunEventFromDatabaseRow(row);
  }

  async update(runId: string, input: UpdateAgentRunInput): Promise<AgentRun | null> {
    const patch: Partial<typeof runsTable.$inferInsert> = {
      updatedAt: input.now ?? new Date(),
    };
    if (input.status) patch.status = input.status;
    if ("output" in input) patch.output = input.output;
    if ("error" in input) patch.error = input.error ?? null;
    if (input.startedAt) patch.startedAt = new Date(input.startedAt);
    if (input.finishedAt) patch.finishedAt = new Date(input.finishedAt);
    const [row] = await this.database
      .update(runsTable)
      .set(patch)
      .where(and(
        eq(runsTable.id, runId),
        notInArray(runsTable.status, [...TERMINAL_STATUSES]),
      ))
      .returning();
    if (row) return agentRunFromDatabaseRow(row);
    return this.getById(runId);
  }

  async getById(runId: string): Promise<AgentRun | null> {
    if (!runId) return null;
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(eq(runsTable.id, runId))
      .limit(1);
    return row ? agentRunFromDatabaseRow(row) : null;
  }

  async getByIdempotencyKey(threadId: string, idempotencyKey: string): Promise<AgentRun | null> {
    if (!threadId || !idempotencyKey) return null;
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(and(
        eq(runsTable.threadId, threadId),
        eq(runsTable.idempotencyKey, idempotencyKey),
      ))
      .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
      .limit(1);
    return row ? agentRunFromDatabaseRow(row) : null;
  }

  private async getIdempotencyConflictWinner(
    threadId: string,
    idempotencyKey: string,
  ): Promise<AgentRun | null> {
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(and(
        eq(runsTable.threadId, threadId),
        eq(runsTable.idempotencyKey, idempotencyKey),
        inArray(runsTable.status, [...IDEMPOTENCY_CONFLICT_STATUSES]),
      ))
      .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
      .limit(1);
    return row ? agentRunFromDatabaseRow(row) : null;
  }

  async claimCallbackFingerprint(runId: string, fingerprint: string): Promise<boolean> {
    if (!runId || !fingerprint) return false;
    const now = new Date();
    const staleBefore = new Date(
      now.getTime() - TERMINAL_CALLBACK_CLAIM_LEASE_MS,
    );
    const [claimed] = await this.database
      .update(runsTable)
      .set({
        callbackFingerprints: drizzleSql`jsonb_build_array(${fingerprint}::text)`,
        updatedAt: now,
      })
      .where(and(
        eq(runsTable.id, runId),
        inArray(runsTable.status, [...ACTIVE_STATUSES]),
        drizzleSql`(
          jsonb_array_length(${runsTable.callbackFingerprints}) = 0
          OR (
            ${runsTable.callbackFingerprints} ? ${fingerprint}::text
            AND ${runsTable.updatedAt} <= ${timestampValue(staleBefore)}
          )
        )`,
      ))
      .returning({ id: runsTable.id });
    return Boolean(claimed);
  }

  async recoverSyntheticRuntimeLoss(
    input: RecoverSyntheticRuntimeLossInput,
  ): Promise<AgentRun | null> {
    const completedAt = input.completedAt ?? new Date();
    if (
      !AGENT_RUN_IDENTIFIER_PATTERN.test(input.runId) ||
      !input.threadId ||
      input.threadId.length > 512 ||
      !AGENT_RUN_IDENTIFIER_PATTERN.test(input.dispatchRunId) ||
      !TERMINAL_CALLBACK_FINGERPRINT_PATTERN.test(input.fingerprint) ||
      Number.isNaN(completedAt.getTime()) ||
      (input.terminalStatus === "failed" &&
        (typeof input.terminalError !== "string" ||
          !input.terminalError.trim() ||
          input.terminalError.length > 256)) ||
      (input.terminalStatus === "completed" &&
        input.terminalError !== undefined)
    ) {
      return null;
    }
    const eventId = id("evt");
    const eventType: AgentRunEventType =
      input.terminalStatus === "failed" ? "failed" : "bot_reply";
    const terminalError =
      input.terminalStatus === "failed" ? input.terminalError : null;
    const result = await this.database.execute(drizzleSql`
      WITH recovered_run AS (
        UPDATE "agent_runs"
        SET
          "status" = ${input.terminalStatus},
          "output" = ${jsonValue(input.output)},
          "error" = ${terminalError},
          "callback_fingerprints" = jsonb_build_array(${input.fingerprint}::text),
          "finished_at" = ${timestampValue(completedAt)},
          "updated_at" = ${timestampValue(completedAt)}
        WHERE "id" = ${input.runId}
          AND "thread_id" = ${input.threadId}
          AND "status" = 'failed'
          AND "error" = ${AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR}
          AND (
            jsonb_array_length("callback_fingerprints") = 0
            OR "callback_fingerprints" = jsonb_build_array(${input.fingerprint}::text)
          )
          AND (
            "idempotency_key" IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM "agent_runs" AS retry_run
              WHERE retry_run."id" <> "agent_runs"."id"
                AND retry_run."thread_id" = "agent_runs"."thread_id"
                AND retry_run."idempotency_key" = "agent_runs"."idempotency_key"
                AND retry_run."status" IN ('queued', 'running', 'completed')
            )
          )
          AND EXISTS (
            SELECT 1
            FROM "agent_run_events" AS recovery_event
            WHERE recovery_event."run_id" = "agent_runs"."id"
              AND recovery_event."thread_id" = "agent_runs"."thread_id"
              AND recovery_event."type" = 'runtime_unreachable'
              AND recovery_event."data"->>'code' = ${AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE}
              AND recovery_event."data"->>'dispatchRunId' = ${input.dispatchRunId}
          )
        RETURNING "id", "thread_id", "trace_id"
      ), inserted_event AS (
        INSERT INTO "agent_run_events" (
          "id", "run_id", "thread_id", "trace_id", "type", "ts", "data"
        )
        SELECT ${eventId}, "id", "thread_id", "trace_id", ${eventType},
               ${timestampValue(completedAt)}, ${jsonValue(input.output)}
        FROM recovered_run
        RETURNING "run_id"
      )
      SELECT "run_id" AS "runId" FROM inserted_event
    `);
    if (!statementRows(result)[0]) return null;
    const recovered = await this.getById(input.runId);
    if (!recovered) {
      throw new Error("agent_runs: synthetic runtime-loss recovery disappeared");
    }
    return recovered;
  }

  async getLatestActive(threadId: string): Promise<AgentRun | null> {
    const [row] = await this.database
      .select()
      .from(runsTable)
      .where(and(
        eq(runsTable.threadId, threadId),
        inArray(runsTable.status, [...ACTIVE_STATUSES]),
      ))
      .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
      .limit(1);
    return row ? agentRunFromDatabaseRow(row) : null;
  }

  async listActive(limit = 100): Promise<AgentRun[]> {
    const rows = await this.database
      .select()
      .from(runsTable)
      .where(inArray(runsTable.status, [...ACTIVE_STATUSES]))
      .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
      .limit(Math.max(0, limit));
    return rows.map(agentRunFromDatabaseRow);
  }

  async listActiveChildren(parentRunId: string): Promise<AgentRun[]> {
    if (!parentRunId) return [];
    const rows = await this.database
      .select()
      .from(runsTable)
      .where(
        and(
          inArray(runsTable.status, [...ACTIVE_STATUSES]),
          drizzleSql`${runsTable.input}->>'controlParentAgentRunId' = ${parentRunId}`,
        ),
      )
      .orderBy(asc(runsTable.createdAt), asc(runsTable.id));
    return rows.map(agentRunFromDatabaseRow);
  }

  async markDispatched(runId: string, threadId: string, data?: unknown): Promise<AgentRun | null> {
    const now = new Date();
    return this.transition({
      runId,
      threadId,
      status: "running",
      eventType: "runtime_dispatched",
      eventData: data,
      now,
      startedAt: now,
    });
  }

  async markFailed(
    runId: string,
    threadId: string,
    error: string,
    type: "runtime_rejected" | "runtime_unreachable" | "failed" = "failed",
    data?: unknown,
  ): Promise<AgentRun | null> {
    const now = new Date();
    return this.transition({
      runId,
      threadId,
      status: "failed",
      eventType: type,
      eventData: data ?? { error },
      now,
      error,
      hasError: true,
      finishedAt: now,
    });
  }

  async markCompleted(
    runId: string,
    threadId: string,
    output?: unknown,
    completedAt?: Date,
  ): Promise<AgentRun | null> {
    const now = completedAt ?? new Date();
    return this.transition({
      runId,
      threadId,
      status: "completed",
      eventType: "bot_reply",
      eventData: output,
      now,
      output,
      hasOutput: true,
      finishedAt: now,
    });
  }

  async markCancelled(runId: string, threadId: string, data?: unknown): Promise<AgentRun | null> {
    const now = new Date();
    return this.transition({
      runId,
      threadId,
      status: "cancelled",
      eventType: "cancel_requested",
      eventData: data,
      now,
      finishedAt: now,
    });
  }

  async listForThread(threadId: string, limit?: number): Promise<AgentRun[]> {
    if (limit !== undefined) {
      const rows = await this.database
        .select()
        .from(runsTable)
        .where(eq(runsTable.threadId, threadId))
        .orderBy(desc(runsTable.createdAt), desc(runsTable.id))
        .limit(Math.max(0, limit));
      return rows.reverse().map(agentRunFromDatabaseRow);
    }
    const rows = await this.database
      .select()
      .from(runsTable)
      .where(eq(runsTable.threadId, threadId))
      .orderBy(asc(runsTable.createdAt), asc(runsTable.id));
    return rows.map(agentRunFromDatabaseRow);
  }

  async listEvents(runId: string): Promise<AgentRunEvent[]> {
    const rows = await this.database
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.runId, runId))
      .orderBy(asc(eventsTable.sequence));
    return rows.map(agentRunEventFromDatabaseRow);
  }

  async listForTrace(traceId: string): Promise<AgentRun[]> {
    const normalized = normalizeTraceId(traceId);
    if (!normalized) return [];
    const rows = await this.database
      .select()
      .from(runsTable)
      .where(eq(runsTable.traceId, normalized))
      .orderBy(asc(runsTable.createdAt), asc(runsTable.id));
    return rows.map(agentRunFromDatabaseRow);
  }

  async listEventsForTrace(traceId: string): Promise<AgentRunEvent[]> {
    const normalized = normalizeTraceId(traceId);
    if (!normalized) return [];
    const rows = await this.database
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.traceId, normalized))
      .orderBy(asc(eventsTable.sequence));
    return rows.map(agentRunEventFromDatabaseRow);
  }

  private async transition(input: TransitionInput): Promise<AgentRun | null> {
    const eventId = id("evt");
    const traceId = traceIdForEvent(input.traceId);
    await this.database.execute(drizzleSql`
      WITH transitioned_run AS (
        UPDATE "agent_runs"
        SET
          "status" = ${input.status},
          "output" = CASE WHEN ${input.hasOutput === true}
            THEN ${jsonValue(input.output)} ELSE "output" END,
          "error" = CASE WHEN ${input.hasError === true}
            THEN ${input.error ?? null} ELSE "error" END,
          "started_at" = CASE WHEN ${Boolean(input.startedAt)}
            THEN ${timestampValue(input.startedAt)} ELSE "started_at" END,
          "finished_at" = CASE WHEN ${Boolean(input.finishedAt)}
            THEN ${timestampValue(input.finishedAt)} ELSE "finished_at" END,
          "updated_at" = ${timestampValue(input.now)}
        WHERE "id" = ${input.runId}
          AND "thread_id" = ${input.threadId}
          AND "status" NOT IN ('completed', 'failed', 'cancelled')
        RETURNING "id", "thread_id", "trace_id"
      )
      INSERT INTO "agent_run_events" (
        "id", "run_id", "thread_id", "trace_id", "type", "ts", "data"
      )
      SELECT ${eventId}, "id", "thread_id", COALESCE("trace_id", ${traceId ?? null}),
             ${input.eventType}, ${timestampValue(input.now)}, ${jsonValue(input.eventData)}
      FROM transitioned_run
    `);
    return this.getById(input.runId);
  }
}
