import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// done-gate resolves BASE from MC_WORKSPACE (paths.ts) and reads its skills root
// from OPENCLAW_HOME — both at import time — and captures DONE_GATE at module
// load. Point BASE + OPENCLAW_HOME at throwaway dirs and keep the gate ENABLED
// (the default) BEFORE importing; the `=off` bypass is a SEPARATE child process
// (bottom test), because the flag is captured once at module load.
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(THIS_DIR, "..", "..", "..", "..");
const DONE_GATE_TS = path.join(WORKTREE_ROOT, "src", "lib", "qa", "done-gate.ts");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-done-gate-"));
const openclawHome = path.join(tmp, "openclaw-home");
process.env.MC_WORKSPACE = tmp;
process.env.OPENCLAW_HOME = openclawHome;
delete process.env.DONE_GATE; // ensure default-ON for this module

type GateMod = typeof import("../done-gate");
let evaluateDeliverableDone: GateMod["evaluateDeliverableDone"];
let assertDeliverableDone: GateMod["assertDeliverableDone"];
let DoneGateError: GateMod["DoneGateError"];

const SLUG = "gate-brand";
const SKILL = "demo-skill";

function brandDir() {
  return path.join(tmp, "brand", SLUG);
}
function skillDir() {
  return path.join(openclawHome, "skills", SKILL);
}

/** Seed a SKILL.md for `demo-skill` with the given `context_writes` entries. */
function writeSkill(contextWrites: string[]) {
  fs.mkdirSync(skillDir(), { recursive: true });
  const fm = [
    "---",
    `name: ${SKILL}`,
    "description: demo skill for the done-gate test",
    "context_writes:",
    ...contextWrites.map((w) => `  - ${w}`),
    "---",
    "",
    "# Demo skill body",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(skillDir(), "SKILL.md"), fm);
}

/** Write a workspace-relative file with content (creating parent dirs). */
function writeRel(rel: string, content: string) {
  const abs = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function reset() {
  fs.rmSync(brandDir(), { recursive: true, force: true });
  fs.rmSync(skillDir(), { recursive: true, force: true });
}

before(async () => {
  ({ evaluateDeliverableDone, assertDeliverableDone, DoneGateError } = await import("../done-gate"));
});

beforeEach(() => reset());

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

// ── happy path ───────────────────────────────────────────────────────────────

test("declared context_writes present + non-empty → ok, stamped", () => {
  writeSkill([`brand/{slug}/out/result.md`]);
  writeRel(`brand/${SLUG}/out/result.md`, "# real content\n");
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, status: "completed" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.checkedOutputs.length, 1);
  assert.equal(r.stamp.skill, SKILL);
  assert.match(r.stamp.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(r.enforced, true);
});

// ── (a) missing / empty outputs ──────────────────────────────────────────────

test("declared output file missing → MISSING_OUTPUT", () => {
  writeSkill([`brand/{slug}/out/result.md`]); // file never written
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL });
  assert.equal(r.ok, false);
  assert.equal(r.reasons.length, 1);
  assert.equal(r.reasons[0].code, "MISSING_OUTPUT");
});

test("declared output file empty (0 bytes) → EMPTY_OUTPUT", () => {
  writeSkill([`brand/{slug}/out/result.md`]);
  writeRel(`brand/${SLUG}/out/result.md`, ""); // 0 bytes
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL });
  assert.equal(r.ok, false);
  assert.equal(r.reasons[0].code, "EMPTY_OUTPUT");
});

test("directory output non-empty → pass; empty → EMPTY_OUTPUT", () => {
  writeSkill([`brand/{slug}/research-raw/`]);
  // empty dir
  fs.mkdirSync(path.join(brandDir(), "research-raw"), { recursive: true });
  let r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL });
  assert.equal(r.ok, false);
  assert.equal(r.reasons[0].code, "EMPTY_OUTPUT");
  // now non-empty
  writeRel(`brand/${SLUG}/research-raw/source-1.md`, "x");
  r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL });
  assert.equal(r.ok, true);
  assert.equal(r.checkedOutputs[0], `brand/${SLUG}/research-raw/`);
});

test("non-brand-root directory (campaigns/) resolves against BASE, not brand/", () => {
  writeSkill([`campaigns/`]);
  fs.mkdirSync(path.join(tmp, "campaigns"), { recursive: true });
  writeRel(`campaigns/2026-06.md`, "x");
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.checkedOutputs[0], "campaigns/");
});

// ── false-positive guards: unresolved placeholders + globs are SKIPPED ────────

test("unresolved placeholder ({ideaId}) → skipped, not blocking", () => {
  writeSkill([`brand/{slug}/drafts/{ideaId}/post.md`]);
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL });
  assert.equal(r.ok, true);
  assert.equal(r.reasons.length, 0);
  assert.equal(r.skippedOutputs.length, 1);
});

test("placeholder resolves when its value is supplied via vars", () => {
  writeSkill([`brand/{slug}/drafts/{ideaId}/post.md`]);
  writeRel(`brand/${SLUG}/drafts/idea-7/post.md`, "draft");
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, vars: { ideaId: "idea-7" } });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.checkedOutputs.length, 1);
  assert.equal(r.skippedOutputs.length, 0);
});

test("glob entry (*.json) → skipped, never blocking", () => {
  writeSkill([`brand/{slug}/data/*.json`]);
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL });
  assert.equal(r.ok, true);
  assert.equal(r.skippedOutputs.length, 1);
});

test("inline annotation is stripped before resolving", () => {
  writeSkill([`brand/{slug}/out/result.md  (frontmatter via API)`]);
  writeRel(`brand/${SLUG}/out/result.md`, "content");
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.checkedOutputs.length, 1);
});

// ── status + step validation ─────────────────────────────────────────────────

test("invalid status → INVALID_STATUS; legacy alias + canonical pass", () => {
  // no SKILL.md → no outputs → only the status check runs
  const bad = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, status: "shipped" });
  assert.equal(bad.ok, false);
  assert.equal(bad.reasons[0].code, "INVALID_STATUS");
  assert.equal(evaluateDeliverableDone({ slug: SLUG, skill: SKILL, status: "done" }).ok, true);
  assert.equal(evaluateDeliverableDone({ slug: SLUG, skill: SKILL, status: "completed" }).ok, true);
});

test("invalid step → INVALID_STEP; concrete pipeline step passes", () => {
  assert.equal(
    evaluateDeliverableDone({ slug: SLUG, skill: SKILL, step: "frobnicate" }).reasons[0]?.code,
    "INVALID_STEP",
  );
  assert.equal(evaluateDeliverableDone({ slug: SLUG, skill: SKILL, step: "drafting" }).ok, true);
});

// ── N/A: a skill that writes nothing ─────────────────────────────────────────

test("skill with no context_writes and no deliverableFiles → pass (N/A)", () => {
  writeSkill([]); // empty context_writes
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, status: "completed" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.checkedOutputs, []);
});

// ── deliverableFiles checked verbatim, independent of the skill ───────────────

test("deliverableFiles param is checked verbatim (missing → MISSING_OUTPUT)", () => {
  // no SKILL.md; the explicit deliverable doesn't exist
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    deliverableFiles: [`brand/${SLUG}/explicit/missing.md`],
  });
  assert.equal(r.ok, false);
  assert.equal(r.reasons[0].code, "MISSING_OUTPUT");
});

// ── assert vs evaluate (contract + idempotency) ──────────────────────────────

test("assertDeliverableDone throws DoneGateError(422); evaluate returns same result", () => {
  writeSkill([`brand/{slug}/out/result.md`]); // missing
  let caught: unknown;
  try {
    assertDeliverableDone({ slug: SLUG, skill: SKILL, status: "completed" });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof DoneGateError, "expected DoneGateError");
  assert.equal((caught as InstanceType<typeof DoneGateError>).statusCode, 422);
  // evaluate is non-throwing + idempotent
  const a = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, status: "completed" });
  const b = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, status: "completed" });
  assert.equal(a.ok, false);
  assert.deepEqual(a.reasons, b.reasons);
});

// ── DONE_GATE=off → audit-only bypass (child process; flag captured at import) ─

test("DONE_GATE=off → assert does NOT throw, enforced=false", async () => {
  writeSkill([`brand/{slug}/out/result.md`]); // missing → would 422 if enforced

  const script = `
    import { assertDeliverableDone } from ${JSON.stringify(DONE_GATE_TS)};
    const r = assertDeliverableDone({ slug: ${JSON.stringify(SLUG)}, skill: ${JSON.stringify(
      SKILL,
    )}, status: "completed" });
    if (r.enforced) { console.error("ENFORCED-TRUE"); process.exit(1); }
    if (r.ok) { console.error("UNEXPECTED-OK"); process.exit(1); }
    console.log("BYPASS-OK");
  `;

  const { execFileSync } = await import("node:child_process");
  const tsxBin = path.join(WORKTREE_ROOT, "node_modules", ".bin", "tsx");
  const out = execFileSync(tsxBin, ["--eval", script], {
    env: {
      ...process.env,
      MC_WORKSPACE: tmp,
      OPENCLAW_HOME: openclawHome,
      DONE_GATE: "off",
    },
    encoding: "utf-8",
    cwd: WORKTREE_ROOT,
  });
  assert.match(out, /BYPASS-OK/);
});
