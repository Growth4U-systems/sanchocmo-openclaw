#!/usr/bin/env tsx
/**
 * reseed-foundation.mts — Reinstala el scaffolding canónico de Foundation
 * en un cliente existente, archivando el estado actual.
 *
 * Sucesor de scripts/reseed-foundation.sh (SAN-183 F5): los 4 proyectos P00
 * ya NO viven en heredocs — se instancian del registro declarativo
 * (config/pillar-manifest.json → taskSets foundation-*) vía
 * src/lib/data/task-blueprints.ts::instantiateFoundationProject. Misma
 * salida que el .sh canonicalizada (status todo, sección brand-book, skill
 * market-synthesis, +agent, +deliverable_file, +mc_chat_thread_id) — ver el
 * golden src/lib/__tests__/foundation-blueprints.test.mts.
 *
 * Uso:
 *   npx tsx scripts/reseed-foundation.mts --slug innatica --name "Innatica" [--dry-run]
 *
 * Variables:
 *   OPENCLAW_WORKSPACE  ruta a workspace-sancho (default: ~/.openclaw/workspace-sancho)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Dynamic import: el repo es CJS y el interop de import estático desde .mts
// solo expone `default` — mismo patrón que los .test.mts.
const { FOUNDATION_TASK_SET_KEYS, instantiateFoundationProject } = await import(
  "../src/lib/data/task-blueprints"
);

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), ".openclaw", "workspace-sancho");

let slug = "";
let name = "";
let dryRun = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--slug") slug = argv[++i] ?? "";
  else if (argv[i] === "--name") name = argv[++i] ?? "";
  else if (argv[i] === "--dry-run") dryRun = true;
  else {
    console.error(`❌ Argumento desconocido: ${argv[i]}`);
    process.exit(1);
  }
}

if (!slug || !name) {
  console.error('❌ Faltan argumentos. Uso: reseed-foundation.mts --slug <slug> --name <nombre> [--dry-run]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error(`❌ Slug inválido '${slug}'. Sólo minúsculas, números, guiones.`);
  process.exit(1);
}

const BRAND_DIR = path.join(WORKSPACE, "brand", slug);
if (!fs.existsSync(BRAND_DIR)) {
  console.error(`❌ El cliente '${slug}' no existe en ${BRAND_DIR}`);
  console.error("   (Para crear un cliente nuevo usá Mission Control → New client)");
  process.exit(1);
}

const TS = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const ARCHIVE_DIR = path.join(BRAND_DIR, "_archive", `pre-reseed-${TS}`);

const act = (desc: string, fn: () => void) => {
  if (dryRun) console.log(`  [dry-run] ${desc}`);
  else fn();
};

console.log(`🔧 Reseed Foundation: ${name} (slug=${slug})`);
console.log(`   workspace: ${WORKSPACE}`);
console.log(`   archive:   ${ARCHIVE_DIR}`);
if (dryRun) console.log("   ### DRY RUN — no changes will be written ###");

// --- 1. Archivar estado actual ---
console.log("\n📦 [1/3] Archivando estado actual...");
act("mkdir archive", () => fs.mkdirSync(path.join(ARCHIVE_DIR, "projects"), { recursive: true }));

const stateFile = path.join(BRAND_DIR, "foundation-state.json");
if (fs.existsSync(stateFile)) {
  act("foundation-state.json → archive", () =>
    fs.copyFileSync(stateFile, path.join(ARCHIVE_DIR, "foundation-state.json.before-reseed")));
  console.log("  ✓ foundation-state.json → archive");
}
const stateBak = `${stateFile}.bak`;
if (fs.existsSync(stateBak)) {
  act("foundation-state.json.bak → archive", () => {
    fs.copyFileSync(stateBak, path.join(ARCHIVE_DIR, "foundation-state.json.bak.before-reseed"));
    fs.rmSync(stateBak);
  });
}

const projectsDir = path.join(BRAND_DIR, "projects");
if (fs.existsSync(projectsDir)) {
  for (const base of fs.readdirSync(projectsDir)) {
    if (base.startsWith("_archive_")) continue;
    act(`projects/${base} → archive`, () =>
      fs.renameSync(path.join(projectsDir, base), path.join(ARCHIVE_DIR, "projects", base)));
    console.log(`  ✓ projects/${base} → archive`);
  }
}

for (const d of ["company-brief", "market-and-us", "brand-identity", "brand-book", "brand-voice", "go-to-market", "operational", "presentations", "strategic-plan", "business-model", "budget", "company-context"]) {
  const dir = path.join(BRAND_DIR, d);
  if (fs.existsSync(dir)) {
    act(`${d}/ → archive`, () => fs.renameSync(dir, path.join(ARCHIVE_DIR, d)));
    console.log(`  ✓ ${d}/ → archive`);
  }
}
console.log(`  → archivo: ${ARCHIVE_DIR}`);

// --- 2. Crear estructura de carpetas vacías (árbol canónico de brand) ---
console.log("\n📁 [2/3] Recreando estructura de carpetas vacías...");
const TREE = [
  "company-context", "business-model", "budget", "company-brief",
  "market-and-us/market", "market-and-us/competitors", "market-and-us/self",
  "market-and-us/swot", "market-and-us/summary", "market-and-us/ope-canvas", "market-and-us/sources",
  "go-to-market/ecps", "go-to-market/positioning/shared", "go-to-market/pricing",
  "go-to-market/existing-customer-data", "go-to-market/ecp-validation",
  "brand-book/brand-voice", "brand-book/visual-identity",
  "presentations", "strategic-plan", "operational", "projects", "chat",
];
act("mkdir árbol canónico", () => {
  for (const d of TREE) fs.mkdirSync(path.join(BRAND_DIR, d), { recursive: true });
});

// --- 3. Escribir templates canónicos ---
console.log("\n🏗️ [3/3] Escribiendo templates canónicos...");
if (dryRun) {
  console.log("  [dry-run] foundation-state.json + 4 proyectos (CB/Full/Metrics/Strategic-Plan)");
  console.log("\n✓ Reseed dry-run complete.");
  process.exit(0);
}

// Foundation state v3 (transicional — muere en F5 PR4; lo siembra la default igual que clients/create.ts)
const templatePath = path.join(process.cwd(), "config", "foundation-state.default.json");
if (fs.existsSync(templatePath)) {
  const now = new Date().toISOString();
  const seeded = fs.readFileSync(templatePath, "utf-8")
    .replaceAll("__SLUG__", slug)
    .replaceAll("__NAME__", name)
    .replaceAll("__NOW__", now);
  fs.writeFileSync(stateFile, seeded);
  console.log("  ✓ foundation-state.json (v3.0, todos los pilares not-started)");
} else {
  console.log("  ⚠ config/foundation-state.default.json no encontrado — estado legacy no sembrado");
}

// Los 4 proyectos P00 desde el registro declarativo
for (const setKey of FOUNDATION_TASK_SET_KEYS) {
  const { project, tasks } = instantiateFoundationProject(setKey, { slug });
  const projDir = path.join(projectsDir, project.id);
  fs.mkdirSync(projDir, { recursive: true });
  // Anchors mínimos sin depender de MC_WORKSPACE: chat thread file por task.
  for (const t of tasks) {
    const chatId = String(t.mc_chat_thread_id ?? `task-${t.id.toLowerCase()}`);
    const chatFile = path.join(BRAND_DIR, "chat", `${chatId}.json`);
    if (!fs.existsSync(chatFile)) {
      fs.writeFileSync(chatFile, JSON.stringify({ messages: [], createdAt: new Date().toISOString() }, null, 2));
    }
  }
  fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify(project, null, 2));
  fs.writeFileSync(path.join(projDir, "tasks.json"), JSON.stringify(tasks, null, 2));
  console.log(`  ✓ projects/${project.id}/ (${tasks.length} tasks)`);
}

console.log(`\n✅ Reseed Foundation completo para ${name} (slug=${slug})`);
console.log(`   Archive: ${ARCHIVE_DIR}`);
console.log("   Proyectos canónicos: P00-Company-Brief, P00-Full-Foundation, P00-Metrics, P00-Strategic-Plan");
console.log("\n   Próximo paso: reiniciar el contenedor de la app para que tome el estado nuevo.");
