import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================
// SAN-183 F5 — Foundation declarada en el registro (golden)
// ============================================================
// Los 5 proyectos P00 (Company-Brief, Site-Audit, Full-Foundation, Metrics,
// Strategic-Plan) se instancian del manifest (taskSets foundation-*) en vez
// de los heredocs de scripts/reseed-foundation.sh. El golden congela la
// salida; las DIVERGENCIAS respecto a los heredocs son canonicalizaciones
// deliberadas, asserted una a una abajo:
//
//   1. status "pending" → "todo" (vocabulario canónico de task).
//   2. P00-FUL-T04 skill "market-summary" → "market-synthesis" (la skill
//      market-summary NO existe en skills/; market-synthesis sí).
//   3. P00-FUL-T08/T09 section "brand-identity" → "brand-book" (la sección
//      canónica del default state, el manifest y el árbol de carpetas).
//   4. +deliverable_file canónico (pillars[key].docPaths[0]) — los heredocs
//      no lo declaraban (resolución vía foundation-state, que muere en F5).
//   5. +agent explícito (owner del skill) y +mc_chat_thread_id (anchor del
//      task-create protocol). discord_thread_id murió (Discord retirado).
//   6. P00-Metrics tasks.json shape objeto {project_id,tasks} → array
//      (mismo shape que los otros 3 proyectos).
//   7. P00-CB-T01 "pillars"/"sections" (arrays plurales, que setPillarStatus
//      nunca matcheaba) → "pillar"/"section" singulares.
//   8. +6 tasks de pilar nuevas (decisión Alfonso: TODO pilar tiene task 1:1):
//      FUL-T10 foundation-presentation, T11 existing-customer-data (opt),
//      T12 ecp-validation (opt), T13 gtm-presentation, T14 brand-report (opt),
//      SP-T03 strategic-presentation.
// ============================================================

const {
  FOUNDATION_TASK_SET_KEYS,
  instantiateFoundationProject,
  getFoundationManifest,
  findFoundationPillar,
  foundationTaskIdForPillar,
  getTaskSet,
  ownerCheckFindings,
} = await import("../data/task-blueprints");

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  fs.readFileSync(path.join(here, "__fixtures__", "foundation-blueprints.golden.json"), "utf-8"),
) as Record<string, { project: Record<string, unknown>; tasks: Record<string, unknown>[] }>;

const manifest = JSON.parse(
  fs.readFileSync(path.join(here, "..", "..", "..", "config", "pillar-manifest.json"), "utf-8"),
);

// ── Golden: salida byte-idéntica al fixture congelado ───────────────────────
test("instantiateFoundationProject reproduce el golden congelado (slug innatica)", () => {
  for (const setKey of FOUNDATION_TASK_SET_KEYS) {
    assert.deepEqual(
      instantiateFoundationProject(setKey, { slug: "innatica" }),
      golden[setKey],
      `set ${setKey} divergió del golden`,
    );
  }
});

// ── Canonicalizaciones deliberadas vs heredocs del .sh ─────────────────────
test("canonicalizaciones documentadas respecto a reseed-foundation.sh", () => {
  const ful = golden["foundation-full"].tasks;
  const byId = (id: string) => ful.find((t) => t.id === id)!;

  // (1) vocabulario canónico
  for (const set of Object.values(golden)) {
    for (const t of set.tasks) assert.equal(t.status, "todo", `${t.id} status`);
  }
  // (2) market-summary no existe → market-synthesis
  assert.equal(byId("P00-FUL-T04").skill, "market-synthesis");
  // (3) brand-identity → brand-book
  assert.equal(byId("P00-FUL-T08").section, "brand-book");
  assert.equal(byId("P00-FUL-T09").section, "brand-book");
  // (4) deliverable_file canónico desde pillars[key].docPaths[0]
  //     SAN-211: visual-identity → design-system; DESIGN.md es el source-of-truth.
  assert.equal(
    byId("P00-FUL-T09").deliverable_file,
    "brand/innatica/brand-book/visual-identity/DESIGN.md",
  );
  // (7) singular pillar/section en el task de Company Brief
  const cb = golden["foundation-cb"].tasks[0];
  assert.equal(cb.pillar, "company-brief");
  assert.equal(cb.section, "company-brief");
  assert.equal("pillars" in cb, false);
});

// ── Estructura: el bloque foundation cubre los 19 pilares 1:1 ──────────────
test("foundation block: 7 secciones, 19 pilares, todos con task 1:1 resoluble", () => {
  const sections = getFoundationManifest();
  assert.equal(sections.length, 7);
  const pillars = sections.flatMap((s) => s.pillars);
  assert.equal(pillars.length, 19);

  const seen = new Set<string>();
  for (const p of pillars) {
    assert.equal(seen.has(p.key), false, `pilar duplicado: ${p.key}`);
    seen.add(p.key);
    // Todo pilar declarado existe en el bloque pillars (paths canónicos).
    assert.ok(manifest.pillars[p.key], `pilar ${p.key} sin entrada en manifest.pillars`);
    // El binding a task resuelve a una entrada real del set.
    const set = getTaskSet(p.task.set);
    assert.ok(set, `${p.key}: set ${p.task.set} no existe`);
    const entry = set!.tasks.find((t) => t.id === p.task.id);
    assert.ok(entry, `${p.key}: task ${p.task.set}/${p.task.id} no existe`);
    // La task declara EXACTAMENTE este pilar (1:1, sin compartir).
    assert.equal(entry!.pillar, p.key, `${p.key}: la task cubre otro pilar`);
    assert.equal(entry!.section, sections.find((s) => s.pillars.includes(p))!.key);
    // Y el id concreto resuelve.
    assert.match(foundationTaskIdForPillar(p.key)!, /^P00-[A-Z]+-T\d+$/);
  }

  // Inverso: toda task con pillar en los sets foundation-* está en el bloque.
  for (const setKey of FOUNDATION_TASK_SET_KEYS) {
    for (const t of getTaskSet(setKey)!.tasks) {
      if (t.pillar) {
        assert.ok(findFoundationPillar(t.pillar), `task ${t.id} declara pilar ${t.pillar} fuera del bloque foundation`);
      }
    }
  }
});

// ── Paridad con el default LEGACY (congelado como fixture; el fichero murió en F5 PR4) ──
test("paridad estructural con el foundation-state.default congelado", () => {
  const def = JSON.parse(
    fs.readFileSync(path.join(here, "__fixtures__", "foundation-state.default.frozen.json"), "utf-8"),
  );
  const sections = getFoundationManifest();
  assert.deepEqual(
    sections.map((s) => s.key),
    Object.keys(def.sections),
    "orden/keys de secciones",
  );
  for (const s of sections) {
    const defSection = def.sections[s.key];
    assert.equal(s.layer, defSection.layer, `${s.key} layer`);
    assert.deepEqual(
      s.pillars.map((p) => p.key),
      Object.keys(defSection.pillars),
      `${s.key} pilares`,
    );
    for (const p of s.pillars) {
      const defPillar = defSection.pillars[p.key];
      assert.equal(Boolean(p.optional), Boolean(defPillar.optional), `${p.key} optional`);
      if (defPillar.layer !== undefined) assert.equal(p.layer, defPillar.layer, `${p.key} layer`);
      // El skill de la task cubriente == el skill del default state.
      const entry = getTaskSet(p.task.set)!.tasks.find((t) => t.id === p.task.id)!;
      assert.equal(entry.skill, defPillar.skill, `${p.key} skill`);
    }
  }
});

// ── Anchors: solo integration/execution van sin deliverable_file ────────────
test("solo las tasks integration/execution omiten deliverable_file", () => {
  for (const [setKey, set] of Object.entries(golden)) {
    for (const t of set.tasks) {
      const exempt = t.type === "integration" || t.type === "execution";
      assert.equal(
        "deliverable_file" in t,
        !exempt,
        `${setKey}/${t.id}: deliverable_file ${exempt ? "presente" : "ausente"} (type=${t.type})`,
      );
    }
  }
  const exemptIds = Object.values(golden)
    .flatMap((s) => s.tasks)
    .filter((t) => !("deliverable_file" in t))
    .map((t) => t.id)
    .sort();
  assert.deepEqual(exemptIds, ["P00-MET-T08", "P00-MET-T09", "P00-MET-T10", "P00-SP-T02"]);
});

// ── Deps cross-proyecto (dependsOnExternal) verbatim ────────────────────────
test("dependencias cross-proyecto se conservan verbatim", () => {
  const met = golden["foundation-metrics"].tasks.find((t) => t.id === "P00-MET-T01")!;
  assert.equal(met.depends_on, "P00-FUL-T09");
  const sp = golden["foundation-sp"].tasks.find((t) => t.id === "P00-SP-T01")!;
  assert.equal(sp.depends_on, "P00-MET-T01");
});

// ── Owner-check global (guarda SAN-166) sigue limpio ────────────────────────
test("ownerCheckFindings() vacío con los sets foundation-*", () => {
  assert.deepEqual(ownerCheckFindings(), []);
});
