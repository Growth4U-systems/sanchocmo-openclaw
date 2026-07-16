import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "../../db/drizzle";
import { PostgresExecutionControlRepository } from "../execution-control/postgres";

const databaseUrl =
  process.env.EXECUTION_CONTROL_BLOCKING_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

function migration(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test(
  "Postgres blocked execution runs are scoped, fenced, resumable and cancellation-safe",
  { skip: !databaseUrl, timeout: 30_000 },
  async (t) => {
    const sql = postgres(databaseUrl as string, { max: 1, onnotice: () => {} });
    const schema = `execution_blocking_${crypto.randomUUID().replaceAll("-", "")}`;
    const operation = `contract.execution-blocking.${crypto.randomUUID()}`;
    let repository: PostgresExecutionControlRepository;

    async function createClaim(leaseMs = 5_000) {
      const { run } = await repository.createRun({
        tenantKey: "tenant-blocking",
        idempotencyKey: `command:${crypto.randomUUID()}`,
        aggregateType: "contract.blocking",
        aggregateId: crypto.randomUUID(),
        operation,
        mode: "canary",
        input: { value: "fixture" },
        metadata: {
          authority: "execution_ledger_v2",
          executionContractVersion: 2,
          executionHandlerVersion: 2,
        },
      });
      const claim = await repository.claimRun({
        tenantKey: run.tenantKey,
        operation,
        mode: "canary",
        runId: run.id,
        workerId: `worker-${crypto.randomUUID()}`,
        leaseMs,
      });
      assert.ok(claim);
      return claim;
    }

    try {
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await sql.unsafe(`SET search_path TO "${schema}", public`);
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
      ];
      for (let pass = 0; pass < 2; pass += 1) {
        for (const name of migrations) {
          for (const statement of migration(name)) await sql.unsafe(statement);
        }
      }
      repository = new PostgresExecutionControlRepository(
        drizzle(sql) as unknown as Db,
      );

      await t.test(
        "fresh and rerun migration keep the closed shape",
        async () => {
          const columns = await sql<
            { column_name: string; is_nullable: string }[]
          >`
          SELECT "column_name", "is_nullable"
          FROM information_schema.columns
          WHERE table_schema = ${schema}
            AND table_name = 'execution_runs'
            AND column_name IN ('blocked_at', 'blocked_reason_code')
          ORDER BY "column_name"
        `;
          assert.deepEqual(
            [...columns],
            [
              { column_name: "blocked_at", is_nullable: "YES" },
              { column_name: "blocked_reason_code", is_nullable: "YES" },
            ],
          );
          const indexes = await sql<{ indexname: string }[]>`
          SELECT "indexname"
          FROM pg_indexes
          WHERE schemaname = ${schema}
            AND tablename = 'execution_runs'
        `;
          assert.ok(
            indexes.some(
              ({ indexname }) =>
                indexname === "execution_runs_blocked_scope_idx",
            ),
          );
        },
      );

      await t.test(
        "stale fences are zero-mutation and exact resume becomes runnable",
        async () => {
          const claim = await createClaim();
          const before = await repository.listEvents(claim.run.id);
          for (const wrong of [
            { token: "stale-token" },
            { tenantKey: "tenant-other" },
            { operation: `${operation}.wrong` },
            { mode: "active" as const },
          ]) {
            assert.equal(
              await repository.blockRun({
                tenantKey: claim.run.tenantKey,
                operation,
                mode: "canary",
                runId: claim.run.id,
                token: claim.token,
                reasonCode: "command_contract_mismatch",
                ...wrong,
              }),
              null,
            );
          }
          assert.equal(
            (await repository.listEvents(claim.run.id)).length,
            before.length,
          );
          const blocked = await repository.blockRun({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
            token: claim.token,
            reasonCode: "command_contract_mismatch",
          });
          assert.equal(blocked?.status, "blocked");
          assert.equal(blocked?.blockedReasonCode, "command_contract_mismatch");
          assert.ok(blocked?.blockedAt);
          assert.equal(blocked?.leaseOwner, undefined);
          assert.equal(blocked?.leaseExpiresAt, undefined);
          assert.equal(blocked?.finishedAt, undefined);
          assert.equal(
            await repository.claimRun({
              tenantKey: claim.run.tenantKey,
              operation,
              mode: "canary",
              runId: claim.run.id,
              workerId: "blocked-claim",
              leaseMs: 5_000,
            }),
            null,
          );
          const events = await repository.listEvents(claim.run.id);
          assert.equal(events.at(-1)?.type, "run.blocked");
          assert.deepEqual(events.at(-1)?.data, {
            reasonCode: "command_contract_mismatch",
          });

          assert.equal(
            await repository.resumeBlockedRun({
              tenantKey: claim.run.tenantKey,
              operation,
              mode: "canary",
              runId: claim.run.id,
              expectedReasonCode: "execution_policy_mismatch",
            }),
            null,
          );
          const [clockBefore] = await sql<{ now: Date }[]>`
            SELECT clock_timestamp() AS "now"
          `;
          const resumed = await repository.resumeBlockedRun({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
            expectedReasonCode: "command_contract_mismatch",
          });
          assert.ok(clockBefore);
          const [clockBound] = await sql<{ bounded: boolean }[]>`
            SELECT "available_at" BETWEEN
              (${clockBefore.now}::timestamptz AT TIME ZONE 'UTC') AND
              (clock_timestamp() AT TIME ZONE 'UTC')
              AS "bounded"
            FROM "execution_runs"
            WHERE "id" = ${claim.run.id}
          `;
          assert.equal(resumed?.status, "queued");
          assert.equal(resumed?.blockedReasonCode, undefined);
          assert.equal(resumed?.blockedAt, undefined);
          assert.equal(clockBound?.bounded, true);
          assert.deepEqual(
            (await repository.listEvents(claim.run.id)).at(-1)?.data,
            { reasonCode: "command_contract_mismatch" },
          );

          const retry = await repository.claimRun({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
            workerId: "repaired-worker",
            leaseMs: 5_000,
          });
          assert.ok(retry);
          const completed = await repository.finishRun({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
            token: retry.token,
            status: "completed",
            eventType: "run.completed",
          });
          assert.equal(completed?.status, "completed");
        },
      );

      await t.test(
        "expired lease cannot block under application clock skew",
        async () => {
          const claim = await createClaim(100);
          await delay(150);
          const before = await repository.listEvents(claim.run.id);
          assert.equal(
            await repository.blockRun({
              tenantKey: claim.run.tenantKey,
              operation,
              mode: "canary",
              runId: claim.run.id,
              token: claim.token,
              reasonCode: "runtime_authority_unavailable",
            }),
            null,
          );
          assert.equal(
            (await repository.listEvents(claim.run.id)).length,
            before.length,
          );
          assert.equal(
            (await repository.getRunById(claim.run.id))?.status,
            "running",
          );
        },
      );

      await t.test(
        "cancel arriving before block converges atomically and records no compensation claim",
        async () => {
          const claim = await createClaim();
          const cancellationId = crypto.randomUUID();
          const requested = await repository.requestRunCancellation({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
            cancellationId,
            actor: { type: "user", id: "operator-fixture" },
            reasonCode: "user_requested",
          });
          assert.equal(requested?.disposition, "requested");

          const cancelled = await repository.blockRun({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
            token: claim.token,
            reasonCode: "execution_policy_mismatch",
          });
          assert.equal(cancelled?.status, "cancelled");
          assert.ok(cancelled?.cancelAcknowledgedAt);
          assert.equal(cancelled?.blockedReasonCode, undefined);
          assert.equal(
            await repository.claimRun({
              tenantKey: claim.run.tenantKey,
              operation,
              mode: "canary",
              runId: claim.run.id,
              workerId: "must-not-reclaim",
              leaseMs: 5_000,
            }),
            null,
          );
          const events = await repository.listEvents(claim.run.id);
          const terminal = events.at(-1);
          assert.equal(terminal?.type, "run.cancelled");
          assert.deepEqual(terminal?.data, {
            cancellationId,
            actor: { type: "user", id: "operator-fixture" },
            reasonCode: "user_requested",
            safePoint: "before_block",
            cooperative: true,
            blockedReasonCode: "execution_policy_mismatch",
            remoteEffectsReverted: false,
          });
          const projection = await repository.getTerminalProjectionForScope({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
          });
          assert.equal(projection?.terminalStatus, "cancelled");
          assert.equal(projection?.state, "pending");
        },
      );

      await t.test(
        "blocked managed-v2 cancellation is immediate with outbox",
        async () => {
          const claim = await createClaim();
          const blocked = await repository.blockRun({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
            token: claim.token,
            reasonCode: "runtime_authority_unavailable",
          });
          assert.equal(blocked?.status, "blocked");
          const cancellationId = crypto.randomUUID();
          const cancelled = await repository.requestRunCancellation({
            tenantKey: claim.run.tenantKey,
            operation,
            mode: "canary",
            runId: claim.run.id,
            cancellationId,
            actor: { type: "service", id: "growie-runtime" },
            reasonCode: "operator_intervention",
          });
          assert.equal(cancelled?.disposition, "cancelled");
          assert.equal(cancelled?.run.status, "cancelled");
          assert.equal(cancelled?.run.blockedReasonCode, undefined);
          assert.equal(cancelled?.run.blockedAt, undefined);
          assert.equal(
            cancelled?.terminalProjection?.terminalStatus,
            "cancelled",
          );
          assert.equal(cancelled?.terminalProjection?.state, "pending");
        },
      );
    } finally {
      try {
        await sql.unsafe("SET search_path TO public");
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
  },
);
