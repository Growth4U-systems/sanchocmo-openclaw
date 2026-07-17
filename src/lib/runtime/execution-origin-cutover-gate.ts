import { sql as drizzleSql, type SQL } from "drizzle-orm";

import { db } from "@/db/drizzle";

import {
  resolveDurableWorkerBootPlan,
  type DurableWorkerBootEnvironment,
} from "./durable-worker-boot-plan";

const NON_TERMINAL_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "blocked",
] as const;

const EXECUTION_ORIGIN_PARENT_ID_PATTERN =
  "^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$";

export const EXECUTION_ORIGIN_CUTOVER_BLOCKED_CODE =
  "execution_origin_cutover_blocked" as const;
export const EXECUTION_ORIGIN_CUTOVER_UNAVAILABLE_CODE =
  "execution_origin_cutover_unavailable" as const;

/** Minimal read-only port shared by neon-http and postgres-js Drizzle clients. */
export interface ExecutionOriginCutoverDatabase {
  execute(query: SQL): Promise<unknown>;
}

export interface ExecutionOriginCutoverReport {
  /** Decimal text preserves PostgreSQL bigint precision without truncation. */
  gapCount: string;
}

export interface ExecutionOriginCutoverGateResult extends ExecutionOriginCutoverReport {
  checked: boolean;
}

export interface VerifyExecutionOriginCutoverInput {
  env?: DurableWorkerBootEnvironment;
  database?: ExecutionOriginCutoverDatabase;
  /** Operator inventory mode; checks even while every worker boot flag is off. */
  requireCheck?: boolean;
}

/** Stable, payload-free rollout refusal. */
export class ExecutionOriginCutoverBlockedError extends Error {
  readonly code = EXECUTION_ORIGIN_CUTOVER_BLOCKED_CODE;
  readonly gapCount: string;

  constructor(gapCount: string) {
    const safeCount = decimalCount(gapCount);
    super(
      `Durable worker rollout is blocked by ${safeCount} non-terminal execution run(s) with an unregistered execution origin. Keep admissions and workers off; drain or cancel and re-admit them through the trusted origin API, then run the cutover check again.`,
    );
    this.name = "ExecutionOriginCutoverBlockedError";
    this.gapCount = safeCount;
  }
}

/** Stable, credential-free refusal when safety cannot be established. */
export class ExecutionOriginCutoverUnavailableError extends Error {
  readonly code = EXECUTION_ORIGIN_CUTOVER_UNAVAILABLE_CODE;

  constructor() {
    super(
      "Durable worker rollout is blocked because execution-origin cutover safety could not be verified. Keep admissions and workers off, verify migrations through 0032 and database connectivity, then run the cutover check again.",
    );
    this.name = "ExecutionOriginCutoverUnavailableError";
  }
}

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

function decimalCount(value: unknown): string {
  if (typeof value === "bigint" && value >= BigInt(0)) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    return value;
  }
  throw new ExecutionOriginCutoverUnavailableError();
}

function strictBoolean(value: unknown): boolean {
  if (value === true || value === "t" || value === "true") return true;
  if (value === false || value === "f" || value === "false") return false;
  throw new ExecutionOriginCutoverUnavailableError();
}

export function isExecutionOriginCutoverCheckRequired(
  env: DurableWorkerBootEnvironment,
): boolean {
  const plan = resolveDurableWorkerBootPlan(env);
  return Object.values(plan).some(Boolean);
}

/**
 * Read-only inventory for the 0032 cutover.
 *
 * Metadata is only a diagnostic candidate selector. It must match the exact
 * closed schema, and the run is safe only when an immutable registration and
 * its root exist for the same tenant, run and parent. No metadata value is
 * inserted, repaired or otherwise promoted to authority here.
 */
export async function inspectExecutionOriginCutover(
  database: ExecutionOriginCutoverDatabase = db,
): Promise<ExecutionOriginCutoverReport> {
  let result: unknown;
  try {
    result = await database.execute(drizzleSql`
      WITH schema_contract AS MATERIALIZED (
        SELECT
          EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint AS c
            WHERE c."conrelid" = to_regclass('execution_origins')
              AND c."conname" = 'execution_origins_pkey'
              AND c."contype" = 'p' AND c."convalidated"
              AND pg_get_constraintdef(c."oid", false) =
                'PRIMARY KEY (tenant_key, kind, parent_agent_run_id)'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint AS c
            WHERE c."conrelid" = to_regclass('execution_origins')
              AND c."conname" = 'execution_origins_kind_check'
              AND c."contype" = 'c' AND c."convalidated"
              AND pg_get_constraintdef(c."oid", false) LIKE '%kind%'
              AND pg_get_constraintdef(c."oid", false)
                LIKE '%mc_chat_parent_run%'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint AS c
            WHERE c."conrelid" = to_regclass('execution_origins')
              AND c."conname" =
                'execution_origins_parent_agent_run_id_check'
              AND c."contype" = 'c' AND c."convalidated"
              AND pg_get_constraintdef(c."oid", false)
                LIKE '%parent_agent_run_id%'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint AS c
            WHERE c."conrelid" = to_regclass('execution_origins')
              AND c."conname" =
                'execution_origins_cancellation_shape_check'
              AND c."contype" = 'c' AND c."convalidated"
              AND pg_get_constraintdef(c."oid", false)
                LIKE '%cancel_request_id%'
              AND pg_get_constraintdef(c."oid", false)
                LIKE '%cancel_requested_at%'
              AND pg_get_constraintdef(c."oid", false)
                LIKE '%cancel_actor_type%'
              AND pg_get_constraintdef(c."oid", false)
                LIKE '%cancel_actor_id%'
              AND pg_get_constraintdef(c."oid", false)
                LIKE '%cancel_reason_code%'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint AS c
            WHERE c."conrelid" = to_regclass('execution_run_origins')
              AND c."conname" = 'execution_run_origins_pkey'
              AND c."contype" = 'p' AND c."convalidated"
              AND pg_get_constraintdef(c."oid", false) =
                'PRIMARY KEY (run_id)'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint AS c
            WHERE c."conrelid" = to_regclass('execution_run_origins')
              AND c."conname" = 'execution_run_origins_kind_check'
              AND c."contype" = 'c' AND c."convalidated"
              AND pg_get_constraintdef(c."oid", false) LIKE '%kind%'
              AND pg_get_constraintdef(c."oid", false)
                LIKE '%mc_chat_parent_run%'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint AS c
            WHERE c."conrelid" = to_regclass('execution_run_origins')
              AND c."conname" =
                'execution_run_origins_run_tenant_fk'
              AND c."contype" = 'f' AND c."convalidated"
              AND pg_get_constraintdef(c."oid", false) =
                'FOREIGN KEY (run_id, tenant_key) REFERENCES execution_runs(id, tenant_key) ON DELETE CASCADE'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint AS c
            WHERE c."conrelid" = to_regclass('execution_run_origins')
              AND c."conname" = 'execution_run_origins_origin_fk'
              AND c."contype" = 'f' AND c."convalidated"
              AND pg_get_constraintdef(c."oid", false) =
                'FOREIGN KEY (tenant_key, kind, parent_agent_run_id) REFERENCES execution_origins(tenant_key, kind, parent_agent_run_id) ON DELETE RESTRICT'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_index AS i
            WHERE i."indexrelid" =
                to_regclass('execution_runs_id_tenant_idx')
              AND i."indrelid" = to_regclass('execution_runs')
              AND i."indisunique" AND i."indisvalid"
              AND pg_get_indexdef(i."indexrelid") LIKE '%(id, tenant_key)%'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_index AS i
            WHERE i."indexrelid" =
                to_regclass('execution_run_origins_root_run_idx')
              AND i."indrelid" = to_regclass('execution_run_origins')
              AND i."indisvalid"
              AND pg_get_indexdef(i."indexrelid")
                LIKE '%(tenant_key, kind, parent_agent_run_id, run_id)%'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_index AS i
            WHERE i."indexrelid" =
                to_regclass('execution_origins_cancelled_idx')
              AND i."indrelid" = to_regclass('execution_origins')
              AND i."indisvalid"
              AND pg_get_indexdef(i."indexrelid")
                LIKE '%(tenant_key, cancel_requested_at, parent_agent_run_id)%'
              AND pg_get_indexdef(i."indexrelid")
                LIKE '%cancel_request_id IS NOT NULL%'
          ) AS "schemaReady"
      ), gaps AS MATERIALIZED (
        SELECT r."id"
        FROM "execution_runs" AS r
        WHERE r."status" IN (${drizzleSql.join(
          NON_TERMINAL_STATUSES.map((status) => drizzleSql`${status}`),
          drizzleSql`, `,
        )})
          AND jsonb_typeof(r."metadata"->'executionOrigin') = 'object'
          AND r."metadata" #>> '{executionOrigin,kind}' =
            'mc_chat_parent_run'
          AND r."metadata"->'executionOrigin' = jsonb_build_object(
            'schemaVersion', 1,
            'kind', 'mc_chat_parent_run',
            'parentAgentRunId',
            r."metadata" #>> '{executionOrigin,parentAgentRunId}'
          )
          AND r."metadata" #>> '{executionOrigin,parentAgentRunId}'
            ~ ${EXECUTION_ORIGIN_PARENT_ID_PATTERN}
          AND NOT EXISTS (
            SELECT 1
            FROM "execution_run_origins" AS registration
            INNER JOIN "execution_origins" AS origin
              ON origin."tenant_key" = registration."tenant_key"
             AND origin."kind" = registration."kind"
             AND origin."parent_agent_run_id" =
               registration."parent_agent_run_id"
            WHERE registration."run_id" = r."id"
              AND registration."tenant_key" = r."tenant_key"
              AND registration."kind" = 'mc_chat_parent_run'
              AND registration."parent_agent_run_id" =
                r."metadata" #>> '{executionOrigin,parentAgentRunId}'
          )
      )
      SELECT schema_contract."schemaReady",
             (SELECT count(*)::text FROM gaps) AS "gapCount"
      FROM schema_contract
    `);
  } catch {
    // Database/driver errors can contain credentials or query payloads. Collapse
    // every failure to one stable operational message before it reaches logs.
    throw new ExecutionOriginCutoverUnavailableError();
  }

  const row = statementRows(result)[0];
  if (!row) throw new ExecutionOriginCutoverUnavailableError();
  if (!strictBoolean(row.schemaReady ?? row.schema_ready)) {
    throw new ExecutionOriginCutoverUnavailableError();
  }
  return { gapCount: decimalCount(row.gapCount ?? row.gap_count) };
}

/**
 * Fail-closed gate used by both deploy preflight and process boot. With all
 * worker boot flags off it performs no database I/O unless explicitly required
 * by an operator inventory command.
 */
export async function verifyExecutionOriginCutover(
  input: VerifyExecutionOriginCutoverInput = {},
): Promise<ExecutionOriginCutoverGateResult> {
  const env = input.env ?? (process.env as DurableWorkerBootEnvironment);
  if (!input.requireCheck && !isExecutionOriginCutoverCheckRequired(env)) {
    return { checked: false, gapCount: "0" };
  }

  const report = await inspectExecutionOriginCutover(input.database);
  if (report.gapCount !== "0") {
    throw new ExecutionOriginCutoverBlockedError(report.gapCount);
  }
  return { checked: true, gapCount: report.gapCount };
}

/** Never includes database errors, payloads, tenant keys or credentials. */
export function executionOriginCutoverFailureMessage(error: unknown): string {
  if (
    error instanceof ExecutionOriginCutoverBlockedError ||
    error instanceof ExecutionOriginCutoverUnavailableError
  ) {
    return error.message;
  }
  return new ExecutionOriginCutoverUnavailableError().message;
}
