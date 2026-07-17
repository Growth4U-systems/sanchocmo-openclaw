import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inspectOrResumeTerminalProjection,
  parseTerminalProjectionRepairArgs,
  type TerminalProjectionRepairRepository,
} from "../../../scripts/lib/terminal-projection-repair.mts";
import type { ExecutionTerminalProjection } from "../execution-control/types";

const blocked: ExecutionTerminalProjection = {
  runId: "xrun_repair_1",
  tenantKey: "growth4u",
  operation: "leads.search",
  mode: "canary",
  terminalStatus: "completed",
  state: "blocked",
  availableAt: "2026-07-16T12:00:00.000Z",
  claimCount: 3,
  lastErrorCode: "terminal_projection_callback_failed",
  createdAt: "2026-07-16T11:00:00.000Z",
  updatedAt: "2026-07-16T12:00:00.000Z",
};

const baseArgs = [
  "--tenant",
  "growth4u",
  "--operation=leads.search",
  "--mode",
  "canary",
  "--run-id",
  "xrun_repair_1",
  "--expected-error-code",
  "terminal_projection_callback_failed",
];

test("repair arguments are exact and apply needs a repeated run id", () => {
  assert.deepEqual(parseTerminalProjectionRepairArgs(baseArgs), {
    tenantKey: "growth4u",
    operation: "leads.search",
    mode: "canary",
    runId: "xrun_repair_1",
    expectedErrorCode: "terminal_projection_callback_failed",
    apply: false,
  });
  assert.throws(
    () => parseTerminalProjectionRepairArgs([...baseArgs, "--apply"]),
    /exactly match/,
  );
  assert.throws(
    () =>
      parseTerminalProjectionRepairArgs([
        ...baseArgs,
        "--apply",
        "--confirm-run-id",
        "xrun_other",
      ]),
    /exactly match/,
  );
});

test("dry run returns only bounded blocked incident evidence", async () => {
  let resumes = 0;
  const repository: TerminalProjectionRepairRepository = {
    async getTerminalProjectionForScope() {
      return blocked;
    },
    async resumeBlockedTerminalProjection() {
      resumes += 1;
      return null;
    },
  };
  const result = await inspectOrResumeTerminalProjection(
    repository,
    parseTerminalProjectionRepairArgs(baseArgs),
  );
  assert.equal(result.kind, "ready");
  assert.equal(resumes, 0);
  assert.deepEqual(Object.keys(result.projection ?? {}).sort(), [
    "claimCount",
    "lastErrorCode",
    "mode",
    "operation",
    "runId",
    "state",
    "tenantKey",
    "terminalStatus",
    "updatedAt",
  ]);
});

test("apply uses the observed error as a CAS guard", async () => {
  const calls: unknown[] = [];
  const repository: TerminalProjectionRepairRepository = {
    async getTerminalProjectionForScope() {
      return blocked;
    },
    async resumeBlockedTerminalProjection(input) {
      calls.push(input);
      return { ...blocked, state: "pending", lastErrorCode: undefined };
    },
  };
  const options = parseTerminalProjectionRepairArgs([
    ...baseArgs,
    "--apply",
    "--confirm-run-id",
    "xrun_repair_1",
  ]);
  const result = await inspectOrResumeTerminalProjection(repository, options);
  assert.equal(result.kind, "resumed");
  assert.deepEqual(calls, [
    {
      tenantKey: "growth4u",
      operation: "leads.search",
      mode: "canary",
      runId: "xrun_repair_1",
      expectedErrorCode: "terminal_projection_callback_failed",
    },
  ]);
});

test("a changed incident is refused before the mutation", async () => {
  let resumes = 0;
  const repository: TerminalProjectionRepairRepository = {
    async getTerminalProjectionForScope() {
      return {
        ...blocked,
        lastErrorCode: "terminal_projection_contract_invalid",
      };
    },
    async resumeBlockedTerminalProjection() {
      resumes += 1;
      return null;
    },
  };
  const options = parseTerminalProjectionRepairArgs([
    ...baseArgs,
    "--apply",
    "--confirm-run-id=xrun_repair_1",
  ]);
  const result = await inspectOrResumeTerminalProjection(repository, options);
  assert.equal(result.kind, "stale_incident");
  assert.equal(resumes, 0);
});
