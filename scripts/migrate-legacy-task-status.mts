#!/usr/bin/env tsx
/**
 * migrate-legacy-task-status.mts (SAN-192 / W1.5) — canonicaliza los status
 * legacy de las tasks de primer nivel a los 6 valores canónicos, para poder
 * retirar el normalizador de las lecturas (el shim queda solo en escritura).
 *
 * Qué hace:
 *   - Recorre brand/{slug}/projects/star/tasks.json. Para cada task de PRIMER
 *     NIVEL cuyo status sea un alias legacy (approved, generated, not-started,
 *     done, draft, discarded…) lo reescribe al canónico (approved→completed,
 *     generated→pending-review, not-started→todo, discarded→cancelled, …).
 *   - NUNCA toca `content_tasks` anidadas ni rows type=content_task/
 *     content_subtask: usan OTRO vocabulario (New/Approved/Draft/Published…)
 *     y el normalizador de task las corrompería.
 *   - Backup `tasks.json` → `tasks.json.bak-status-<ts>` antes de escribir.
 *   - Idempotente: re-ejecutar no cambia nada (los canónicos pasan tal cual).
 *
 * Paso DB opcional (--db): si hay DATABASE_URL, normaliza también la tabla
 * `tasks` (saltando content_task/content_subtask). El import a DB ya normaliza
 * (migrate-projects-to-db), así que normalmente no hace falta.
 *
 * Uso (dry-run por defecto):
 *   npx tsx scripts/migrate-legacy-task-status.mts [--slug X] [--apply] [--db]
 *
 * Variables: OPENCLAW_WORKSPACE (default ~/.openclaw/workspace-sancho)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const { normalizeTaskStatus, isLegacyStatusAlias } = await import("../src/lib/task-status");

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), ".openclaw", "workspace-sancho");
const BRAND_ROOT = path.join(WORKSPACE, "brand");

const argv = process.argv.slice(2);
let onlySlug = "";
let apply = false;
let withDb = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--slug") onlySlug = argv[++i] ?? "";
  else if (argv[i] === "--apply") apply = true;
  else if (argv[i] === "--db") withDb = true;
}

const SKIP_TYPES = new Set(["content_task", "content_subtask"]);

type AnyRecord = Record<string, unknown>;
let totalTasksChanged = 0;
let totalFilesChanged = 0;
const sample: string[] = [];

function listSlugs(): string[] {
  if (onlySlug) return [onlySlug];
  if (!fs.existsSync(BRAND_ROOT)) return [];
  return fs
    .readdirSync(BRAND_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function tasksJsonFiles(slug: string): string[] {
  const projectsDir = path.join(BRAND_ROOT, slug, "projects");
  if (!fs.existsSync(projectsDir)) return [];
  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(projectsDir, d.name, "tasks.json"))
    .filter((p) => fs.existsSync(p));
}

function migrateFile(file: string): number {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    console.warn(`  ⚠️  no parseable: ${file}`);
    return 0;
  }
  const tasks: AnyRecord[] = Array.isArray(raw) ? (raw as AnyRecord[]) : ((raw as AnyRecord).tasks as AnyRecord[]) || [];
  let changed = 0;
  for (const task of tasks) {
    const type = String(task.type ?? "");
    if (SKIP_TYPES.has(type)) continue; // content tasks → otro vocabulario
    const status = task.status;
    if (typeof status !== "string" || !isLegacyStatusAlias(status)) continue;
    const canonical = normalizeTaskStatus(status);
    if (canonical === status) continue;
    if (sample.length < 12) sample.push(`${task.id ?? "?"}: ${status} → ${canonical}`);
    task.status = canonical;
    changed++;
  }
  if (changed > 0 && apply) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(file, `${file}.bak-status-${ts}`);
    const out = Array.isArray(raw) ? tasks : { ...(raw as AnyRecord), tasks };
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
  }
  return changed;
}

console.log(`\n🗂  migrate-legacy-task-status — ${apply ? "APPLY" : "DRY-RUN"} — workspace: ${WORKSPACE}\n`);

for (const slug of listSlugs()) {
  let slugChanged = 0;
  for (const file of tasksJsonFiles(slug)) {
    const c = migrateFile(file);
    if (c > 0) {
      slugChanged += c;
      totalFilesChanged++;
    }
  }
  if (slugChanged > 0) {
    totalTasksChanged += slugChanged;
    console.log(`  ${slug}: ${slugChanged} task status normalizados`);
  }
}

if (withDb && process.env.DATABASE_URL) {
  try {
    const { db } = await import("../src/db/drizzle");
    const { tasks: tasksTable } = await import("../src/db/schema");
    const rows = await db.select().from(tasksTable);
    let dbChanged = 0;
    for (const row of rows as AnyRecord[]) {
      const type = String(row.type ?? "");
      if (SKIP_TYPES.has(type)) continue;
      const status = row.status;
      if (typeof status !== "string" || !isLegacyStatusAlias(status)) continue;
      const canonical = normalizeTaskStatus(status);
      if (canonical === status) continue;
      if (sample.length < 24) sample.push(`[db] ${row.id ?? "?"}: ${status} → ${canonical}`);
      dbChanged++;
      if (apply) {
        const { eq } = await import("drizzle-orm");
        await db.update(tasksTable).set({ status: canonical }).where(eq(tasksTable.sourceKey, row.sourceKey as string));
      }
    }
    console.log(`  [db] ${dbChanged} task status normalizados`);
    totalTasksChanged += dbChanged;
  } catch (e) {
    console.warn(`  ⚠️  paso DB saltado: ${(e as Error).message}`);
  }
} else if (withDb) {
  console.log("  [db] saltado (sin DATABASE_URL)");
}

console.log(`\n${sample.length ? "Ejemplos:\n  " + sample.join("\n  ") + "\n" : ""}`);
console.log(`Total: ${totalTasksChanged} status legacy en ${totalFilesChanged} fichero(s).`);
if (!apply && totalTasksChanged > 0) console.log("Re-ejecuta con --apply para escribir (hace backup .bak-status-<ts>).\n");
else if (apply) console.log("✅ Migración aplicada.\n");
else console.log("✅ Nada que migrar (ya canónico).\n");
