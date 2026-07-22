import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeEffectTurnArbitrator } from "../runtime-effect-turn.js";

const leads = {
  name: "leads_search_start",
  arguments: { criteria: { titles: ["Founder"] }, limit: 5 },
};
const partnerships = {
  name: "partnerships_discovery_start",
  arguments: { plan: { title: "Partners" } },
};

test("a later OpenClaw route removes an effect buffered in an earlier delivery", () => {
  const turn = createRuntimeEffectTurnArbitrator();
  assert.deepEqual(turn.observe({ effects: [leads] }), {
    acceptedCount: 1,
    blockedCount: 0,
  });
  assert.equal(turn.hasPendingEffect(), true);
  assert.deepEqual(turn.observe({ controlAction: true }), {
    acceptedCount: 0,
    blockedCount: 1,
  });
  assert.equal(turn.appendToCallback("Voy a mover la tarea."), "Voy a mover la tarea.");
});

test("an earlier OpenClaw route blocks a later effect delivery", () => {
  const turn = createRuntimeEffectTurnArbitrator();
  turn.observe({ controlAction: true });
  assert.deepEqual(turn.observe({ effects: [leads] }), {
    acceptedCount: 0,
    blockedCount: 1,
  });
  assert.equal(turn.hasPendingEffect(), false);
});

test("an effect-only OpenClaw turn forwards one closed marker to the shared webhook", () => {
  const turn = createRuntimeEffectTurnArbitrator();
  assert.deepEqual(turn.observe({ effects: [leads, partnerships] }), {
    acceptedCount: 1,
    blockedCount: 1,
  });
  const callback = turn.appendToCallback("He preparado la solicitud.");
  assert.match(callback, /^He preparado la solicitud\./);
  assert.equal((callback.match(/:::sancho-effect/g) || []).length, 1);
  assert.match(callback, /"name":"leads_search_start"/);
  assert.doesNotMatch(callback, /partnerships_discovery_start/);
});
