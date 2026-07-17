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
import {
  EXECUTION_CANCELLATION_CONFLICT_CODE,
  type ExecutionRunStatus,
} from "../execution-control/types";

const databaseUrl =
  process.env.EXECUTION_CONTROL_CANCELLATION_TEST_DATABASE_URL ??
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

function isCancellationConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === EXECUTION_CANCELLATION_CONFLICT_CODE
  );
}

test(
  "Postgres execution cancellation is scoped, idempotent and lease fenced",
  { skip: !databaseUrl, timeout: 40_000 },
  async (t) => {
    const suiteSchema = `execution_cancellation_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 12,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const secondSql = postgres(databaseUrl as string, {
      max: 12,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const repository = new PostgresExecutionControlRepository(
      drizzle(sql) as unknown as Db,
    );
    const secondRepository = new PostgresExecutionControlRepository(
      drizzle(secondSql) as unknown as Db,
    );
    const operation = `contract.execution-cancellation.${crypto.randomUUID()}`;
    const actor = { type: "user" as const, id: "user:martin-fila" };

    async function createRun(
      options: {
        status?: "queued" | "waiting_approval";
        mode?: "shadow" | "canary" | "active";
      } = {},
    ) {
      const receipt = await repository.createRun({
        tenantKey: "tenant-a",
        idempotencyKey: `command:${crypto.randomUUID()}`,
        aggregateType: "contract.run",
        aggregateId: crypto.randomUUID(),
        operation,
        mode: options.mode ?? "canary",
        input: { fixture: "cancellation" },
        metadata: { executionHandlerVersion: 1 },
      });
      if (options.status === "waiting_approval") {
        return repository.transitionRun(
          receipt.run.id,
          { status: "waiting_approval", expectedStatus: "queued" },
          "run.waiting_approval",
        );
      }
      return receipt.run;
    }

    try {
      await adminSql.unsafe(`CREATE SCHEMA "${suiteSchema}"`);
      // Serialize the curated DDL inside this suite. The transaction-scoped
      // lock guarantees the DDL and lock use the same pooled connection.
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
        "eight queued requests create one terminal transition and one event",
        async () => {
          const run = await createRun();
          const cancellationId = crypto.randomUUID();
          const input = {
            tenantKey: run.tenantKey,
            operation,
            mode: "canary" as const,
            runId: run.id,
            cancellationId,
            actor,
            reasonCode: "user_requested" as const,
          };

          const before = await repository.listEvents(run.id);
          assert.equal(
            await repository.requestRunCancellation({
              ...input,
              tenantKey: "tenant-b",
            }),
            null,
          );
          assert.equal(
            await repository.requestRunCancellation({
              ...input,
              operation: `${operation}.wrong`,
            }),
            null,
          );
          assert.equal(
            await repository.requestRunCancellation({
              ...input,
              mode: "active",
            }),
            null,
          );
          assert.equal(
            (await repository.listEvents(run.id)).length,
            before.length,
          );

          const receipts = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
              (index % 2 === 0
                ? repository
                : secondRepository
              ).requestRunCancellation(input),
            ),
          );
          assert.ok(
            receipts.every((receipt) => receipt?.disposition === "cancelled"),
          );
          assert.equal(
            receipts.filter((receipt) => !receipt?.replayed).length,
            1,
          );
          assert.equal(
            receipts.filter((receipt) => receipt?.replayed).length,
            7,
          );
          const finalRun = await repository.getRunById(run.id);
          assert.equal(finalRun?.status, "cancelled");
          assert.equal(finalRun?.cancelRequestId, cancellationId);
          assert.deepEqual(finalRun?.cancelRequestedBy, actor);
          assert.equal(finalRun?.cancelReasonCode, "user_requested");
          assert.ok(finalRun?.cancelRequestedAt);
          assert.ok(finalRun?.cancelAcknowledgedAt);
          assert.equal(finalRun?.leaseOwner, undefined);

          const events = await repository.listEvents(run.id);
          assert.equal(
            events.filter((event) => event.type === "run.cancelled").length,
            1,
          );
          const cancellationEvent = events.find(
            (event) => event.type === "run.cancelled",
          );
          assert.deepEqual(cancellationEvent?.data, {
            cancellationId,
            actor,
            reasonCode: "user_requested",
            cooperative: true,
          });
          assert.doesNotMatch(
            JSON.stringify(cancellationEvent?.data),
            /token|secret/i,
          );

          const replay = await repository.requestRunCancellation(input);
          assert.equal(replay?.disposition, "cancelled");
          assert.equal(replay?.replayed, true);
          await assert.rejects(
            repository.requestRunCancellation({
              ...input,
              cancellationId: crypto.randomUUID(),
            }),
            isCancellationConflict,
          );
        },
      );

      await t.test(
        "waiting approval cancels directly and terminal states stay immutable",
        async () => {
          const waiting = await createRun({ status: "waiting_approval" });
          const cancelled = await repository.requestRunCancellation({
            tenantKey: waiting.tenantKey,
            operation,
            mode: "canary",
            runId: waiting.id,
            cancellationId: crypto.randomUUID(),
            actor,
            reasonCode: "superseded",
          });
          assert.equal(cancelled?.run.status, "cancelled");

          for (const status of ["completed", "partial", "failed"] as const) {
            const run = await createRun();
            const claim = await repository.claimRun({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              workerId: `terminal-${status}`,
              leaseMs: 5_000,
            });
            assert.ok(claim);
            const finished = await repository.finishRun({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              token: claim.token,
              status,
              eventType: `run.${status}`,
            });
            assert.equal(finished?.status, status);
            await assert.rejects(
              repository.requestRunCancellation({
                tenantKey: run.tenantKey,
                operation,
                mode: "canary",
                runId: run.id,
                cancellationId: crypto.randomUUID(),
                actor,
                reasonCode: "operator_intervention",
              }),
              isCancellationConflict,
            );
            assert.equal((await repository.getRunById(run.id))?.status, status);
          }
        },
      );

      await t.test(
        "running request preserves its lease and only its owner acknowledges",
        async () => {
          const run = await createRun();
          const claim = await repository.claimRun({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            workerId: "active-owner",
            leaseMs: 8_000,
          });
          assert.ok(claim);
          await repository.checkpointRun({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            token: claim.token,
            currentStep: "provider.accepted",
            output: { acceptedId: "downstream-1" },
            eventType: "run.checkpointed",
          });
          const inFlightStep = "provider.in_flight";
          const payloadFingerprint = "c".repeat(64);
          const policyFingerprint = "d".repeat(64);
          const prepared = await repository.prepareEffect({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            token: claim.token,
            stepKey: inFlightStep,
            effectKey: `effect:${crypto.randomUUID()}`,
            handlerVersion: 2,
            definitionVersion: 1,
            capability: "contract.provider.in_flight",
            safety: "target_idempotency",
            payloadSchemaVersion: 1,
            payloadFingerprint,
            policyFingerprint,
            receiptSchemaVersion: 1,
            deadlineMs: 1_000,
            maxAttempts: 1,
          });
          assert.equal(prepared?.kind, "invoke");
          const cancellationId = crypto.randomUUID();
          const request = {
            tenantKey: run.tenantKey,
            operation,
            mode: "canary" as const,
            runId: run.id,
            cancellationId,
            actor,
            reasonCode: "operator_intervention" as const,
          };
          const requests = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
              (index % 2 === 0
                ? repository
                : secondRepository
              ).requestRunCancellation(request),
            ),
          );
          assert.ok(
            requests.every((receipt) => receipt?.disposition === "requested"),
          );
          assert.equal(
            requests.filter((receipt) => !receipt?.replayed).length,
            1,
          );
          const requested = await repository.getRunById(run.id);
          assert.equal(requested?.status, "running");
          assert.equal(requested?.leaseOwner, "active-owner");
          assert.equal(requested?.leaseExpiresAt, claim.expiresAt);
          assert.equal(requested?.cancelAcknowledgedAt, undefined);

          // The provider response may arrive after the cancellation marker.
          // Its bounded receipt must still become durable before the run can
          // acknowledge cancellation at a safe point.
          const completedInFlight = await repository.completeEffect({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            token: claim.token,
            stepKey: inFlightStep,
            payloadFingerprint,
            policyFingerprint,
            receipt: { acceptedId: "downstream-1" },
            receiptFingerprint: "e".repeat(64),
          });
          assert.equal(completedInFlight?.status, "succeeded");
          assert.deepEqual(completedInFlight?.receipt, {
            acceptedId: "downstream-1",
          });

          // The cancellation marker blocks legacy/admin terminal and retry
          // primitives, but checkpointing an already accepted receipt remains
          // available to the current owner before acknowledgement.
          await assert.rejects(
            repository.transitionRun(
              run.id,
              { status: "completed", expectedStatus: "running" },
              "run.admin_bypass",
            ),
            /invalid or stale transition/,
          );
          assert.equal(
            await repository.requeueRun({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              token: claim.token,
              availableAt: new Date(),
              error: "retry",
            }),
            null,
          );
          assert.equal(
            await repository.finishRun({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              token: claim.token,
              status: "completed",
              eventType: "run.completed",
            }),
            null,
          );
          assert.equal(
            await repository.prepareEffect({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              token: claim.token,
              stepKey: "provider.next",
              effectKey: `effect:${crypto.randomUUID()}`,
              handlerVersion: 2,
              definitionVersion: 1,
              capability: "contract.provider.next",
              safety: "target_idempotency",
              payloadSchemaVersion: 1,
              payloadFingerprint: "a".repeat(64),
              policyFingerprint: "b".repeat(64),
              receiptSchemaVersion: 1,
              deadlineMs: 1_000,
              maxAttempts: 1,
            }),
            null,
          );
          const checkpointed = await repository.checkpointRun({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            token: claim.token,
            currentStep: "provider.receipt_persisted",
            output: { acceptedId: "downstream-1", receiptPersisted: true },
            eventType: "run.checkpointed",
          });
          assert.equal(checkpointed?.status, "running");

          for (const wrong of [
            { token: "wrong-token" },
            { tenantKey: "tenant-b" },
            { operation: `${operation}.wrong` },
            { mode: "active" as const },
            { cancellationId: crypto.randomUUID() },
          ]) {
            assert.equal(
              await repository.acknowledgeRunCancellation({
                tenantKey: run.tenantKey,
                operation,
                mode: "canary",
                runId: run.id,
                token: claim.token,
                cancellationId,
                safePoint: "provider.receipt_persisted",
                ...wrong,
              }),
              null,
            );
          }

          const acknowledged = await repository.acknowledgeRunCancellation({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            token: claim.token,
            cancellationId,
            safePoint: "provider.receipt_persisted",
          });
          assert.equal(acknowledged?.disposition, "cancelled");
          assert.equal(acknowledged?.run.status, "cancelled");
          assert.equal(
            acknowledged?.run.currentStep,
            "provider.receipt_persisted",
          );
          assert.deepEqual(acknowledged?.run.output, {
            acceptedId: "downstream-1",
            receiptPersisted: true,
          });
          assert.equal(acknowledged?.run.leaseOwner, undefined);
          assert.ok(acknowledged?.run.cancelAcknowledgedAt);

          assert.equal(
            await repository.acknowledgeRunCancellation({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              token: claim.token,
              cancellationId,
              safePoint: "provider.receipt_persisted",
            }),
            null,
          );
          const replay = await repository.requestRunCancellation(request);
          assert.equal(replay?.disposition, "cancelled");
          assert.equal(replay?.replayed, true);
          assert.equal(
            await repository.claimRun({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              workerId: "poison-retry",
              leaseMs: 5_000,
            }),
            null,
          );

          const events = await repository.listEvents(run.id);
          assert.equal(
            events.filter(
              (event) => event.type === "run.cancellation_requested",
            ).length,
            1,
          );
          assert.equal(
            events.filter((event) => event.type === "run.cancelled").length,
            1,
          );
          const terminal = events.find(
            (event) => event.type === "run.cancelled",
          );
          assert.deepEqual(terminal?.data, {
            cancellationId,
            actor,
            reasonCode: "operator_intervention",
            safePoint: "provider.receipt_persisted",
            cooperative: true,
          });
        },
      );

      await t.test(
        "an expired owner cannot acknowledge but normal recovery can",
        async () => {
          const run = await createRun();
          const first = await repository.claimRun({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            workerId: "crashed-owner",
            leaseMs: 120,
          });
          assert.ok(first);
          const cancellationId = crypto.randomUUID();
          await repository.requestRunCancellation({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            cancellationId,
            actor,
            reasonCode: "system_shutdown",
          });
          await delay(180);
          assert.equal(
            await repository.acknowledgeRunCancellation({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              token: first.token,
              cancellationId,
              safePoint: "recovery.start",
            }),
            null,
          );
          assert.equal(
            (await repository.getRunById(run.id))?.status,
            "running",
          );

          const recovered = await secondRepository.claimRun({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            workerId: "recovery-owner",
            leaseMs: 5_000,
          });
          assert.ok(recovered);
          assert.equal(recovered.recovered, true);
          const cancelled = await secondRepository.acknowledgeRunCancellation({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            token: recovered.token,
            cancellationId,
            safePoint: "recovery.reconciled",
          });
          assert.equal(cancelled?.run.status, "cancelled");
        },
      );

      await t.test(
        "finish versus cancellation has one serialized terminal winner",
        async () => {
          const run = await createRun();
          const claim = await repository.claimRun({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            workerId: "race-owner",
            leaseMs: 5_000,
          });
          assert.ok(claim);
          await repository.checkpointRun({
            tenantKey: run.tenantKey,
            operation,
            mode: "canary",
            runId: run.id,
            token: claim.token,
            currentStep: "stable.checkpoint",
            output: { stable: "checkpoint" },
            eventType: "run.checkpointed",
          });
          const cancellationId = crypto.randomUUID();
          const [cancelResult, finishResult] = await Promise.allSettled([
            repository.requestRunCancellation({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              cancellationId,
              actor,
              reasonCode: "user_requested",
            }),
            secondRepository.finishRun({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              token: claim.token,
              status: "completed",
              eventType: "run.completed",
            }),
          ]);

          let winner: Extract<ExecutionRunStatus, "completed" | "cancelled">;
          if (
            cancelResult.status === "fulfilled" &&
            cancelResult.value?.disposition === "requested"
          ) {
            assert.equal(finishResult.status, "fulfilled");
            assert.equal(
              finishResult.status === "fulfilled" ? finishResult.value : null,
              null,
            );
            const acknowledged = await repository.acknowledgeRunCancellation({
              tenantKey: run.tenantKey,
              operation,
              mode: "canary",
              runId: run.id,
              token: claim.token,
              cancellationId,
              safePoint: "stable.checkpoint",
            });
            assert.equal(acknowledged?.run.status, "cancelled");
            winner = "cancelled";
          } else {
            assert.equal(cancelResult.status, "rejected");
            assert.ok(
              cancelResult.status === "rejected" &&
                isCancellationConflict(cancelResult.reason),
            );
            assert.equal(finishResult.status, "fulfilled");
            assert.equal(
              finishResult.status === "fulfilled"
                ? finishResult.value?.status
                : undefined,
              "completed",
            );
            winner = "completed";
          }

          const finalRun = await repository.getRunById(run.id);
          assert.equal(finalRun?.status, winner);
          assert.equal(finalRun?.currentStep, "stable.checkpoint");
          assert.deepEqual(finalRun?.output, { stable: "checkpoint" });
          const events = await repository.listEvents(run.id);
          assert.equal(
            events.filter((event) =>
              ["run.completed", "run.cancelled"].includes(event.type),
            ).length,
            1,
          );
        },
      );

      await t.test(
        "identifiers and audit fields reject free-form values",
        async () => {
          const run = await createRun();
          const base = {
            tenantKey: run.tenantKey,
            operation,
            mode: "canary" as const,
            runId: run.id,
            cancellationId: crypto.randomUUID(),
            actor,
            reasonCode: "user_requested" as const,
          };
          await assert.rejects(
            repository.requestRunCancellation({
              ...base,
              cancellationId: "contains free form",
            }),
            /invalid cancellationId/,
          );
          await assert.rejects(
            repository.requestRunCancellation({
              ...base,
              actor: { type: "user", id: "free form actor" },
            }),
            /invalid cancellation actor id/,
          );
          await assert.rejects(
            repository.requestRunCancellation({
              ...base,
              actor: { type: "admin", id: "martin" },
            } as never),
            /invalid cancellation actor type/,
          );
          await assert.rejects(
            repository.requestRunCancellation({
              ...base,
              reasonCode: "because I said so",
            } as never),
            /invalid cancellation reasonCode/,
          );
          assert.equal((await repository.getRunById(run.id))?.status, "queued");
          assert.equal((await repository.listEvents(run.id)).length, 1);
        },
      );
    } finally {
      await Promise.all([
        sql.end({ timeout: 5 }),
        secondSql.end({ timeout: 5 }),
      ]);
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`);
      await adminSql.end({ timeout: 5 });
    }
  },
);
