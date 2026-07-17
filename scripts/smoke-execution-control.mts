import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/drizzle";
import { executionRuns } from "../src/db/schema";
import { PostgresExecutionControlRepository } from "../src/lib/execution-control/postgres";
import { EXECUTION_COMMAND_CONFLICT_CODE } from "../src/lib/execution-control/types";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the execution-control smoke");
  }

  const repository = new PostgresExecutionControlRepository();
  const smokeId = `smoke:${crypto.randomUUID()}`;
  const operation = `execution-control.verify.${smokeId}`;
  const createdAt = new Date();
  const input = {
    tenantKey: "system",
    aggregateType: "system.smoke",
    aggregateId: smokeId,
    operation,
    idempotencyKey: `${smokeId}:attempt:1`,
    mode: "shadow" as const,
    input: { smokeId },
    metadata: {
      source: "smoke-execution-control",
      executionHandlerVersion: 1,
    },
    now: createdAt,
  };

  const receipts = await Promise.all([
    repository.createRun(input),
    repository.createRun(input),
  ]);
  assert.equal(receipts.filter((receipt) => receipt.created).length, 1);
  assert.equal(receipts[0].run.id, receipts[1].run.id);
  assert.match(receipts[0].run.commandFingerprint ?? "", /^[a-f0-9]{64}$/);
  const replay = await repository.createRun({
    ...input,
    traceId: "smoke-replay-trace",
    now: new Date(createdAt.getTime() + 1_000),
  });
  assert.equal(replay.created, false);
  assert.equal(replay.run.id, receipts[0].run.id);

  async function assertCommandConflict(promise: Promise<unknown>) {
    await assert.rejects(
      promise,
      (error: unknown) =>
        error instanceof Error &&
        (error as { code?: unknown }).code === EXECUTION_COMMAND_CONFLICT_CODE,
    );
  }
  await assertCommandConflict(
    repository.createRun({
      ...input,
      input: { smokeId, drift: true },
    }),
  );
  await assertCommandConflict(
    repository.createRun({ ...input, mode: "canary" }),
  );
  await assertCommandConflict(
    repository.createRun({
      ...input,
      metadata: { ...input.metadata, executionHandlerVersion: 2 },
    }),
  );

  const crossTenant = await repository.createRun({
    ...input,
    tenantKey: "system-smoke-isolation",
    // During the expand/contract compatibility release the old unique index
    // remains, so aggregate ids continue to include the tenant explicitly.
    aggregateId: `system-smoke-isolation:${smokeId}`,
  });
  assert.equal(crossTenant.created, true);
  assert.notEqual(crossTenant.run.id, receipts[0].run.id);

  const legacyId = `legacy:${crypto.randomUUID()}`;
  const legacyAggregateId = `growth4u:${legacyId}`;
  const legacyIdempotencyKey = `${legacyId}:attempt:1`;
  const legacyRunId = `xrun_legacy_${crypto.randomUUID()}`;
  await db.execute(sql`
    INSERT INTO "execution_runs" (
      "id", "idempotency_key", "aggregate_type", "aggregate_id", "operation",
      "input", "metadata"
    ) VALUES (
      ${legacyRunId}, ${legacyIdempotencyKey}, 'partnerships.search',
      ${legacyAggregateId}, 'partnerships.discovery',
      ${JSON.stringify({ slug: "growth4u" })}::jsonb, '{}'::jsonb
    )
  `);
  const legacyInput = {
    tenantKey: "growth4u",
    aggregateType: "partnerships.search",
    aggregateId: legacyAggregateId,
    operation: "partnerships.discovery",
    idempotencyKey: legacyIdempotencyKey,
    mode: "shadow",
    input: { slug: "growth4u" },
  } as const;

  await assert.rejects(
    repository.createRun({ ...legacyInput, tenantKey: "other-tenant" }),
    /did not persist or resolve an idempotent run/,
  );
  const beforeAdoption = await db
    .select({
      tenantKey: executionRuns.tenantKey,
      commandFingerprint: executionRuns.commandFingerprint,
    })
    .from(executionRuns)
    .where(eq(executionRuns.id, legacyRunId));
  assert.deepEqual(beforeAdoption, [
    { tenantKey: null, commandFingerprint: null },
  ]);

  const adoptedReceipts = await Promise.all([
    repository.createRun(legacyInput),
    repository.createRun(legacyInput),
  ]);
  assert.ok(adoptedReceipts.every((receipt) => receipt.created === false));
  assert.ok(adoptedReceipts.every((receipt) => receipt.run.id === legacyRunId));
  assert.ok(
    adoptedReceipts.every((receipt) => receipt.run.tenantKey === "growth4u"),
  );
  const afterAdoption = await db
    .select({
      id: executionRuns.id,
      tenantKey: executionRuns.tenantKey,
      commandFingerprint: executionRuns.commandFingerprint,
    })
    .from(executionRuns)
    .where(eq(executionRuns.aggregateId, legacyAggregateId));
  assert.equal(afterAdoption[0]?.id, legacyRunId);
  assert.equal(afterAdoption[0]?.tenantKey, "growth4u");
  assert.match(afterAdoption[0]?.commandFingerprint ?? "", /^[a-f0-9]{64}$/);

  await Promise.all(
    ["page-2", "page-3"].map((suffix) =>
      repository.createRun({
        ...input,
        aggregateId: `${smokeId}:${suffix}`,
        idempotencyKey: `${smokeId}:${suffix}:attempt:1`,
      }),
    ),
  );

  const runId = receipts[0].run.id;
  const running = await repository.transitionRun(
    runId,
    { status: "running", expectedStatus: "queued", currentStep: "discover" },
    "smoke.started",
  );
  assert.equal(running.currentStep, "discover");

  await assert.rejects(
    repository.transitionRun(
      runId,
      { status: "completed", expectedStatus: "queued" },
      "smoke.stale_transition",
    ),
    /stale transition/,
  );

  const terminalRace = await Promise.allSettled([
    repository.transitionRun(
      runId,
      { status: "completed", expectedStatus: "running", currentStep: "verify" },
      "smoke.completed",
    ),
    repository.transitionRun(
      runId,
      { status: "failed", expectedStatus: "running", currentStep: "failed" },
      "smoke.failed",
    ),
  ]);
  assert.equal(
    terminalRace.filter((result) => result.status === "fulfilled").length,
    1,
  );

  const finalRun = await repository.getRunById(runId);
  assert.ok(finalRun);
  assert.ok(finalRun.status === "completed" || finalRun.status === "failed");
  const events = await repository.listEvents(runId);
  assert.equal(events[0]?.type, "run.created");
  assert.ok(
    events.every(
      (event, index) =>
        index === 0 || event.sequence > events[index - 1].sequence,
    ),
  );

  const firstPage = await repository.listRuns({
    tenantKey: "system",
    operation,
    limit: 2,
  });
  assert.equal(firstPage.runs.length, 2);
  assert.ok(firstPage.nextBefore);
  const secondPage = await repository.listRuns({
    tenantKey: "system",
    operation,
    before: firstPage.nextBefore,
    limit: 2,
  });
  assert.equal(secondPage.runs.length, 1);
  assert.equal(
    new Set([...firstPage.runs, ...secondPage.runs].map((run) => run.id)).size,
    3,
  );
  assert.equal(
    await repository.getRunByIdForTenant("another-tenant", runId),
    null,
  );
  const pagedEvents = await repository.listEventsPage({
    tenantKey: "system",
    runId,
    limit: 2,
  });
  assert.equal(pagedEvents.events.length, 2);
  assert.ok(pagedEvents.nextAfterSequence);
  const remainingEvents = await repository.listEventsPage({
    tenantKey: "system",
    runId,
    afterSequence: pagedEvents.nextAfterSequence,
    limit: 100,
  });
  const eventUnion = [...pagedEvents.events, ...remainingEvents.events];
  assert.deepEqual(
    eventUnion.map((event) => event.sequence),
    events.map((event) => event.sequence),
  );

  console.log(
    JSON.stringify({
      ok: true,
      runId,
      idempotentCreate: true,
      immutableCommandFingerprint: true,
      staleCasRejected: true,
      terminalRaceSingleWinner: true,
      tenantIsolation: true,
      tenantScopedQueries: true,
      rollbackCompatibleIdempotency: true,
      legacyWriterAdoption: true,
      boundedReads: true,
      stableKeysetPagination: true,
      finalStatus: finalRun.status,
      events: events.map((event) => event.type),
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Execution-control smoke failed",
    );
    process.exit(1);
  });
