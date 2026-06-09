import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTransport } from "../publish/registry";

test("resolveTransport returns the slack transport", () => {
  const t = resolveTransport("slack");
  assert.equal(t.name, "slack");
  assert.equal(typeof t.publish, "function");
});

test("resolveTransport throws an actionable error for unregistered transports", () => {
  assert.throws(() => resolveTransport("discord"), /not available/);
  assert.throws(() => resolveTransport("telegram"), /slack/); // lists what IS registered
});
