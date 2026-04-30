#!/usr/bin/env tsx
/**
 * One-off migration: backfill `mc_chat_thread_id` on ContentTasks to the
 * canonical `content-{ctId.lower()}` convention.
 *
 * Why:
 *   `createContentTask` used to default `mc_chat_thread_id` to
 *   `task-{ctId.lower()}` by mistake, but the actual chat thread file lives
 *   at `chat/content-{ctId.lower()}.json` (because buildContentTaskThread
 *   uses the `content:` namespace and the threadFile sanitiser turns colons
 *   into hyphens). Result: legacy ContentTasks stored a dead pointer; the
 *   API task-index now uses a fallback to find the canonical file, but the
 *   JSON is still wrong. This script fixes the JSON and reconciles the
 *   chat files on disk so the source of truth and the cache agree.
 *
 * Strategy per ContentTask:
 *   1. canonical = `content-{ct.id.toLowerCase()}`
 *   2. If stored === canonical → skip.
 *   3. Else: rewrite the field to canonical.
 *   4. Reconcile chat files in `brand/{slug}/chat/`:
 *      - legacy exists, canonical missing → rename legacy → canonical
 *      - legacy exists, canonical exists  → merge messages (dedupe by
 *        ts+role+text), keep canonical, delete legacy
 *      - legacy missing, canonical missing → write empty canonical so the
 *        invariant matches what new createContentTask provides
 *      - legacy missing, canonical exists  → no-op on disk
 *
 * Usage:
 *   tsx scripts/migrate-content-task-threads.mts [--dry-run] [--slug=<slug>]
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

interface ChatMessage {
  role: string;
  text: string;
  ts?: number;
  agent?: string;
  attachments?: unknown[];
}

interface ChatFile {
  messages: ChatMessage[];
  createdAt?: string;
  discordThreadId?: string;
  discordChannelId?: string;
  updatedAt?: number;
}

interface ContentTask {
  id: string;
  mc_chat_thread_id?: string;
  [k: string]: unknown;
}

interface Task {
  id: string;
  type?: string;
  content_tasks?: ContentTask[];
  [k: string]: unknown;
}

type FileAction =
  | "skipped (canonical exists)"
  | "renamed legacy → canonical"
  | "merged legacy + canonical"
  | "created empty canonical"
  | "no chat files (created empty)";

interface MigrationEntry {
  slug: string;
  project: string;
  parentTaskId: string;
  contentTaskId: string;
  oldThread: string;
  newThread: string;
  fileAction: FileAction;
  alreadyCanonical?: boolean;
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

function mergeChatFiles(canonical: ChatFile, legacy: ChatFile): ChatFile {
  const seen = new Set<string>();
  const merged: ChatMessage[] = [];
  const all = [...(canonical.messages || []), ...(legacy.messages || [])];
  for (const m of all) {
    const key = `${m.ts ?? 0}|${m.role}|${(m.text || "").slice(0, 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(m);
  }
  merged.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return {
    ...canonical,
    messages: merged,
    createdAt:
      canonical.createdAt && legacy.createdAt
        ? canonical.createdAt < legacy.createdAt
          ? canonical.createdAt
          : legacy.createdAt
        : canonical.createdAt || legacy.createdAt,
    updatedAt: Math.max(canonical.updatedAt ?? 0, legacy.updatedAt ?? 0) || undefined,
    discordThreadId: canonical.discordThreadId || legacy.discordThreadId,
    discordChannelId: canonical.discordChannelId || legacy.discordChannelId,
  };
}

function migrateSlug(slug: string): MigrationEntry[] {
  const entries: MigrationEntry[] = [];
  const chatDir = path.join(BRAND_DIR, slug, "chat");

  for (const projDir of findProjectDirs(slug)) {
    const tasksPath = path.join(projDir, "tasks.json");
    if (!fileExists(tasksPath)) continue;

    const raw = readJSON<Task[] | { tasks: Task[] }>(tasksPath);
    if (!raw) continue;

    const tasks: Task[] = Array.isArray(raw) ? raw : raw.tasks || [];
    let dirty = false;

    for (const task of tasks) {
      const cts = Array.isArray(task.content_tasks) ? task.content_tasks : null;
      if (!cts || cts.length === 0) continue;

      for (const ct of cts) {
        if (!ct.id) continue;
        const canonical = `content-${ct.id.toLowerCase()}`;
        const stored = ct.mc_chat_thread_id;

        if (stored === canonical) {
          entries.push({
            slug,
            project: path.basename(projDir),
            parentTaskId: task.id,
            contentTaskId: ct.id,
            oldThread: stored,
            newThread: canonical,
            fileAction: "skipped (canonical exists)",
            alreadyCanonical: true,
          });
          continue;
        }

        // Always rewrite the field
        ct.mc_chat_thread_id = canonical;
        dirty = true;

        const canonicalFile = path.join(chatDir, `${canonical}.json`);
        const legacyFile = stored ? path.join(chatDir, `${stored}.json`) : null;
        const canonicalExists = fileExists(canonicalFile);
        const legacyExists = !!legacyFile && fileExists(legacyFile);

        let fileAction: FileAction = "skipped (canonical exists)";

        if (legacyExists && !canonicalExists) {
          if (!DRY_RUN) {
            fs.mkdirSync(chatDir, { recursive: true });
            fs.renameSync(legacyFile!, canonicalFile);
          }
          fileAction = "renamed legacy → canonical";
        } else if (legacyExists && canonicalExists) {
          if (!DRY_RUN) {
            const canonicalData = readJSON<ChatFile>(canonicalFile) || { messages: [] };
            const legacyData = readJSON<ChatFile>(legacyFile!) || { messages: [] };
            const merged = mergeChatFiles(canonicalData, legacyData);
            fs.writeFileSync(canonicalFile, JSON.stringify(merged, null, 2));
            fs.unlinkSync(legacyFile!);
          }
          fileAction = "merged legacy + canonical";
        } else if (!legacyExists && !canonicalExists) {
          if (!DRY_RUN) {
            fs.mkdirSync(chatDir, { recursive: true });
            fs.writeFileSync(
              canonicalFile,
              JSON.stringify({ messages: [], createdAt: new Date().toISOString() }, null, 2),
            );
          }
          fileAction = "no chat files (created empty)";
        } else {
          // canonicalExists && !legacyExists → nothing to do on disk
          fileAction = "skipped (canonical exists)";
        }

        entries.push({
          slug,
          project: path.basename(projDir),
          parentTaskId: task.id,
          contentTaskId: ct.id,
          oldThread: stored || "(unset)",
          newThread: canonical,
          fileAction,
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

console.log(`Migration: ContentTask mc_chat_thread_id backfill`);
console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "WRITE"}`);
console.log(`Workspace: ${BASE}`);
console.log(`Slugs: ${slugs.join(", ") || "(none)"}\n`);

const allEntries: MigrationEntry[] = [];
for (const slug of slugs) {
  const entries = migrateSlug(slug);
  allEntries.push(...entries);
}

const skipped = allEntries.filter((e) => e.alreadyCanonical);
const migrated = allEntries.filter((e) => !e.alreadyCanonical);

console.log(`========== SUMMARY ==========`);
console.log(`ContentTasks scanned:           ${allEntries.length}`);
console.log(`Already canonical (skipped):    ${skipped.length}`);
console.log(`Migrated:                       ${migrated.length}`);
console.log(`  field-only (canonical existed): ${migrated.filter((e) => e.fileAction === "skipped (canonical exists)").length}`);
console.log(`  legacy renamed → canonical:     ${migrated.filter((e) => e.fileAction === "renamed legacy → canonical").length}`);
console.log(`  legacy + canonical merged:      ${migrated.filter((e) => e.fileAction === "merged legacy + canonical").length}`);
console.log(`  empty canonical created:        ${migrated.filter((e) => e.fileAction === "no chat files (created empty)").length}`);

if (migrated.length > 0) {
  console.log(`\n========== CHANGES ==========`);
  for (const e of migrated) {
    console.log(
      `  ${e.slug.padEnd(15)} ${e.contentTaskId.padEnd(35)}  ${e.oldThread.padEnd(45)} → ${e.newThread.padEnd(45)}  ${e.fileAction}`,
    );
  }
}

if (DRY_RUN) {
  console.log(`\n(dry run — no files were modified)`);
}
