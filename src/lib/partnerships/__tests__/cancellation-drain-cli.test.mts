import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePartnershipsCancellationDrainArgs,
  partnershipsCancellationDrainReport,
} from "../../../../scripts/lib/partnerships-cancellation-drain.mts";

const exactArgs = [
  "--tenant=hospital-capilar",
  "--run-id=xrun_mroob60b_8a9a32b2",
];

test("cancellation drain parser requires an exact repeated run id for apply", () => {
  assert.deepEqual(parsePartnershipsCancellationDrainArgs(exactArgs), {
    tenantKey: "hospital-capilar",
    runId: "xrun_mroob60b_8a9a32b2",
    apply: false,
  });
  assert.deepEqual(
    parsePartnershipsCancellationDrainArgs([
      ...exactArgs,
      "--apply",
      "--confirm-run-id=xrun_mroob60b_8a9a32b2",
    ]),
    {
      tenantKey: "hospital-capilar",
      runId: "xrun_mroob60b_8a9a32b2",
      apply: true,
      confirmRunId: "xrun_mroob60b_8a9a32b2",
    },
  );
  assert.throws(
    () => parsePartnershipsCancellationDrainArgs([...exactArgs, "--apply"]),
    /requires --confirm-run-id/,
  );
});

test("cancellation drain parser rejects confirmation on dry-run and every duplicate flag", () => {
  assert.throws(
    () =>
      parsePartnershipsCancellationDrainArgs([
        ...exactArgs,
        "--confirm-run-id=xrun_mroob60b_8a9a32b2",
      ]),
    /valid only with --apply/,
  );
  for (const duplicate of [
    "--tenant=hospital-capilar",
    "--run-id=xrun_mroob60b_8a9a32b2",
  ]) {
    assert.throws(
      () => parsePartnershipsCancellationDrainArgs([...exactArgs, duplicate]),
      /only once/,
    );
  }
  assert.throws(
    () =>
      parsePartnershipsCancellationDrainArgs([
        ...exactArgs,
        "--apply",
        "--apply",
        "--confirm-run-id=xrun_mroob60b_8a9a32b2",
      ]),
    /only once/,
  );
  assert.throws(
    () =>
      parsePartnershipsCancellationDrainArgs([
        ...exactArgs,
        "--apply",
        "--confirm-run-id=xrun_mroob60b_8a9a32b2",
        "--confirm-run-id=xrun_mroob60b_8a9a32b2",
      ]),
    /only once/,
  );
});

test("cancellation report never claims that terminal projection delivery was verified", () => {
  assert.deepEqual(
    partnershipsCancellationDrainReport({
      dryRun: false,
      runId: "xrun_mroob60b_8a9a32b2",
      status: "cancelled",
      handlerVersion: 3,
      cancellationRequested: true,
      cancellationAcknowledged: true,
      executionOutcome: "cancelled",
    }),
    {
      ok: true,
      dryRun: false,
      runCancellation: {
        runId: "xrun_mroob60b_8a9a32b2",
        status: "cancelled",
        terminal: true,
        requested: true,
        acknowledged: true,
        handlerVersion: 3,
        executionOutcome: "cancelled",
      },
      projectionDelivery: {
        verified: false,
        status: "not_verified_by_cancellation_drain",
      },
    },
  );
});
