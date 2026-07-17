import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Db } from "../../db/drizzle";
import { durableExecutionMcChatOrigin } from "../durable-execution/execution-origin";
import { PostgresExecutionControlRepository } from "../execution-control/postgres";
import {
  ExecutionOriginCutoverBlockedError,
  ExecutionOriginCutoverUnavailableError,
  inspectExecutionOriginCutover,
  verifyExecutionOriginCutover,
} from "../runtime/execution-origin-cutover-gate";

const databaseUrl =
  process.env.EXECUTION_ORIGIN_CUTOVER_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_ORIGIN_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL;

const migrations = [
  "0019_execution_control.sql",
  "0020_execution_tenant_scope.sql",
  "0021_execution_leases.sql",
  "0022_execution_command_fingerprint.sql",
  "0023_execution_drain.sql",
  "0024_execution_tenant_contract.sql",
  "0025_execution_effects.sql",
  "0026_execution_cancellation.sql",
  "0027_execution_terminal_projections.sql",
  "0028_execution_run_blocking.sql",
  "0029_leads_search_projections.sql",
  "0030_execution_utc_timestamps.sql",
  "0031_execution_origin_lookup.sql",
  "0032_execution_origin_tombstones.sql",
];

function migration(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test(
  "0032 cutover gate detects only valid, non-terminal, unregistered origins",
  { skip: !databaseUrl, timeout: 60_000 },
  async (t) => {
    const suiteSchema = `execution_origin_cutover_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 4,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const database = drizzle(sql) as unknown as Db;
    const repository = new PostgresExecutionControlRepository(database);

    async function insertLegacyRun(input: {
      id: string;
      tenantKey: string;
      parentAgentRunId: string;
      status?: "queued" | "running" | "waiting_approval" | "completed";
      metadata?: unknown;
    }) {
      const status = input.status ?? "queued";
      const metadata =
        input.metadata ?? durableExecutionMcChatOrigin(input.parentAgentRunId);
      await sql`
        INSERT INTO "execution_runs" (
          "id", "tenant_key", "idempotency_key", "aggregate_type",
          "aggregate_id", "operation", "mode", "status", "metadata"
        ) VALUES (
          ${input.id}, ${input.tenantKey}, ${`idem:${input.id}`},
          'contract.cutover', ${input.id}, 'contract.cutover', 'canary',
          ${status},
          ${JSON.stringify({ executionOrigin: metadata })}::jsonb
        )
      `;
    }

    try {
      await adminSql.unsafe(`CREATE SCHEMA "${suiteSchema}"`);
      await sql.begin(async (migrationSql) => {
        for (const name of migrations) {
          for (const statement of migration(name)) {
            await migrationSql.unsafe(statement);
          }
        }
      });

      await t.test("empty inventory is ready and read-only", async () => {
        assert.deepEqual(await inspectExecutionOriginCutover(database), {
          gapCount: "0",
        });
        const readOnlySql = postgres(databaseUrl as string, {
          max: 1,
          onnotice: () => {},
          connection: {
            search_path: `${suiteSchema},public`,
            default_transaction_read_only: "on",
          },
        });
        try {
          const readOnlyDatabase = drizzle(readOnlySql) as unknown as Db;
          assert.deepEqual(
            await inspectExecutionOriginCutover(readOnlyDatabase),
            { gapCount: "0" },
          );
        } finally {
          await readOnlySql.end({ timeout: 5 });
        }
      });

      const sharedParent = "run-parent-shared-cutover";
      const unsafeId = `xrun_legacy_${crypto.randomUUID().slice(0, 8)}`;
      const terminalId = `xrun_terminal_${crypto.randomUUID().slice(0, 8)}`;
      const invalidId = `xrun_invalid_${crypto.randomUUID().slice(0, 8)}`;
      await insertLegacyRun({
        id: unsafeId,
        tenantKey: "tenant-unsafe",
        parentAgentRunId: sharedParent,
      });
      await insertLegacyRun({
        id: terminalId,
        tenantKey: "tenant-terminal",
        parentAgentRunId: sharedParent,
        status: "completed",
      });
      await insertLegacyRun({
        id: invalidId,
        tenantKey: "tenant-invalid",
        parentAgentRunId: sharedParent,
        metadata: {
          schemaVersion: 1,
          kind: "mc_chat_parent_run",
          parentAgentRunId: sharedParent,
          injected: true,
        },
      });

      const trusted = await repository.createRunWithTrustedOrigin({
        command: {
          tenantKey: "tenant-trusted",
          idempotencyKey: `trusted:${crypto.randomUUID()}`,
          aggregateType: "contract.cutover",
          aggregateId: crypto.randomUUID(),
          operation: "contract.cutover",
          mode: "canary",
        },
        origin: durableExecutionMcChatOrigin(sharedParent),
      });

      await t.test(
        "tenant-matched authority clears only its own exact run",
        async () => {
          assert.deepEqual(await inspectExecutionOriginCutover(database), {
            gapCount: "1",
          });
          await assert.rejects(
            verifyExecutionOriginCutover({
              env: { LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "1" },
              database,
            }),
            (error: unknown) =>
              error instanceof ExecutionOriginCutoverBlockedError &&
              error.gapCount === "1",
          );
          assert.ok(trusted.created);
        },
      );

      await t.test(
        "a valid but drifting metadata mirror is not elevated over registration",
        async () => {
          await sql`
            UPDATE "execution_runs"
            SET "metadata" = ${JSON.stringify({
              executionOrigin: durableExecutionMcChatOrigin(
                "run-parent-metadata-drift",
              ),
            })}::jsonb
            WHERE "id" = ${trusted.run.id}
          `;
          assert.deepEqual(await inspectExecutionOriginCutover(database), {
            gapCount: "2",
          });
        },
      );

      await t.test("remediation must not be a metadata backfill", async () => {
        await sql`
          UPDATE "execution_runs"
          SET "status" = 'cancelled',
              "finished_at" = clock_timestamp() AT TIME ZONE 'UTC'
          WHERE "id" = ${unsafeId}
        `;
        await sql`
          UPDATE "execution_runs"
          SET "metadata" = ${JSON.stringify({
            executionOrigin: durableExecutionMcChatOrigin(sharedParent),
          })}::jsonb
          WHERE "id" = ${trusted.run.id}
        `;
        assert.deepEqual(
          await verifyExecutionOriginCutover({
            env: { PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "1" },
            database,
          }),
          { checked: true, gapCount: "0" },
        );
      });

      await t.test(
        "tracked-but-drifted 0032 authority fails closed",
        async () => {
          await sql`
          ALTER TABLE "execution_run_origins"
          DROP CONSTRAINT "execution_run_origins_origin_fk"
        `;
          await assert.rejects(
            inspectExecutionOriginCutover(database),
            ExecutionOriginCutoverUnavailableError,
          );
        },
      );
    } finally {
      await sql.end({ timeout: 5 });
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`);
      await adminSql.end({ timeout: 5 });
    }
  },
);
