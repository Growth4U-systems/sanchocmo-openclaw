import { test } from "node:test";
import assert from "node:assert/strict";
import { callbackAuthorityHeaders } from "./callback-authority.mjs";

test("callback authority binds a bridge callback to one Mission Control run", () => {
  const capability = "b".repeat(64);

  assert.deepEqual(
    callbackAuthorityHeaders({
      missionControlRunId: "run_mc:runtime/one",
      runtimeToolCapability: capability,
    }),
    {
      "X-Mission-Control-Run-Id": "run_mc:runtime/one",
      "X-Sancho-Run-Capability": capability,
    },
  );
});

test("callback authority never forwards malformed credentials", () => {
  assert.deepEqual(
    callbackAuthorityHeaders({
      missionControlRunId: "run with spaces",
      runtimeToolCapability: "not-a-capability",
    }),
    {},
  );
});
