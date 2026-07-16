import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "../../db/drizzle";
import {
  EXECUTION_EFFECT_CONFLICT_CODE,
  type ExecutionLeaseReceipt,
  type PrepareExecutionEffectInput,
} from "../execution-control/types";
import { PostgresExecutionControlRepository } from "../execution-control/postgres";

const databaseUrl =
  process.env.EXECUTION_CONTROL_EFFECT_TEST_DATABASE_URL ??
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
  "Postgres execution effects are immutable, scoped and lease-fenced",
  { skip: !databaseUrl, timeout: 30_000 },
  async (t) => {
    const sql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
      connection: { TimeZone: "Europe/Madrid" },
    });
    const schema = `execution_effects_${crypto.randomUUID().replaceAll("-", "")}`;
    let repository: PostgresExecutionControlRepository;
    const operation = `contract.execution-effects.${crypto.randomUUID()}`;

    async function createClaim(
      leaseMs = 5_000,
    ): Promise<ExecutionLeaseReceipt> {
      const { run } = await repository.createRun({
        tenantKey: "tenant-a",
        idempotencyKey: `command:${crypto.randomUUID()}`,
        aggregateType: "contract.effect",
        aggregateId: crypto.randomUUID(),
        operation,
        mode: "canary",
        metadata: { executionContractVersion: 2 },
      });
      const claim = await repository.claimRun({
        tenantKey: "tenant-a",
        operation,
        mode: "canary",
        runId: run.id,
        workerId: `worker-${crypto.randomUUID()}`,
        leaseMs,
      });
      assert.ok(claim);
      return claim;
    }

    function prepareInput(
      claim: ExecutionLeaseReceipt,
      overrides: Partial<PrepareExecutionEffectInput> = {},
    ): PrepareExecutionEffectInput {
      return {
        tenantKey: "tenant-a",
        operation,
        mode: "canary",
        runId: claim.run.id,
        token: claim.token,
        stepKey: "provider.start",
        effectKey: `${operation}:run:${claim.run.id}:step:provider.start:v2`,
        handlerVersion: 2,
        definitionVersion: 1,
        capability: "provider.workflow.start",
        safety: "target_idempotency",
        payloadSchemaVersion: 1,
        payloadFingerprint: "a".repeat(64),
        policyFingerprint: "b".repeat(64),
        receiptSchemaVersion: 1,
        deadlineMs: 2_000,
        maxAttempts: 3,
        ...overrides,
      };
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
          for (const statement of migration(name)) {
            await sql.unsafe(statement);
          }
        }
      }
      repository = new PostgresExecutionControlRepository(
        drizzle(sql) as unknown as Db,
      );

      await t.test(
        "migration is rerunnable and stores no payload column",
        async () => {
          const columns = await sql<{ column_name: string }[]>`
          SELECT "column_name"
          FROM information_schema.columns
          WHERE table_schema = ${schema}
            AND table_name = 'execution_effects'
          ORDER BY "ordinal_position"
        `;
          const names = new Set(columns.map((column) => column.column_name));
          assert.equal(names.has("payload"), false);
          assert.equal(names.has("payload_fingerprint"), true);
          assert.equal(names.has("receipt"), true);
        },
      );

      await t.test(
        "prepare precedes I/O and immutable drift is stable",
        async () => {
          const claim = await createClaim();
          const input = prepareInput(claim);
          assert.equal(
            await repository.prepareEffect({ ...input, tenantKey: "tenant-b" }),
            null,
          );

          const prepared = await repository.prepareEffect(input);
          assert.equal(prepared?.kind, "invoke");
          assert.equal(prepared?.effect.status, "prepared");
          assert.equal(prepared?.effect.attemptCount, 1);
          assert.equal(prepared?.effect.payloadFingerprint, "a".repeat(64));
          assert.equal("payload" in (prepared?.effect ?? {}), false);

          for (const drift of [
            { effectKey: `${input.effectKey}:drift` },
            { handlerVersion: 3 },
            { definitionVersion: 2 },
            { capability: "provider.workflow.other" },
            { safety: "read_only" as const },
            { payloadSchemaVersion: 2 },
            { payloadFingerprint: "d".repeat(64) },
            { policyFingerprint: "d".repeat(64) },
            { receiptSchemaVersion: 2 },
          ]) {
            await assert.rejects(
              repository.prepareEffect({ ...input, ...drift }),
              (error: unknown) =>
                error instanceof Error &&
                (error as { code?: unknown }).code ===
                  EXECUTION_EFFECT_CONFLICT_CODE &&
                !error.message.includes("d".repeat(64)),
            );
          }
          const unchanged = await repository.getEffectForScope({
            tenantKey: "tenant-a",
            operation,
            mode: "canary",
            runId: claim.run.id,
            stepKey: input.stepKey,
          });
          assert.equal(unchanged?.attemptCount, 1);
          assert.equal(
            await repository.getEffectForScope({
              tenantKey: "tenant-b",
              operation,
              mode: "canary",
              runId: claim.run.id,
              stepKey: input.stepKey,
            }),
            null,
          );

          for (const invalidReceipt of ["primitive", ["array"]] as unknown[]) {
            await assert.rejects(
              repository.completeEffect({
                ...input,
                receipt: invalidReceipt as Record<string, unknown>,
                receiptFingerprint: "c".repeat(64),
              }),
              /effect receipt must be a JSON object/,
            );
          }
          await assert.rejects(
            repository.completeEffect({
              ...input,
              receipt: { oversized: "x".repeat(16_385) },
              receiptFingerprint: "c".repeat(64),
            }),
            /effect receipt exceeds 16384 bytes/,
          );

          const receipt = { providerId: "provider-1", status: "accepted" };
          assert.equal(
            await repository.completeEffect({
              ...input,
              operation: `${operation}.wrong`,
              receipt,
              receiptFingerprint: "c".repeat(64),
            }),
            null,
          );
          const completed = await repository.completeEffect({
            ...input,
            receipt,
            receiptFingerprint: "c".repeat(64),
          });
          assert.equal(completed?.status, "succeeded");
          assert.deepEqual(completed?.receipt, receipt);

          const replay = await repository.completeEffect({
            ...input,
            receipt,
            receiptFingerprint: "c".repeat(64),
          });
          assert.equal(replay?.status, "succeeded");
          const events = await repository.listEvents(claim.run.id);
          assert.deepEqual(
            events.map((event) => event.type),
            [
              "run.created",
              "run.claimed",
              "effect.prepared",
              "effect.succeeded",
            ],
          );
          const serializedEvents = JSON.stringify(events);
          assert.doesNotMatch(serializedEvents, /provider-1|accepted/);
          assert.equal(
            events.some(
              (event) =>
                event.data !== null &&
                typeof event.data === "object" &&
                ("payload" in event.data || "receipt" in event.data),
            ),
            false,
          );
        },
      );

      await t.test(
        "DB clock prevents concurrent replay before the invocation deadline",
        async () => {
          for (const safety of [
            "read_only",
            "target_idempotency",
            "reconcile_before_replay",
          ] as const) {
            const claim = await createClaim();
            const stepKey = `provider.concurrent.${safety}`;
            const input = prepareInput(claim, {
              safety,
              stepKey,
              effectKey: `${operation}:run:${claim.run.id}:step:${stepKey}:v2`,
              deadlineMs: 2_000,
            });
            const dispositions = await Promise.all([
              repository.prepareEffect(input),
              repository.prepareEffect(input),
            ]);
            assert.deepEqual(dispositions.map((value) => value?.kind).sort(), [
              "invoke",
              "retry_wait",
            ]);
            const stored = await repository.getEffectForScope({
              tenantKey: input.tenantKey,
              operation: input.operation,
              mode: input.mode,
              runId: input.runId,
              stepKey,
            });
            assert.equal(stored?.attemptCount, 1);
            assert.ok(
              Date.parse(stored?.lastDeadlineAt ?? "") >
                Date.parse(stored?.updatedAt ?? ""),
            );
          }
        },
      );

      await t.test(
        "final unknown attempt remains reconcilable after deadline",
        async () => {
          const claim = await createClaim();
          const stepKey = "provider.final-unknown";
          const input = prepareInput(claim, {
            safety: "reconcile_before_replay",
            stepKey,
            effectKey: `${operation}:run:${claim.run.id}:step:${stepKey}:v2`,
            deadlineMs: 2_000,
            maxAttempts: 1,
          });
          assert.equal((await repository.prepareEffect(input))?.kind, "invoke");
          const uncertain = await repository.recordEffectFailure({
            ...input,
            classification: "outcome_unknown",
            errorCode: "provider_unknown",
            availableAt: new Date(0),
            terminal: false,
          });
          assert.equal(uncertain?.status, "uncertain");
          assert.equal(
            (await repository.prepareEffect(input))?.kind,
            "retry_wait",
          );

          await sql`
          UPDATE "execution_effects"
          SET "last_deadline_at" =
                (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second',
              "available_at" =
                (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
          WHERE "run_id" = ${claim.run.id}
            AND "step_key" = ${stepKey}
        `;
          const recovery = await repository.prepareEffect(input);
          assert.equal(recovery?.kind, "reconcile");
          assert.equal(recovery?.effect.attemptCount, 1);

          const unknown = await repository.recordEffectReconcile({
            ...input,
            outcome: "unknown",
            availableAt: new Date(Date.now() + 60_000),
          });
          assert.equal(unknown?.status, "uncertain");
          assert.equal(
            (await repository.prepareEffect(input))?.kind,
            "retry_wait",
          );

          const absent = await repository.recordEffectReconcile({
            ...input,
            outcome: "not_found",
          });
          assert.equal(absent?.lastErrorCode, "effect_reconcile_not_found");
          const exhausted = await repository.prepareEffect(input);
          assert.equal(exhausted?.kind, "retry_wait");
          assert.equal(exhausted?.effect.attemptCount, 1);
        },
      );

      await t.test(
        "failure and reconcile transitions keep counters separate",
        async () => {
          const claim = await createClaim();
          const input = prepareInput(claim, {
            safety: "reconcile_before_replay",
            stepKey: "provider.reconcile",
            effectKey: `${operation}:run:${claim.run.id}:step:provider.reconcile:v2`,
          });
          assert.equal((await repository.prepareEffect(input))?.kind, "invoke");
          assert.equal(
            await repository.recordEffectFailure({
              ...input,
              tenantKey: "tenant-b",
              classification: "outcome_unknown",
              errorCode: "wrong_scope",
              terminal: false,
            }),
            null,
          );
          const uncertain = await repository.recordEffectFailure({
            ...input,
            classification: "outcome_unknown",
            errorCode: "provider_timeout",
            terminal: false,
          });
          assert.equal(uncertain?.status, "uncertain");
          assert.equal(uncertain?.attemptCount, 1);

          assert.equal(
            await repository.recordEffectReconcile({
              ...input,
              operation: `${operation}.wrong`,
              outcome: "unknown",
            }),
            null,
          );
          const unknown = await repository.recordEffectReconcile({
            ...input,
            outcome: "unknown",
            availableAt: new Date(Date.now() + 25),
          });
          assert.equal(unknown?.status, "uncertain");
          assert.equal(unknown?.attemptCount, 1);
          assert.equal(unknown?.reconcileCount, 1);

          const absent = await repository.recordEffectReconcile({
            ...input,
            outcome: "not_found",
          });
          assert.equal(absent?.status, "prepared");
          assert.equal(absent?.lastErrorCode, "effect_reconcile_not_found");
          assert.equal(absent?.attemptCount, 1);
          assert.equal(absent?.reconcileCount, 2);

          const replay = await repository.prepareEffect(input);
          assert.equal(replay?.kind, "invoke");
          assert.equal(replay?.effect.attemptCount, 2);
          assert.equal(replay?.effect.reconcileCount, 2);
          for (const invalidReceipt of [
            "raw-response",
            ["raw-response"],
          ] as unknown[]) {
            await assert.rejects(
              repository.recordEffectReconcile({
                ...input,
                outcome: "found",
                receipt: invalidReceipt as Record<string, unknown>,
                receiptFingerprint: "e".repeat(64),
              }),
              /effect receipt must be a JSON object/,
            );
          }
          await assert.rejects(
            repository.recordEffectReconcile({
              ...input,
              outcome: "found",
              receipt: { oversized: "x".repeat(16_385) },
              receiptFingerprint: "e".repeat(64),
            }),
            /effect receipt exceeds 16384 bytes/,
          );
          const found = await repository.recordEffectReconcile({
            ...input,
            outcome: "found",
            receipt: { providerId: "provider-reconciled" },
            receiptFingerprint: "e".repeat(64),
          });
          assert.equal(found?.status, "succeeded");
          assert.equal(found?.attemptCount, 2);
          assert.equal(found?.reconcileCount, 3);
        },
      );

      await t.test(
        "reconcile conflict is one fenced terminal effect transition",
        async () => {
          const claim = await createClaim();
          const input = prepareInput(claim, {
            safety: "target_idempotency",
            stepKey: "provider.receipt-conflict",
            effectKey: `${operation}:run:${claim.run.id}:step:provider.receipt-conflict:v2`,
          });
          assert.equal((await repository.prepareEffect(input))?.kind, "invoke");
          const uncertain = await repository.recordEffectFailure({
            ...input,
            classification: "outcome_unknown",
            errorCode: "provider_timeout",
            terminal: false,
          });
          assert.equal(uncertain?.status, "uncertain");

          const conflicted = await repository.recordEffectReconcile({
            ...input,
            outcome: "conflict",
            errorCode: "provider_idempotency_conflict",
          });
          assert.equal(conflicted?.status, "failed");
          assert.equal(conflicted?.reconcileCount, 1);
          assert.equal(
            conflicted?.lastErrorCode,
            "provider_idempotency_conflict",
          );
          assert.ok(conflicted?.finishedAt);
          assert.equal(
            (await repository.prepareEffect(input))?.effect.status,
            "failed",
          );
          await assert.rejects(
            repository.recordEffectReconcile({
              ...input,
              outcome: "conflict",
            }),
            /conflict requires errorCode/,
          );
          await assert.rejects(
            repository.recordEffectReconcile({
              ...input,
              outcome: "unknown",
              errorCode: "not_allowed",
            }),
            /only valid for conflict/,
          );
        },
      );

      await t.test(
        "expired owners cannot mutate any effect transition",
        async () => {
          // Keep enough headroom for a loaded CI/database connection before
          // the first fenced mutation, then wait deliberately past expiry.
          const claim = await createClaim(1_000);
          const input = prepareInput(claim, {
            stepKey: "provider.stale",
            effectKey: `${operation}:run:${claim.run.id}:step:provider.stale:v2`,
            // Lease expiry and invocation ambiguity are separate clocks. Give
            // the assertions enough DB/CI headroom to observe that boundary.
            deadlineMs: 20_000,
          });
          assert.equal((await repository.prepareEffect(input))?.kind, "invoke");
          await delay(1_150);
          assert.equal(await repository.prepareEffect(input), null);
          assert.equal(
            await repository.completeEffect({
              ...input,
              receipt: { providerId: "late" },
              receiptFingerprint: "f".repeat(64),
            }),
            null,
          );
          assert.equal(
            await repository.recordEffectFailure({
              ...input,
              classification: "outcome_unknown",
              errorCode: "late_failure",
              terminal: false,
            }),
            null,
          );
          assert.equal(
            await repository.recordEffectReconcile({
              ...input,
              outcome: "unknown",
            }),
            null,
          );

          const recovered = await repository.claimRun({
            tenantKey: "tenant-a",
            operation,
            mode: "canary",
            runId: claim.run.id,
            workerId: "replacement-worker",
            leaseMs: 5_000,
          });
          assert.ok(recovered);
          assert.equal(recovered.recovered, true);
          const replacementInput = prepareInput(recovered, {
            stepKey: input.stepKey,
            effectKey: input.effectKey,
          });
          const beforeDeadline =
            await repository.prepareEffect(replacementInput);
          assert.equal(beforeDeadline?.kind, "retry_wait");
          assert.equal(beforeDeadline?.effect.attemptCount, 1);
          await sql`
          UPDATE "execution_effects"
          SET "last_deadline_at" =
                (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
          WHERE "run_id" = ${claim.run.id}
            AND "step_key" = ${input.stepKey}
        `;
          const replay = await repository.prepareEffect(replacementInput);
          assert.equal(replay?.kind, "invoke");
          assert.equal(replay?.effect.attemptCount, 2);
        },
      );
    } finally {
      await sql.unsafe("SET search_path TO public").catch(() => {});
      await sql
        .unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => {});
      await sql.end({ timeout: 5 });
    }
  },
);
