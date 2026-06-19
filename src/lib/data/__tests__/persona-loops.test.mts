import { test, before } from "node:test";
import assert from "node:assert/strict";
import type { ContentTask } from "@/types";

// Source modules are CJS under this tsx test runner; follow the repo
// convention of importing them dynamically (see client-access.test.mts).
type Mod = typeof import("../persona-loops");
let personaId: Mod["personaId"];
let suggestAuthor: Mod["suggestAuthor"];
let buildPersonaLoops: Mod["buildPersonaLoops"];

before(async () => {
  ({ personaId, suggestAuthor, buildPersonaLoops } = await import("../persona-loops"));
});

const ct = (over: Partial<ContentTask>): ContentTask => ({
  id: "x", idea_id: "x", name: "n", status: "New",
  target_channels: ["linkedin"], documents: [], created_at: "", ...over,
});

test("personaId prefers explicit id, falls back to slug of name", () => {
  assert.equal(personaId({ id: "alfonso", name: "Alfonso S.B." }), "alfonso");
  assert.equal(personaId({ name: "Martín Pérez" }), "martin-perez");
});

test("suggestAuthor matches pillars_slant keyword against title/angle", () => {
  const personas = [
    { id: "alfonso", name: "Alfonso", pillars_slant: ["AI agents", "growth ops"] },
    { id: "martin", name: "Martín", pillars_slant: ["pricing", "fundraising"] },
  ];
  assert.equal(
    suggestAuthor({ title: "Why AI agents change ops", angle_draft: "" }, personas),
    "alfonso"
  );
  assert.equal(
    suggestAuthor({ title: "Our pricing experiment", angle_draft: "" }, personas),
    "martin"
  );
});

test("suggestAuthor returns null when nothing matches", () => {
  const personas = [{ id: "alfonso", name: "Alfonso", pillars_slant: ["AI agents"] }];
  assert.equal(suggestAuthor({ title: "Holiday recap", angle_draft: "" }, personas), null);
});

test("suggestAuthor returns null when no personas have slants", () => {
  assert.equal(suggestAuthor({ title: "AI agents", angle_draft: "" }, [{ id: "a", name: "A" }]), null);
});

test("buildPersonaLoops groups CTs by author and counts the unassigned pool", () => {
  const personas = [
    { id: "alfonso", name: "Alfonso", role: "CMO", pillars_slant: ["AI agents"] },
    { id: "martin", name: "Martín" },
  ];
  const cts = [
    ct({ author: "alfonso", status: "New" }),
    ct({ author: "alfonso", status: "Approved" }),
    ct({ author: "martin", status: "Ready" }),
    ct({ status: "New" }), // unassigned
  ];
  const out = buildPersonaLoops(cts, personas);
  assert.equal(out.unassignedPool, 1);
  const alfonso = out.personas.find((p) => p.id === "alfonso")!;
  assert.equal(alfonso.stages.ideation.newCount, 1);
  assert.equal(alfonso.stages.ideation.approvedCount, 1);
  assert.equal(alfonso.role, "CMO");
  assert.deepEqual(alfonso.pillarsSlant, ["AI agents"]);
  const martin = out.personas.find((p) => p.id === "martin")!;
  assert.equal(martin.stages.creation.readyCount, 1);
  assert.equal(martin.role, null);
});

test("buildPersonaLoops surfaces nextAction for a persona with pending approvals", () => {
  const out = buildPersonaLoops([ct({ author: "a", status: "New" })], [{ id: "a", name: "A" }]);
  assert.equal(out.personas[0].nextAction?.focusStatus, "New");
});

test("buildPersonaLoops with no personas yields empty personas and pool = all CTs", () => {
  const out = buildPersonaLoops([ct({}), ct({})], []);
  assert.deepEqual(out.personas, []);
  assert.equal(out.unassignedPool, 2);
});
