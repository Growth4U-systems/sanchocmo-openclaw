import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listRuntimeTransitionBlockers,
  runtimeTransitionBlockedPayload,
} from "@/lib/runtime/transition-guard";

test("runtime transitions expose only bounded active run identity", async () => {
  let receivedLimit = 0;
  const blockers = await listRuntimeTransitionBlockers(7, async (limit) => {
    receivedLimit = limit;
    return [
      {
        id: "run_queued",
        threadId: "demo:general",
        runtime: "hermes",
        status: "queued",
        input: { runtimeToolCapabilitySha256: "must-not-leak" },
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
      {
        id: "run_done",
        threadId: "demo:general",
        runtime: "hermes",
        status: "completed",
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
    ];
  });

  assert.equal(receivedLimit, 7);
  assert.deepEqual(blockers, [
    {
      id: "run_queued",
      threadId: "demo:general",
      runtime: "hermes",
      status: "queued",
    },
  ]);
  assert.equal(JSON.stringify(runtimeTransitionBlockedPayload(blockers)).includes("must-not-leak"), false);
});
