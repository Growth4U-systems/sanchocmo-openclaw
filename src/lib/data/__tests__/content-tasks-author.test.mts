import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// loadUnifiedContentTasks resolves BASE from MC_WORKSPACE at import time
// (paths.ts). Point it at a throwaway workspace BEFORE importing the module.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ct-author-"));
process.env.MC_WORKSPACE = tmp;

type FlatMod = typeof import("../content-tasks-flat");
type PersMod = typeof import("../persona-loops");
let loadUnifiedContentTasks: FlatMod["loadUnifiedContentTasks"];
let buildPersonaLoops: PersMod["buildPersonaLoops"];

const SLUG = "demo-personas";

before(async () => {
  // Seed an idea-queue.json where ideas carry `author` — the founder-led case.
  const dir = path.join(tmp, "brand", SLUG, "content");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "idea-queue.json"),
    JSON.stringify([
      { id: "idea-1", title: "AI agents post", target_channel: "linkedin", status: "New", author: "alfonso", created_at: "2026-06-11T00:00:00Z" },
      { id: "idea-2", title: "Pricing thread", target_channel: "linkedin", status: "Approved", author: "martin", created_at: "2026-06-11T00:00:00Z" },
      { id: "idea-3", title: "Unrouted idea", target_channel: "linkedin", status: "New", created_at: "2026-06-11T00:00:00Z" },
    ]),
  );
  ({ loadUnifiedContentTasks } = await import("../content-tasks-flat"));
  ({ buildPersonaLoops } = await import("../persona-loops"));
});

test("author survives idea-queue → unified ContentTask (SAN-163 regression)", () => {
  const cts = loadUnifiedContentTasks(SLUG);
  const byId = Object.fromEntries(cts.map((c) => [c.id, c]));
  // The bug this guards: `author` was dropped by the idea→CT mapping because it
  // wasn't in IDEA_DISCOVERY_FIELDS, so assignment silently did nothing.
  assert.equal(byId["idea-1"].author, "alfonso");
  assert.equal(byId["idea-2"].author, "martin");
  assert.equal(byId["idea-3"].author, undefined);
});

test("buildPersonaLoops groups the loaded CTs by their surviving author", () => {
  const cts = loadUnifiedContentTasks(SLUG).filter((c) => c.target_channel === "linkedin" || c.target_channels?.includes("linkedin"));
  const out = buildPersonaLoops(cts, [
    { id: "alfonso", name: "Alfonso" },
    { id: "martin", name: "Martín" },
  ]);
  assert.equal(out.unassignedPool, 1); // idea-3
  assert.equal(out.personas.find((p) => p.id === "alfonso")!.stages.ideation.newCount, 1);
  assert.equal(out.personas.find((p) => p.id === "martin")!.stages.ideation.approvedCount, 1);
});
