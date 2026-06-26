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

/** Seed a SKILL.md for `demo-skill` with the given `context_writes` entries
 *  (used to exercise the ADVISORY path). */
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
  fs.rmSync(path.join(tmp, "campaigns"), { recursive: true, force: true });
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

// ── HARD floor: the task's own deliverable_file ──────────────────────────────

test("deliverable present + non-empty → ok, stamped", () => {
  writeRel(`brand/${SLUG}/out/result.md`, "# real content\n");
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    status: "completed",
    deliverableFiles: [`brand/${SLUG}/out/result.md`],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.checkedOutputs.length, 1);
  assert.equal(r.stamp.skill, SKILL);
  assert.match(r.stamp.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(r.enforced, true);
});

test("deliverable missing → MISSING_OUTPUT (hard, blocks)", () => {
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, deliverableFiles: [`brand/${SLUG}/out/result.md`] });
  assert.equal(r.ok, false);
  assert.equal(r.reasons.length, 1);
  assert.equal(r.reasons[0].code, "MISSING_OUTPUT");
});

test("deliverable empty (0 bytes) → EMPTY_OUTPUT", () => {
  writeRel(`brand/${SLUG}/out/result.md`, "");
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, deliverableFiles: [`brand/${SLUG}/out/result.md`] });
  assert.equal(r.ok, false);
  assert.equal(r.reasons[0].code, "EMPTY_OUTPUT");
});

test("deliverable is a non-empty DIRECTORY (no trailing slash) → pass", () => {
  // A deliverable_file may point at a directory of outputs (old check used
  // existsSync, which accepted dirs). The gate must accept a non-empty dir.
  writeRel(`brand/${SLUG}/research-raw/source-1.md`, "x");
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, deliverableFiles: [`brand/${SLUG}/research-raw`] });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.checkedOutputs[0], `brand/${SLUG}/research-raw/`);
});

test("deliverable resolving only to a preliminary lite.md → MISSING (not 'done')", () => {
  // Declared canonical pillar.current.md was never written; only a kickoff
  // lite.md stub exists. The resolver's lite fallback must NOT pass the gate.
  writeRel(`brand/${SLUG}/pillar/lite.md`, "preliminary stub");
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    deliverableFiles: [`brand/${SLUG}/pillar/pillar.current.md`],
  });
  assert.equal(r.ok, false);
  assert.equal(r.reasons[0].code, "MISSING_OUTPUT");
});

test("canonical-alias drift (declared x.current.md, disk has bare current.md) → pass", () => {
  // This fallback is the SAME logical doc (legacy/canonical rename) — must pass.
  writeRel(`brand/${SLUG}/pillar/current.md`, "real content");
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    deliverableFiles: [`brand/${SLUG}/pillar/pillar.current.md`],
  });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
});

// ── ADVISORY: the skill's generic context_writes never blocks (the #1 fix) ───

test("slug-only context_writes missing → ok (advisory, NOT blocked)", () => {
  // Reproduces the false-positive: skill declares campaigns/ + a slug-only file,
  // this task produced its own deliverable but not those. Must NOT block.
  writeSkill([`campaigns/`, `brand/{slug}/operational/assets.md`]);
  writeRel(`brand/${SLUG}/out/post.md`, "the actual deliverable");
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    status: "completed",
    deliverableFiles: [`brand/${SLUG}/out/post.md`],
  });
  assert.equal(r.ok, true, "skill-generic context_writes must never block");
  assert.deepEqual(r.reasons, []);
  assert.equal(r.advisories.length, 2, "missing context_writes surface as advisories");
  assert.ok(r.advisories.every((a) => a.code === "MISSING_OUTPUT"));
});

test("context_writes present → no advisory, counted in checkedOutputs", () => {
  writeSkill([`brand/{slug}/operational/learnings.md`]);
  writeRel(`brand/${SLUG}/operational/learnings.md`, "notes");
  writeRel(`brand/${SLUG}/out/post.md`, "deliverable");
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    deliverableFiles: [`brand/${SLUG}/out/post.md`],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.advisories, []);
  assert.equal(r.checkedOutputs.length, 2);
});

// ── false-positive guards: placeholders + globs are SKIPPED ───────────────────

test("unresolved placeholder ({ideaId}) → skipped, not blocking", () => {
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, deliverableFiles: [`brand/${SLUG}/drafts/{ideaId}/post.md`] });
  assert.equal(r.ok, true);
  assert.equal(r.reasons.length, 0);
  assert.equal(r.skippedOutputs.length, 1);
});

test("placeholder resolves when its value is supplied via vars", () => {
  writeRel(`brand/${SLUG}/drafts/idea-7/post.md`, "draft");
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    deliverableFiles: [`brand/${SLUG}/drafts/{ideaId}/post.md`],
    vars: { ideaId: "idea-7" },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.checkedOutputs.length, 1);
});

test("vars value containing '$' substitutes LITERALLY (no regex specials)", () => {
  // A '$1'/'$&' in a value must not be interpreted as a replacement special.
  writeRel(`brand/${SLUG}/drafts/a$1b/post.md`, "draft");
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    deliverableFiles: [`brand/${SLUG}/drafts/{ideaId}/post.md`],
    vars: { ideaId: "a$1b" },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.checkedOutputs.length, 1);
});

test("glob entry (*.json) → skipped, never blocking", () => {
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, deliverableFiles: [`brand/${SLUG}/data/*.json`] });
  assert.equal(r.ok, true);
  assert.equal(r.skippedOutputs.length, 1);
});

test("non-brand-root directory (campaigns/) resolves against BASE, not brand/", () => {
  writeSkill([`campaigns/`]);
  writeRel(`campaigns/2026-06.md`, "x");
  writeRel(`brand/${SLUG}/out/post.md`, "deliverable");
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, deliverableFiles: [`brand/${SLUG}/out/post.md`] });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.ok(r.checkedOutputs.includes("campaigns/"));
});

test("inline annotation is stripped before resolving", () => {
  writeRel(`brand/${SLUG}/out/result.md`, "content");
  const r = evaluateDeliverableDone({
    slug: SLUG,
    skill: SKILL,
    deliverableFiles: [`brand/${SLUG}/out/result.md  (frontmatter via API)`],
  });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.equal(r.checkedOutputs.length, 1);
});

// ── status + step validation (HARD) ──────────────────────────────────────────

test("invalid status → INVALID_STATUS; legacy alias + canonical pass", () => {
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

// ── N/A: nothing declared ────────────────────────────────────────────────────

test("no deliverableFiles and no context_writes → pass (N/A)", () => {
  writeSkill([]);
  const r = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, status: "completed" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.checkedOutputs, []);
});

// ── assert vs evaluate (contract + idempotency) ──────────────────────────────

test("assertDeliverableDone throws DoneGateError(422) on hard fail; evaluate returns same", () => {
  let caught: unknown;
  try {
    assertDeliverableDone({ slug: SLUG, skill: SKILL, status: "completed", deliverableFiles: [`brand/${SLUG}/missing.md`] });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof DoneGateError, "expected DoneGateError");
  assert.equal((caught as InstanceType<typeof DoneGateError>).statusCode, 422);
  const a = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, deliverableFiles: [`brand/${SLUG}/missing.md`] });
  const b = evaluateDeliverableDone({ slug: SLUG, skill: SKILL, deliverableFiles: [`brand/${SLUG}/missing.md`] });
  assert.equal(a.ok, false);
  assert.deepEqual(a.reasons, b.reasons);
});

// ── DONE_GATE=off → audit-only bypass (child process; flag captured at import) ─

test("DONE_GATE=off → assert does NOT throw, enforced=false", async () => {
  const script = `
    import { assertDeliverableDone } from ${JSON.stringify(DONE_GATE_TS)};
    const r = assertDeliverableDone({ slug: ${JSON.stringify(SLUG)}, skill: ${JSON.stringify(
      SKILL,
    )}, status: "completed", deliverableFiles: [${JSON.stringify(`brand/${SLUG}/missing.md`)}] });
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
