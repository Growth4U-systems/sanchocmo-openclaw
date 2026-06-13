import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * SAN-183 F5 — el BrandBrainState es una VISTA ensamblada de manifest + tasks.
 *
 * Round-trip central: escribir el status de un pilar (setPillarStatusViaTask,
 * lo que hace POST /api/brand-brain/pillar-status) debe verse reflejado en el
 * estado ensamblado Y en la task (que son lo mismo — única fuente). También:
 * aliases legacy normalizan, secciones rollupean, presentations se escanean
 * del directorio y brand_summary se parsea del company-brief (cache mtime).
 *
 * MC_WORKSPACE debe estar seteado ANTES de importar los módulos (BASE se
 * resuelve a import-time).
 */

let workspace: string;
let assembler: typeof import("../data/brand-brain-assembler");
let fstatus: typeof import("../data/task-status-store");
let blueprints: typeof import("../data/task-blueprints");

const SLUG = "acme";

function writeBrandFile(rel: string, content: string) {
  const abs = path.join(workspace, "brand", SLUG, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

before(async () => {
  workspace = mkdtempSync(path.join(tmpdir(), "bb-assembler-"));
  process.env.MC_WORKSPACE = workspace;
  assembler = await import("../data/brand-brain-assembler");
  fstatus = await import("../data/task-status-store");
  blueprints = await import("../data/task-blueprints");

  // Sembrar los 4 proyectos P00 desde el registro (lo que hace clients/create).
  for (const setKey of blueprints.FOUNDATION_TASK_SET_KEYS) {
    const { project, tasks } = blueprints.instantiateFoundationProject(setKey, { slug: SLUG });
    writeBrandFile(`projects/${project.id}/project.json`, JSON.stringify(project, null, 2));
    writeBrandFile(`projects/${project.id}/tasks.json`, JSON.stringify(tasks, null, 2));
  }
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

test("estado ensamblado: 6 secciones, 18 pilares, todo en 'todo' tras el seed", () => {
  const state = assembler.assembleBrandBrainState(SLUG);
  assert.equal(Object.keys(state.sections).length, 6);
  const pillars = Object.values(state.sections).flatMap((s) => Object.entries(s.pillars ?? {}));
  assert.equal(pillars.length, 18);
  for (const [key, p] of pillars) {
    assert.equal(p.status, "todo", `${key} status inicial`);
    assert.ok(p.output_file, `${key} sin output_file`);
  }
  // optional preservado
  assert.equal(state.sections["go-to-market"].pillars?.["ecp-validation"]?.optional, true);
  assert.equal(state.sections["brand-book"].pillars?.["brand-report"]?.optional, true);
});

test("round-trip: cada status canónico escrito a un pilar vuelve idéntico", () => {
  const statuses = ["in-progress", "pending-review", "completed", "blocked", "todo"] as const;
  for (const status of statuses) {
    const res = fstatus.setPillarStatusViaTask(SLUG, "market-and-us", "market-analysis", status);
    assert.equal(res.ok, true, `write ${status}: ${res.error}`);
    const state = assembler.assembleBrandBrainState(SLUG);
    assert.equal(
      state.sections["market-and-us"].pillars?.["market-analysis"]?.status,
      status,
      `round-trip ${status}`,
    );
  }
});

test("aliases legacy (approved/done/not-started/generated) normalizan al canónico", () => {
  const cases: Array<[string, string]> = [
    ["approved", "completed"],
    ["done", "completed"],
    ["generated", "pending-review"],
    ["request-changes", "todo"],
    ["not-started", "todo"],
  ];
  for (const [legacy, canonical] of cases) {
    const res = fstatus.setPillarStatusViaTask(SLUG, "go-to-market", "pricing", legacy);
    assert.equal(res.ok, true, `write ${legacy}`);
    assert.equal(res.newStatus, canonical, `${legacy} → ${canonical}`);
    const state = assembler.assembleBrandBrainState(SLUG);
    assert.equal(state.sections["go-to-market"].pillars?.["pricing"]?.status, canonical);
  }
});

test("el write de pilar ES el write de la task (única fuente, sin sync)", () => {
  fstatus.setPillarStatusViaTask(SLUG, "company-brief", "company-brief", "completed");
  const tasks = JSON.parse(
    readFileSync(path.join(workspace, "brand", SLUG, "projects", "P00-Company-Brief", "tasks.json"), "utf-8"),
  );
  const t = tasks.find((x: { id: string }) => x.id === "P00-CB-T01");
  assert.equal(t.status, "completed");
  assert.ok(t.completed, "completed timestamp poblado");
  // y el ensamblado refleja approved_at
  const state = assembler.assembleBrandBrainState(SLUG);
  assert.ok(state.sections["company-brief"].pillars?.["company-brief"]?.approved_at);
});

test("rollup de sección: completed solo cuando TODOS sus pilares lo están", () => {
  // metrics-setup tiene 1 pilar → completarlo completa la sección
  fstatus.setPillarStatusViaTask(SLUG, "metrics-setup", "metrics-setup", "completed");
  // market-and-us tiene 5 → uno activo basta para in-progress, no completed
  fstatus.setPillarStatusViaTask(SLUG, "market-and-us", "market-analysis", "in-progress");
  const state = assembler.assembleBrandBrainState(SLUG);
  assert.equal(state.sections["metrics-setup"].status, "completed");
  assert.equal(state.sections["market-and-us"].status, "in-progress");
});

test("pilar inexistente → error claro", () => {
  const res = fstatus.setPillarStatusViaTask(SLUG, "x", "no-such-pillar", "completed");
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /not found/i);
});

test("brand_summary se parsea del company-brief y se cachea por mtime", () => {
  writeBrandFile(
    "company-brief/company-brief.current.md",
    [
      "# Company Brief — Acme Corp",
      "",
      "## 1. La Empresa",
      "**Tipo:** SaaS B2B",
      "**Modelo:** Suscripción mensual para pymes",
      "",
      "## 3. Cliente Ideal",
      "**En una frase:** Pymes industriales que digitalizan compras.",
    ].join("\n"),
  );
  const s1 = assembler.loadBrandSummary(SLUG);
  assert.equal(s1.company_name, "Acme Corp");
  assert.equal(s1.sector, "SaaS B2B");
  assert.equal(s1.description, "Suscripción mensual para pymes");
  assert.equal(s1.positioning, "Pymes industriales que digitalizan compras.");
  // cache: misma referencia mientras el doc no cambie
  const s2 = assembler.loadBrandSummary(SLUG);
  assert.equal(s1, s2);
});

test("presentations = scan del directorio (con sección por keywords)", () => {
  writeBrandFile("presentations/foundation-deck.html", "<html/>");
  writeBrandFile("presentations/strategic-deck.html", "<html/>");
  const pres = assembler.scanPresentations(SLUG);
  assert.equal(pres.length, 2);
  const deck = pres.find((p) => p.file.includes("foundation-deck"))!;
  assert.equal(deck.type, "html");
  assert.equal(deck.section, "market-and-us");
  assert.equal(pres.find((p) => p.file.includes("strategic-deck"))!.section, "go-to-market");
});

test("setTaskStatus (genérico, por id) escribe sin mitad de pilar", () => {
  const res = fstatus.setTaskStatus(SLUG, "P00-FUL-T02", "in-progress");
  assert.equal(res.ok, true);
  assert.equal(res.pillarChanged, false); // siempre false: no hay otro store
  const state = assembler.assembleBrandBrainState(SLUG);
  assert.equal(state.sections["market-and-us"].pillars?.["competitor-analysis"]?.status, "in-progress");
});
