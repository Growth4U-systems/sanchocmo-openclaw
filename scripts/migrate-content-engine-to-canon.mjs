#!/usr/bin/env node
/**
 * migrate-content-engine-to-canon.mjs
 *
 * Reports the diff between a brand's existing P{NN}-Content-Engine project
 * and the canonical 5-task structure that growth4u/P14-Content-Engine uses
 * and that `src/pages/api/content-creation/create-project.ts` now generates.
 *
 * Usage:
 *   node scripts/migrate-content-engine-to-canon.mjs                 # all brands, dry-run
 *   node scripts/migrate-content-engine-to-canon.mjs --slug paymatico  # one brand, dry-run
 *   node scripts/migrate-content-engine-to-canon.mjs --slug paymatico --apply  # write changes
 *
 * Defaults to dry-run (no writes). With `--apply` the script:
 *   1. Backups the existing `tasks.json` to `tasks.json.pre-canon-<timestamp>`
 *   2. Rewrites `tasks.json` to the canonical 5-task structure
 *   3. Preserves the existing T01 Strategy (if any) by mapping its
 *      deliverable_file to the canonical path — does NOT delete files.
 *   4. Marks non-canonical tasks as DROPPED in the backup but does not
 *      attempt to migrate them. The operator decides what to do with
 *      Playbook/Channel/Keywords/Calendar/Lead-Magnet work (kept in disk).
 *
 * Skill-based mapping rules:
 *   content-strategy        →  T01  Content Strategy (kept, status preserved)
 *   content-pillars         →  T02  Content Pillars (kept if exists)
 *   content-engine-setup    →  T03  Setup configs (kept if exists)
 *   pov-bank-builder        →  T04  Build POV Bank (kept if exists)
 *   {slug}-visual-generator →  T05  Visual Templates (kept if exists)
 *   everything else         →  DROPPED (work preserved on disk)
 */

import fs from "fs";
import os from "os";
import path from "path";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const SLUG_ARG = argv[argv.indexOf("--slug") + 1] || null;

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
const WORKSPACE = process.env.MC_WORKSPACE || path.join(OPENCLAW_HOME, "workspace-sancho");
const BRANDS_DIR = path.join(WORKSPACE, "brand");

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); }
  catch { return fallback; }
}

function findContentEngineProjectDir(slug) {
  const projectsDir = path.join(BRANDS_DIR, slug, "projects");
  if (!fs.existsSync(projectsDir)) return null;
  const dirs = fs.readdirSync(projectsDir).filter((d) => /^P\d+-Content-Engine/i.test(d));
  if (dirs.length === 0) return null;
  // Prefer the first match (usually only one)
  return path.join(projectsDir, dirs[0]);
}

function canonicalTasks(slug, projectId) {
  const taskThreadId = (n) => `task-${projectId.toLowerCase()}-${n}`;
  return [
    {
      id: `${projectId}-T01`,
      name: "Content Strategy (14 decisiones globales)",
      description: "Proceso 1 — Ejecutar content-strategy a nivel empresa. Define: nichos confirmados, Content Tilt, Villano, Trigger Events, canales activos, mix searchable/shareable, pillars a alto nivel, KPIs norte.",
      phase: 1, type: "foundation", channel: "strategy", niche: null, status: "todo",
      deliverable: "Documento con las 14 decisiones estrategicas globales del Content Engine",
      deliverable_file: `brand/${slug}/content/strategy-decisions.md`,
      output_files: ["strategy-decisions.md"],
      depends_on: null,
      owner: "Sancho", skill: "content-strategy",
      mc_chat_thread_id: taskThreadId("t01"),
      discord_thread_id: null,
    },
    {
      id: `${projectId}-T02`,
      name: "Content Pillars (3-5 temas)",
      description: "Proceso 1 — Ejecutar content-pillars. Define 3-5 pillars (TEMAS, no POV). Lee Foundation completa + strategy-decisions.md. Asigna funnel_role per pillar. El humano confirma la lista final.",
      phase: 1, type: "foundation", channel: "strategy", niche: null, status: "todo",
      deliverable: "Content pillars con funnel_role, pain_origin, expertise, related_topics",
      deliverable_file: `brand/${slug}/content/content-pillars.md`,
      output_files: ["content-pillars.md"],
      depends_on: `${projectId}-T01`,
      owner: "Sancho", skill: "content-pillars",
      mc_chat_thread_id: taskThreadId("t02"),
      discord_thread_id: null,
    },
    {
      id: `${projectId}-T03`,
      name: "Setup configs por pillar",
      description: `Rellena los configs existentes (news-prompts, paa-queries, keywords-seed, sources.json profiles, cadence-config.yml) con datos derivados de content-pillars.md + pov-bank.json + Foundation. ORDEN DE EJECUCION: SE EJECUTA EL ULTIMO. Requiere ${projectId}-T01 (Strategy) + ${projectId}-T02 (Pillars) + ${projectId}-T04 (POV Bank) en status:completed.`,
      phase: 1, type: "execution", channel: "strategy", niche: null, status: "todo",
      deliverable: "Configs por pillar + cadence + sources.json profiles + setup.md narrativo",
      deliverable_file: `brand/${slug}/content/configs/setup.md`,
      output_files: ["setup.md", "cadence-config.yml", "news-prompts/*.yml", "paa-queries/*.yml", "keywords-seed/*.yml", "../../market-and-us/competitors/sources.json"],
      depends_on: `${projectId}-T04`,
      owner: "Sancho", skill: "content-engine-setup",
      mc_chat_thread_id: taskThreadId("t03"),
      discord_thread_id: null,
    },
    {
      id: `${projectId}-T04`,
      name: "Build POV Bank",
      description: `Construye la BD de puntos de vista (pov-bank.json) per pillar. ORDEN DE EJECUCION: VA ANTES que ${projectId}-T03 (Setup configs). Requiere ${projectId}-T01 (Strategy) + ${projectId}-T02 (Pillars).`,
      phase: 1, type: "execution", channel: "strategy", niche: null, status: "todo",
      deliverable: "POV Bank con opiniones por pillar (core_belief, we_say_yes/no, preferred_angles, evidence)",
      deliverable_file: `brand/${slug}/content/pov-bank.json`,
      output_files: ["pov-bank.json", "pov-bank-history.json"],
      depends_on: `${projectId}-T02`,
      owner: "Sancho", skill: "pov-bank-builder",
      mc_chat_thread_id: taskThreadId("t04"),
      discord_thread_id: null,
    },
    {
      id: `${projectId}-T05`,
      name: "Visual Templates (5 plantillas HTML)",
      description: `Genera 5 plantillas HTML brand-specific via skill ${slug}-visual-generator. Prerequisito: visual-identity pillar 'approved' en Foundation L5.`,
      phase: 1, type: "foundation", channel: "visual", niche: null, status: "todo",
      deliverable: "5 plantillas HTML + meta.json por plantilla",
      deliverable_file: [
        `brand/${slug}/brand-book/visual-identity/templates/linkedin-quote/template.html`,
        `brand/${slug}/brand-book/visual-identity/templates/linkedin-9-slide/slide-cover.html`,
        `brand/${slug}/brand-book/visual-identity/templates/instagram-3-slide/slide-cover.html`,
        `brand/${slug}/brand-book/visual-identity/templates/blog-post/template.html`,
        `brand/${slug}/brand-book/visual-identity/templates/blog-title/template.html`,
      ],
      output_files: [
        "brand-book/visual-identity/templates/linkedin-quote/template.html",
        "brand-book/visual-identity/templates/linkedin-9-slide/slide-cover.html",
        "brand-book/visual-identity/templates/instagram-3-slide/slide-cover.html",
        "brand-book/visual-identity/templates/blog-post/template.html",
        "brand-book/visual-identity/templates/blog-title/template.html",
      ],
      depends_on: [`${projectId}-T01`, `${projectId}-T02`],
      owner: "Sancho", skill: `${slug}-visual-generator`,
      mc_chat_thread_id: taskThreadId("t05"),
      discord_thread_id: null,
    },
  ];
}

const CANON_SKILL_MAP = {
  "content-strategy":     "T01",
  "content-pillars":      "T02",
  "content-engine-setup": "T03",
  "pov-bank-builder":     "T04",
  // Visual generator is per-brand: matched separately by suffix
};

function classifyExisting(existingTasks, projectId, slug) {
  const visualSkill = `${slug}-visual-generator`;
  const kept = [];   // { existingTask, mapsTo: "T01" }
  const dropped = []; // existingTask
  for (const t of existingTasks) {
    const canon = CANON_SKILL_MAP[t.skill];
    if (canon) {
      kept.push({ existingTask: t, mapsTo: `${projectId}-${canon}` });
      continue;
    }
    if (t.skill === visualSkill) {
      kept.push({ existingTask: t, mapsTo: `${projectId}-T05` });
      continue;
    }
    dropped.push(t);
  }
  return { kept, dropped };
}

function diff(slug) {
  const projectDir = findContentEngineProjectDir(slug);
  if (!projectDir) return { slug, status: "no-content-engine-project" };

  const projectName = path.basename(projectDir);
  const project = readJSON(path.join(projectDir, "project.json"), null);
  if (!project) return { slug, status: "missing-project-json", projectName };

  const projectId = project.id;
  const existingTasks = readJSON(path.join(projectDir, "tasks.json"), null);
  if (!Array.isArray(existingTasks)) return { slug, status: "missing-tasks-json", projectName, projectId };

  const target = canonicalTasks(slug, projectId);
  const { kept, dropped } = classifyExisting(existingTasks, projectId, slug);

  // For canonical tasks already present (kept), inherit status / completion
  // from existing where possible.
  const merged = target.map((canonTask) => {
    const match = kept.find((k) => k.mapsTo === canonTask.id);
    if (!match) return canonTask;
    const ex = match.existingTask;
    return {
      ...canonTask,
      status: ex.status || canonTask.status,
      completed: ex.completed || canonTask.completed,
      // Keep the existing deliverable_file if it points somewhere real
      // (preserves links to {niche}/current.md instead of overwriting)
      ...(ex.deliverable_file ? { deliverable_file_legacy: ex.deliverable_file } : {}),
    };
  });

  return {
    slug, status: "ready", projectName, projectId,
    existingCount: existingTasks.length,
    kept: kept.map((k) => ({ id: k.existingTask.id, name: k.existingTask.name, skill: k.existingTask.skill, status: k.existingTask.status, mapsTo: k.mapsTo })),
    dropped: dropped.map((t) => ({ id: t.id, name: t.name, skill: t.skill, status: t.status })),
    canonical: merged.map((t) => ({ id: t.id, name: t.name, skill: t.skill, status: t.status })),
  };
}

function listBrands() {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs.readdirSync(BRANDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((s) => !["example", "default", "general", "test", "unknown", "sancho", "sanchocmo"].includes(s));
}

function printReport(report) {
  console.log(`\n=== ${report.slug} ===`);
  if (report.status !== "ready") { console.log(`  status: ${report.status}`); return; }
  console.log(`  project: ${report.projectName} (id ${report.projectId})`);
  console.log(`  existing tasks: ${report.existingCount}`);
  console.log();
  console.log("  KEPT (will map to canonical position):");
  if (report.kept.length === 0) console.log("    (none)");
  for (const k of report.kept) console.log(`    ${k.id.padEnd(15)} → ${k.mapsTo.padEnd(8)} | skill: ${k.skill.padEnd(28)} | status: ${k.status} | ${(k.name||"").slice(0,40)}`);
  console.log();
  console.log("  DROPPED (NOT in canon — files on disk untouched):");
  if (report.dropped.length === 0) console.log("    (none)");
  for (const d of report.dropped) console.log(`    ${d.id.padEnd(15)} | skill: ${(d.skill||"").padEnd(28)} | status: ${d.status} | ${(d.name||"").slice(0,40)}`);
  console.log();
  console.log("  CANONICAL (final tasks.json structure):");
  for (const c of report.canonical) console.log(`    ${c.id.padEnd(15)} | skill: ${(c.skill||"").padEnd(28)} | status: ${c.status} | ${(c.name||"").slice(0,40)}`);
}

function applyMigration(slug, report) {
  const projectDir = findContentEngineProjectDir(slug);
  if (!projectDir) return;
  const tasksPath = path.join(projectDir, "tasks.json");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(projectDir, `tasks.json.pre-canon-${ts}`);
  fs.copyFileSync(tasksPath, backupPath);
  const projectId = report.projectId;
  const target = canonicalTasks(slug, projectId);
  // Merge in existing kept tasks' status + completed
  for (const t of target) {
    const k = report.kept.find((x) => x.mapsTo === t.id);
    if (k) {
      t.status = k.status || t.status;
    }
  }
  fs.writeFileSync(tasksPath, JSON.stringify(target, null, 2));
  console.log(`  ✓ wrote canonical tasks.json (backup: ${path.basename(backupPath)})`);
}

const targets = SLUG_ARG ? [SLUG_ARG] : listBrands();
console.log(`Mode: ${APPLY ? "APPLY (writes)" : "DRY-RUN"}`);
console.log(`Workspace: ${WORKSPACE}`);
console.log(`Brands: ${targets.length === 1 ? targets[0] : `${targets.length} (${targets.slice(0, 5).join(", ")}${targets.length > 5 ? ", ..." : ""})`}`);

for (const slug of targets) {
  const report = diff(slug);
  if (report.status === "no-content-engine-project") continue;
  printReport(report);
  if (APPLY && report.status === "ready") applyMigration(slug, report);
}
