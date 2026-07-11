import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missionControlRunIdFor,
  registerRuntimeRun,
  resetRuntimeRunStateForTest,
} from "../runtime-run-state.js";

test("OpenClaw outbound delivery resolves the exact run by canonical thread and agent", () => {
  resetRuntimeRunStateForTest();
  const releaseOwner = registerRuntimeRun({
    slug: "acme",
    threadId: "acme:task-1",
    agent: "rocinante",
    missionControlRunId: "run_owner",
  });
  const releaseTemporary = registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_temporary",
  });

  assert.equal(missionControlRunIdFor("acme", "task-1", "rocinante"), "run_owner");
  assert.equal(missionControlRunIdFor("acme", "acme:task-1", "sancho"), "run_temporary");
  releaseOwner();
  assert.equal(missionControlRunIdFor("acme", "task-1", "rocinante"), undefined);
  assert.equal(missionControlRunIdFor("acme", "task-1", "sancho"), "run_temporary");
  releaseTemporary();
});

test("a stale release cannot remove a newer registration", () => {
  resetRuntimeRunStateForTest();
  const releaseOld = registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_old",
  });
  const releaseNew = registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_new",
  });
  releaseOld();
  assert.equal(missionControlRunIdFor("acme", "task-1", "sancho"), "run_new");
  releaseNew();
});
