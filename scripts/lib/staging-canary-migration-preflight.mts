import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { executionControlMigrations } from "./execution-control-migration-set.mjs";
import {
  normalizeMigrationDatabaseConnection,
  prepareTrackedMigrations,
} from "./tracked-sql-migrations.mjs";
import {
  verifyExecutionOriginCutover,
  type ExecutionOriginCutoverDatabase,
} from "../../src/lib/runtime/execution-origin-cutover-gate";

export const STAGING_CANARY_MIGRATION_IDS = Object.freeze([
  "0019",
  "0020",
  "0021",
  "0022",
  "0023",
  "0024",
  "0025",
  "0026",
  "0027",
  "0028",
  "0029",
  "0030",
  "0031",
  "0032",
  "0033",
]);

export class StagingCanaryMigrationPreflightError extends Error {
  readonly code = "migrations_or_cutover_unready" as const;

  constructor() {
    super("Staging canary migrations or execution-origin cutover are unready");
    this.name = "StagingCanaryMigrationPreflightError";
  }
}

/**
 * Full 0019–0033 inspection. The client is read-only at connection level;
 * this function never invokes the migration runner, advisory locks or DDL.
 */
export async function inspectStagingCanaryMigrationsReadOnly(
  databaseUrl: string,
) {
  let sql: ReturnType<typeof postgres> | undefined;
  try {
    const connection = normalizeMigrationDatabaseConnection(databaseUrl);
    const prepared = await prepareTrackedMigrations(executionControlMigrations);
    if (
      prepared.length !== STAGING_CANARY_MIGRATION_IDS.length ||
      prepared.some(
        (migration, index) =>
          migration.id !== STAGING_CANARY_MIGRATION_IDS[index],
      )
    ) {
      throw new StagingCanaryMigrationPreflightError();
    }

    sql = postgres(connection.databaseUrl, {
      ...connection.postgresOptions,
      max: 1,
      connect_timeout: 5,
      onnotice: () => {},
      connection: {
        default_transaction_read_only: "on",
        search_path: "public",
        statement_timeout: "15000",
        lock_timeout: "5000",
      },
    });

    await sql.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL search_path TO public");
      const [tracker] = await transaction<[{ exists: boolean }]>`
        SELECT to_regclass('sancho_internal.sql_migrations') IS NOT NULL
          AS "exists"
      `;
      if (tracker?.exists !== true) {
        throw new StagingCanaryMigrationPreflightError();
      }
      const names = prepared.map((migration) => migration.name);
      const rows = await transaction<
        { name: string; sha256: string; disposition: string }[]
      >`
        SELECT "name", "sha256", "disposition"
        FROM "sancho_internal"."sql_migrations"
        WHERE "name" IN ${transaction(names)}
      `;
      if (rows.length !== prepared.length) {
        throw new StagingCanaryMigrationPreflightError();
      }
      const tracked = new Map(rows.map((row) => [row.name, row]));
      for (const migration of prepared) {
        const row = tracked.get(migration.name);
        if (
          !row ||
          row.sha256 !== migration.sha256 ||
          (row.disposition !== "applied" && row.disposition !== "adopted") ||
          (await migration.inspectState(transaction)) !== "applied"
        ) {
          throw new StagingCanaryMigrationPreflightError();
        }
      }
    });

    const cutover = await verifyExecutionOriginCutover({
      requireCheck: true,
      database: drizzle(sql) as unknown as ExecutionOriginCutoverDatabase,
    });
    if (!cutover.checked || cutover.gapCount !== "0") {
      throw new StagingCanaryMigrationPreflightError();
    }
    return {
      migrationCount: prepared.length,
      firstMigration: STAGING_CANARY_MIGRATION_IDS[0],
      lastMigration:
        STAGING_CANARY_MIGRATION_IDS[STAGING_CANARY_MIGRATION_IDS.length - 1],
      cutoverGapCount: "0",
    } as const;
  } catch (error) {
    if (error instanceof StagingCanaryMigrationPreflightError) throw error;
    throw new StagingCanaryMigrationPreflightError();
  } finally {
    if (sql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
