import crypto from "node:crypto";
import {
  and,
  desc,
  eq,
  inArray,
  sql as drizzleSql,
  type SQL,
} from "drizzle-orm";
import { db, type Db } from "@/db/drizzle";
import { agentRunEvents, agentRuns } from "@/db/schema";
import { PostgresAgentRunsRepository } from "@/lib/data/agent-runs-postgres";
import {
  resolveAgentRunsBackend,
  type AgentRun,
  type CreateAgentRunInput,
} from "@/lib/data/agent-runs";
import {
  PostgresExecutionControlRepository,
  executionCommandFingerprint,
  type ExecutionRun,
} from "@/lib/execution-control";
import {
  createTraceContext,
  getTraceId,
  normalizeTraceId,
} from "@/lib/trace-context";
import {
  agentRunInputFingerprint,
  prepareChatAgentTurnDispatch,
  type AdmitChatAgentTurnDependencies,
} from "./agent-turn-durable";

export interface AtomicChatAgentTurnAdmissionReceipt {
  run: AgentRun;
  created: boolean;
  dispatchRun: ExecutionRun;
  dispatchCreated: boolean;
  atomic: boolean;
}

export interface AtomicChatAgentTurnAdmissionDependencies
  extends Omit<AdmitChatAgentTurnDependencies, "repository"> {
  database?: Db;
}

export class ChatAgentTurnIdempotencyConflictError extends Error {
  readonly code = "chat_agent_turn_idempotency_conflict" as const;

  constructor() {
    super("The chat idempotency key is already bound to another command");
    this.name = "ChatAgentTurnIdempotencyConflictError";
  }
}

function jsonValue(value: unknown): SQL {
  return value === undefined
    ? drizzleSql`NULL::jsonb`
    : drizzleSql`${JSON.stringify(value)}::jsonb`;
}

function timestampValue(value: Date): SQL {
  return drizzleSql`${value.toISOString()}::timestamp`;
}

function opaqueId(prefix: string, seed?: string): string {
  const suffix = seed
    ? crypto.createHash("sha256").update(seed, "utf8").digest("hex").slice(0, 32)
    : `${Date.now().toString(36)}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  return `${prefix}_${suffix}`;
}

function parentRunId(_input: CreateAgentRunInput): string {
  // The partial idempotency index deliberately releases failed/cancelled
  // attempts. A random attempt id therefore matters: reusing a deterministic
  // id would let the primary key keep a failed attempt wedged forever.
  return opaqueId("run_chat");
}

function prospectiveParent(
  id: string,
  input: CreateAgentRunInput,
  traceId: string,
  now: Date,
): AgentRun {
  return {
    id,
    ...(input.idempotencyKey
      ? { idempotencyKey: input.idempotencyKey }
      : {}),
    threadId: input.threadId,
    traceId,
    runtime: input.runtime,
    ...(input.agent ? { agent: input.agent } : {}),
    ...(input.skill ? { skill: input.skill } : {}),
    ...(input.skills ? { skills: input.skills } : {}),
    ...(input.skillMode ? { skillMode: input.skillMode } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.taskContract ? { taskContract: input.taskContract } : {}),
    status: "queued",
    ...(input.input === undefined ? {} : { input: input.input }),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function activeIdempotencyWinner(
  database: Db,
  input: CreateAgentRunInput,
): Promise<AgentRun | null> {
  if (!input.idempotencyKey) return null;
  const [row] = await database
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.threadId, input.threadId),
        eq(agentRuns.idempotencyKey, input.idempotencyKey),
        inArray(agentRuns.status, ["queued", "running", "completed"]),
      ),
    )
    .orderBy(desc(agentRuns.createdAt), desc(agentRuns.id))
    .limit(1);
  if (!row) return null;
  return new PostgresAgentRunsRepository(database).getById(row.id);
}

function assertIdempotencyBinding(
  existing: AgentRun,
  prospective: AgentRun,
): void {
  const existingInput =
    existing.input &&
    typeof existing.input === "object" &&
    !Array.isArray(existing.input)
      ? (existing.input as Record<string, unknown>)
      : null;
  const prospectiveInput =
    prospective.input &&
    typeof prospective.input === "object" &&
    !Array.isArray(prospective.input)
      ? (prospective.input as Record<string, unknown>)
      : null;
  const existingBinding = existingInput?.runtimeIdempotencyFingerprint;
  const prospectiveBinding = prospectiveInput?.runtimeIdempotencyFingerprint;
  const requestBound =
    typeof existingBinding === "string" &&
    typeof prospectiveBinding === "string" &&
    /^[a-f0-9]{64}$/.test(existingBinding) &&
    existingBinding === prospectiveBinding;
  if (
    existing.threadId !== prospective.threadId ||
    existing.runtime !== prospective.runtime ||
    (!requestBound &&
      (existing.agent !== prospective.agent ||
        existing.skill !== prospective.skill ||
        existing.skillMode !== prospective.skillMode ||
        existing.taskId !== prospective.taskId ||
        agentRunInputFingerprint(existing) !==
          agentRunInputFingerprint(prospective)))
  ) {
    throw new ChatAgentTurnIdempotencyConflictError();
  }
}

/**
 * Insert the parent AgentRun, both creation events and its dispatch Ledger row
 * in one SQL statement. This is deliberately Postgres-only: a canary must not
 * downgrade to the process-local JSON store and recreate the loss window.
 */
export async function admitChatAgentTurnAtomically(
  input: CreateAgentRunInput,
  dependencies: AtomicChatAgentTurnAdmissionDependencies = {},
): Promise<AtomicChatAgentTurnAdmissionReceipt> {
  if (!dependencies.database && resolveAgentRunsBackend() !== "postgres") {
    throw new Error("chat_agent_turn_postgres_parent_repository_required");
  }
  const database = dependencies.database ?? db;
  const now = input.now ?? new Date();
  const traceId =
    normalizeTraceId(input.traceId) ??
    getTraceId() ??
    createTraceContext().traceId;
  const runId = parentRunId(input);
  const parent = prospectiveParent(runId, input, traceId, now);
  const prepared = prepareChatAgentTurnDispatch(parent, dependencies);
  const executionInput = prepared.createInput;
  const dispatchRunId = opaqueId(
    "xrun_chat",
    `chat-agent-dispatch-v1\0${runId}`,
  );
  const parentEventId = opaqueId("evt_chat");
  const dispatchEventId = opaqueId("xevt_chat");
  const parentEventData = {
    runtime: input.runtime,
    idempotencyKey: input.idempotencyKey,
    agent: input.agent,
    skill: input.skill,
    skills: input.skills,
    skillMode: input.skillMode,
    taskId: input.taskId,
    traceId,
    dispatchOperation: executionInput.operation,
  };
  const commandFingerprint = executionCommandFingerprint(executionInput);

  await database.execute(drizzleSql`
    WITH inserted_parent AS (
      INSERT INTO "agent_runs" (
        "id", "idempotency_key", "thread_id", "trace_id", "runtime",
        "agent", "skill", "skills", "skill_mode", "task_id",
        "task_contract", "status", "input", "callback_fingerprints",
        "created_at", "updated_at"
      ) VALUES (
        ${runId}, ${input.idempotencyKey ?? null}, ${input.threadId},
        ${traceId}, ${input.runtime}, ${input.agent ?? null},
        ${input.skill ?? null}, ${jsonValue(input.skills)},
        ${input.skillMode ?? null}, ${input.taskId ?? null},
        ${jsonValue(input.taskContract)}, 'queued', ${jsonValue(input.input)},
        '[]'::jsonb, ${timestampValue(now)}, ${timestampValue(now)}
      )
      ON CONFLICT DO NOTHING
      RETURNING "id", "thread_id", "trace_id"
    ), inserted_parent_event AS (
      INSERT INTO "agent_run_events" (
        "id", "run_id", "thread_id", "trace_id", "type", "ts", "data"
      )
      SELECT ${parentEventId}, "id", "thread_id", "trace_id", 'run_created',
             ${timestampValue(now)}, ${jsonValue(parentEventData)}
      FROM inserted_parent
      RETURNING "id"
    ), inserted_dispatch AS (
      INSERT INTO "execution_runs" (
        "id", "tenant_key", "idempotency_key", "aggregate_type",
        "aggregate_id", "operation", "mode", "status", "trace_id",
        "input", "metadata", "command_fingerprint", "available_at",
        "created_at", "updated_at"
      )
      SELECT ${dispatchRunId}, ${executionInput.tenantKey},
             ${executionInput.idempotencyKey}, ${executionInput.aggregateType},
             ${executionInput.aggregateId}, ${executionInput.operation},
             ${executionInput.mode ?? "shadow"}, 'queued', ${traceId},
             ${jsonValue(executionInput.input)},
             ${jsonValue(executionInput.metadata)}, ${commandFingerprint},
             ${timestampValue(now)}, ${timestampValue(now)},
             ${timestampValue(now)}
      FROM inserted_parent
      ON CONFLICT DO NOTHING
      RETURNING "id", "aggregate_type", "aggregate_id", "trace_id"
    ), inserted_dispatch_event AS (
      INSERT INTO "execution_events" (
        "id", "run_id", "aggregate_type", "aggregate_id", "trace_id",
        "type", "ts", "data"
      )
      SELECT ${dispatchEventId}, "id", "aggregate_type", "aggregate_id",
             "trace_id", 'run.created', ${timestampValue(now)},
             ${jsonValue({
               operation: executionInput.operation,
               mode: executionInput.mode ?? "shadow",
             })}
      FROM inserted_dispatch
      RETURNING "id"
    )
    SELECT
      EXISTS (SELECT 1 FROM inserted_parent_event) AS "parent_created",
      EXISTS (SELECT 1 FROM inserted_dispatch_event) AS "dispatch_created"
  `);

  const agentRepository = new PostgresAgentRunsRepository(database);
  const executionRepository = new PostgresExecutionControlRepository(database);
  let persistedParent = await agentRepository.getById(runId);
  if (!persistedParent) persistedParent = await activeIdempotencyWinner(database, input);
  if (!persistedParent) {
    throw new Error("chat_agent_turn_atomic_parent_missing");
  }
  assertIdempotencyBinding(persistedParent, parent);

  const dispatchRun = await executionRepository.getRunByAggregate({
    tenantKey: executionInput.tenantKey,
    aggregateType: executionInput.aggregateType,
    aggregateId: persistedParent.id,
    operation: executionInput.operation,
  });
  if (!dispatchRun) {
    // Never repair this after accepting the parent: doing so would recreate
    // the exact crash window this admission primitive exists to remove.
    throw new Error("chat_agent_turn_atomic_dispatch_missing");
  }
  const [createdEvent, createdDispatchEvent] = await Promise.all([
    database
      .select({ id: agentRunEvents.id })
      .from(agentRunEvents)
      .where(eq(agentRunEvents.id, parentEventId))
      .limit(1)
      .then(([event]) => event),
    executionRepository
      .listEvents(dispatchRun.id)
      .then((events) => events.find((event) => event.id === dispatchEventId)),
  ]);

  return {
    run: persistedParent,
    created: Boolean(createdEvent),
    dispatchRun,
    dispatchCreated: Boolean(createdDispatchEvent),
    atomic: true,
  };
}
