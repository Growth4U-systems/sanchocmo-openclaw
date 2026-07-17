import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import type { Db } from "../../db/drizzle";
import { admitDurableExecutionV2 } from "../durable-execution/admission";
import type { DurableExecutionHandlerV2 } from "../durable-execution/effect-contract";
import type {
  DurableJsonBounds,
  DurableJsonContract,
} from "../durable-execution/json-contract";
import { DurableExecutionRegistry } from "../durable-execution/registry";
import { DurableExecutionEngine } from "../durable-execution/runtime";
import { PostgresExecutionControlRepository } from "../execution-control/postgres";
import { createTerminalProjectionCrashHandler } from "./fixtures/terminal-projection-crash-support.mts";

const databaseUrl =
  process.env.EXECUTION_CONTROL_PROJECTION_TEST_DATABASE_URL ??
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

const projectionCrashFixture = path.join(
  process.cwd(),
  "src/lib/__tests__/fixtures/terminal-projection-crash-child.mts",
);

interface ProjectionCrashChild {
  child: ChildProcessWithoutNullStreams;
  completed: Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>;
  waitForMarker(marker: string): Promise<void>;
}

function launchProjectionCrashChild(input: {
  mode: "crash" | "recover";
  operation: string;
  runId: string;
  tenantKey: string;
  ledgerSchema: string;
  schema: string;
  leaseMs: number;
}): ProjectionCrashChild {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", projectionCrashFixture],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PROJECTION_CRASH_MODE: input.mode,
        PROJECTION_CRASH_OPERATION: input.operation,
        PROJECTION_CRASH_RUN_ID: input.runId,
        PROJECTION_CRASH_TENANT: input.tenantKey,
        PROJECTION_LEDGER_SCHEMA: input.ledgerSchema,
        PROJECTION_CRASH_SCHEMA: input.schema,
        PROJECTION_CRASH_LEASE_MS: String(input.leaseMs),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  const waiters = new Map<string, Array<() => void>>();
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
    for (const [marker, resolvers] of waiters) {
      if (!stdout.includes(`\"marker\":\"${marker}\"`)) continue;
      waiters.delete(marker);
      for (const resolve of resolvers) resolve();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const completed = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(`projection crash child timed out\n${stdout}\n${stderr}`),
      );
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
  return {
    child,
    completed,
    waitForMarker(marker) {
      if (stdout.includes(`\"marker\":\"${marker}\"`)) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const resolvers = waiters.get(marker) ?? [];
        resolvers.push(resolve);
        waiters.set(marker, resolvers);
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `projection marker ${marker} was not observed\n${stdout}\n${stderr}`,
            ),
          );
        }, 8_000);
        void completed.finally(() => clearTimeout(timeout));
      });
    },
  };
}

async function waitForProjectionLeaseExpiry(
  sql: Sql,
  runId: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await sql<[{ expired: boolean }]>`
      SELECT "lease_expires_at" <=
        (clock_timestamp() AT TIME ZONE 'UTC') AS "expired"
      FROM "execution_terminal_projections"
      WHERE "run_id" = ${runId} AND "state" = 'running'
    `;
    if (row?.expired) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("projection lease did not expire after SIGKILL");
}

test(
  "Postgres terminal projections are atomic, scoped, fenced and recoverable",
  { skip: !databaseUrl, timeout: 40_000 },
  async (t) => {
    const suiteSchema = `execution_projections_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 12,
      onnotice: () => {},
      connection: {
        TimeZone: "Europe/Madrid",
        search_path: `${suiteSchema},public`,
      },
    });
    const secondSql = postgres(databaseUrl as string, {
      max: 12,
      onnotice: () => {},
      connection: {
        TimeZone: "Europe/Madrid",
        search_path: `${suiteSchema},public`,
      },
    });
    const repository = new PostgresExecutionControlRepository(
      drizzle(sql) as unknown as Db,
    );
    const secondRepository = new PostgresExecutionControlRepository(
      drizzle(secondSql) as unknown as Db,
    );
    const operationPrefix = `contract.terminal-projection.${crypto.randomUUID()}`;
    const tenantKey = "tenant-projection-pg";

    async function createRun(input: {
      operation: string;
      managed?: boolean;
      mode?: "canary" | "active";
    }) {
      return repository.createRun({
        tenantKey,
        idempotencyKey: `projection:${crypto.randomUUID()}`,
        aggregateType: "contract.projection",
        aggregateId: crypto.randomUUID(),
        operation: input.operation,
        mode: input.mode ?? "canary",
        input: { value: "fixture" },
        metadata: input.managed
          ? {
              authority: "execution_ledger_v2",
              executionContractVersion: 2,
              executionHandlerVersion: 1,
            }
          : { executionHandlerVersion: 1 },
      });
    }

    async function finishRun(operation: string, managed = true) {
      const created = await createRun({ operation, managed });
      const claimed = await repository.claimRun({
        tenantKey,
        operation,
        mode: "canary",
        runId: created.run.id,
        workerId: "projection-fixture",
        leaseMs: 60_000,
      });
      assert.ok(claimed);
      const finished = await repository.finishRun({
        tenantKey,
        operation,
        mode: "canary",
        runId: created.run.id,
        token: claimed.token,
        status: "completed",
        currentStep: "completed",
        output: { projected: true },
        error: null,
        eventType: `${operation}.completed`,
      });
      assert.ok(finished);
      return finished;
    }

    async function projectionEvents(runId: string) {
      return (await repository.listEvents(runId)).filter((event) =>
        event.type.startsWith("run.projection_"),
      );
    }

    try {
      await adminSql.unsafe(`CREATE SCHEMA "${suiteSchema}"`);
      await sql.begin(async (migrationSql) => {
        await migrationSql`SELECT pg_advisory_xact_lock(hashtext('sancho_execution_control_migrations'))`;
        for (const name of [
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
        ]) {
          for (const statement of migration(name)) {
            await migrationSql.unsafe(statement);
          }
        }
        // The new migration itself must be rerunnable.
        for (const name of [
          "0027_execution_terminal_projections.sql",
          "0028_execution_run_blocking.sql",
        ]) {
          for (const statement of migration(name)) {
            await migrationSql.unsafe(statement);
          }
        }
      });

      await t.test(
        "managed finish creates the obligation atomically and legacy finish does not",
        async () => {
          const operation = `${operationPrefix}.finish`;
          const finished = await finishRun(operation);
          assert.equal(finished.status, "completed");
          assert.equal(finished.terminalProjection?.runId, finished.id);
          assert.equal(finished.terminalProjection?.state, "pending");
          const persisted = await repository.getTerminalProjectionForScope({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
          });
          assert.equal(persisted?.terminalStatus, "completed");
          assert.equal(persisted?.state, "pending");

          const legacy = await finishRun(`${operation}.legacy`, false);
          assert.equal(legacy.terminalProjection, undefined);
          assert.equal(
            await repository.getTerminalProjectionForScope({
              tenantKey,
              operation: `${operation}.legacy`,
              mode: "canary",
              runId: legacy.id,
            }),
            null,
          );

          const transitioned = await createRun({
            operation: `${operation}.transition`,
            managed: true,
          });
          const terminal = await repository.transitionRun(
            transitioned.run.id,
            {
              status: "completed",
              expectedStatus: "queued",
              now: new Date("2099-01-01T00:00:00.000Z"),
            },
            `${operation}.transition.completed`,
          );
          assert.equal(terminal.status, "completed");
          assert.equal(terminal.terminalProjection?.state, "pending");
          assert.ok(
            Date.parse(terminal.finishedAt ?? "") <
              Date.parse("2090-01-01T00:00:00.000Z"),
            "terminal transition must use the database clock, not input.now",
          );
          assert.ok(
            Date.parse(terminal.updatedAt) <
              Date.parse("2090-01-01T00:00:00.000Z"),
          );
          const transitionEvent = (
            await repository.listEvents(transitioned.run.id)
          ).find(({ type }) => type === `${operation}.transition.completed`);
          assert.ok(transitionEvent);
          assert.ok(
            Date.parse(transitionEvent.ts) <
              Date.parse("2090-01-01T00:00:00.000Z"),
          );
        },
      );

      await t.test(
        "ACK is event-atomic and a stale token writes neither state nor event",
        async () => {
          const operation = `${operationPrefix}.ack`;
          const finished = await finishRun(operation);
          const claimed = await repository.claimTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            workerId: "projection-owner",
            leaseMs: 60_000,
          });
          assert.ok(claimed);
          assert.equal(
            await repository.acknowledgeTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              token: "stale-projection-token",
            }),
            null,
          );
          assert.deepEqual(await projectionEvents(finished.id), []);

          const acknowledged = await repository.acknowledgeTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            token: claimed.token,
          });
          assert.equal(acknowledged?.state, "succeeded");
          const events = await projectionEvents(finished.id);
          assert.equal(events.length, 1);
          assert.equal(events[0]?.type, "run.projection_succeeded");
          assert.deepEqual(events[0]?.data, { claimCount: 1 });
          assert.doesNotMatch(JSON.stringify(events[0]?.data), /token|secret/i);
        },
      );

      await t.test(
        "retry and block events are closed, fenced and blocked work never reclaims",
        async () => {
          const operation = `${operationPrefix}.retry-block`;
          const finished = await finishRun(operation);
          const claimed = await repository.claimTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            workerId: "projection-owner",
            leaseMs: 60_000,
          });
          assert.ok(claimed);
          assert.equal(
            await repository.requeueTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              token: "stale-projection-token",
              delayMs: 1_500,
              errorCode: "projection_fixture_retry",
            }),
            null,
          );
          assert.deepEqual(await projectionEvents(finished.id), []);

          const requeued = await repository.requeueTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            token: claimed.token,
            delayMs: 1_500,
            errorCode: "projection_fixture_retry",
          });
          assert.equal(requeued?.state, "retry_wait");
          assert.equal(
            await repository.claimTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              workerId: "too-early",
              leaseMs: 60_000,
            }),
            null,
          );
          const retryEvents = await projectionEvents(finished.id);
          assert.deepEqual(
            retryEvents.map((event) => event.data),
            [
              {
                errorCode: "projection_fixture_retry",
                delayMs: 1_500,
                claimCount: 1,
              },
            ],
          );
          assert.deepEqual(Object.keys(retryEvents[0]?.data as object).sort(), [
            "claimCount",
            "delayMs",
            "errorCode",
          ]);

          await sql`
            UPDATE "execution_terminal_projections"
            SET "available_at" =
              (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
            WHERE "run_id" = ${finished.id}
          `;
          const retryClaim = await repository.claimTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            workerId: "projection-retry-owner",
            leaseMs: 60_000,
          });
          assert.ok(retryClaim);
          assert.equal(
            await repository.blockTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              token: "stale-projection-token",
              errorCode: "projection_contract_invalid",
            }),
            null,
          );
          assert.equal((await projectionEvents(finished.id)).length, 1);

          const blocked = await repository.blockTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            token: retryClaim.token,
            errorCode: "projection_contract_invalid",
          });
          assert.equal(blocked?.state, "blocked");
          assert.equal(
            await repository.claimTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              workerId: "blocked-must-not-run",
              leaseMs: 60_000,
            }),
            null,
          );
          assert.equal(
            (
              await repository.getBlockedTerminalProjectionForScope({
                tenantKey,
                operation,
                mode: "canary",
              })
            )?.runId,
            finished.id,
          );
          assert.deepEqual(
            (
              await repository.listBlockedProjectionScopesPage({
                operations: [operation],
                modes: ["canary"],
                limit: 10,
              })
            ).scopes,
            [{ tenantKey, operation, mode: "canary" }],
          );
          assert.deepEqual(
            (
              await repository.listRunnableScopesPage({
                operations: [operation],
                modes: ["canary"],
                limit: 10,
              })
            ).scopes,
            [],
          );
          const events = await projectionEvents(finished.id);
          assert.equal(events[1]?.type, "run.projection_blocked");
          assert.deepEqual(events[1]?.data, {
            errorCode: "projection_contract_invalid",
            claimCount: 2,
          });
        },
      );

      await t.test(
        "manual projection resume is exact-scope, error-CAS, event-atomic and one-shot",
        async () => {
          const operation = `${operationPrefix}.resume-blocked`;
          const finished = await finishRun(operation);
          const claimed = await repository.claimTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            workerId: "projection-owner",
            leaseMs: 60_000,
          });
          assert.ok(claimed);
          const blocked = await repository.blockTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            token: claimed.token,
            errorCode: "projection_contract_invalid",
          });
          assert.equal(blocked?.state, "blocked");
          assert.equal(blocked?.claimCount, 1);

          for (const wrong of [
            { expectedErrorCode: "terminal_projection_command_mismatch" },
            { tenantKey: "another-tenant" },
            { operation: `${operation}.other` },
            { mode: "active" as const },
          ]) {
            assert.equal(
              await repository.resumeBlockedTerminalProjection({
                tenantKey,
                operation,
                mode: "canary",
                runId: finished.id,
                expectedErrorCode: "projection_contract_invalid",
                ...wrong,
              }),
              null,
            );
          }
          assert.deepEqual(
            (await projectionEvents(finished.id)).map(({ type }) => type),
            ["run.projection_blocked"],
          );

          const [clockBefore] = await sql<{ now: Date }[]>`
            SELECT clock_timestamp() AS "now"
          `;
          const resumed = await repository.resumeBlockedTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            expectedErrorCode: "projection_contract_invalid",
          });
          assert.ok(clockBefore);
          assert.equal(resumed?.state, "pending");
          assert.equal(resumed?.claimCount, 1);
          assert.equal(resumed?.lastErrorCode, undefined);
          const [clockBound] = await sql<
            [{ availableBounded: boolean; updatedBounded: boolean }]
          >`
            SELECT
              "available_at" BETWEEN
                (${clockBefore.now}::timestamptz AT TIME ZONE 'UTC') AND
                (clock_timestamp() AT TIME ZONE 'UTC')
                AS "availableBounded",
              "updated_at" BETWEEN
                (${clockBefore.now}::timestamptz AT TIME ZONE 'UTC') AND
                (clock_timestamp() AT TIME ZONE 'UTC')
                AS "updatedBounded"
            FROM "execution_terminal_projections"
            WHERE "run_id" = ${finished.id}
          `;
          assert.equal(clockBound?.availableBounded, true);
          assert.equal(clockBound?.updatedBounded, true);
          const resumedEvent = (await projectionEvents(finished.id)).at(-1);
          assert.equal(resumedEvent?.type, "run.projection_resumed");
          assert.deepEqual(resumedEvent?.data, {
            errorCode: "projection_contract_invalid",
            claimCount: 1,
          });
          assert.deepEqual(
            (
              await repository.listRunnableScopesPage({
                operations: [operation],
                modes: ["canary"],
                limit: 10,
              })
            ).scopes,
            [{ tenantKey, operation, mode: "canary" }],
          );

          assert.equal(
            await repository.resumeBlockedTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              expectedErrorCode: "projection_contract_invalid",
            }),
            null,
          );
          assert.equal((await projectionEvents(finished.id)).length, 2);

          const repairedClaim = await repository.claimTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            workerId: "repaired-projection-owner",
            leaseMs: 60_000,
          });
          assert.equal(repairedClaim?.projection.claimCount, 2);
          assert.ok(repairedClaim);
          assert.equal(
            (
              await repository.blockTerminalProjection({
                tenantKey,
                operation,
                mode: "canary",
                runId: finished.id,
                token: repairedClaim.token,
                errorCode: "projection_contract_invalid",
              })
            )?.state,
            "blocked",
          );
          assert.equal(
            await repository.claimTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              workerId: "must-not-hot-loop",
              leaseMs: 60_000,
            }),
            null,
          );
          assert.deepEqual(
            (
              await repository.listRunnableScopesPage({
                operations: [operation],
                modes: ["canary"],
                limit: 10,
              })
            ).scopes,
            [],
          );
        },
      );

      await t.test(
        "stale running delivery has one recovery winner and old owner stays fenced",
        async () => {
          const operation = `${operationPrefix}.stale`;
          const finished = await finishRun(operation);
          const oldOwner = await repository.claimTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            workerId: "old-owner",
            leaseMs: 60_000,
          });
          assert.ok(oldOwner);
          assert.equal(
            await secondRepository.claimTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              workerId: "contender-too-early",
              leaseMs: 60_000,
            }),
            null,
          );
          await sql`
            UPDATE "execution_terminal_projections"
            SET "lease_expires_at" =
              (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
            WHERE "run_id" = ${finished.id}
          `;
          const winners = await Promise.all([
            repository.claimTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              workerId: "recovery-a",
              leaseMs: 60_000,
            }),
            secondRepository.claimTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              workerId: "recovery-b",
              leaseMs: 60_000,
            }),
          ]);
          const winner = winners.find(Boolean);
          assert.equal(winners.filter(Boolean).length, 1);
          assert.equal(winner?.recovered, true);

          assert.equal(
            await repository.acknowledgeTerminalProjection({
              tenantKey,
              operation,
              mode: "canary",
              runId: finished.id,
              token: oldOwner.token,
            }),
            null,
          );
          assert.deepEqual(await projectionEvents(finished.id), []);
          assert.equal(
            (
              await repository.acknowledgeTerminalProjection({
                tenantKey,
                operation,
                mode: "canary",
                runId: finished.id,
                token: winner!.token,
              })
            )?.state,
            "succeeded",
          );
          assert.equal((await projectionEvents(finished.id)).length, 1);
        },
      );

      await t.test(
        "terminal-only obligation keeps its scope discoverable until delivery",
        async () => {
          const operation = `${operationPrefix}.discovery`;
          const finished = await finishRun(operation);
          const page = await repository.listRunnableScopesPage({
            operations: [operation],
            modes: ["canary"],
            limit: 10,
          });
          assert.deepEqual(page.scopes, [
            { tenantKey, operation, mode: "canary" },
          ]);
          const claimed = await repository.claimTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            workerId: "projection-owner",
            leaseMs: 60_000,
          });
          assert.ok(claimed);
          await repository.acknowledgeTerminalProjection({
            tenantKey,
            operation,
            mode: "canary",
            runId: finished.id,
            token: claimed.token,
          });
          assert.deepEqual(
            (
              await repository.listRunnableScopesPage({
                operations: [operation],
                modes: ["canary"],
                limit: 10,
              })
            ).scopes,
            [],
          );
        },
      );

      await t.test(
        "immediate and cooperative cancellation create the same obligation",
        async () => {
          const operation = `${operationPrefix}.cancellation`;
          const immediate = await createRun({ operation, managed: true });
          const immediateReceipt = await repository.requestRunCancellation({
            tenantKey,
            operation,
            mode: "canary",
            runId: immediate.run.id,
            cancellationId: crypto.randomUUID(),
            actor: { type: "user", id: "user:projection-fixture" },
            reasonCode: "user_requested",
          });
          assert.equal(immediateReceipt?.disposition, "cancelled");
          assert.equal(immediateReceipt?.terminalProjection?.state, "pending");

          const running = await createRun({ operation, managed: true });
          const lease = await repository.claimRun({
            tenantKey,
            operation,
            mode: "canary",
            runId: running.run.id,
            workerId: "cancellation-owner",
            leaseMs: 60_000,
          });
          assert.ok(lease);
          const cancellationId = crypto.randomUUID();
          assert.equal(
            (
              await repository.requestRunCancellation({
                tenantKey,
                operation,
                mode: "canary",
                runId: running.run.id,
                cancellationId,
                actor: { type: "user", id: "user:projection-fixture" },
                reasonCode: "user_requested",
              })
            )?.disposition,
            "requested",
          );
          const acknowledged = await repository.acknowledgeRunCancellation({
            tenantKey,
            operation,
            mode: "canary",
            runId: running.run.id,
            token: lease.token,
            cancellationId,
            safePoint: "before_handler",
          });
          assert.equal(acknowledged?.run.status, "cancelled");
          assert.equal(acknowledged?.terminalProjection?.state, "pending");
        },
      );

      await t.test(
        "rerun backfill restores only managed v2 terminal obligations",
        async () => {
          const operation = `${operationPrefix}.backfill`;
          const managed = await finishRun(operation);
          const legacy = await finishRun(`${operation}.legacy`, false);
          await sql`
            DELETE FROM "execution_terminal_projections"
            WHERE "run_id" = ${managed.id}
          `;
          for (const name of [
            "0027_execution_terminal_projections.sql",
            "0028_execution_run_blocking.sql",
          ]) {
            for (const statement of migration(name))
              await sql.unsafe(statement);
          }
          assert.equal(
            (
              await repository.getTerminalProjectionForScope({
                tenantKey,
                operation,
                mode: "canary",
                runId: managed.id,
              })
            )?.state,
            "pending",
          );
          assert.equal(
            await repository.getTerminalProjectionForScope({
              tenantKey,
              operation: `${operation}.legacy`,
              mode: "canary",
              runId: legacy.id,
            }),
            null,
          );
        },
      );

      await t.test(
        "a fresh engine recovers projection-only work after callback crash",
        async () => {
          const operation = `${operationPrefix}.runtime-restart`;
          const runtimeScope = {
            tenantKey,
            operation,
            mode: "canary" as const,
          };
          const bounds: DurableJsonBounds = {
            maxBytes: 2_048,
            maxDepth: 5,
            maxNodes: 32,
            maxStringBytes: 256,
            maxArrayItems: 8,
            maxObjectKeys: 8,
          };
          const contract: DurableJsonContract<{ value: string }> = {
            schemaVersion: 1,
            bounds,
            secrets: { mode: "reject" },
            parse(value) {
              if (
                !value ||
                typeof value !== "object" ||
                Array.isArray(value) ||
                typeof (value as { value?: unknown }).value !== "string"
              ) {
                throw new Error("invalid fixture value");
              }
              return { value: (value as { value: string }).value };
            },
          };
          function runtimeHandler(
            projectTerminal: DurableExecutionHandlerV2<
              { value: string },
              { value: string },
              { value: string },
              Record<string, never>
            >["projectTerminal"],
          ): DurableExecutionHandlerV2<
            { value: string },
            { value: string },
            { value: string },
            Record<string, never>
          > {
            return {
              contractVersion: 2,
              operation,
              version: 1,
              command: contract,
              checkpoint: contract,
              result: contract,
              effects: {},
              execute: async (command) => ({ output: command }),
              classifyPureError: () => ({
                code: "fixture_invalid",
                retryable: false,
                message: "fixture invalid",
              }),
              projectTerminal,
            };
          }
          const allowPolicy = {
            mayAdmit: () => true,
            mayDrain: () => "allow" as const,
          };
          const crashingRegistry = new DurableExecutionRegistry().register(
            runtimeHandler(async () => {
              throw new Error("synthetic projection process crash");
            }),
          );
          const admission = await admitDurableExecutionV2({
            repository,
            registry: crashingRegistry,
            capabilityPolicy: allowPolicy,
            scope: runtimeScope,
            handlerVersion: 1,
            aggregateType: "contract.projection",
            aggregateId: crypto.randomUUID(),
            idempotencyKey: `runtime:${crypto.randomUUID()}`,
            command: { value: "recover-me" },
          });
          const crashingEngine = new DurableExecutionEngine({
            repository,
            registry: crashingRegistry,
            capabilityPolicy: allowPolicy,
            scope: runtimeScope,
            workerId: "projection-crashing-process",
            leaseMs: 60_000,
            maxAttempts: 3,
            projectionRetryBaseMs: 1_000,
            projectionRetryMaximumMs: 1_000,
          });
          const first = await crashingEngine.processRun(admission.run.id);
          assert.equal(first.kind, "projection_pending");
          assert.equal(
            (await repository.getRunById(admission.run.id))?.status,
            "completed",
          );
          assert.equal(
            (
              await repository.getTerminalProjectionForScope({
                ...runtimeScope,
                runId: admission.run.id,
              })
            )?.state,
            "retry_wait",
          );

          await sql`
            UPDATE "execution_terminal_projections"
            SET "available_at" =
              (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
            WHERE "run_id" = ${admission.run.id}
          `;
          const projected: string[] = [];
          const recoveredRegistry = new DurableExecutionRegistry().register(
            runtimeHandler(async (run, command) => {
              projected.push(`${run.id}:${command.value}`);
            }),
          );
          const recoveredEngine = new DurableExecutionEngine({
            repository: secondRepository,
            registry: recoveredRegistry,
            capabilityPolicy: allowPolicy,
            scope: runtimeScope,
            workerId: "projection-fresh-process",
            leaseMs: 60_000,
            maxAttempts: 3,
          });
          const recovered = await recoveredEngine.processNextProjection();
          assert.equal(recovered.kind, "completed");
          assert.deepEqual(projected, [`${admission.run.id}:recover-me`]);
          assert.equal(
            (
              await repository.getTerminalProjectionForScope({
                ...runtimeScope,
                runId: admission.run.id,
              })
            )?.state,
            "succeeded",
          );
          assert.deepEqual(
            (await projectionEvents(admission.run.id)).map(({ type }) => type),
            ["run.projection_retry_scheduled", "run.projection_succeeded"],
          );
        },
      );

      await t.test(
        "SIGKILL after sink commit recovers in a fresh process without rerunning the command",
        { timeout: 15_000 },
        async () => {
          const operation = `${operationPrefix}.sigkill`;
          const runtimeScope = {
            tenantKey,
            operation,
            mode: "canary" as const,
          };
          const schema = `san480_projection_${crypto
            .randomUUID()
            .replaceAll("-", "")}`;
          const leaseMs = 1_200;
          let crashing: ProjectionCrashChild | undefined;
          let recovering: ProjectionCrashChild | undefined;
          await sql.unsafe(`CREATE SCHEMA "${schema}"`);
          await sql.unsafe(
            `CREATE TABLE "${schema}"."sink" ("run_id" text PRIMARY KEY, "committed_at" timestamp NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'))`,
          );
          try {
            let commandExecutions = 0;
            const initialRegistry = new DurableExecutionRegistry().register(
              createTerminalProjectionCrashHandler({
                operation,
                onExecute: () => {
                  commandExecutions += 1;
                },
                projectTerminal: async () => {
                  throw new Error("prime projection retry before hard kill");
                },
              }),
            );
            const allowPolicy = {
              mayAdmit: () => true,
              mayDrain: () => "allow" as const,
            };
            const admission = await admitDurableExecutionV2({
              repository,
              registry: initialRegistry,
              capabilityPolicy: allowPolicy,
              scope: runtimeScope,
              handlerVersion: 1,
              aggregateType: "contract.projection",
              aggregateId: crypto.randomUUID(),
              idempotencyKey: `sigkill:${crypto.randomUUID()}`,
              command: { value: "sink-once" },
            });
            const initialEngine = new DurableExecutionEngine({
              repository,
              registry: initialRegistry,
              capabilityPolicy: allowPolicy,
              scope: runtimeScope,
              workerId: "projection-command-process",
              leaseMs,
              maxAttempts: 3,
              projectionRetryBaseMs: 1_000,
              projectionRetryMaximumMs: 1_000,
            });
            assert.equal(
              (await initialEngine.processRun(admission.run.id)).kind,
              "projection_pending",
            );
            assert.equal(commandExecutions, 1);
            assert.equal(
              (await repository.getRunById(admission.run.id))?.handlerAttempt,
              1,
            );
            await sql`
              UPDATE "execution_terminal_projections"
              SET "available_at" =
                (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
              WHERE "run_id" = ${admission.run.id}
            `;

            crashing = launchProjectionCrashChild({
              mode: "crash",
              operation,
              runId: admission.run.id,
              tenantKey,
              ledgerSchema: suiteSchema,
              schema,
              leaseMs,
            });
            await crashing.waitForMarker("sink_committed");
            assert.equal(crashing.child.kill("SIGKILL"), true);
            const crashed = await crashing.completed;
            assert.equal(crashed.signal, "SIGKILL", crashed.stderr);
            const [afterCrash] = await sql.unsafe<
              [{ state: string; sink_count: number }]
            >(
              `SELECT p."state", (SELECT count(*)::integer FROM "${schema}"."sink" WHERE "run_id" = $1) AS "sink_count" FROM "execution_terminal_projections" AS p WHERE p."run_id" = $1`,
              [admission.run.id],
            );
            assert.deepEqual(afterCrash, { state: "running", sink_count: 1 });

            await waitForProjectionLeaseExpiry(sql, admission.run.id);
            recovering = launchProjectionCrashChild({
              mode: "recover",
              operation,
              runId: admission.run.id,
              tenantKey,
              ledgerSchema: suiteSchema,
              schema,
              leaseMs,
            });
            await recovering.waitForMarker("completed");
            const recovered = await recovering.completed;
            assert.equal(recovered.code, 0, recovered.stderr);
            assert.match(recovered.stdout, /"kind":"completed"/);

            const [finalState] = await sql.unsafe<
              [{ state: string; sink_count: number }]
            >(
              `SELECT p."state", (SELECT count(*)::integer FROM "${schema}"."sink" WHERE "run_id" = $1) AS "sink_count" FROM "execution_terminal_projections" AS p WHERE p."run_id" = $1`,
              [admission.run.id],
            );
            assert.deepEqual(finalState, {
              state: "succeeded",
              sink_count: 1,
            });
            assert.equal(
              (await repository.getRunById(admission.run.id))?.handlerAttempt,
              1,
              "projection recovery must not reclaim or execute the command",
            );
            assert.equal(
              (await projectionEvents(admission.run.id)).filter(
                ({ type }) => type === "run.projection_succeeded",
              ).length,
              1,
            );
          } finally {
            if (
              crashing &&
              crashing.child.exitCode === null &&
              crashing.child.signalCode === null
            ) {
              crashing.child.kill("SIGKILL");
            }
            if (
              recovering &&
              recovering.child.exitCode === null &&
              recovering.child.signalCode === null
            ) {
              recovering.child.kill("SIGKILL");
            }
            await Promise.allSettled([
              crashing?.completed,
              recovering?.completed,
            ]);
            await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          }
        },
      );
    } finally {
      await sql`
        DELETE FROM "execution_terminal_projections"
        WHERE "operation" LIKE ${`${operationPrefix}%`}
      `.catch(() => undefined);
      await sql`
        DELETE FROM "execution_runs"
        WHERE "operation" LIKE ${`${operationPrefix}%`}
      `.catch(() => undefined);
      await Promise.all([sql.end(), secondSql.end()]);
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`);
      await adminSql.end({ timeout: 5 });
    }
  },
);
