import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callbackAuthorityHeaders,
  terminalCallbackAuthorityHeaders,
} from "./callback-authority.mjs";

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

test("terminal authority is isolated from progress headers and expires closed", () => {
  const message = {
    missionControlRunId: "run-terminal-1",
    runtimeToolCapability: "c".repeat(64),
    runtimeTerminalCallbackGrant: `${"a".repeat(24)}.${"b".repeat(43)}`,
    runtimeTerminalCallbackGrantExpiresAt: "2026-07-23T12:00:00.000Z",
  };
  assert.equal(
    callbackAuthorityHeaders(message)["X-Sancho-Terminal-Callback-Grant"],
    undefined,
  );
  assert.equal(
    terminalCallbackAuthorityHeaders(
      message,
      Date.parse("2026-07-22T12:00:00.000Z"),
    )["X-Sancho-Terminal-Callback-Grant"],
    message.runtimeTerminalCallbackGrant,
  );
  assert.deepEqual(
    terminalCallbackAuthorityHeaders(
      message,
      Date.parse("2026-07-23T12:00:00.000Z"),
    ),
    {},
  );
});
