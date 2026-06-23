import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This test file lives at {worktree}/src/lib/data/__tests__/<file>.mts — derive
// the worktree root and the content-tasks module path from its own location so
// the child-process bypass test (which can't share this module's import-time
// env capture) resolves the real source files, not the throwaway tmp BASE.
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(THIS_DIR, "..", "..", "..", "..");
const CONTENT_TASKS_TS = path.join(WORKTREE_ROOT, "src", "lib", "data", "content-tasks.ts");

// content-tasks resolves BASE from MC_WORKSPACE at import time (paths.ts), and
// reads CONTENT_RESEARCH_GATE at import time too. Point BASE at a throwaway
// workspace and keep the gate ENABLED (the default) BEFORE importing — the
// `=off` bypass is exercised via a SEPARATE child process (see bottom test),
// because the flag is captured once at module load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ct-research-gate-"));
process.env.MC_WORKSPACE = tmp;
delete process.env.CONTENT_RESEARCH_GATE; // ensure default-ON for this module

type CtMod = typeof import("../content-tasks");
let setChannelPhase: CtMod["setChannelPhase"];
let setChannelPhases: CtMod["setChannelPhases"];
let findContentTask: CtMod["findContentTask"];
let countResearchSourceUrls: CtMod["countResearchSourceUrls"];
let ResearchGateError: CtMod["ResearchGateError"];

const SLUG = "gate-brand";
const PARENT_ID = "P-Content-Semana-01-T01";
const CT_ID = `${PARENT_ID}-C01`;
const IDEA_ID = "idea-2026-06-19-1";
const CHANNEL = "linkedin";

function brandDir() {
  return path.join(tmp, "brand", SLUG);
}
function ideaDir() {
  return path.join(brandDir(), "content", "drafts", IDEA_ID);
}

// research.md with the FAKED self-reported marker but 4 REAL distinct URLs —
// the gate must count the URLs and ignore the marker.
const RESEARCH_WITH_SOURCES = [
  "# Research — test",
  "<!-- generado | fuentes: 12 | búsquedas: 9 | qa-score: 8.5 -->",
  "",
  "## Executive Summary",
  "El dato se confirma.",
  "",
  "## Sources Index",
  "1. https://example.com/report-2026 (oficial)",
  "2. https://www.statista.com/chart/12345/topic — secundaria",
  "3. https://blog.hubspot.com/marketing/benchmark, citada en el cuerpo.",
  "4. https://news.ycombinator.com/item?id=99999",
  "",
].join("\n");

// FABRICATED-from-memory case: the agent faked a high `fuentes: 12` marker but
// the body carries ZERO real URLs (just prose). Must be rejected.
const RESEARCH_FAKED_MARKER_NO_URLS = [
  "# Research — test",
  "<!-- generado | fuentes: 12 | búsquedas: 9 | qa-score: 9.0 -->",
  "",
  "## Executive Summary",
  "Según mi conocimiento, el dato es correcto y hay estudios que lo respaldan.",
  "",
  "## Sources Index",
  "- Estudio interno (sin enlace)",
  "- Reporte de la industria 2026",
  "",
].join("\n");

/**
 * Seed a CT in `researching` with a fresh draft, optionally writing the 3
 * research artifacts. Mirrors the media-gate test's seedCt shape.
 */
function seedCt(opts: {
  researchBody?: string | null; // null/undefined → research.md NOT written
  writeQaReport?: boolean;
  writeResearchLog?: boolean;
}) {
  // Clean any prior run so "missing file" cases truly start empty.
  fs.rmSync(brandDir(), { recursive: true, force: true });

  const projDir = path.join(brandDir(), "projects", "P-Content-Semana-01");
  fs.mkdirSync(projDir, { recursive: true });
  const ct = {
    id: CT_ID,
    parent_task_id: PARENT_ID,
    idea_id: IDEA_ID,
    name: "Hot take post",
    status: "Approved",
    pipeline_state: "researching",
    target_channels: [CHANNEL],
    documents: [],
    channel_phases: { [CHANNEL]: "researching" },
    created_at: "2026-06-19T00:00:00Z",
    updated_at: "2026-06-19T00:00:00Z",
  };
  fs.writeFileSync(
    path.join(projDir, "tasks.json"),
    JSON.stringify([{ id: PARENT_ID, type: "content", content_tasks: [ct] }], null, 2),
  );

  fs.mkdirSync(ideaDir(), { recursive: true });
  if (opts.researchBody != null) {
    fs.writeFileSync(path.join(ideaDir(), "research.md"), opts.researchBody);
  }
  if (opts.writeQaReport) {
    fs.writeFileSync(path.join(ideaDir(), "QA-REPORT-research.md"), "verdict: PASS\nscore: 8.5\n");
  }
  if (opts.writeResearchLog) {
    const intelDir = path.join(brandDir(), "intelligence");
    fs.mkdirSync(intelDir, { recursive: true });
    fs.writeFileSync(
      path.join(intelDir, "research-log.json"),
      JSON.stringify([{ idea_id: IDEA_ID, at: "2026-06-19T00:00:00Z" }], null, 2),
    );
  }
}

/** All three artifacts present + ≥threshold real URLs — the happy path. */
function seedComplete() {
  seedCt({ researchBody: RESEARCH_WITH_SOURCES, writeQaReport: true, writeResearchLog: true });
}

before(async () => {
  ({ setChannelPhase, setChannelPhases, findContentTask, countResearchSourceUrls, ResearchGateError } =
    await import("../content-tasks"));
});

// ── countResearchSourceUrls (pure) ───────────────────────────────────────────

test("countResearchSourceUrls: counts distinct real URLs, ignores marker & dupes", () => {
  assert.equal(countResearchSourceUrls(RESEARCH_WITH_SOURCES), 4);
  // faked marker, zero real URLs
  assert.equal(countResearchSourceUrls(RESEARCH_FAKED_MARKER_NO_URLS), 0);
  // dedupe + trailing-punctuation/slash normalization → still 1
  const dup = "see https://a.com/x and https://a.com/x. and https://a.com/x/";
  assert.equal(countResearchSourceUrls(dup), 1);
  // a URL hidden inside the marker/comment must NOT count
  assert.equal(countResearchSourceUrls("<!-- src https://hidden.com/y -->"), 0);
  assert.equal(countResearchSourceUrls(""), 0);
  assert.equal(countResearchSourceUrls(null), 0);
});

// ── (a) gate enabled: 3 files + ≥threshold URLs → transition passes ───────────

beforeEach(() => seedComplete());

test("(a) all 3 artifacts + ≥threshold URLs → advances to clarify-needed", () => {
  const ct = setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "clarify-needed");
  assert.equal(ct.channel_phases?.[CHANNEL], "clarify-needed");
});

test("(a) all 3 artifacts + ≥threshold URLs → advances to drafting", () => {
  const ct = setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "drafting");
  assert.equal(ct.channel_phases?.[CHANNEL], "drafting");
});

test("(a) ungated phases (researching/draft) never blocked even with no research", () => {
  seedCt({ researchBody: null }); // nothing on disk
  // staying in researching is fine
  let ct = setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "researching");
  assert.equal(ct.channel_phases?.[CHANNEL], "researching");
  // `draft` (post-write) is intentionally NOT gated by research
  ct = setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "draft");
  assert.equal(ct.channel_phases?.[CHANNEL], "draft");
});

// ── (b) any file missing → ResearchGateError/422, phase NOT advanced ──────────

test("(b) research.md missing → ResearchGateError(422), phase unchanged", () => {
  seedCt({ researchBody: null, writeQaReport: true, writeResearchLog: true });
  let caught: unknown;
  try {
    setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "clarify-needed");
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof ResearchGateError, "expected ResearchGateError");
  assert.equal((caught as InstanceType<typeof ResearchGateError>).statusCode, 422);
  const ct = findContentTask(SLUG, PARENT_ID, CT_ID)!;
  assert.equal(ct.channel_phases?.[CHANNEL], "researching");
});

test("(b) QA-REPORT-research.md missing → 422, phase unchanged", () => {
  seedCt({ researchBody: RESEARCH_WITH_SOURCES, writeQaReport: false, writeResearchLog: true });
  assert.throws(
    () => setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "drafting"),
    ResearchGateError,
  );
  assert.equal(findContentTask(SLUG, PARENT_ID, CT_ID)!.channel_phases?.[CHANNEL], "researching");
});

test("(b) research-log.json missing → 422, phase unchanged", () => {
  seedCt({ researchBody: RESEARCH_WITH_SOURCES, writeQaReport: true, writeResearchLog: false });
  assert.throws(
    () => setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "clarify-needed"),
    ResearchGateError,
  );
  assert.equal(findContentTask(SLUG, PARENT_ID, CT_ID)!.channel_phases?.[CHANNEL], "researching");
});

test("(b) bulk setChannelPhases: missing artifact → blocks, phase unchanged", () => {
  seedCt({ researchBody: null, writeQaReport: true, writeResearchLog: true });
  assert.throws(
    () => setChannelPhases(SLUG, PARENT_ID, CT_ID, { [CHANNEL]: "clarify-needed" }),
    ResearchGateError,
  );
  assert.equal(findContentTask(SLUG, PARENT_ID, CT_ID)!.channel_phases?.[CHANNEL], "researching");
});

// ── (c) files present but faked marker / <threshold real URLs → 422 ───────────

test("(c) all 3 files but faked marker + 0 real URLs → 422 (fabrication rejected)", () => {
  seedCt({ researchBody: RESEARCH_FAKED_MARKER_NO_URLS, writeQaReport: true, writeResearchLog: true });
  let caught: unknown;
  try {
    setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "clarify-needed");
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof ResearchGateError, "expected ResearchGateError");
  assert.equal((caught as InstanceType<typeof ResearchGateError>).statusCode, 422);
  assert.equal(findContentTask(SLUG, PARENT_ID, CT_ID)!.channel_phases?.[CHANNEL], "researching");
});

test("(c) empty generate-drafts scaffold (headers, no URLs) → 422", () => {
  // Reproduces the scaffold written by generate-drafts.ts (no URLs).
  const scaffold = [
    "# Research — test",
    "",
    "_Pendiente._",
    "",
    "## Sources",
    "",
    "## Queries",
    "",
    "## Key findings",
    "",
  ].join("\n");
  seedCt({ researchBody: scaffold, writeQaReport: true, writeResearchLog: true });
  assert.throws(
    () => setChannelPhase(SLUG, PARENT_ID, CT_ID, CHANNEL, "drafting"),
    ResearchGateError,
  );
});

// ── (d) CONTENT_RESEARCH_GATE=off → bypass (passes regardless) ────────────────
// The flag is read once at module import, so this runs in a child process with
// the env set, against the same throwaway workspace seeded with NO research.

test("(d) CONTENT_RESEARCH_GATE=off → bypass even with NO research artifacts", async () => {
  seedCt({ researchBody: null }); // nothing on disk → would 422 if enabled

  const script = `
    import { setChannelPhase, findContentTask } from ${JSON.stringify(CONTENT_TASKS_TS)};
    const ct = setChannelPhase(${JSON.stringify(SLUG)}, ${JSON.stringify(PARENT_ID)}, ${JSON.stringify(
      CT_ID,
    )}, ${JSON.stringify(CHANNEL)}, "clarify-needed");
    if (ct.channel_phases?.[${JSON.stringify(CHANNEL)}] !== "clarify-needed") {
      console.error("BYPASS-FAILED:" + ct.channel_phases?.[${JSON.stringify(CHANNEL)}]);
      process.exit(1);
    }
    // confirm persisted
    const reread = findContentTask(${JSON.stringify(SLUG)}, ${JSON.stringify(PARENT_ID)}, ${JSON.stringify(
      CT_ID,
    )});
    if (reread?.channel_phases?.[${JSON.stringify(CHANNEL)}] !== "clarify-needed") {
      console.error("PERSIST-FAILED");
      process.exit(1);
    }
    console.log("BYPASS-OK");
  `;

  const { execFileSync } = await import("node:child_process");
  // Resolve tsx relative to the worktree root (node_modules is a symlink).
  const tsxBin = path.join(WORKTREE_ROOT, "node_modules", ".bin", "tsx");
  const out = execFileSync(tsxBin, ["--eval", script], {
    env: {
      ...process.env,
      MC_WORKSPACE: tmp,
      CONTENT_RESEARCH_GATE: "off",
    },
    encoding: "utf-8",
    cwd: WORKTREE_ROOT,
  });
  assert.match(out, /BYPASS-OK/);
});
