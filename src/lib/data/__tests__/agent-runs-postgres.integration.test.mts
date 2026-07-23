import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Db } from "@/db/drizzle";
import { PostgresAgentRunsRepository } from "../agent-runs-postgres";
import {
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE,
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR,
} from "../agent-run-synthetic-runtime-loss";

const databaseUrl = process.env.AGENT_RUNS_TEST_DATABASE_URL;

test("Postgres agent-run claims and terminal receipts are atomic under concurrency", {
  skip: databaseUrl ? false : "set AGENT_RUNS_TEST_DATABASE_URL to run Postgres integration coverage",
}, async () => {
  const client = postgres(databaseUrl as string, { max: 8 });
  const repository = new PostgresAgentRunsRepository(
    drizzle(client) as unknown as Db,
  );
  const suffix = crypto.randomUUID();
  const threadId = `integration:${suffix}`;
  const traceId = `trace-pg-${suffix}`;
  const input = {
    threadId,
    traceId,
    runtime: "integration",
    idempotencyKey: `idem:${suffix}`,
  };

  try {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "src", "db", "migrations", "0018_agent_runs.sql"),
      "utf8",
    );
    // Exercise the deploy artifact itself, twice: CI must prove both real
    // Postgres syntax and the idempotence required by every deploy/restart.
    await client.unsafe(migration);
    await client.unsafe(migration);

    const receipts = await Promise.all(
      Array.from({ length: 8 }, () => repository.createWithReceipt(input)),
    );
    assert.equal(receipts.filter((receipt) => receipt.created).length, 1);
    assert.equal(new Set(receipts.map((receipt) => receipt.run.id)).size, 1);
    const runId = receipts[0].run.id;

    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.claimCallbackFingerprint(runId, "callback-one")),
    );
    assert.equal(claims.filter(Boolean).length, 1);

    await repository.markDispatched(runId, threadId, { accepted: true });
    await Promise.all([
      repository.markCompleted(runId, threadId, { text: "winner" }),
      repository.markFailed(runId, threadId, "late failure"),
    ]);

    const stored = await repository.getById(runId);
    assert.ok(stored);
    assert.ok(stored.status === "completed" || stored.status === "failed");
    const events = await repository.listEvents(runId);
    assert.deepEqual(events.slice(0, 2).map((event) => event.type), [
      "run_created",
      "runtime_dispatched",
    ]);
    assert.equal(
      events.filter((event) => event.type === "bot_reply" || event.type === "failed").length,
      1,
    );
    assert.ok(events.every((event) => event.traceId === traceId));
    assert.deepEqual(
      (await repository.listForTrace(traceId)).map((run) => run.id),
      [runId],
    );
    assert.equal(repository.retention.durable, true);

    // Conflict resolution must mirror the partial unique index. A failed run
    // can be the general "newest" lookup winner (including the deterministic
    // id tie-break) without masking the queued/running/completed run that
    // actually rejected the insert.
    const conflictThreadId = `integration-conflict:${suffix}`;
    const conflictKey = `integration-conflict-key:${suffix}`;
    const sharedCreatedAt = new Date("2026-01-02T03:04:05.000Z");
    const failedRunId = `run_z_failed_${suffix}`;
    const activeRunId = `run_a_active_${suffix}`;
    await client`
      INSERT INTO agent_runs (
        id, idempotency_key, thread_id, trace_id, runtime, status,
        created_at, updated_at
      ) VALUES
        (
          ${failedRunId}, ${conflictKey}, ${conflictThreadId}, ${traceId},
          'integration', 'failed', ${sharedCreatedAt.toISOString()}::timestamp,
          ${sharedCreatedAt.toISOString()}::timestamp
        ),
        (
          ${activeRunId}, ${conflictKey}, ${conflictThreadId}, ${traceId},
          'integration', 'queued', ${sharedCreatedAt.toISOString()}::timestamp,
          ${sharedCreatedAt.toISOString()}::timestamp
        )
    `;

    assert.equal(
      (await repository.getByIdempotencyKey(conflictThreadId, conflictKey))?.id,
      failedRunId,
    );
    const conflictReceipt = await repository.createWithReceipt({
      threadId: conflictThreadId,
      traceId,
      runtime: "integration",
      idempotencyKey: conflictKey,
      now: sharedCreatedAt,
    });
    assert.equal(conflictReceipt.created, false);
    assert.equal(conflictReceipt.run.id, activeRunId);
  } finally {
    await client.end({ timeout: 5 });
  }
});

test("the parent row lock linearizes child admission against Stop", {
  skip: databaseUrl
    ? false
    : "set AGENT_RUNS_TEST_DATABASE_URL to run Postgres integration coverage",
  timeout: 30_000,
}, async () => {
  const client = postgres(databaseUrl as string, { max: 6 });
  const database = drizzle(client);
  const repository = new PostgresAgentRunsRepository(
    database as unknown as Db,
  );
  const suffix = crypto.randomUUID();

  try {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "src", "db", "migrations", "0018_agent_runs.sql"),
      "utf8",
    );
    await client.unsafe(migration);

    // Stop wins: hold its parent UPDATE open while child admission starts.
    // The child must block on FOR UPDATE, then reject after the tombstone
    // commits; no child row can leak through the stale authorization read.
    const stopFirstParent = await repository.create({
      threadId: `integration:stop-first-parent:${suffix}`,
      runtime: "hermes",
    });
    await repository.markDispatched(
      stopFirstParent.id,
      stopFirstParent.threadId,
    );
    let stopLockedResolve!: () => void;
    const stopLocked = new Promise<void>((resolve) => {
      stopLockedResolve = resolve;
    });
    let releaseStop!: () => void;
    const stopHold = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const stopTransaction = client.begin(async (transaction) => {
      await transaction`
        UPDATE agent_runs
        SET status = 'cancelled', updated_at = clock_timestamp()
        WHERE id = ${stopFirstParent.id}
      `;
      stopLockedResolve();
      await stopHold;
    });
    await stopLocked;

    let stopFirstAdmissionSettled = false;
    const stopFirstAdmission = repository
      .createWithReceipt({
        threadId: `integration:stop-first-child:${suffix}`,
        runtime: "external-http",
        activeParent: {
          runId: stopFirstParent.id,
          threadId: stopFirstParent.threadId,
        },
        input: {
          controlParentAgentRunId: stopFirstParent.id,
          controlParentThreadId: stopFirstParent.threadId,
        },
      })
      .then(
        (receipt) => ({ receipt, error: null }),
        (error: unknown) => ({ receipt: null, error }),
      )
      .finally(() => {
        stopFirstAdmissionSettled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(stopFirstAdmissionSettled, false);
    releaseStop();
    await stopTransaction;
    const stopFirstResult = await stopFirstAdmission;
    assert.equal(stopFirstResult.receipt, null);
    assert.ok(stopFirstResult.error instanceof Error);
    assert.equal(stopFirstResult.error.name, "AgentRunParentInactiveError");
    assert.equal(
      (stopFirstResult.error as Error & { code?: unknown }).code,
      "agent_run_parent_inactive",
    );
    assert.equal(
      stopFirstResult.error.message,
      "agent_runs: active parent fence rejected child admission",
    );
    assert.deepEqual(
      await repository.listActiveChildren(stopFirstParent.id),
      [],
    );

    // Child wins: keep the admission transaction open after its INSERT. Stop
    // must wait for that parent lock, then its post-tombstone scan must see and
    // cancel the committed child.
    const childFirstParent = await repository.create({
      threadId: `integration:child-first-parent:${suffix}`,
      runtime: "hermes",
    });
    await repository.markDispatched(
      childFirstParent.id,
      childFirstParent.threadId,
    );
    let childInsertedResolve!: () => void;
    const childInserted = new Promise<void>((resolve) => {
      childInsertedResolve = resolve;
    });
    let releaseChild!: () => void;
    const childHold = new Promise<void>((resolve) => {
      releaseChild = resolve;
    });
    let childRunId = "";
    const childTransaction = database.transaction(async (transaction) => {
      const transactionalRepository = new PostgresAgentRunsRepository(
        transaction as unknown as Db,
      );
      const child = await transactionalRepository.createWithReceipt({
        threadId: `integration:child-first-child:${suffix}`,
        runtime: "external-http",
        activeParent: {
          runId: childFirstParent.id,
          threadId: childFirstParent.threadId,
        },
        input: {
          controlParentAgentRunId: childFirstParent.id,
          controlParentThreadId: childFirstParent.threadId,
        },
      });
      childRunId = child.run.id;
      childInsertedResolve();
      await childHold;
    });
    await childInserted;

    let stopAndDrainSettled = false;
    const stopAndDrain = (async () => {
      await repository.markCancelled(
        childFirstParent.id,
        childFirstParent.threadId,
      );
      const children = await repository.listActiveChildren(childFirstParent.id);
      for (const child of children) {
        await repository.markCancelled(child.id, child.threadId, {
          code: "control_parent_stopped",
        });
      }
      return children;
    })().finally(() => {
      stopAndDrainSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(stopAndDrainSettled, false);
    releaseChild();
    await childTransaction;
    const drainedChildren = await stopAndDrain;
    assert.deepEqual(drainedChildren.map((run) => run.id), [childRunId]);
    assert.equal((await repository.getById(childFirstParent.id))?.status, "cancelled");
    assert.equal((await repository.getById(childRunId))?.status, "cancelled");
  } finally {
    await client.end({ timeout: 5 });
  }
});

test("late runtime-loss recovery is an exact one-winner Postgres CAS", {
  skip: databaseUrl
    ? false
    : "set AGENT_RUNS_TEST_DATABASE_URL to run Postgres integration coverage",
  timeout: 30_000,
}, async () => {
  const client = postgres(databaseUrl as string, { max: 6 });
  const repository = new PostgresAgentRunsRepository(
    drizzle(client) as unknown as Db,
  );
  const suffix = crypto.randomUUID();
  const migration = fs.readFileSync(
    path.join(process.cwd(), "src", "db", "migrations", "0018_agent_runs.sql"),
    "utf8",
  );

  try {
    await client.unsafe(migration);
    const threadId = `integration:late-runtime-loss:${suffix}`;
    const dispatchRunId = `dispatch-late-${suffix}`;
    const run = await repository.create({
      threadId,
      runtime: "openclaw",
      traceId: `trace-late-${suffix}`,
    });
    await repository.markDispatched(run.id, threadId);
    await repository.markFailed(
      run.id,
      threadId,
      AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR,
      "runtime_unreachable",
      {
        code: AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE,
        dispatchRunId,
      },
    );
    const fingerprintA = crypto
      .createHash("sha256")
      .update(`late-a:${suffix}`)
      .digest("hex");
    const fingerprintB = crypto
      .createHash("sha256")
      .update(`late-b:${suffix}`)
      .digest("hex");
    const recoveries = await Promise.all([
      repository.recoverSyntheticRuntimeLoss({
        runId: run.id,
        threadId,
        dispatchRunId,
        fingerprint: fingerprintA,
        output: { text: "winner-a" },
        terminalStatus: "completed",
      }),
      repository.recoverSyntheticRuntimeLoss({
        runId: run.id,
        threadId,
        dispatchRunId,
        fingerprint: fingerprintB,
        output: { text: "winner-b" },
        terminalStatus: "completed",
      }),
    ]);
    assert.equal(recoveries.filter(Boolean).length, 1);
    const recovered = await repository.getById(run.id);
    assert.equal(recovered?.status, "completed");
    assert.equal(recovered?.error, undefined);
    assert.equal(recovered?.callbackFingerprints?.length, 1);
    const winningFingerprint = recovered?.callbackFingerprints?.[0];
    assert.ok(
      winningFingerprint === fingerprintA ||
        winningFingerprint === fingerprintB,
    );
    assert.equal(
      (recovered?.output as { text?: string } | undefined)?.text,
      winningFingerprint === fingerprintA ? "winner-a" : "winner-b",
    );
    assert.equal(
      (await repository.listEvents(run.id)).filter(
        (event) => event.type === "bot_reply",
      ).length,
      1,
    );

    // A callback claimant may crash before the synthetic worker failure. The
    // retained exact singleton fingerprint remains recoverable, but a
    // different payload cannot take over that slot.
    const preclaimedThreadId = `integration:late-preclaimed:${suffix}`;
    const preclaimedDispatchRunId = `dispatch-preclaimed-${suffix}`;
    const preclaimed = await repository.create({
      threadId: preclaimedThreadId,
      runtime: "openclaw",
    });
    await repository.markDispatched(preclaimed.id, preclaimedThreadId);
    assert.equal(
      await repository.claimCallbackFingerprint(
        preclaimed.id,
        fingerprintA,
      ),
      true,
    );
    await repository.markFailed(
      preclaimed.id,
      preclaimedThreadId,
      AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR,
      "runtime_unreachable",
      {
        code: AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE,
        dispatchRunId: preclaimedDispatchRunId,
      },
    );
    assert.equal(
      await repository.recoverSyntheticRuntimeLoss({
        runId: preclaimed.id,
        threadId: preclaimedThreadId,
        dispatchRunId: preclaimedDispatchRunId,
        fingerprint: fingerprintB,
        output: { text: "competitor" },
        terminalStatus: "completed",
      }),
      null,
    );
    assert.equal(
      (
        await repository.recoverSyntheticRuntimeLoss({
          runId: preclaimed.id,
          threadId: preclaimedThreadId,
          dispatchRunId: preclaimedDispatchRunId,
          fingerprint: fingerprintA,
          output: { text: "exact recovery" },
          terminalStatus: "completed",
        })
      )?.status,
      "completed",
    );
  } finally {
    await client.end({ timeout: 5 });
  }
});
