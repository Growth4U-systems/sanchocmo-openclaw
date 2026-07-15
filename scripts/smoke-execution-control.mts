import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PostgresExecutionControlRepository } from "../src/lib/execution-control/postgres";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the execution-control smoke");
  }

  const repository = new PostgresExecutionControlRepository();
  const smokeId = `smoke:${crypto.randomUUID()}`;
  const input = {
    aggregateType: "system.smoke",
    aggregateId: smokeId,
    operation: "execution-control.verify",
    idempotencyKey: `${smokeId}:attempt:1`,
    mode: "shadow" as const,
    input: { smokeId },
    metadata: { source: "smoke-execution-control" },
  };

  const receipts = await Promise.all([
    repository.createRun(input),
    repository.createRun(input),
  ]);
  assert.equal(receipts.filter((receipt) => receipt.created).length, 1);
  assert.equal(receipts[0].run.id, receipts[1].run.id);

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

  console.log(
    JSON.stringify({
      ok: true,
      runId,
      idempotentCreate: true,
      staleCasRejected: true,
      terminalRaceSingleWinner: true,
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
