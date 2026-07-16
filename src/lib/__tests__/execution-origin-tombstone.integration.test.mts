import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "../../db/drizzle";
import { durableExecutionMcChatOrigin } from "../durable-execution/execution-origin";
import { requestExecutionOriginCancellation } from "../durable-execution/origin-cancellation";
import { PostgresExecutionControlRepository } from "../execution-control/postgres";
import { ExecutionOriginCancelledError } from "../execution-control/types";

const databaseUrl =
  process.env.EXECUTION_CONTROL_ORIGIN_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_CANCELLATION_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

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

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

async function remainsPending(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(
      () => false,
      () => false,
    ),
    new Promise<true>((resolve) => setTimeout(() => resolve(true), 40)),
  ]);
}

test(
  "trusted origin tombstone serializes Stop and child admission in PostgreSQL",
  { skip: !databaseUrl, timeout: 60_000 },
  async (t) => {
    const suiteSchema = `execution_origin_tombstone_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 12,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const repository = new PostgresExecutionControlRepository(
      drizzle(sql) as unknown as Db,
    );
    const operation = `contract.origin-race.${crypto.randomUUID()}`;

    function command(tenantKey: string, suffix: string) {
      return {
        tenantKey,
        idempotencyKey: `origin-race:${suffix}`,
        aggregateType: "contract.origin-child",
        aggregateId: suffix,
        operation,
        mode: "canary" as const,
        input: { suffix },
        metadata: { source: "origin-race-test" },
      };
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

      await t.test(
        "child-first registration is committed before Stop can fan out",
        async () => {
          const tenantKey = "tenant-child-first";
          const origin = durableExecutionMcChatOrigin("run-parent-child-first");
          const childCommand = command(tenantKey, "child-first");
          const childReady = deferred<string>();
          const releaseChild = deferred();
          const childSql = postgres(databaseUrl as string, {
            max: 1,
            onnotice: () => {},
            connection: { search_path: `${suiteSchema},public` },
          });
          const transactionRepository = new PostgresExecutionControlRepository(
            drizzle(childSql) as unknown as Db,
          );
          const childTransaction = (async () => {
            await childSql.unsafe("BEGIN");
            try {
              const receipt =
                await transactionRepository.createRunWithTrustedOrigin({
                  command: childCommand,
                  origin,
                });
              childReady.resolve(receipt.run.id);
              await releaseChild.promise;
              await childSql.unsafe("COMMIT");
            } catch (error) {
              childReady.reject(error);
              await childSql.unsafe("ROLLBACK").catch(() => undefined);
              throw error;
            } finally {
              await childSql.end({ timeout: 5 });
            }
          })();
          const childRunId = await childReady.promise;
          const stop = requestExecutionOriginCancellation(
            {
              tenantKey,
              parentAgentRunId: origin.parentAgentRunId,
              actor: { type: "user", id: "user:martin-fila" },
            },
            repository,
          );
          assert.equal(
            await remainsPending(stop),
            true,
            "Stop must wait for the child transaction's origin row lock",
          );
          releaseChild.resolve(undefined);
          await childTransaction;
          const result = await stop;
          assert.ok(result.children.some(({ id }) => id === childRunId));
          assert.ok(result.requestedRunIds.includes(childRunId));
          assert.equal(
            (await repository.getRunById(childRunId))?.status,
            "cancelled",
          );
          const replay = await repository.createRunWithTrustedOrigin({
            command: childCommand,
            origin,
          });
          assert.equal(replay.created, false);
          assert.equal(replay.run.id, childRunId);
          assert.equal(
            (
              await repository.getRunTrustedExecutionOrigin({
                tenantKey,
                runId: childRunId,
              })
            )?.cancellation?.cancellationId,
            result.originCancellation.cancellationId,
            "the admission gate's no-op upsert must not erase Stop",
          );
        },
      );

      await t.test(
        "stop-first tombstone blocks new children and preserves first writer",
        async () => {
          const tenantKey = "tenant-stop-first";
          const origin = durableExecutionMcChatOrigin("run-parent-stop-first");
          const stopReady = deferred<string>();
          const releaseStop = deferred();
          const firstCancellationId = `cancel_${"a".repeat(32)}`;
          const stopSql = postgres(databaseUrl as string, {
            max: 1,
            onnotice: () => {},
            connection: { search_path: `${suiteSchema},public` },
          });
          const transactionRepository = new PostgresExecutionControlRepository(
            drizzle(stopSql) as unknown as Db,
          );
          const stopTransaction = (async () => {
            await stopSql.unsafe("BEGIN");
            try {
              const receipt =
                await transactionRepository.requestOriginCancellation({
                  tenantKey,
                  origin,
                  cancellationId: firstCancellationId,
                  actor: { type: "service", id: "stop-first-writer" },
                  reasonCode: "user_requested",
                });
              stopReady.resolve(receipt.cancellationId);
              await releaseStop.promise;
              await stopSql.unsafe("COMMIT");
            } catch (error) {
              stopReady.reject(error);
              await stopSql.unsafe("ROLLBACK").catch(() => undefined);
              throw error;
            } finally {
              await stopSql.end({ timeout: 5 });
            }
          })();
          assert.equal(await stopReady.promise, firstCancellationId);
          const child = repository.createRunWithTrustedOrigin({
            command: command(tenantKey, "stop-first"),
            origin,
          });
          assert.equal(
            await remainsPending(child),
            true,
            "child admission must wait for Stop's origin row lock",
          );
          releaseStop.resolve(undefined);
          await stopTransaction;
          await assert.rejects(
            child,
            (error: unknown) =>
              error instanceof Error &&
              error.name === ExecutionOriginCancelledError.name &&
              (error as { code?: unknown }).code ===
                "execution_origin_cancelled",
          );

          const replay = await repository.requestOriginCancellation({
            tenantKey,
            origin,
            cancellationId: `cancel_${"b".repeat(32)}`,
            actor: { type: "user", id: "second-stop-writer" },
            reasonCode: "operator_intervention",
          });
          assert.equal(replay.replayed, true);
          assert.equal(replay.cancellationId, firstCancellationId);
          assert.deepEqual(replay.actor, {
            type: "service",
            id: "stop-first-writer",
          });
          assert.equal(replay.reasonCode, "user_requested");
          assert.equal(
            (
              await repository.listRunsByExecutionOriginPage({
                tenantKey,
                parentAgentRunId: origin.parentAgentRunId,
                limit: 100,
              })
            ).runs.length,
            0,
          );
        },
      );

      await t.test(
        "same parent id is isolated by tenant and descendants retain the root",
        async () => {
          const parentAgentRunId = "run-parent-tenant-isolation";
          const origin = durableExecutionMcChatOrigin(parentAgentRunId);
          await repository.requestOriginCancellation({
            tenantKey: "tenant-isolated-a",
            origin,
            cancellationId: `cancel_${"c".repeat(32)}`,
            actor: { type: "system", id: "tenant-isolation" },
            reasonCode: "user_requested",
          });
          await assert.rejects(
            repository.createRunWithTrustedOrigin({
              command: command("tenant-isolated-a", "tenant-a-child"),
              origin,
            }),
            (error: unknown) =>
              error instanceof Error &&
              (error as { code?: unknown }).code ===
                "execution_origin_cancelled",
          );
          const child = await repository.createRunWithTrustedOrigin({
            command: command("tenant-isolated-b", "tenant-b-child"),
            origin,
          });
          const descendant = await repository.createRunWithTrustedOrigin({
            command: command("tenant-isolated-b", "tenant-b-grandchild"),
            origin,
          });
          const page = await repository.listRunsByExecutionOriginPage({
            tenantKey: "tenant-isolated-b",
            parentAgentRunId,
            limit: 100,
          });
          assert.deepEqual(
            new Set(page.runs.map(({ id }) => id)),
            new Set([child.run.id, descendant.run.id]),
          );
          assert.equal(
            (
              await repository.listRunsByExecutionOriginPage({
                tenantKey: "tenant-isolated-a",
                parentAgentRunId,
                limit: 100,
              })
            ).runs.length,
            0,
          );
        },
      );

      await t.test(
        "metadata-only origin never acquires trusted authority",
        async () => {
          const tenantKey = "tenant-metadata-spoof";
          const origin = durableExecutionMcChatOrigin("run-parent-spoofed");
          const untrusted = await repository.createRun({
            ...command(tenantKey, "metadata-spoof"),
            metadata: { executionOrigin: origin },
          });
          assert.equal(
            await repository.getRunTrustedExecutionOrigin({
              tenantKey,
              runId: untrusted.run.id,
            }),
            null,
          );
          assert.equal(
            (
              await repository.listRunsByExecutionOriginPage({
                tenantKey,
                parentAgentRunId: origin.parentAgentRunId,
                limit: 100,
              })
            ).runs.length,
            0,
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
