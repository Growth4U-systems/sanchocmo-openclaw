#!/usr/bin/env tsx
/**
 * migrate-foundation-state.mts — Migración F5 (SAN-183): el status de cada
 * pilar pasa del árbol de foundation-state.json a su task 1:1 (única fuente).
 *
 * Por cliente:
 *   1. Asegura los 5 proyectos P00 con sus tasks (instancia del manifest;
 *      NUNCA pisa una task existente — solo añade las que falten).
 *   2. Copia el status legacy de cada pilar → task.status (vocabulario
 *      canónico: approved→completed, not-started→todo, generated→
 *      pending-review, request-*→todo) + approved_at → task.completed.
 *      La verdad en el instante de la migración es el fichero legacy.
 *   3. Reporte de paridad de presentations: entradas del array legacy que
 *      apuntan FUERA de presentations/ (el scan no las verá) = warning.
 *   4. Renombra foundation-state.json → foundation-state.json.bak-<ts>.
 *   5. Check de resurrección: si el fichero reaparece (sesión vieja de
 *      Sancho escribiendo por costumbre), avisa.
 *
 * Uso (dry-run por defecto):
 *   npx tsx scripts/migrate-foundation-state.mts [--slug X] [--apply]
 *   npx tsx scripts/migrate-foundation-state.mts --slug X --rollback   # restaura el .bak más reciente
 *
 * Variables: OPENCLAW_WORKSPACE (default ~/.openclaw/workspace-sancho)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const { FOUNDATION_TASK_SET_KEYS, instantiateFoundationProject, getFoundationManifest, foundationTaskIdForPillar } =
  await import("../src/lib/data/task-blueprints");

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), ".openclaw", "workspace-sancho");

const argv = process.argv.slice(2);
let onlySlug = "";
let apply = false;
let rollback = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--slug") onlySlug = argv[++i] ?? "";
  else if (argv[i] === "--apply") apply = true;
  else if (argv[i] === "--rollback") rollback = true;
  else {
    console.error(`❌ Argumento desconocido: ${argv[i]}`);
    process.exit(1);
  }
}

// Vocabulario: legacy de pilar → canónico de task (espejo de foundation-status.ts)
const LEGACY_TO_TASK: Record<string, string> = {
  approved: "completed", done: "completed", completed: "completed", complete: "completed",
  "in-progress": "in-progress", in_progress: "in-progress", running: "in-progress", active: "in-progress", lite: "in-progress",
  "pending-review": "pending-review", pending_review: "pending-review", review: "pending-review", generated: "pending-review",
  blocked: "blocked", error: "blocked",
  cancelled: "cancelled", canceled: "cancelled", skipped: "cancelled",
  "not-started": "todo", not_started: "todo", todo: "todo", pending: "todo",
  "request-changes": "todo", request_changes: "todo", "request-refresh": "todo", request_refresh: "todo",
};
const normalize = (s: string) => LEGACY_TO_TASK[(s || "").trim().toLowerCase()] ?? "todo";

type AnyRecord = Record<string, unknown>;

function listClients(): string[] {
  const brandDir = path.join(WORKSPACE, "brand");
  if (!fs.existsSync(brandDir)) return [];
  return fs
    .readdirSync(brandDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .map((d) => d.name);
}

function readTasksFile(p: string): { raw: unknown; tasks: AnyRecord[] } | null {
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return { raw, tasks: Array.isArray(raw) ? raw : ((raw as AnyRecord).tasks as AnyRecord[]) || [] };
  } catch {
    return null;
  }
}

function migrateClient(slug: string): void {
  const brandDir = path.join(WORKSPACE, "brand", slug);
  const stateFile = path.join(brandDir, "foundation-state.json");

  if (rollback) {
    const baks = fs
      .readdirSync(brandDir)
      .filter((f) => f.startsWith("foundation-state.json.bak-"))
      .sort()
      .reverse();
    if (!baks.length) {
      console.log(`  [${slug}] sin .bak que restaurar`);
      return;
    }
    if (apply) fs.copyFileSync(path.join(brandDir, baks[0]), stateFile);
    console.log(`  [${slug}] ${apply ? "restaurado" : "[dry-run] restauraría"} ${baks[0]} → foundation-state.json`);
    return;
  }

  const hasLegacy = fs.existsSync(stateFile);
  const legacy: AnyRecord | null = hasLegacy ? JSON.parse(fs.readFileSync(stateFile, "utf-8")) : null;

  // 1. Asegurar proyectos P00 (añade lo que falte, nunca pisa)
  let tasksAdded = 0;
  for (const setKey of FOUNDATION_TASK_SET_KEYS) {
    const { project, tasks } = instantiateFoundationProject(setKey, { slug });
    const projDir = path.join(brandDir, "projects", project.id);
    const tasksPath = path.join(projDir, "tasks.json");
    const existing = readTasksFile(tasksPath);
    if (!existing) {
      if (apply) {
        fs.mkdirSync(projDir, { recursive: true });
        fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify(project, null, 2));
        fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
        // chat thread por task (anchor)
        for (const t of tasks) {
          const chatFile = path.join(brandDir, "chat", `${String(t.mc_chat_thread_id)}.json`);
          if (!fs.existsSync(chatFile)) {
            fs.mkdirSync(path.dirname(chatFile), { recursive: true });
            fs.writeFileSync(chatFile, JSON.stringify({ messages: [], createdAt: new Date().toISOString() }, null, 2));
          }
        }
      }
      tasksAdded += tasks.length;
      console.log(`  [${slug}] + projects/${project.id} (${tasks.length} tasks)${apply ? "" : " [dry-run]"}`);
      continue;
    }
    const have = new Set(existing.tasks.map((t) => t.id));
    const missing = tasks.filter((t) => !have.has(t.id));
    if (missing.length) {
      if (apply) {
        const merged = [...existing.tasks, ...missing];
        const writeData = Array.isArray(existing.raw) ? merged : { ...(existing.raw as AnyRecord), tasks: merged };
        fs.writeFileSync(tasksPath, JSON.stringify(writeData, null, 2));
      }
      tasksAdded += missing.length;
      console.log(`  [${slug}] ${project.id}: +${missing.length} tasks que faltaban${apply ? "" : " [dry-run]"}`);
    }
  }

  if (!legacy) {
    console.log(`  [${slug}] sin foundation-state.json — solo seed (${tasksAdded} tasks nuevas)`);
    return;
  }

  // 2. Copiar statuses legacy → tasks (el legacy gana en el instante de migrar)
  const sections = (legacy.sections || {}) as Record<string, AnyRecord>;
  let statusCopied = 0;
  const drift: string[] = [];
  for (const decl of getFoundationManifest()) {
    const legacySection = sections[decl.key];
    if (!legacySection) continue;
    const legacyPillars = ((legacySection.pillars as AnyRecord) || {}) as Record<string, AnyRecord>;
    for (const p of decl.pillars) {
      const lp = legacyPillars[p.key];
      if (!lp) continue;
      const want = normalize((lp.status as string) || "not-started");
      const taskId = foundationTaskIdForPillar(p.key);
      if (!taskId) continue;
      // localizar la task (en dry-run los proyectos pueden no existir aún:
      // se siembran con status "todo", así que el diff se calcula contra eso)
      let found = false;
      for (const setKey of FOUNDATION_TASK_SET_KEYS) {
        const { project } = instantiateFoundationProject(setKey, { slug });
        const tasksPath = path.join(brandDir, "projects", project.id, "tasks.json");
        const data = readTasksFile(tasksPath);
        const task = data?.tasks.find((t) => t.id === taskId);
        if (!data || !task) continue;
        found = true;
        const current = String(task.status || "todo");
        if (current !== want) {
          drift.push(`${p.key}: task ${current} → legacy ${lp.status} (${want})`);
          if (apply) {
            task.status = want;
            if (want === "completed" && !task.completed) {
              task.completed = String(lp.approved_at || lp.completed_at || new Date().toISOString().slice(0, 10));
            }
            const writeData = Array.isArray(data.raw) ? data.tasks : { ...(data.raw as AnyRecord), tasks: data.tasks };
            fs.writeFileSync(tasksPath, JSON.stringify(writeData, null, 2));
          }
          statusCopied++;
        }
        break;
      }
      if (!found && want !== "todo") {
        drift.push(`${p.key}: task (a sembrar, todo) → legacy ${lp.status} (${want})`);
        statusCopied++;
      }
    }
  }
  if (drift.length) console.log(`  [${slug}] statuses copiados (${statusCopied}):\n    ${drift.join("\n    ")}`);
  else console.log(`  [${slug}] statuses ya en sync (diff ∅ — el reconcile hizo su trabajo)`);

  // 3. Paridad de presentations
  const legacyPres = (legacy.presentations || []) as AnyRecord[];
  for (const pres of legacyPres) {
    const file = String(pres.file || "");
    if (file && !file.includes("presentations/")) {
      console.warn(`  [${slug}] ⚠ presentación legacy fuera de presentations/: ${file} — copiarla a mano si se quiere conservar`);
    }
  }

  // 4. Archivar el fichero
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  if (apply) {
    fs.renameSync(stateFile, `${stateFile}.bak-${ts}`);
    console.log(`  [${slug}] foundation-state.json → foundation-state.json.bak-${ts}`);
  } else {
    console.log(`  [${slug}] [dry-run] renombraría foundation-state.json → .bak-${ts}`);
  }
}

const clients = onlySlug ? [onlySlug] : listClients();
console.log(`🔧 Migración F5 — workspace: ${WORKSPACE}`);
console.log(`   clientes: ${clients.join(", ") || "(ninguno)"}`);
console.log(`   modo: ${rollback ? "ROLLBACK" : apply ? "APPLY" : "DRY-RUN"}\n`);

for (const slug of clients) {
  if (!fs.existsSync(path.join(WORKSPACE, "brand", slug))) {
    console.error(`  [${slug}] ❌ no existe`);
    continue;
  }
  migrateClient(slug);
}

// 5. Check de resurrección (solo en apply, tras migrar)
if (apply && !rollback) {
  const resurrected = clients.filter((s) => fs.existsSync(path.join(WORKSPACE, "brand", s, "foundation-state.json")));
  if (resurrected.length) {
    console.warn(`\n⚠ foundation-state.json REAPARECIÓ en: ${resurrected.join(", ")} — hay una sesión vieja de Sancho escribiendo; reinicia el runtime y re-archiva.`);
  } else {
    console.log("\n✅ Migración completa. El fichero legacy no reaparece.");
  }
}
