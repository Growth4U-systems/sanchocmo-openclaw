#!/usr/bin/env tsx
/**
 * One-off migration: populate `deliverable_file` on every task in every
 * client's `tasks.json`.
 *
 * Why:
 *   The UI used to hard-code `current.md` for foundation pillar deliverables,
 *   but skills like `competitor-intelligence` actually write
 *   `competitive-analysis.current.md`. The new resolver (`resolveTaskDocPaths`
 *   in `lib/pillar-doc-paths.ts`) reads `deliverable_file` from the task
 *   when present. This migration backfills that field for tasks that were
 *   created before the field existed.
 *
 * Strategy per task:
 *   1. If `deliverable_file` already set → skip.
 *   2. If task has a `pillar` and `foundation-state.json.pillars[pillar].output_file`
 *      points to an actual file on disk → use it.
 *   3. If the task's `deliverable` description embeds a path-like fragment
 *      (e.g. "market-and-us/competitors/ con fichas..."), glob that
 *      directory for `*.current.md` files and pick the first match,
 *      preferring filenames that include the skill name.
 *   4. Else, leave it unset (no harm — the resolver still falls back to
 *      the static map).
 *
 * Usage:
 *   tsx scripts/migrate-deliverable-file.mts [--dry-run] [--slug=<slug>]
 *
 * Output: prints a summary table of changes per slug.
 */

import fs from "fs";
import path from "path";
import os from "os";

const HOME = os.homedir();
const BASE = process.env.MC_WORKSPACE || path.join(HOME, ".openclaw", "workspace-sancho");
const BRAND_DIR = path.join(BASE, "brand");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SLUG_FILTER = args.find((a) => a.startsWith("--slug="))?.split("=")[1];

interface Task {
  id: string;
  name: string;
  deliverable?: string;
  deliverable_file?: string | string[];
  pillar?: string;
  section?: string;
  skill?: string;
  output_files?: string[];
  [k: string]: unknown;
}

interface FoundationState {
  sections?: Record<
    string,
    {
      pillars?: Record<string, { output_file?: string; status?: string }>;
      skills?: Record<string, { output_file?: string }>;
    }
  >;
}

interface MigrationEntry {
  slug: string;
  project: string;
  taskId: string;
  taskName: string;
  resolvedFrom: "pillar.output_file" | "deliverable.glob" | "skill.glob" | "skipped (already set)" | "skipped (not found)";
  newValue: string | null;
}

function readJSON<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function listSlugs(): string[] {
  if (!fs.existsSync(BRAND_DIR)) return [];
  return fs
    .readdirSync(BRAND_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function findProjectDirs(slug: string): string[] {
  const dir = path.join(BRAND_DIR, slug, "projects");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name));
}

/**
 * Try to extract a directory path from the task's `deliverable` text.
 * Examples:
 *   "market-and-us/competitors/ con fichas y battle cards." → "market-and-us/competitors"
 *   "market-and-us/market/current.md con análisis"           → "market-and-us/market"
 *   "go-to-market/ecps/current.md"                           → "go-to-market/ecps"
 */
function extractDeliverablePath(deliverable: string | undefined): string | null {
  if (!deliverable) return null;
  // Match a path-looking token: word/word(/word)*[/]
  const match = deliverable.match(/([a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-/]+)/);
  if (!match) return null;
  let p = match[1];
  // Strip trailing slash and trailing filename
  p = p.replace(/\/$/, "");
  // If the match looks like a file (ends with .md, .json, .html, etc.), strip the filename
  if (/\.(md|json|html|txt|yaml|yml)$/i.test(p)) {
    p = path.dirname(p);
  }
  return p || null;
}

/**
 * Glob `*.current.md` (or other current.* files) inside a directory, sorted
 * with files matching skillName preferred first.
 */
function globCurrentFiles(dirAbs: string, skillName?: string): string[] {
  if (!fs.existsSync(dirAbs)) return [];
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(dirAbs, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
  } catch {
    return [];
  }
  // Filter to .current.md or current.md
  const candidates = files.filter((f) => /\.current\.(md|html|json)$/.test(f) || f === "current.md");
  // Prefer filename that contains the skill slug
  if (skillName) {
    const skillSlug = skillName.replace(/[^a-z0-9]/gi, "").toLowerCase();
    candidates.sort((a, b) => {
      const aMatch = a.toLowerCase().replace(/[^a-z0-9]/gi, "").includes(skillSlug) ? 0 : 1;
      const bMatch = b.toLowerCase().replace(/[^a-z0-9]/gi, "").includes(skillSlug) ? 0 : 1;
      return aMatch - bMatch;
    });
  }
  return candidates;
}

function migrateSlug(slug: string): MigrationEntry[] {
  const entries: MigrationEntry[] = [];

  const stateFile = path.join(BRAND_DIR, slug, "foundation-state.json");
  const state = fileExists(stateFile) ? readJSON<FoundationState>(stateFile) : null;

  for (const projDir of findProjectDirs(slug)) {
    const tasksPath = path.join(projDir, "tasks.json");
    if (!fileExists(tasksPath)) continue;

    const raw = readJSON<Task[] | { tasks: Task[] }>(tasksPath);
    if (!raw) continue;

    const tasks: Task[] = Array.isArray(raw) ? raw : raw.tasks || [];
    let dirty = false;

    for (const task of tasks) {
      if (task.deliverable_file) {
        entries.push({
          slug,
          project: path.basename(projDir),
          taskId: task.id,
          taskName: task.name,
          resolvedFrom: "skipped (already set)",
          newValue: null,
        });
        continue;
      }

      // Try 1: pillar.output_file from foundation-state
      let resolved: string | null = null;
      let resolvedFrom: MigrationEntry["resolvedFrom"] = "skipped (not found)";

      if (task.pillar && state?.sections) {
        for (const sec of Object.values(state.sections)) {
          const pillars = sec.pillars || sec.skills || {};
          const p = pillars[task.pillar];
          if (p?.output_file) {
            const abs = path.join(BRAND_DIR, slug, p.output_file.replace(/^brand\/[^/]+\//, ""));
            if (fileExists(abs)) {
              resolved = p.output_file.replace(/^brand\/[^/]+\//, "");
              resolvedFrom = "pillar.output_file";
              break;
            }
          }
        }
      }

      // Try 2: glob *.current.md inside the deliverable directory
      if (!resolved) {
        const dirHint = extractDeliverablePath(task.deliverable);
        if (dirHint) {
          const dirAbs = path.join(BRAND_DIR, slug, dirHint);
          const candidates = globCurrentFiles(dirAbs, task.skill);
          if (candidates.length > 0) {
            resolved = path.join(dirHint, candidates[0]);
            resolvedFrom = "deliverable.glob";
          }
        }
      }

      // Try 3: glob in the directory implied by the skill name (if no deliverable hint)
      // Skipped — too speculative. Better to leave unset and let the static fallback handle it.

      if (resolved) {
        task.deliverable_file = resolved;
        dirty = true;
        entries.push({
          slug,
          project: path.basename(projDir),
          taskId: task.id,
          taskName: task.name,
          resolvedFrom,
          newValue: resolved,
        });
      } else {
        entries.push({
          slug,
          project: path.basename(projDir),
          taskId: task.id,
          taskName: task.name,
          resolvedFrom: "skipped (not found)",
          newValue: null,
        });
      }
    }

    if (dirty && !DRY_RUN) {
      const writeData = Array.isArray(raw) ? tasks : { ...raw, tasks };
      fs.writeFileSync(tasksPath, JSON.stringify(writeData, null, 2));
    }
  }

  return entries;
}

// -- Main --------------------------------------------------------------------

const slugs = SLUG_FILTER ? [SLUG_FILTER] : listSlugs();

console.log(`Migration: deliverable_file backfill`);
console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "WRITE"}`);
console.log(`Workspace: ${BASE}`);
console.log(`Slugs: ${slugs.join(", ")}\n`);

const allEntries: MigrationEntry[] = [];
for (const slug of slugs) {
  const entries = migrateSlug(slug);
  allEntries.push(...entries);
}

const updated = allEntries.filter((e) => e.newValue !== null);
const skippedExisting = allEntries.filter((e) => e.resolvedFrom === "skipped (already set)");
const skippedNotFound = allEntries.filter((e) => e.resolvedFrom === "skipped (not found)");

console.log(`\n========== SUMMARY ==========`);
console.log(`Tasks scanned:            ${allEntries.length}`);
console.log(`Tasks updated:            ${updated.length}`);
console.log(`  via pillar.output_file: ${updated.filter((e) => e.resolvedFrom === "pillar.output_file").length}`);
console.log(`  via deliverable.glob:   ${updated.filter((e) => e.resolvedFrom === "deliverable.glob").length}`);
console.log(`Tasks skipped (existing): ${skippedExisting.length}`);
console.log(`Tasks skipped (no match): ${skippedNotFound.length}`);

if (updated.length > 0) {
  console.log(`\n========== CHANGES ==========`);
  for (const e of updated) {
    console.log(`  ${e.slug.padEnd(15)} ${e.taskId.padEnd(15)} ${e.resolvedFrom.padEnd(22)} ${e.newValue}`);
  }
}

if (DRY_RUN) {
  console.log(`\n(dry run — no files were modified)`);
}
