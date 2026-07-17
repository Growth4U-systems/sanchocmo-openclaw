import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "../../db/drizzle";
import { EXECUTION_COMMAND_CONFLICT_CODE } from "../execution-control/types";
import {
  executionCommandFingerprint,
  hashExecutionLeaseToken,
  PostgresExecutionControlRepository,
} from "../execution-control/postgres";

// CI already provisions a disposable Postgres URL for agent-run contracts.
// These tests use separate tables and UUID-scoped operations, so the same
// isolated database can safely exercise the real execution repository too.
const databaseUrl =
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
  "Postgres execution leases are exclusive, scoped and token-fenced",
  { skip: !databaseUrl, timeout: 30_000 },
  async (t) => {
    const suiteSchema = `execution_leases_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 10,
      onnotice: () => {},
      connection: {
        TimeZone: "Europe/Madrid",
        search_path: `${suiteSchema},public`,
      },
    });
    const database = drizzle(sql) as unknown as Db;
    const repository = new PostgresExecutionControlRepository(database);
    const secondSql = postgres(databaseUrl as string, {
      max: 10,
      onnotice: () => {},
      connection: {
        TimeZone: "Europe/Madrid",
        search_path: `${suiteSchema},public`,
      },
    });
    const secondRepository = new PostgresExecutionControlRepository(
      drizzle(secondSql) as unknown as Db,
    );
    const operation = `contract.execution-leases.${crypto.randomUUID()}`;

    async function createRun(
      options: {
        tenantKey?: string;
        mode?: "shadow" | "canary" | "active";
        aggregateId?: string;
        idempotencyKey?: string;
        now?: Date;
      } = {},
    ) {
      const aggregateId = options.aggregateId ?? crypto.randomUUID();
      return repository.createRun({
        tenantKey: options.tenantKey ?? "tenant-a",
        idempotencyKey:
          options.idempotencyKey ?? `command:${crypto.randomUUID()}`,
        aggregateType: "contract.run",
        aggregateId,
        operation,
        mode: options.mode ?? "canary",
        now: options.now,
      });
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
      });

      await t.test(
        "one idempotency key binds one immutable command",
        async () => {
          const aggregateId = crypto.randomUUID();
          const idempotencyKey = `command:${crypto.randomUUID()}`;
          const commandOperation = `${operation}.fingerprint`;
          const command = {
            tenantKey: "tenant-a",
            idempotencyKey,
            aggregateType: "contract.run",
            aggregateId,
            operation: ` ${commandOperation.toUpperCase()} `,
            mode: "canary" as const,
            input: {
              filters: { country: "ES", categories: ["health", "beauty"] },
              target: 20,
            },
            metadata: {
              executionHandlerVersion: 1,
              adapter: { name: "contract", version: 2 },
            },
            traceId: "trace-first",
            now: new Date("2026-07-16T09:00:00.000Z"),
          };
          const first = await repository.createRun(command);
          const replay = await repository.createRun({
            ...command,
            operation: commandOperation,
            input: {
              target: 20,
              filters: { categories: ["health", "beauty"], country: "ES" },
            },
            metadata: {
              adapter: { version: 2, name: "contract" },
              executionHandlerVersion: 1,
            },
            traceId: "trace-replay",
            now: new Date("2026-07-16T10:00:00.000Z"),
          });
          assert.equal(first.created, true);
          assert.equal(replay.created, false);
          assert.equal(replay.run.id, first.run.id);
          assert.equal(first.run.operation, commandOperation);
          assert.equal(
            replay.run.commandFingerprint,
            executionCommandFingerprint(command),
          );
          assert.match(replay.run.commandFingerprint ?? "", /^[a-f0-9]{64}$/);

          async function assertConflict(
            promise: Promise<unknown>,
          ): Promise<void> {
            await assert.rejects(
              promise,
              (error: unknown) =>
                error instanceof Error &&
                (error as { code?: unknown }).code ===
                  EXECUTION_COMMAND_CONFLICT_CODE,
            );
          }

          await assertConflict(
            repository.createRun({
              ...command,
              operation: commandOperation,
              input: { ...command.input, target: 21 },
            }),
          );
          await assertConflict(
            repository.createRun({
              ...command,
              operation: commandOperation,
              mode: "active",
            }),
          );
          await assertConflict(
            repository.createRun({
              ...command,
              operation: commandOperation,
              metadata: {
                ...command.metadata,
                executionHandlerVersion: 2,
              },
            }),
          );
        },
      );

      await t.test(
        "the same command identity is independent across tenants",
        async () => {
          const aggregateId = `shared-${crypto.randomUUID()}`;
          const idempotencyKey = `shared:${crypto.randomUUID()}`;
          const tenantIsolationOperation = `${operation}.tenant-isolation`;
          const shared = {
            idempotencyKey,
            aggregateType: "contract.run",
            aggregateId,
            operation: tenantIsolationOperation,
            mode: "canary" as const,
            input: { target: "same-logical-resource" },
            metadata: { executionHandlerVersion: 1 },
          };
          const [tenantA, tenantB] = await Promise.all([
            repository.createRun({ ...shared, tenantKey: "tenant-a" }),
            secondRepository.createRun({ ...shared, tenantKey: "tenant-b" }),
          ]);
          assert.equal(tenantA.created, true);
          assert.equal(tenantB.created, true);
          assert.notEqual(tenantA.run.id, tenantB.run.id);
          assert.equal(tenantA.run.tenantKey, "tenant-a");
          assert.equal(tenantB.run.tenantKey, "tenant-b");
        },
      );

      await t.test(
        "legacy fingerprints backfill only on an exact command",
        async () => {
          const matchingRunId = `xrun_legacy_${crypto.randomUUID()}`;
          const matchingAggregateId = crypto.randomUUID();
          const matchingKey = `command:${crypto.randomUUID()}`;
          const legacyOperation = `${operation}.legacy-fingerprint`;
          const matchingInput = { target: 20, filters: { country: "ES" } };
          const matchingMetadata = { executionHandlerVersion: 1 };
          await sql`
          INSERT INTO "execution_runs" (
            "id", "tenant_key", "idempotency_key", "aggregate_type",
            "aggregate_id", "operation", "mode", "input", "metadata",
            "command_fingerprint"
          ) VALUES (
            ${matchingRunId}, 'tenant-a', ${matchingKey}, 'contract.run',
            ${matchingAggregateId}, ${legacyOperation}, 'canary',
            ${JSON.stringify(matchingInput)}::jsonb,
            ${JSON.stringify(matchingMetadata)}::jsonb, NULL
          )
        `;
          const adopted = await repository.createRun({
            tenantKey: "tenant-a",
            idempotencyKey: matchingKey,
            aggregateType: "contract.run",
            aggregateId: matchingAggregateId,
            operation: legacyOperation,
            mode: "canary",
            input: matchingInput,
            metadata: matchingMetadata,
          });
          assert.equal(adopted.created, false);
          assert.equal(adopted.run.id, matchingRunId);
          assert.match(adopted.run.commandFingerprint ?? "", /^[a-f0-9]{64}$/);

          const mismatchRunId = `xrun_legacy_${crypto.randomUUID()}`;
          const mismatchAggregateId = crypto.randomUUID();
          const mismatchKey = `command:${crypto.randomUUID()}`;
          await sql`
          INSERT INTO "execution_runs" (
            "id", "tenant_key", "idempotency_key", "aggregate_type",
            "aggregate_id", "operation", "mode", "input", "metadata",
            "command_fingerprint"
          ) VALUES (
            ${mismatchRunId}, 'tenant-a', ${mismatchKey}, 'contract.run',
            ${mismatchAggregateId}, ${legacyOperation}, 'canary',
            ${JSON.stringify({ target: 20 })}::jsonb,
            ${JSON.stringify({ executionHandlerVersion: 1 })}::jsonb, NULL
          )
        `;
          await assert.rejects(
            repository.createRun({
              tenantKey: "tenant-a",
              idempotencyKey: mismatchKey,
              aggregateType: "contract.run",
              aggregateId: mismatchAggregateId,
              operation: legacyOperation,
              mode: "canary",
              input: { target: 21 },
              metadata: { executionHandlerVersion: 1 },
            }),
            (error: unknown) =>
              error instanceof Error &&
              (error as { code?: unknown }).code ===
                EXECUTION_COMMAND_CONFLICT_CODE,
          );
          const [mismatch] = await sql<
            {
              command_fingerprint: string | null;
            }[]
          >`
          SELECT "command_fingerprint"
          FROM "execution_runs"
          WHERE "id" = ${mismatchRunId}
        `;
          assert.equal(mismatch?.command_fingerprint, null);
        },
      );

      await t.test(
        "only one concurrent worker claims a queued run",
        async () => {
          const { run } = await createRun();
          const claims = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
              (index % 2 === 0 ? repository : secondRepository).claimRun({
                runId: run.id,
                tenantKey: run.tenantKey,
                operation,
                mode: "canary",
                workerId: `worker-${index}`,
                leaseMs: 5_000,
              }),
            ),
          );
          const winners = claims.filter((claim) => claim !== null);
          assert.equal(winners.length, 1);
          const winner = winners[0];
          assert.ok(winner);
          assert.equal(winner.recovered, false);
          assert.equal(winner.run.claimCount, 1);
          assert.match(winner.expiresAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
          assert.equal(winner.expiresAt, winner.run.leaseExpiresAt);
          const leaseRemainingMs = Date.parse(winner.expiresAt) - Date.now();
          assert.ok(
            leaseRemainingMs > 1_000,
            `${leaseRemainingMs}ms remaining`,
          );
          assert.ok(
            leaseRemainingMs < 7_000,
            `${leaseRemainingMs}ms remaining`,
          );

          const [stored] = await sql<
            {
              lease_token_hash: string;
              lease_owner: string;
              claim_count: number;
            }[]
          >`
          SELECT "lease_token_hash", "lease_owner", "claim_count"
          FROM "execution_runs"
          WHERE "id" = ${run.id}
        `;
          assert.notEqual(stored?.lease_token_hash, winner.token);
          assert.equal(
            stored?.lease_token_hash,
            hashExecutionLeaseToken(winner.token),
          );
          assert.equal(stored?.claim_count, 1);

          const claimedEvent = (await repository.listEvents(run.id)).find(
            (event) => event.type === "run.claimed",
          );
          assert.ok(claimedEvent);
          const claimedEventData = claimedEvent.data as {
            leaseExpiresAt?: unknown;
          };
          assert.equal(typeof claimedEventData.leaseExpiresAt, "string");
          assert.match(
            claimedEventData.leaseExpiresAt as string,
            /^\d{4}-\d{2}-\d{2}T.*\.\d{6}Z$/,
          );
          assert.equal(
            Date.parse(claimedEventData.leaseExpiresAt as string),
            Date.parse(winner.expiresAt),
          );

          assert.equal(
            await repository.renewRunLease({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              token: "wrong-token",
              leaseMs: 5_000,
            }),
            null,
          );
          assert.equal(
            await repository.checkpointRun({
              runId: run.id,
              tenantKey: "tenant-b",
              operation,
              mode: "canary",
              token: winner.token,
              currentStep: "wrong-scope",
              eventType: "run.checkpointed",
            }),
            null,
          );
          await assert.rejects(
            repository.checkpointRun({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              token: winner.token,
              currentStep: "unsafe-checkpoint",
              eventType: "run.checkpointed",
              eventData: { leaked: winner.token },
            }),
            /must not contain the bearer lease token/,
          );

          const checkpointed = await repository.checkpointRun({
            runId: run.id,
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            token: winner.token,
            currentStep: "provider.complete",
            output: { accepted: 1 },
            eventType: "run.checkpointed",
            eventData: { accepted: 1 },
          });
          assert.equal(checkpointed?.currentStep, "provider.complete");
          assert.deepEqual(checkpointed?.output, { accepted: 1 });

          const renewed = await repository.renewRunLease({
            runId: run.id,
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            token: winner.token,
            leaseMs: 10_000,
          });
          assert.equal(renewed?.run.id, run.id);
          assert.equal(renewed?.token, winner.token);
          assert.equal(renewed?.recovered, false);
          assert.ok(
            new Date(renewed?.expiresAt ?? 0).getTime() >
              new Date(winner.expiresAt).getTime(),
          );

          const finished = await repository.finishRun({
            runId: run.id,
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            token: winner.token,
            status: "completed",
            output: { accepted: 1 },
            eventType: "run.completed",
          });
          assert.equal(finished?.status, "completed");
          assert.equal(finished?.leaseOwner, undefined);
          assert.equal(finished?.leaseExpiresAt, undefined);
          assert.equal(
            await repository.claimRun({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              workerId: "late-worker",
              leaseMs: 5_000,
            }),
            null,
          );
          assert.equal(
            await repository.finishRun({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              token: winner.token,
              status: "failed",
              eventType: "run.failed",
            }),
            null,
          );

          const events = await repository.listEvents(run.id);
          assert.deepEqual(
            events.map((event) => event.type),
            ["run.created", "run.claimed", "run.checkpointed", "run.completed"],
          );
        },
      );

      await t.test(
        "future availableAt delays a retry and fences the old token",
        async () => {
          const { run } = await createRun();
          const first = await repository.claimRun({
            runId: run.id,
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            workerId: "worker-first",
            leaseMs: 5_000,
          });
          assert.ok(first);
          const availableAt = new Date(Date.now() + 500);
          const queued = await repository.requeueRun({
            runId: run.id,
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            token: first.token,
            availableAt,
            currentStep: "provider.retry",
            error: "temporary",
          });
          assert.equal(queued?.status, "queued");
          assert.equal(queued?.leaseOwner, undefined);
          const retryEvent = (await repository.listEvents(run.id)).find(
            (event) => event.type === "run.retry_scheduled",
          );
          assert.ok(retryEvent);
          const retryEventData = retryEvent.data as { availableAt?: unknown };
          assert.equal(typeof retryEventData.availableAt, "string");
          assert.match(
            retryEventData.availableAt as string,
            /^\d{4}-\d{2}-\d{2}T.*\.\d{6}Z$/,
          );
          assert.equal(
            Date.parse(retryEventData.availableAt as string),
            availableAt.getTime(),
          );
          assert.equal(
            await repository.checkpointRun({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              token: first.token,
              currentStep: "stale-worker",
              eventType: "run.checkpointed",
            }),
            null,
          );
          assert.equal(
            await repository.claimNextRun({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              workerId: "too-early",
              leaseMs: 5_000,
            }),
            null,
          );
          await delay(600);
          const retry = await repository.claimNextRun({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            workerId: "retry-worker",
            leaseMs: 5_000,
          });
          assert.ok(retry);
          assert.equal(retry.run.id, run.id);
          assert.equal(retry.recovered, false);
          assert.equal(retry.run.claimCount, 2);
        },
      );

      await t.test(
        "an expired lease is recovered and its old token stays fenced",
        async () => {
          const { run } = await createRun();
          const first = await repository.claimRun({
            runId: run.id,
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            workerId: "crashed-worker",
            leaseMs: 200,
          });
          assert.ok(first);
          await delay(300);
          const recoveries = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
              (index % 2 === 0 ? repository : secondRepository).claimRun({
                runId: run.id,
                tenantKey: run.tenantKey,
                operation,
                mode: "canary",
                workerId: `recovery-worker-${index}`,
                leaseMs: 5_000,
              }),
            ),
          );
          const recoveredWinners = recoveries.filter(
            (receipt) => receipt !== null,
          );
          assert.equal(recoveredWinners.length, 1);
          const recovered = recoveredWinners[0];
          assert.ok(recovered);
          assert.equal(recovered.recovered, true);
          assert.equal(recovered.run.claimCount, 2);
          assert.notEqual(recovered.token, first.token);
          assert.equal(
            await repository.renewRunLease({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              token: first.token,
              leaseMs: 5_000,
            }),
            null,
          );
          assert.equal(
            await repository.checkpointRun({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              token: first.token,
              currentStep: "old-worker",
              eventType: "run.checkpointed",
            }),
            null,
          );
          assert.equal(
            await repository.requeueRun({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              token: first.token,
              availableAt: new Date(Date.now() + 1_000),
              error: "old worker",
            }),
            null,
          );
          assert.equal(
            await repository.finishRun({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              token: first.token,
              status: "failed",
              eventType: "run.failed",
            }),
            null,
          );
          const events = await repository.listEvents(run.id);
          assert.equal(events.at(-1)?.type, "run.lease_recovered");
        },
      );

      await t.test(
        "approval resume hands running work back to an exact-scope lease",
        async () => {
          const { run } = await createRun();
          const waiting = await repository.transitionRun(
            run.id,
            {
              status: "waiting_approval",
              expectedStatus: "queued",
            },
            "run.waiting_approval",
          );
          assert.equal(waiting.status, "waiting_approval");

          const resumed = await repository.transitionRun(
            run.id,
            {
              status: "running",
              expectedStatus: "waiting_approval",
              // Lease eligibility must use the database clock, not this value.
              now: new Date("2099-01-01T00:00:00.000Z"),
            },
            "run.approved",
          );
          assert.equal(resumed.status, "running");
          assert.equal(resumed.leaseOwner, undefined);
          assert.ok(resumed.leaseExpiresAt);

          const claim = await secondRepository.claimRun({
            runId: run.id,
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            workerId: "approval-resume-worker",
            leaseMs: 5_000,
          });
          assert.ok(claim);
          assert.equal(claim.run.id, run.id);
          assert.equal(claim.recovered, true);
          assert.equal(claim.run.claimCount, 1);
          assert.equal(claim.run.leaseOwner, "approval-resume-worker");

          const events = await repository.listEvents(run.id);
          assert.deepEqual(
            events.map((event) => event.type),
            [
              "run.created",
              "run.waiting_approval",
              "run.approved",
              "run.lease_recovered",
            ],
          );
        },
      );

      await t.test(
        "shadow and wrong-scope runs are never claimable",
        async () => {
          const { run } = await createRun({ mode: "shadow" });
          assert.equal(
            await repository.claimRun({
              runId: run.id,
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              workerId: "worker",
              leaseMs: 5_000,
            }),
            null,
          );

          const canary = await createRun();
          assert.equal(
            await repository.claimRun({
              runId: canary.run.id,
              tenantKey: canary.run.tenantKey,
              operation: "different.operation",
              mode: "canary",
              workerId: "worker",
              leaseMs: 5_000,
            }),
            null,
          );

          const cancelled = await createRun();
          await repository.transitionRun(
            cancelled.run.id,
            { status: "cancelled", expectedStatus: "queued" },
            "run.cancelled",
          );
          assert.equal(
            await repository.claimRun({
              runId: cancelled.run.id,
              tenantKey: cancelled.run.tenantKey,
              operation,
              mode: "canary",
              workerId: "worker",
              leaseMs: 5_000,
            }),
            null,
          );

          await assert.rejects(
            sql`
            INSERT INTO "execution_runs" (
              "id", "tenant_key", "idempotency_key", "aggregate_type",
              "aggregate_id", "operation", "mode", "status"
            ) VALUES (
              ${`xrun_null_${crypto.randomUUID()}`}, NULL,
              ${crypto.randomUUID()}, 'contract.run', ${crypto.randomUUID()},
              ${operation}, 'canary', 'queued'
            )
          `,
            /tenant_key|null value/i,
          );
        },
      );

      await t.test(
        "aggregate reconciliation reads one exact execution mode",
        async () => {
          const aggregateId = crypto.randomUUID();
          const shadow = await createRun({
            aggregateId,
            mode: "shadow",
            now: new Date("2026-07-16T10:01:00.000Z"),
          });
          const canary = await createRun({
            aggregateId,
            mode: "canary",
            now: new Date("2026-07-16T10:00:00.000Z"),
          });
          const active = await createRun({
            aggregateId,
            mode: "active",
            now: new Date("2026-07-16T10:02:00.000Z"),
          });

          const scoped = await repository.getRunByAggregateForScope({
            tenantKey: "TENANT-A",
            operation,
            mode: "canary",
            aggregateType: "contract.run",
            aggregateId,
          });
          assert.equal(scoped?.id, canary.run.id);
          assert.notEqual(scoped?.id, shadow.run.id);
          assert.notEqual(scoped?.id, active.run.id);

          assert.equal(
            (
              await repository.getRunByIdForScope({
                runId: canary.run.id,
                tenantKey: "TENANT-A",
                operation,
                mode: "canary",
              })
            )?.id,
            canary.run.id,
          );
          assert.equal(
            await repository.getRunByIdForScope({
              runId: canary.run.id,
              tenantKey: "tenant-b",
              operation,
              mode: "canary",
            }),
            null,
          );
          assert.equal(
            await repository.getRunByIdForScope({
              runId: canary.run.id,
              tenantKey: "tenant-a",
              operation: "different.operation",
              mode: "canary",
            }),
            null,
          );
          assert.equal(
            await repository.getRunByIdForScope({
              runId: canary.run.id,
              tenantKey: "tenant-a",
              operation,
              mode: "active",
            }),
            null,
          );

          const administrative = await repository.getRunByAggregate({
            tenantKey: "tenant-a",
            operation,
            aggregateType: "contract.run",
            aggregateId,
          });
          assert.equal(administrative?.id, active.run.id);
        },
      );

      await t.test(
        "UTC run cursors remain stable across the Europe/Madrid DST boundary",
        async () => {
          const cursorOperation = `${operation}.utc-cursor`;
          const instants = [
            "2026-03-29T00:30:00.000Z",
            "2026-03-29T01:30:00.000Z",
            "2026-03-29T02:30:00.000Z",
          ];
          const created = [];
          for (const [index, instant] of instants.entries()) {
            created.push(
              (
                await repository.createRun({
                  tenantKey: "tenant-cursor",
                  idempotencyKey: `cursor:${crypto.randomUUID()}`,
                  aggregateType: "contract.cursor",
                  aggregateId: `cursor-${index}-${crypto.randomUUID()}`,
                  operation: cursorOperation,
                  mode: "canary",
                  now: new Date(instant),
                })
              ).run,
            );
          }

          assert.deepEqual(
            created.map((run) => run.createdAt),
            instants,
          );
          const firstPage = await repository.listRuns({
            tenantKey: "tenant-cursor",
            operation: cursorOperation,
            limit: 2,
          });
          assert.deepEqual(
            firstPage.runs.map((run) => run.createdAt),
            instants.slice(1).reverse(),
          );
          assert.ok(firstPage.nextBefore);
          const secondPage = await repository.listRuns({
            tenantKey: "tenant-cursor",
            operation: cursorOperation,
            limit: 2,
            before: firstPage.nextBefore,
          });
          assert.deepEqual(
            secondPage.runs.map((run) => run.createdAt),
            [instants[0]],
          );
          assert.equal(secondPage.nextBefore, undefined);

          const events = await repository.listEvents(created[0].id);
          assert.equal(events[0]?.ts, instants[0]);
        },
      );

      await t.test(
        "run cursors preserve PostgreSQL microseconds without skips",
        async () => {
          const cursorOperation = `${operation}.microsecond-cursor`;
          const instants = [
            "2026-07-16T10:00:00.123900Z",
            "2026-07-16T10:00:00.123500Z",
            "2026-07-16T10:00:00.123100Z",
          ];
          const created = await Promise.all(
            instants.map(
              async (_, index) =>
                (
                  await repository.createRun({
                    tenantKey: "tenant-microsecond-cursor",
                    idempotencyKey: `microsecond-cursor:${crypto.randomUUID()}`,
                    aggregateType: "contract.cursor",
                    aggregateId: `microsecond-${index}-${crypto.randomUUID()}`,
                    operation: cursorOperation,
                    mode: "canary",
                  })
                ).run,
            ),
          );
          for (const [index, run] of created.entries()) {
            await sql`
              UPDATE "execution_runs"
              SET "created_at" = (
                ${instants[index]}::timestamptz AT TIME ZONE 'UTC'
              )
              WHERE "id" = ${run.id}
            `;
          }

          let before: { createdAt: string; id: string } | undefined;
          for (const [index, expectedRun] of created.entries()) {
            const page = await repository.listRuns({
              tenantKey: "tenant-microsecond-cursor",
              operation: cursorOperation,
              limit: 1,
              ...(before ? { before } : {}),
            });
            assert.equal(page.runs.length, 1);
            assert.equal(page.runs[0]?.id, expectedRun.id);
            if (index < created.length - 1) {
              assert.ok(page.nextBefore);
              assert.equal(page.nextBefore.createdAt, instants[index]);
              before = page.nextBefore;
            } else {
              assert.equal(page.nextBefore, undefined);
            }
          }
        },
      );

      await t.test(
        "runnable scope pages use one global exact-scope keyset",
        async () => {
          const firstOperation = `${operation}.scope-a`;
          const secondOperation = `${operation}.scope-b`;
          const runnableScopes = [
            {
              operation: firstOperation,
              mode: "active" as const,
              tenantKey: "scope-tenant-a",
            },
            {
              operation: firstOperation,
              mode: "canary" as const,
              tenantKey: "scope-tenant-b",
            },
            {
              operation: firstOperation,
              mode: "canary" as const,
              tenantKey: "scope-tenant-c",
            },
            {
              operation: secondOperation,
              mode: "active" as const,
              tenantKey: "scope-tenant-d",
            },
            {
              operation: secondOperation,
              mode: "canary" as const,
              tenantKey: "scope-tenant-e",
            },
          ];
          for (const [index, scope] of runnableScopes.entries()) {
            await repository.createRun({
              ...scope,
              idempotencyKey: `scope:${crypto.randomUUID()}`,
              aggregateType: "contract.scope",
              aggregateId: `scope-${index}-${crypto.randomUUID()}`,
            });
          }
          await repository.createRun({
            tenantKey: "scope-shadow",
            idempotencyKey: `scope:${crypto.randomUUID()}`,
            aggregateType: "contract.scope",
            aggregateId: crypto.randomUUID(),
            operation: firstOperation,
            mode: "shadow",
          });
          const terminal = await repository.createRun({
            tenantKey: "scope-terminal",
            idempotencyKey: `scope:${crypto.randomUUID()}`,
            aggregateType: "contract.scope",
            aggregateId: crypto.randomUUID(),
            operation: secondOperation,
            mode: "canary",
          });
          await repository.transitionRun(
            terminal.run.id,
            { status: "cancelled", expectedStatus: "queued" },
            "run.cancelled",
          );

          const discovered: string[] = [];
          let after:
            | {
                operation: string;
                mode: "canary" | "active";
                tenantKey: string;
              }
            | undefined;
          let pageCount = 0;
          do {
            const page = await repository.listRunnableScopesPage({
              operations: [secondOperation, firstOperation],
              modes: ["canary", "active"],
              limit: 2,
              ...(after ? { after } : {}),
            });
            pageCount += 1;
            discovered.push(
              ...page.scopes.map(
                (scope) =>
                  `${scope.operation}\u0000${scope.mode}\u0000${scope.tenantKey}`,
              ),
            );
            after = page.nextAfter;
          } while (after);

          assert.equal(pageCount, 3);
          assert.deepEqual(
            discovered,
            runnableScopes
              .map(
                (scope) =>
                  `${scope.operation}\u0000${scope.mode}\u0000${scope.tenantKey}`,
              )
              .sort(),
          );
        },
      );
    } finally {
      await secondSql.end({ timeout: 5 });
      await sql.end({ timeout: 5 });
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`);
      await adminSql.end({ timeout: 5 });
    }
  },
);
