import { sql as drizzleSql, type SQL } from "drizzle-orm";
import {
  LeadsSearchProjectionConflictError,
  LeadsSearchProjectionCorruptError,
  type LeadsSearchProjection,
  type LeadsSearchProjectionPage,
  type LeadsSearchProjectionRef,
  type LeadsSearchProjectionRepository,
  LeadsSearchProjectionTenantConflictError,
  type ListLeadsSearchProjectionsInput,
  type UpsertLeadsSearchProjectionInput,
  leadsSearchProjectionFromRow,
  normalizeLeadsSearchProjectionCursor,
  normalizeLeadsSearchProjectionListLimit,
  normalizeLeadsSearchProjectionRunId,
  normalizeLeadsSearchProjectionTenantKey,
  normalizeUpsertLeadsSearchProjectionInput,
} from "./search-projection";

type StatementRow = Record<string, unknown>;

/** Minimal structural port implemented by both supported Drizzle PG drivers. */
export interface LeadsSearchProjectionDatabase {
  execute(query: SQL): Promise<unknown>;
}

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

function jsonbValue(value: LeadsSearchProjection["result"]): SQL {
  return value === null
    ? drizzleSql`NULL::jsonb`
    : drizzleSql`${JSON.stringify(value)}::jsonb`;
}

/**
 * Migration 0029 deliberately uses `timestamp without time zone`. Treat that
 * column as a UTC wall-clock at every SQL boundary: a plain `::timestamp`
 * drops the ISO zone marker, while drivers can re-interpret returned text in
 * the process time zone. That combination makes cursors drift outside UTC.
 */
function utcWallTimestampValue(value: string): SQL {
  return drizzleSql`(${value}::timestamptz AT TIME ZONE 'UTC')`;
}

const SELECT_COLUMNS = drizzleSql`
  "run_id" AS "runId",
  "tenant_key" AS "tenantKey",
  "terminal_status" AS "terminalStatus",
  "candidate_count" AS "candidateCount",
  "result",
  "projection_fingerprint" AS "projectionFingerprint",
  to_char(
    "projected_at",
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS "projectedAt"
`;

/**
 * Immutable product projection for `leads.search`.
 *
 * `run_id` is intentionally globally unique in the product table. Public
 * reads are tenant-scoped, while the insert conflict path performs a private
 * run-id lookup solely to reject cross-tenant adoption.
 */
export class PostgresLeadsSearchProjectionRepository implements LeadsSearchProjectionRepository {
  constructor(private readonly database: LeadsSearchProjectionDatabase) {}

  async upsert(
    input: UpsertLeadsSearchProjectionInput,
  ): Promise<LeadsSearchProjection> {
    const projection = normalizeUpsertLeadsSearchProjectionInput(input);
    const inserted = await this.database.execute(drizzleSql`
      INSERT INTO "leads_search_projections" (
        "run_id", "tenant_key", "terminal_status", "candidate_count",
        "result", "projection_fingerprint", "projected_at"
      ) VALUES (
        ${projection.runId}, ${projection.tenantKey},
        ${projection.terminalStatus}, ${projection.candidateCount},
        ${jsonbValue(projection.result)}, ${projection.projectionFingerprint},
        ${utcWallTimestampValue(projection.projectedAt)}
      )
      ON CONFLICT ("run_id") DO NOTHING
      RETURNING ${SELECT_COLUMNS}
    `);
    const insertedRow = statementRows(inserted)[0];
    if (insertedRow) return leadsSearchProjectionFromRow(insertedRow);

    // A second statement observes a concurrent winner after ON CONFLICT waited
    // on it. This avoids the stale statement snapshot of an INSERT CTE.
    const existing = await this.getByRunIdAcrossTenants(projection.runId);
    if (!existing) {
      throw new LeadsSearchProjectionCorruptError();
    }
    if (existing.tenantKey !== projection.tenantKey) {
      throw new LeadsSearchProjectionTenantConflictError();
    }
    if (existing.projectionFingerprint !== projection.projectionFingerprint) {
      throw new LeadsSearchProjectionConflictError();
    }
    return existing;
  }

  async get(
    input: LeadsSearchProjectionRef,
  ): Promise<LeadsSearchProjection | null> {
    const tenantKey = normalizeLeadsSearchProjectionTenantKey(input.tenantKey);
    const runId = normalizeLeadsSearchProjectionRunId(input.runId);
    const result = await this.database.execute(drizzleSql`
      SELECT ${SELECT_COLUMNS}
      FROM "leads_search_projections"
      WHERE "tenant_key" = ${tenantKey}
        AND "run_id" = ${runId}
      LIMIT 1
    `);
    const row = statementRows(result)[0];
    if (!row) return null;
    const projection = leadsSearchProjectionFromRow(row);
    if (projection.tenantKey !== tenantKey || projection.runId !== runId) {
      throw new LeadsSearchProjectionCorruptError();
    }
    return projection;
  }

  async list(
    input: ListLeadsSearchProjectionsInput,
  ): Promise<LeadsSearchProjectionPage> {
    const tenantKey = normalizeLeadsSearchProjectionTenantKey(input.tenantKey);
    const limit = normalizeLeadsSearchProjectionListLimit(input.limit);
    const before = input.before
      ? normalizeLeadsSearchProjectionCursor(input.before)
      : null;
    const cursorClause = before
      ? drizzleSql`
          AND (
            "projected_at" < ${utcWallTimestampValue(before.projectedAt)}
            OR (
              "projected_at" = ${utcWallTimestampValue(before.projectedAt)}
              AND "run_id" < ${before.runId}
            )
          )
        `
      : drizzleSql``;
    const result = await this.database.execute(drizzleSql`
      SELECT ${SELECT_COLUMNS}
      FROM "leads_search_projections"
      WHERE "tenant_key" = ${tenantKey}
      ${cursorClause}
      ORDER BY "projected_at" DESC, "run_id" DESC
      LIMIT ${limit + 1}
    `);
    const rows = statementRows(result).map(leadsSearchProjectionFromRow);
    if (rows.some((row) => row.tenantKey !== tenantKey)) {
      throw new LeadsSearchProjectionCorruptError();
    }
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      ...(hasMore && last
        ? {
            nextCursor: {
              projectedAt: last.projectedAt,
              runId: last.runId,
            },
          }
        : {}),
    };
  }

  private async getByRunIdAcrossTenants(
    runId: string,
  ): Promise<LeadsSearchProjection | null> {
    const result = await this.database.execute(drizzleSql`
      SELECT ${SELECT_COLUMNS}
      FROM "leads_search_projections"
      WHERE "run_id" = ${runId}
      LIMIT 1
    `);
    const row = statementRows(result)[0];
    return row ? leadsSearchProjectionFromRow(row) : null;
  }
}
