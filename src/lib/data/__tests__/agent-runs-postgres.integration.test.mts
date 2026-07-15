import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Db } from "@/db/drizzle";
import { PostgresAgentRunsRepository } from "../agent-runs-postgres";

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
