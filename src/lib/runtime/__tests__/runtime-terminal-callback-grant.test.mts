import assert from "node:assert/strict";
import test from "node:test";
import {
  issueRuntimeTerminalCallbackGrant,
  verifyRuntimeTerminalCallbackGrant,
} from "../runtime-terminal-callback-grant";

const secret = "terminal-grant-test-secret-".padEnd(64, "x");
const now = new Date("2026-07-22T12:00:00.000Z");
const input = {
  parentAgentRunId: "run-parent-1",
  dispatchRunId: "dispatch-1",
  runtimeId: "openclaw",
  runtimeToolCapability: "a".repeat(64),
  transportSecretSha256: "c".repeat(64),
};
const expected = { ...input, parentCreatedAt: now.toISOString() };

test("terminal callback grant is scoped and survives the dispatch lease window", () => {
  const issued = issueRuntimeTerminalCallbackGrant(input, {
    secret,
    now: () => now,
  });
  assert.equal(issued.expiresAt, "2026-07-23T13:00:00.000Z");
  assert.equal(
    verifyRuntimeTerminalCallbackGrant(issued.token, expected, {
      secret,
      now: () => new Date(now.getTime() + 61_000),
    }),
    true,
  );
  assert.equal(
    verifyRuntimeTerminalCallbackGrant(
      issued.token,
      { ...expected, parentAgentRunId: "run-parent-2" },
      { secret, now: () => now },
    ),
    false,
  );
  assert.equal(
    verifyRuntimeTerminalCallbackGrant(
      issued.token,
      { ...expected, runtimeToolCapability: "b".repeat(64) },
      { secret, now: () => now },
    ),
    false,
  );
  assert.equal(
    verifyRuntimeTerminalCallbackGrant(
      issued.token,
      { ...expected, transportSecretSha256: "d".repeat(64) },
      { secret, now: () => now },
    ),
    false,
  );
});

test("terminal callback grant rejects tampering, expiry and weak signing configuration", () => {
  const issued = issueRuntimeTerminalCallbackGrant(input, {
    secret,
    now: () => now,
    ttlMs: 1_000,
  });
  assert.equal(
    verifyRuntimeTerminalCallbackGrant(`${issued.token}x`, expected, {
      secret,
      now: () => now,
    }),
    false,
  );
  assert.equal(
    verifyRuntimeTerminalCallbackGrant(issued.token, expected, {
      secret,
      now: () => new Date(now.getTime() + 2_000),
    }),
    false,
  );
  assert.throws(
    () => issueRuntimeTerminalCallbackGrant(input, { secret: "too-short" }),
    /secret_unavailable/,
  );
});
