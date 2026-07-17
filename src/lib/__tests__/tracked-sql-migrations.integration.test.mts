import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import postgres from "postgres";
import {
  executionControlMigrations,
  executionControlMigrationsThrough,
} from "../../../scripts/lib/execution-control-migration-set.mjs";
import {
  MigrationSafetyError,
  runTrackedSqlMigrations,
  splitSqlStatements,
  TRACKED_MIGRATION_ADVISORY_LOCK,
} from "../../../scripts/lib/tracked-sql-migrations.mjs";

// This suite drops the execution-control schema and therefore only accepts its
// own explicitly disposable database URL. Never fall back to a shared CI DB.
const databaseUrl = process.env.TRACKED_SQL_MIGRATION_TEST_DATABASE_URL;
const destructiveOptIn =
  process.env.TRACKED_SQL_MIGRATION_TEST_ALLOW_DESTRUCTIVE;

test(
  "tracked SQL migrations are one-shot, adoptable, concurrent, and atomic",
  { skip: !databaseUrl, timeout: 120_000 },
  async (t) => {
    assert.equal(
      destructiveOptIn,
      "1",
      "set TRACKED_SQL_MIGRATION_TEST_ALLOW_DESTRUCTIVE=1 for the dedicated disposable database",
    );
    let configuredDatabaseName: string;
    try {
      configuredDatabaseName = decodeURIComponent(
        new URL(databaseUrl as string).pathname.replace(/^\//, ""),
      );
    } catch {
      assert.fail("tracked migration test database URL is invalid");
    }
    assert.match(configuredDatabaseName, /^san480_migration_[a-z0-9_]+$/);

    const sql = postgres(databaseUrl as string, {
      max: 4,
      prepare: false,
      onnotice: () => {},
    });
    const temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "sancho-migrations-"),
    );
    const quiet = () => {};

    const [{ currentDatabase }] = await sql<{ currentDatabase: string }[]>`
      SELECT current_database() AS "currentDatabase"
    `;
    assert.equal(currentDatabase, configuredDatabaseName);

    async function resetExecutionSchema() {
      await sql.unsafe(`
        DROP TABLE IF EXISTS
          "execution_run_origins",
          "execution_origins",
          "leads_search_projections",
          "execution_terminal_projections",
          "execution_effects",
          "execution_events",
          "execution_steps",
          "execution_runs"
        CASCADE
      `);
      await sql.unsafe(`DROP SCHEMA IF EXISTS "sancho_internal" CASCADE`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS "attacker" CASCADE`);
    }

    try {
      await resetExecutionSchema();

      await t.test(
        "clean apply records every checksum and a second run executes no DDL",
        async () => {
          await sql.unsafe(`CREATE SCHEMA "attacker"`);
          await sql.unsafe(`
            CREATE FUNCTION "attacker"."pg_advisory_xact_lock"(integer, integer)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              RAISE EXCEPTION 'unqualified advisory lock was called';
            END
            $$
          `);
          const hostileUrl = new URL(databaseUrl as string);
          hostileUrl.searchParams.set(
            "options",
            "-csearch_path=attacker,public,pg_catalog",
          );
          const first = await runTrackedSqlMigrations({
            descriptors: executionControlMigrations,
            databaseUrl: hostileUrl.toString(),
            logger: quiet,
          });
          assert.equal(first.length, 15);
          assert.ok(
            first.every(({ outcome }) => outcome.startsWith("applied")),
          );

          const tracked = await sql<
            { name: string; sha256: string; disposition: string }[]
          >`
            SELECT "name", "sha256", "disposition"
            FROM "sancho_internal"."sql_migrations"
            ORDER BY "name"
          `;
          assert.equal(tracked.length, 15);
          assert.ok(
            tracked.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)),
          );
          assert.ok(
            tracked.every(({ disposition }) => disposition === "applied"),
          );
          const [placement] = await sql<
            { publicTable: boolean; attackerTable: boolean }[]
          >`
            SELECT
              to_regclass('public.execution_runs') IS NOT NULL AS "publicTable",
              to_regclass('attacker.execution_runs') IS NOT NULL AS "attackerTable"
          `;
          assert.equal(placement.publicTable, true);
          assert.equal(placement.attackerTable, false);

          // Event-trigger evidence catches any DDL, including an accidental
          // CREATE ... IF NOT EXISTS in the runner itself on the skip path.
          await sql.unsafe(
            `CREATE TABLE "migration_ddl_audit" (tag text NOT NULL)`,
          );
          await sql.unsafe(`
            CREATE FUNCTION "record_migration_ddl"() RETURNS event_trigger
            LANGUAGE plpgsql AS $$
            BEGIN
              INSERT INTO "migration_ddl_audit" ("tag") VALUES (tg_tag);
            END
            $$
          `);
          await sql.unsafe(`
            CREATE EVENT TRIGGER "record_migration_ddl_trigger"
            ON ddl_command_end EXECUTE FUNCTION "record_migration_ddl"()
          `);
          await sql`TRUNCATE TABLE "migration_ddl_audit"`;

          const second = await runTrackedSqlMigrations({
            descriptors: executionControlMigrations,
            databaseUrl,
            logger: quiet,
          });
          assert.ok(
            second.every(
              ({ outcome }) => outcome === "skipped (already applied)",
            ),
          );
          const [{ count }] = await sql<{ count: number }[]>`
            SELECT count(*)::integer AS "count" FROM "migration_ddl_audit"
          `;
          assert.equal(count, 0);

          await sql.unsafe(`DROP EVENT TRIGGER "record_migration_ddl_trigger"`);
          await sql.unsafe(`DROP FUNCTION "record_migration_ddl"()`);
          await sql.unsafe(`DROP TABLE "migration_ddl_audit"`);
        },
      );

      await t.test(
        "a final legacy schema requires and passes explicit verified adoption",
        async () => {
          await sql.unsafe(`DROP SCHEMA "sancho_internal" CASCADE`);
          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: executionControlMigrations,
              databaseUrl,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              /already applied but untracked/.test(error.message),
          );
          const [{ existsAfterRefusal }] = await sql<
            { existsAfterRefusal: boolean }[]
          >`
            SELECT to_regclass('sancho_internal.sql_migrations') IS NOT NULL
              AS "existsAfterRefusal"
          `;
          assert.equal(existsAfterRefusal, false);

          await sql.unsafe(
            `ALTER TABLE "execution_effects" ALTER COLUMN "step_key" DROP NOT NULL`,
          );
          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: executionControlMigrations,
              databaseUrl,
              adopt: true,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              error.message.includes("0025_execution_effects.sql") &&
              error.message.includes("reported partial"),
          );
          await sql.unsafe(
            `ALTER TABLE "execution_effects" ALTER COLUMN "step_key" SET NOT NULL`,
          );

          // Exact default matching must not regress to substring checks:
          // `'not_queued'` used to satisfy a `defaultIncludes: ['queued']`
          // verifier even though new runs would start in an invalid state.
          for (const corruptDefault of ["not_queued", "QUEUED"]) {
            await sql.unsafe(`
              ALTER TABLE "execution_runs"
                ALTER COLUMN "status" SET DEFAULT '${corruptDefault}'
            `);
            await assert.rejects(
              runTrackedSqlMigrations({
                descriptors: executionControlMigrations,
                databaseUrl,
                adopt: true,
                logger: quiet,
              }),
              (error: unknown) =>
                error instanceof MigrationSafetyError &&
                error.message.includes("0019_execution_control.sql") &&
                error.message.includes("reported partial"),
            );
          }
          await sql.unsafe(`
            ALTER TABLE "execution_runs"
              ALTER COLUMN "status" SET DEFAULT 'queued'
          `);

          await sql.unsafe(`
            ALTER TABLE "execution_runs" ADD COLUMN "TENANT_KEY" text;
            DROP INDEX "execution_runs_tenant_aggregate_idempotency_idx";
            CREATE UNIQUE INDEX "execution_runs_tenant_aggregate_idempotency_idx"
              ON "execution_runs" (
                "TENANT_KEY", "aggregate_type", "aggregate_id", "operation", "idempotency_key"
              )
          `);
          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: executionControlMigrations,
              databaseUrl,
              adopt: true,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              error.message.includes("0019_execution_control.sql") &&
              error.message.includes("reported partial"),
          );
          await sql.unsafe(`
            DROP INDEX "execution_runs_tenant_aggregate_idempotency_idx";
            ALTER TABLE "execution_runs" DROP COLUMN "TENANT_KEY";
            CREATE UNIQUE INDEX "execution_runs_tenant_aggregate_idempotency_idx"
              ON "execution_runs" (
                "tenant_key", "aggregate_type", "aggregate_id", "operation", "idempotency_key"
              )
          `);

          await sql.unsafe(`
            ALTER TABLE "execution_runs"
              DROP CONSTRAINT "execution_runs_mode_check",
              ADD CONSTRAINT "execution_runs_mode_check"
                CHECK ("mode" IN ('shadow', 'canary', 'active', 'rogue'))
          `);
          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: executionControlMigrations,
              databaseUrl,
              adopt: true,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              error.message.includes("0019_execution_control.sql") &&
              error.message.includes("reported partial"),
          );
          await sql.unsafe(`
            ALTER TABLE "execution_runs"
              DROP CONSTRAINT "execution_runs_mode_check",
              ADD CONSTRAINT "execution_runs_mode_check"
                CHECK ("mode" IN ('shadow', 'canary', 'active'))
          `);
          assert.equal(
            (
              await sql`
                SELECT to_regclass('sancho_internal.sql_migrations') AS "table"
              `
            )[0].table,
            null,
          );

          const missingProjectionRun = `xrun_migration_${crypto.randomUUID()}`;
          await sql`
            INSERT INTO "execution_runs" (
              "id", "tenant_key", "idempotency_key", "aggregate_type",
              "aggregate_id", "operation", "mode", "status", "metadata"
            ) VALUES (
              ${missingProjectionRun}, 'migration-test', ${`key:${crypto.randomUUID()}`},
              'migration.test', ${crypto.randomUUID()}, 'migration.test',
              'canary', 'completed', '{"authority":"execution_ledger_v2"}'::jsonb
            )
          `;
          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: executionControlMigrations,
              databaseUrl,
              adopt: true,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              error.message.includes(
                "0027_execution_terminal_projections.sql",
              ) &&
              error.message.includes("reported partial"),
          );
          await sql`DELETE FROM "execution_runs" WHERE "id" = ${missingProjectionRun}`;

          const adopted = await runTrackedSqlMigrations({
            descriptors: executionControlMigrations,
            databaseUrl,
            adopt: true,
            logger: quiet,
          });
          assert.ok(
            adopted.every(
              ({ outcome }) => outcome === "adopted after schema verification",
            ),
          );
          const dispositions = await sql<{ disposition: string }[]>`
            SELECT "disposition"
            FROM "sancho_internal"."sql_migrations"
          `;
          assert.ok(
            dispositions.every(({ disposition }) => disposition === "adopted"),
          );
        },
      );

      await t.test(
        "an existing 0019–0020 prefix adopts through 0020 before the remainder applies",
        async () => {
          await resetExecutionSchema();
          const prefix = executionControlMigrationsThrough("0020");
          // Execute the immutable historical bytes directly, as the legacy
          // untracked deploy did. This is not a runner-created schema with its
          // tracking table deleted after the fact.
          await sql.begin(async (transaction) => {
            for (const migration of prefix) {
              const source = await fs.readFile(migration.path, "utf8");
              for (const statement of splitSqlStatements(source)) {
                await transaction.unsafe(statement);
              }
            }
          });
          assert.equal(
            (
              await sql`
                SELECT to_regclass('sancho_internal.sql_migrations') AS "table"
              `
            )[0].table,
            null,
          );

          await sql.unsafe(
            `DROP INDEX "execution_runs_aggregate_idempotency_idx"`,
          );
          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: prefix,
              databaseUrl,
              adopt: true,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              error.message.includes("reported partial"),
          );
          await sql.unsafe(`
            CREATE UNIQUE INDEX "execution_runs_aggregate_idempotency_idx"
            ON "execution_runs" (
              "aggregate_type", "aggregate_id", "operation", "idempotency_key"
            )
          `);

          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: executionControlMigrations,
              databaseUrl,
              adopt: true,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              error.message.includes("0021_execution_leases.sql") &&
              error.message.includes("reported absent"),
          );
          assert.equal(
            (
              await sql`
                SELECT to_regclass('sancho_internal.sql_migrations') AS "table"
              `
            )[0].table,
            null,
          );

          const adoptedPrefix = await runTrackedSqlMigrations({
            descriptors: prefix,
            databaseUrl,
            adopt: true,
            logger: quiet,
          });
          assert.equal(adoptedPrefix.length, 2);
          assert.ok(
            adoptedPrefix.every(({ outcome }) => outcome.startsWith("adopted")),
          );

          const completed = await runTrackedSqlMigrations({
            descriptors: executionControlMigrations,
            databaseUrl,
            logger: quiet,
          });
          assert.deepEqual(
            completed.map(({ outcome }) => outcome),
            [
              "skipped (already applied)",
              "skipped (already applied)",
              ...Array.from({ length: 13 }, (_, index) => {
                const statementCounts = [3, 1, 2, 4, 3, 7, 7, 8, 2, 6, 1, 5, 3];
                return `applied ${statementCounts[index]} statement(s)`;
              }),
            ],
          );
        },
      );

      await t.test("checksum drift fails before migration DDL", async () => {
        const driftPath = path.join(
          temporaryDirectory,
          "0019_execution_control.sql",
        );
        const original = await fs.readFile(
          executionControlMigrations[0].path,
          "utf8",
        );
        await fs.writeFile(
          driftPath,
          `${original}\nALTER TABLE "execution_runs" ADD COLUMN "drift_must_not_exist" text;\n`,
          "utf8",
        );
        const drifted = {
          ...executionControlMigrations[0],
          path: driftPath,
        };
        await assert.rejects(
          runTrackedSqlMigrations({
            descriptors: [drifted],
            databaseUrl,
            logger: quiet,
          }),
          (error: unknown) =>
            error instanceof MigrationSafetyError &&
            error.message.includes("checksum drift detected") &&
            error.message.includes("no SQL was executed"),
        );
        const [{ exists }] = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'execution_runs'
              AND column_name = 'drift_must_not_exist'
          ) AS "exists"
        `;
        assert.equal(exists, false);
      });

      await t.test(
        "a modern channel_binding URL is normalized before postgres.js connects",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const table = `migration_channel_binding_${suffix}`;
          const file = path.join(temporaryDirectory, `${suffix}.sql`);
          const name = `test/${suffix}.sql`;
          await fs.writeFile(
            file,
            `CREATE TABLE "${table}" ("id" integer PRIMARY KEY);`,
            "utf8",
          );
          const inspectState = async (transaction: postgres.TransactionSql) => {
            const [{ exists }] = await transaction<{ exists: boolean }[]>`
              SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS "exists"
            `;
            return exists ? "applied" : "absent";
          };
          const modernUrl = new URL(databaseUrl as string);
          modernUrl.searchParams.append("channel_binding", "require");
          const [result] = await runTrackedSqlMigrations({
            descriptors: [{ path: file, name, inspectState }],
            databaseUrl: modernUrl.toString(),
            logger: quiet,
          });
          assert.equal(result.outcome, "applied 1 statement(s)");
        },
      );

      await t.test(
        "two concurrent runners execute a migration once",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const table = `migration_concurrency_${suffix}`;
          const file = path.join(temporaryDirectory, `${suffix}.sql`);
          const name = `test/${suffix}.sql`;
          await fs.writeFile(
            file,
            `SELECT pg_sleep(0.2); CREATE TABLE "${table}" ("id" integer PRIMARY KEY);`,
            "utf8",
          );
          const inspectState = async (transaction: postgres.TransactionSql) => {
            const [{ exists }] = await transaction<{ exists: boolean }[]>`
            SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS "exists"
          `;
            return exists ? "applied" : "absent";
          };
          const descriptor = { path: file, name, inspectState };

          const results = await Promise.all([
            runTrackedSqlMigrations({
              descriptors: [descriptor],
              databaseUrl,
              logger: quiet,
            }),
            runTrackedSqlMigrations({
              descriptors: [descriptor],
              databaseUrl,
              logger: quiet,
            }),
          ]);
          assert.deepEqual(
            results
              .flat()
              .map(({ outcome }) => outcome)
              .sort(),
            ["applied 2 statement(s)", "skipped (already applied)"],
          );
          const [{ count }] = await sql<{ count: number }[]>`
          SELECT count(*)::integer AS "count"
          FROM "sancho_internal"."sql_migrations"
          WHERE "name" = ${name}
        `;
          assert.equal(count, 1);
        },
      );

      await t.test(
        "a held migration lock fails within the configured retryable bound",
        async () => {
          let releaseLock: (() => void) | undefined;
          let markReady: (() => void) | undefined;
          const ready = new Promise<void>((resolve) => {
            markReady = resolve;
          });
          const holder = sql.begin(async (transaction) => {
            await transaction`
              SELECT pg_catalog.pg_advisory_xact_lock(
                ${TRACKED_MIGRATION_ADVISORY_LOCK.namespace}::integer,
                ${TRACKED_MIGRATION_ADVISORY_LOCK.key}::integer
              )
            `;
            markReady?.();
            await new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
          });
          await ready;
          const startedAt = Date.now();
          try {
            await assert.rejects(
              runTrackedSqlMigrations({
                descriptors: executionControlMigrations,
                databaseUrl,
                logger: quiet,
                lockTimeoutMs: 75,
                statementTimeoutMs: 5_000,
              }),
              (error: unknown) =>
                error instanceof MigrationSafetyError &&
                error.message.startsWith("Retryable migration timeout:"),
            );
            assert.ok(Date.now() - startedAt < 3_000);
          } finally {
            releaseLock?.();
            await holder;
          }
        },
      );

      await t.test(
        "a failed file rolls back both DDL and tracking",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const table = `migration_rollback_${suffix}`;
          const file = path.join(temporaryDirectory, `${suffix}.sql`);
          const name = `test/${suffix}.sql`;
          await fs.writeFile(
            file,
            `CREATE TABLE "${table}" ("id" integer); SELECT migration_function_that_does_not_exist();`,
            "utf8",
          );
          const inspectState = async (transaction: postgres.TransactionSql) => {
            const [{ exists }] = await transaction<{ exists: boolean }[]>`
            SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS "exists"
          `;
            return exists ? "applied" : "absent";
          };

          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: [{ path: file, name, inspectState }],
              databaseUrl,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              error.message.includes("transaction was rolled back"),
          );
          const [state] = await sql<
            { table: string | null; tracking: number }[]
          >`
          SELECT
            to_regclass(${`public.${table}`})::text AS "table",
            (
              SELECT count(*)::integer
              FROM "sancho_internal"."sql_migrations"
              WHERE "name" = ${name}
            ) AS "tracking"
        `;
          assert.equal(state.table, null);
          assert.equal(state.tracking, 0);
        },
      );

      await t.test(
        "a failed postcondition rolls back DDL and tracking",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const table = `migration_postcondition_${suffix}`;
          const file = path.join(temporaryDirectory, `${suffix}.sql`);
          const name = `test/${suffix}.sql`;
          await fs.writeFile(
            file,
            `CREATE TABLE "${table}" ("id" integer);`,
            "utf8",
          );
          const inspectState = async (transaction: postgres.TransactionSql) => {
            const [{ exists }] = await transaction<{ exists: boolean }[]>`
              SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS "exists"
            `;
            return exists ? "partial" : "absent";
          };

          await assert.rejects(
            runTrackedSqlMigrations({
              descriptors: [{ path: file, name, inspectState }],
              databaseUrl,
              logger: quiet,
            }),
            (error: unknown) =>
              error instanceof MigrationSafetyError &&
              error.message.includes(
                "post-migration verifier reported partial",
              ),
          );
          const [state] = await sql<
            { table: string | null; tracking: number }[]
          >`
            SELECT
              to_regclass(${`public.${table}`})::text AS "table",
              (
                SELECT count(*)::integer
                FROM "sancho_internal"."sql_migrations"
                WHERE "name" = ${name}
              ) AS "tracking"
          `;
          assert.equal(state.table, null);
          assert.equal(state.tracking, 0);
        },
      );

      await t.test(
        "a partial legacy schema cannot apply or adopt",
        async () => {
          await resetExecutionSchema();
          await sql.unsafe(
            `CREATE TABLE "execution_runs" ("id" text PRIMARY KEY)`,
          );

          for (const adopt of [false, true]) {
            await assert.rejects(
              runTrackedSqlMigrations({
                descriptors: executionControlMigrationsThrough("0019"),
                databaseUrl,
                adopt,
                logger: quiet,
              }),
              (error: unknown) =>
                error instanceof MigrationSafetyError &&
                /reported partial|partially applied/.test(error.message),
            );
          }
          const [{ tracker }] = await sql<{ tracker: string | null }[]>`
          SELECT to_regclass('sancho_internal.sql_migrations')::text AS "tracker"
        `;
          assert.equal(tracker, null);
        },
      );
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
      await sql.end({ timeout: 5 }).catch(() => {});
    }
  },
);
