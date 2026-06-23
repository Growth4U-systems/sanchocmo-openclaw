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

  // Seed the skill catalog: a SKILL.md with the `context_required` list.
  const skillMd = [
    "---",
    `name: ${SKILL}`,
    'description: "test skill"',
    "context_required:",
    ...CONTEXT_REQUIRED.map((p) => `- ${p}`),
    "---",
    "",
    "# Body",
  ].join("\n");
  const skillDir = path.join(openclawHome, "skills", SKILL);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), skillMd);

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
  assert.equal(pack.docPaths.length, 3, "all 3 required docs resolved");
  // Resolved paths are ABSOLUTE and point inside the seeded workspace.
  for (const p of pack.docPaths) {
    assert.ok(path.isAbsolute(p), `path is absolute: ${p}`);
    assert.ok(p.startsWith(workspace), `path under workspace: ${p}`);
  }
  // Summary is self-sufficient grounding parsed from the company-brief.
  assert.match(pack.summary, /Acme Corp/);
  assert.match(pack.summary, /SaaS B2B/);
  assert.match(pack.summary, /Pymes industriales/);
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
});

test("(c) brand absent on disk → verdict=missing + no docPaths", () => {
  const pack = mod.assembleContextPack("does-not-exist", SKILL);

  assert.equal(pack.verdict, "missing");
  assert.deepEqual(pack.docPaths, []);
  assert.match(pack.summary, /AUSENTE/);
});

test("no skill → brand exists, summary grounds it, verdict=ok", () => {
  const slug = "acme"; // seeded in case (a)
  const pack = mod.assembleContextPack(slug, null);

  assert.equal(pack.verdict, "ok");
  assert.deepEqual(pack.docPaths, [], "no skill → no required docs to resolve");
  assert.match(pack.summary, /Acme Corp/);
});
