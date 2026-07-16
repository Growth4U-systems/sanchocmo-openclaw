import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

import postgres from "postgres";

import { executionControlMigrations } from "../../../scripts/lib/execution-control-migration-set.mjs";
import {
  inspectStagingCanaryMigrationsReadOnly,
  STAGING_CANARY_MIGRATION_IDS,
  StagingCanaryMigrationPreflightError,
} from "../../../scripts/lib/staging-canary-migration-preflight.mts";
import {
  prepareTrackedMigrations,
  runTrackedSqlMigrations,
} from "../../../scripts/lib/tracked-sql-migrations.mjs";

const databaseUrl = process.env.STAGING_CANARY_PREFLIGHT_TEST_DATABASE_URL;
const destructiveOptIn =
  process.env.STAGING_CANARY_PREFLIGHT_TEST_ALLOW_DESTRUCTIVE;

function isStableRefusal(error: unknown): boolean {
  assert.ok(error instanceof StagingCanaryMigrationPreflightError);
  assert.equal(error.code, "migrations_or_cutover_unready");
  assert.equal(
    error.message,
    "Staging canary migrations or execution-origin cutover are unready",
  );
  assert.equal("cause" in error, false);
  return true;
}

test("migration preflight pins a read-only public search path and exposes only a redacted contract", async () => {
  const source = await fs.readFile(
    path.join(
      process.cwd(),
      "scripts/lib/staging-canary-migration-preflight.mts",
    ),
    "utf8",
  );

  assert.match(source, /default_transaction_read_only:\s*"on"/);
  assert.match(source, /search_path:\s*"public"/);
  assert.match(source, /SET LOCAL search_path TO public/);
  assert.doesNotMatch(source, /runTrackedSqlMigrations/);
  assert.deepEqual(STAGING_CANARY_MIGRATION_IDS, [
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

  const secret = "canary-secret-user:canary-secret-password";
  await assert.rejects(
    inspectStagingCanaryMigrationsReadOnly(
      `postgresql://${secret}@127.0.0.1:1/private-canary`,
    ),
    (error: unknown) => {
      assert.equal(isStableRefusal(error), true);
      assert.doesNotMatch(error.message, /canary-secret|postgres|127\.0\.0\.1/);
      assert.doesNotMatch(JSON.stringify(error), /canary-secret|127\.0\.0\.1/);
      return true;
    },
  );
});

test(
  "migration preflight verifies checksums, completeness, schema state and cutover without writes",
  { skip: !databaseUrl, timeout: 120_000 },
  async (t) => {
    assert.equal(
      destructiveOptIn,
      "1",
      "set STAGING_CANARY_PREFLIGHT_TEST_ALLOW_DESTRUCTIVE=1 for the dedicated disposable database",
    );

    let configuredDatabaseName: string;
    try {
      configuredDatabaseName = decodeURIComponent(
        new URL(databaseUrl as string).pathname.replace(/^\//, ""),
      );
    } catch {
      assert.fail("staging canary preflight test database URL is invalid");
    }
    assert.match(
      configuredDatabaseName,
      /^san480_canary_preflight_[a-z0-9_]+$/,
    );

    const admin = postgres(databaseUrl as string, {
      max: 2,
      prepare: false,
      onnotice: () => {},
    });
    const readerRole = `san480_canary_reader_${crypto
      .randomUUID()
      .replaceAll("-", "")}`;

    async function resetExecutionSchema() {
      await admin.unsafe(`
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
      await admin.unsafe(`DROP SCHEMA IF EXISTS "sancho_internal" CASCADE`);
      await admin.unsafe(`DROP SCHEMA IF EXISTS "attacker" CASCADE`);
    }

    async function trackedRows() {
      return admin<
        {
          name: string;
          sha256: string;
          disposition: string;
          recordedAt: Date;
        }[]
      >`
        SELECT "name", "sha256", "disposition", "recorded_at" AS "recordedAt"
        FROM "sancho_internal"."sql_migrations"
        ORDER BY "name"
      `;
    }

    try {
      await resetExecutionSchema();
      await runTrackedSqlMigrations({
        descriptors: executionControlMigrations,
        databaseUrl: databaseUrl as string,
        logger: () => {},
      });

      const prepared = await prepareTrackedMigrations(
        executionControlMigrations,
      );
      const baselineRows = await trackedRows();
      assert.equal(prepared.length, 15);
      assert.deepEqual(
        baselineRows.map(({ name, sha256, disposition }) => ({
          name,
          sha256,
          disposition,
        })),
        prepared.map(({ name, sha256 }) => ({
          name,
          sha256,
          disposition: "applied",
        })),
      );

      await admin.unsafe(`CREATE SCHEMA "attacker"`);
      await admin.unsafe(`
        CREATE TABLE "attacker"."execution_runs" ("id" text);
        CREATE TABLE "attacker"."execution_origins" ("id" text);
        CREATE TABLE "attacker"."execution_run_origins" ("id" text)
      `);
      await admin.unsafe(`CREATE ROLE "${readerRole}" LOGIN`);
      await admin.unsafe(
        `ALTER ROLE "${readerRole}" SET default_transaction_read_only TO on`,
      );
      await admin.unsafe(
        `ALTER ROLE "${readerRole}" SET search_path TO attacker, public`,
      );
      await admin.unsafe(
        `GRANT USAGE ON SCHEMA public, sancho_internal, attacker TO "${readerRole}"`,
      );
      await admin.unsafe(
        `GRANT SELECT ON ALL TABLES IN SCHEMA public, sancho_internal, attacker TO "${readerRole}"`,
      );

      const hostileReaderUrl = new URL(databaseUrl as string);
      hostileReaderUrl.username = readerRole;
      hostileReaderUrl.password = "reader-password-must-never-surface";
      hostileReaderUrl.searchParams.set(
        "options",
        "-csearch_path=attacker,public -cdefault_transaction_read_only=off",
      );

      await t.test(
        "exact tracked state succeeds through a hostile, read-only role without mutating it",
        async () => {
          const before = await trackedRows();
          assert.deepEqual(
            await inspectStagingCanaryMigrationsReadOnly(
              hostileReaderUrl.toString(),
            ),
            {
              migrationCount: 15,
              firstMigration: "0019",
              lastMigration: "0033",
              cutoverGapCount: "0",
            },
          );
          assert.deepEqual(await trackedRows(), before);
        },
      );

      await t.test(
        "checksum drift fails closed and is not repaired",
        async () => {
          const target = baselineRows[0];
          const driftedChecksum =
            target.sha256 === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64);
          await admin`
          UPDATE "sancho_internal"."sql_migrations"
          SET "sha256" = ${driftedChecksum}
          WHERE "name" = ${target.name}
        `;
          try {
            await assert.rejects(
              inspectStagingCanaryMigrationsReadOnly(databaseUrl as string),
              isStableRefusal,
            );
            const [stillDrifted] = await admin<{ sha256: string }[]>`
            SELECT "sha256"
            FROM "sancho_internal"."sql_migrations"
            WHERE "name" = ${target.name}
          `;
            assert.equal(stillDrifted.sha256, driftedChecksum);
          } finally {
            await admin`
            UPDATE "sancho_internal"."sql_migrations"
            SET "sha256" = ${target.sha256}
            WHERE "name" = ${target.name}
          `;
          }
        },
      );

      await t.test("a missing tracked migration fails closed", async () => {
        const target = baselineRows.at(-1) as (typeof baselineRows)[number];
        await admin`
          DELETE FROM "sancho_internal"."sql_migrations"
          WHERE "name" = ${target.name}
        `;
        try {
          await assert.rejects(
            inspectStagingCanaryMigrationsReadOnly(databaseUrl as string),
            isStableRefusal,
          );
          const [{ count }] = await admin<{ count: number }[]>`
            SELECT count(*)::integer AS "count"
            FROM "sancho_internal"."sql_migrations"
            WHERE "name" = ${target.name}
          `;
          assert.equal(count, 0);
        } finally {
          await admin`
            INSERT INTO "sancho_internal"."sql_migrations"
              ("name", "sha256", "disposition", "recorded_at")
            VALUES (
              ${target.name}, ${target.sha256}, ${target.disposition},
              ${target.recordedAt}
            )
          `;
        }
      });

      await t.test("a missing tracker table fails closed", async () => {
        await admin.unsafe(`
          ALTER TABLE "sancho_internal"."sql_migrations"
          RENAME TO "sql_migrations_missing"
        `);
        try {
          await assert.rejects(
            inspectStagingCanaryMigrationsReadOnly(databaseUrl as string),
            isStableRefusal,
          );
        } finally {
          await admin.unsafe(`
            ALTER TABLE "sancho_internal"."sql_migrations_missing"
            RENAME TO "sql_migrations"
          `);
        }
      });

      await t.test(
        "catalog drift fails closed and is not repaired",
        async () => {
          await admin.unsafe(`
          ALTER TABLE "execution_effects"
          ALTER COLUMN "step_key" DROP NOT NULL
        `);
          try {
            await assert.rejects(
              inspectStagingCanaryMigrationsReadOnly(databaseUrl as string),
              isStableRefusal,
            );
            const [{ notNull }] = await admin<{ notNull: boolean }[]>`
            SELECT "attnotnull" AS "notNull"
            FROM pg_catalog.pg_attribute
            WHERE "attrelid" = 'public.execution_effects'::regclass
              AND "attname" = 'step_key'
          `;
            assert.equal(notNull, false);
          } finally {
            await admin.unsafe(`
            ALTER TABLE "execution_effects"
            ALTER COLUMN "step_key" SET NOT NULL
          `);
          }
        },
      );

      await t.test(
        "an unregistered live origin blocks cutover without repair",
        async () => {
          const runId = `xrun_preflight_${crypto.randomUUID()}`;
          const parentAgentRunId = `run-parent-${crypto.randomUUID()}`;
          await admin`
          INSERT INTO "execution_runs" (
            "id", "tenant_key", "idempotency_key", "aggregate_type",
            "aggregate_id", "operation", "mode", "status", "metadata"
          ) VALUES (
            ${runId}, 'preflight-tenant', ${`idem:${crypto.randomUUID()}`},
            'preflight.contract', ${crypto.randomUUID()},
            'preflight.contract', 'canary', 'queued',
            ${admin.json({
              executionOrigin: {
                schemaVersion: 1,
                kind: "mc_chat_parent_run",
                parentAgentRunId,
              },
            })}
          )
        `;
          try {
            await assert.rejects(
              inspectStagingCanaryMigrationsReadOnly(databaseUrl as string),
              isStableRefusal,
            );
            const [{ count }] = await admin<{ count: number }[]>`
            SELECT count(*)::integer AS "count"
            FROM "execution_runs"
            WHERE "id" = ${runId}
          `;
            assert.equal(count, 1);
          } finally {
            await admin`DELETE FROM "execution_runs" WHERE "id" = ${runId}`;
          }
        },
      );

      assert.deepEqual(await trackedRows(), baselineRows);
      assert.deepEqual(
        await inspectStagingCanaryMigrationsReadOnly(databaseUrl as string),
        {
          migrationCount: 15,
          firstMigration: "0019",
          lastMigration: "0033",
          cutoverGapCount: "0",
        },
      );
    } finally {
      await admin
        .unsafe(`DROP OWNED BY "${readerRole}"`)
        .catch(() => undefined);
      await admin
        .unsafe(`DROP ROLE IF EXISTS "${readerRole}"`)
        .catch(() => undefined);
      await resetExecutionSchema().catch(() => undefined);
      await admin.end({ timeout: 5 });
    }
  },
);
