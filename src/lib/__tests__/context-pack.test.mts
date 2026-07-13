import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * SAN-246 — assembleContextPack grounds a directly-dispatched specialist or
 * fails loud when there is no Foundation. Three cases exercised:
 *   (a) canonical layout (`x.current.md`)  → verdict=ok + resolved abs paths
 *   (b) legacy bare layout (`current.md`)  → resolver maps the drift, verdict=ok
 *   (c) brand absent on disk               → verdict=missing
 *
 * Both MC_WORKSPACE (BASE, resolved at import-time) and OPENCLAW_HOME (the
 * skills catalog root that context-pack reads `context_required` from) must be
 * set BEFORE importing the module — same discipline as
 * brand-brain-assembler.test.mts.
 */

let workspace: string;
let openclawHome: string;
let mod: typeof import("../data/context-pack");

const SKILL = "content-strategy";
const DIR_SKILL = "discovery-runner-test";
const GLOB_SKILL = "glob-context-test";

// The skill's `context_required` (canonical filenames). The resolver must map
// these to whatever the brand actually has on disk (canonical or legacy bare).
const CONTEXT_REQUIRED = [
  "brand/{slug}/company-brief/company-brief.current.md",
  "brand/{slug}/brand-book/brand-voice/brand-voice.current.md",
  "brand/{slug}/go-to-market/ecps/ecps.current.md",
];

function writeBrandFile(slug: string, rel: string, content: string) {
  const abs = path.join(workspace, "brand", slug, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const COMPANY_BRIEF = [
  "# Company Brief — Acme Corp",
  "",
  "## 1. La Empresa",
  "**Tipo:** SaaS B2B",
  "**Modelo:** Suscripción mensual para pymes",
  "",
  "## 3. Cliente Ideal",
  "**En una frase:** Pymes industriales que digitalizan compras.",
].join("\n");

before(async () => {
  workspace = mkdtempSync(path.join(tmpdir(), "context-pack-ws-"));
  openclawHome = mkdtempSync(path.join(tmpdir(), "context-pack-home-"));
  process.env.MC_WORKSPACE = workspace;
  process.env.OPENCLAW_HOME = openclawHome;

  function writeSkill(skill: string, contextRequired: string[]) {
    const skillMd = [
      "---",
      `name: ${skill}`,
      'description: "test skill"',
      "context_required:",
      ...contextRequired.map((p) => `- ${p}`),
      "---",
      "",
      "# Body",
    ].join("\n");
    const skillDir = path.join(openclawHome, "skills", skill);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, "SKILL.md"), skillMd);
  }

  // Seed the skill catalog: SKILL.md files with `context_required` lists.
  writeSkill(SKILL, CONTEXT_REQUIRED);
  writeSkill(DIR_SKILL, ["brand/{slug}/outreach/searches/"]);
  writeSkill(GLOB_SKILL, [
    "brand/{slug}/company-brief/company-brief.current.md",
    "brand/{slug}/go-to-market/positioning/*/*.current.md",
    "brand/{slug}/brand-book/brand-voice/brand-voice.current.md",
    "brand/{slug}/integrations.json",
  ]);

  mod = await import("../data/context-pack");
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(openclawHome, { recursive: true, force: true });
});

test("(a) canonical layout → verdict=ok + resolved absolute paths", () => {
  const slug = "acme";
  writeBrandFile(slug, "company-brief/company-brief.current.md", COMPANY_BRIEF);
  writeBrandFile(slug, "brand-book/brand-voice/brand-voice.current.md", "# Voice\nClaro y directo.");
  writeBrandFile(slug, "go-to-market/ecps/ecps.current.md", "# ECPs\n- ECP1");

  const pack = mod.assembleContextPack(slug, SKILL);

  assert.equal(pack.verdict, "ok");
  assert.equal(pack.brandFound, true);
  assert.equal(pack.docPaths.length, 3, "all 3 required docs resolved");
  assert.equal(pack.documents.length, 3, "all 3 required docs embedded");
  assert.deepEqual(pack.missingRequired, []);
  // Resolved paths are ABSOLUTE and point inside the seeded workspace.
  for (const p of pack.docPaths) {
    assert.ok(path.isAbsolute(p), `path is absolute: ${p}`);
    assert.ok(p.startsWith(workspace), `path under workspace: ${p}`);
  }
  const brief = pack.documents.find((doc) => doc.path.endsWith("company-brief.current.md"));
  assert.equal(brief?.kind, "file");
  assert.match(brief?.content || "", /Acme Corp/);
  // Summary is self-sufficient grounding parsed from the company-brief.
  assert.match(pack.summary, /Acme Corp/);
  assert.match(pack.summary, /SaaS B2B/);
  assert.match(pack.summary, /Pymes industriales/);
  assert.match(pack.summary, /Contexto Foundation: disponible/);
  assert.match(pack.summary, /no interpretes este contador como ausencia de contexto/);
});

test("(b) legacy bare `current.md` layout → resolver maps the drift, verdict=ok", () => {
  const slug = "legacyco";
  // Files on disk use the LEGACY bare `current.md` names, but the skill's
  // context_required asks for the canonical `x.current.md` names. The
  // documents resolver (currentAliasFallback) must bridge the gap.
  writeBrandFile(slug, "company-brief/current.md", COMPANY_BRIEF);
  writeBrandFile(slug, "brand-book/brand-voice/current.md", "# Voice");
  writeBrandFile(slug, "go-to-market/ecps/current.md", "# ECPs");

  const pack = mod.assembleContextPack(slug, SKILL);

  assert.equal(pack.verdict, "ok", "legacy bare layout still resolves to ok");
  assert.equal(pack.docPaths.length, 3, "resolver mapped all 3 despite drift");
  assert.equal(pack.documents.length, 3);
  for (const p of pack.docPaths) {
    assert.ok(p.startsWith(workspace), `path under workspace: ${p}`);
    // Resolved to the bare legacy filename that actually exists on disk.
    assert.match(p, /\/current\.md$/, `resolved to legacy bare file: ${p}`);
  }
});

test("partial: some required docs present, some missing → verdict=partial", () => {
  const slug = "partialco";
  writeBrandFile(slug, "company-brief/company-brief.current.md", COMPANY_BRIEF);
  // brand-voice + ecps intentionally absent.

  const pack = mod.assembleContextPack(slug, SKILL);

  assert.equal(pack.verdict, "partial");
  assert.equal(pack.docPaths.length, 1);
  assert.equal(pack.documents.length, 1);
  assert.equal(pack.missingRequired.length, 2);
  assert.match(pack.missingRequired.join("\n"), /brand-voice/);
  assert.match(pack.missingRequired.join("\n"), /ecps/);
});

test("partial: brand exists but no required docs → no hard missing stop", () => {
  const slug = "emptyco";
  mkdirSync(path.join(workspace, "brand", slug), { recursive: true });

  const pack = mod.assembleContextPack(slug, SKILL);

  assert.equal(pack.verdict, "partial");
  assert.equal(pack.brandFound, true);
  assert.deepEqual(pack.docPaths, []);
  assert.deepEqual(pack.documents, []);
  assert.equal(pack.missingRequired.length, 3);
});

test("directory context_required resolves as directory context", () => {
  const slug = "runnerco";
  const dir = path.join(workspace, "brand", slug, "outreach", "searches");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "ds-20260630-test.json"),
    JSON.stringify({ id: "ds-20260630-test", title: "Creators fintech", runner: { status: "queued" } }, null, 2),
  );

  const pack = mod.assembleContextPack(slug, DIR_SKILL);

  assert.equal(pack.verdict, "ok");
  assert.equal(pack.docPaths.length, 1);
  assert.equal(pack.documents.length, 1);
  assert.equal(pack.documents[0].kind, "directory");
  assert.match(pack.documents[0].content, /ds-20260630-test\.json/);
  assert.match(pack.documents[0].content, /Creators fintech/);
});

test("glob context_required resolves matches without starving later documents", () => {
  const slug = "globco";
  writeBrandFile(slug, "company-brief/company-brief.current.md", COMPANY_BRIEF);
  for (const id of ["ecp1", "ecp2", "ecp3", "ecp4"]) {
    writeBrandFile(
      slug,
      `go-to-market/positioning/${id}/${id}.current.md`,
      `# Positioning ${id}`,
    );
  }
  writeBrandFile(slug, "brand-book/brand-voice/brand-voice.current.md", "# Voice");
  writeBrandFile(slug, "integrations.json", "{}");

  const pack = mod.assembleContextPack(slug, GLOB_SKILL);
  const paths = pack.documents.map((doc) => doc.path);

  assert.equal(pack.verdict, "ok");
  assert.equal(pack.documents.length, 6, "context remains bounded");
  assert.equal(paths.filter((docPath) => docPath.includes("/positioning/")).length, 3);
  assert.ok(paths.some((docPath) => docPath.endsWith("brand-voice.current.md")));
  assert.ok(paths.some((docPath) => docPath.endsWith("integrations.json")));
  assert.deepEqual(pack.missingRequired, []);
});

test("(c) brand absent on disk → verdict=missing + no docPaths", () => {
  const pack = mod.assembleContextPack("does-not-exist", SKILL);

  assert.equal(pack.verdict, "missing");
  assert.equal(pack.brandFound, false);
  assert.deepEqual(pack.docPaths, []);
  assert.deepEqual(pack.documents, []);
  assert.match(pack.summary, /AUSENTE/);
});

test("no skill → brand exists, summary grounds it, verdict=ok", () => {
  const slug = "acme"; // seeded in case (a)
  const pack = mod.assembleContextPack(slug, null);

  assert.equal(pack.verdict, "ok");
  assert.deepEqual(pack.docPaths, [], "no skill → no required docs to resolve");
  assert.deepEqual(pack.documents, [], "no skill → no documents to embed");
  assert.match(pack.summary, /Acme Corp/);
});

test("falls back to the app skills catalog when OPENCLAW_HOME lacks the skill", () => {
  const slug = "repo-skillco";
  writeBrandFile(slug, "company-brief/company-brief.current.md", COMPANY_BRIEF);
  writeBrandFile(slug, "market-and-us/competitors/competitors.current.md", "# Competitors\n- N26");
  writeBrandFile(slug, "go-to-market/ecps/ecps.current.md", "# ECPs\n- Fintech buyers");
  const previousHome = process.env.OPENCLAW_HOME;
  process.env.OPENCLAW_HOME = path.join(openclawHome, "empty-home");
  try {
    const pack = mod.assembleContextPack(slug, "discovery-plan-builder");
    assert.equal(pack.verdict, "ok");
    assert.equal(pack.documents.length, 3);
    assert.match(pack.documents.map((doc) => doc.path).join("\n"), /company-brief/);
  } finally {
    if (previousHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = previousHome;
  }
});

test("docs-review resolves the six core Brain sources from the app catalog", () => {
  const slug = "docs-reviewco";
  writeBrandFile(slug, "company-brief/company-brief.current.md", COMPANY_BRIEF);
  writeBrandFile(slug, "brand-book/brand-voice/brand-voice.current.md", "# Voice\nDirecta.");
  writeBrandFile(slug, "go-to-market/ecps/ecps.current.md", "# ECPs\n- Founder B2B");
  writeBrandFile(slug, "go-to-market/positioning/shared/messaging-summary.md", "# Messaging\nSistema repetible.");
  writeBrandFile(slug, "strategic-plan/strategic-plan.current.md", "# Plan\nPrioridad: crecimiento.");
  writeBrandFile(slug, "operational/learnings.md", "# Learnings\nValidar antes de escalar.");
  const previousHome = process.env.OPENCLAW_HOME;
  process.env.OPENCLAW_HOME = path.join(openclawHome, "empty-home");
  try {
    const pack = mod.assembleContextPack(slug, "docs-review");
    assert.equal(pack.verdict, "ok");
    assert.equal(pack.documents.length, 6);
    assert.match(pack.documents.map((doc) => doc.path).join("\n"), /operational\/learnings\.md/);
  } finally {
    if (previousHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = previousHome;
  }
});
