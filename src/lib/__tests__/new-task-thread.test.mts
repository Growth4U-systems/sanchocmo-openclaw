import { test } from "node:test";
import assert from "node:assert/strict";

const { buildNewTaskThread, instantiateEntry } = await import("../chat-openers");
const { ownerCheckFindings } = await import("../data/task-blueprints");

test("buildNewTaskThread → blank Sancho thread, ready to write", () => {
  const cfg = buildNewTaskThread("growth4u");
  assert.equal(cfg.threadName, "Nueva tarea");
  assert.equal(cfg.skill, "sancho-manager");
  assert.equal(cfg.agent, "sancho");
  assert.equal(cfg.docPath, null);
  assert.equal(cfg.threadState, "continue");
  // No initialMessage → chat-sidebar does NOT auto-send → input opens empty.
  assert.equal(cfg.initialMessage, undefined);
  assert.match(cfg.threadId, /^growth4u:new-task:\d+$/);
});

test("each call is a fresh thread (deterministic via nonce param)", () => {
  assert.equal(
    instantiateEntry("new-task", { slug: "growth4u", params: { nonce: "42" } }).threadId,
    "growth4u:new-task:42",
  );
});

test("owner-check clean (new-task: sancho-manager has no specialist owner)", () => {
  assert.deepEqual(ownerCheckFindings(), []);
});
