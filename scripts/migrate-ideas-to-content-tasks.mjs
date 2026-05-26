#!/usr/bin/env node
/**
 * One-shot migration: unify content-engine ideas + nested ContentTasks into
 * a single flat-file `brand/{slug}/content/content-tasks.json`.
 *
 * Reads:
 *   - brand/{slug}/content/idea-queue.json              (legacy idea pool)
 *   - brand/{slug}/projects/{*}/tasks.json              (nested content_tasks[])
 *
 * Writes:
 *   - brand/{slug}/content/content-tasks.json           (new flat list)
 *   - brand/{slug}/content/idea-queue.json.pre-unification.bak (timestamped backup)
 *
 * Does NOT touch tasks.json (still has nested content_tasks[] for legacy
 * consumers — Phase 6 cleanup will strip them once all consumers migrate to
 * the flat file).
 *
 * Merging rules:
 *   - For each idea, if a nested CT references it via `idea_id`, MERGE: take
 *     the CT's runtime fields (status, drafts, threads, parent_task_id) and
 *     enrich with the idea's discovery fields (title, signal, angle_draft,
 *     pov_confidence, pillar_id, ...).
 *   - For ideas without any CT match, create an orphan CT (no parent_task_id).
 *   - For nested CTs without a matching idea (rare/defensive), include as-is.
 *
 * Run:  node scripts/migrate-ideas-to-content-tasks.mjs [slug]
 *   No slug → process all brands.
 *   Slug    → process only that brand (e.g. `growth4u` for dry-run).
 */

import fs from "fs";
import path from "path";

const BASE = process.env.MC_WORKSPACE
  || path.join(process.env.HOME || "/Users/ragi", ".openclaw", "workspace-sancho");

const targetSlug = process.argv[2] || null;

// Idea-only fields to copy onto the unified CT (do not overwrite if CT already
// has the field set — CT is the more authoritative record).
const IDEA_DISCOVERY_FIELDS = [
  "title",
  "pillar_id",
  "content_type",
  "target_channel",
  "signal",
  "angle_draft",
  "pov_confidence",
  "signal_type",
  "source_signals",
  "dispatch_date",
  "dispatch_slot",
  "approved_via",
  "approved_by",
  "archived_at",
  "archived_via",
  "archived_by",
  "deferred_by",
  "target_date",
];

function ts() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); }
  catch { return null; }
}

function listBrandSlugs() {
  const root = path.join(BASE, "brand");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function listProjectTasksFiles(slug) {
  const root = path.join(BASE, "brand", slug, "projects");
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const proj of fs.readdirSync(root, { withFileTypes: true })) {
    if (!proj.isDirectory()) continue;
    const f = path.join(root, proj.name, "tasks.json");
    if (fs.existsSync(f)) out.push(f);
  }
  return out;
}

function collectNestedContentTasks(slug) {
  const out = [];
  for (const f of listProjectTasksFiles(slug)) {
    const tasks = loadJson(f);
    if (!Array.isArray(tasks)) continue;
    for (const t of tasks) {
      if (!Array.isArray(t.content_tasks)) continue;
      for (const ct of t.content_tasks) {
        out.push({ ...ct, parent_task_id: ct.parent_task_id || t.id });
      }
    }
  }
  return out;
}

function buildUnifiedCT(idea, ct) {
  // CT is the authoritative source; merge discovery fields from idea where CT
  // doesn't already have them. Status comes from CT if present, else idea.
  const merged = { ...ct };
  for (const k of IDEA_DISCOVERY_FIELDS) {
    if (merged[k] === undefined && idea[k] !== undefined) merged[k] = idea[k];
  }
  // Required fields with sane defaults
  if (!merged.idea_id) merged.idea_id = idea.id;
  if (!merged.documents) merged.documents = [];
  if (!merged.target_channels || merged.target_channels.length === 0) {
    merged.target_channels = idea.target_channel ? [idea.target_channel] : [];
  }
  if (!merged.created_at) merged.created_at = idea.created_at;
  if (!merged.status) merged.status = idea.status || "New";
  if (!merged.name) merged.name = idea.title || (idea.angle_draft || "").slice(0, 80) || idea.id;
  return merged;
}

function ideaToOrphanCT(idea) {
  const ct = {
    id: idea.id,                     // Preserve legacy ID (Phase 6 may rename to CT-{slug}-... format)
    idea_id: idea.id,                // Self-reference
    // parent_task_id intentionally omitted (orphan)
    name: idea.title || (idea.angle_draft || "").slice(0, 80) || idea.id,
    status: idea.status || "New",
    target_channels: idea.target_channel ? [idea.target_channel] : [],
    documents: [],
    created_at: idea.created_at || new Date().toISOString(),
  };
  for (const k of IDEA_DISCOVERY_FIELDS) {
    if (idea[k] !== undefined) ct[k] = idea[k];
  }
  if (idea.approved_at) ct.approved_at = idea.approved_at;
  if (idea.deferred_at) ct.deferred_at = idea.deferred_at;
  return ct;
}

function migrateBrand(slug) {
  const ideaPath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  const outPath = path.join(BASE, "brand", slug, "content", "content-tasks.json");

  const ideas = loadJson(ideaPath) || [];
  const nestedCTs = collectNestedContentTasks(slug);

  if (ideas.length === 0 && nestedCTs.length === 0) {
    return { slug, ideas: 0, nestedCTs: 0, output: 0, skipped: true };
  }

  // Already migrated? Skip if content-tasks.json exists with non-zero entries.
  const existingFlat = loadJson(outPath);
  if (Array.isArray(existingFlat) && existingFlat.length > 0) {
    return { slug, ideas: ideas.length, nestedCTs: nestedCTs.length, output: existingFlat.length, alreadyMigrated: true };
  }

  // Index nested CTs by their idea_id reference.
  const ctsByIdeaId = new Map();
  for (const ct of nestedCTs) {
    if (ct.idea_id) ctsByIdeaId.set(ct.idea_id, ct);
  }

  const seenIds = new Set();
  const output = [];

  // Pass 1: every idea becomes a CT (merged or orphan)
  for (const idea of ideas) {
    const matched = ctsByIdeaId.get(idea.id);
    const ct = matched ? buildUnifiedCT(idea, matched) : ideaToOrphanCT(idea);
    if (seenIds.has(ct.id)) {
      // Shouldn't happen post-dedup, but be defensive
      console.warn(`[${slug}] duplicate id during migration: ${ct.id}, skipping`);
      continue;
    }
    seenIds.add(ct.id);
    output.push(ct);
  }

  // Pass 2: nested CTs not linked to any idea (defensive — should be empty in practice)
  for (const ct of nestedCTs) {
    if (ct.idea_id && ctsByIdeaId.has(ct.idea_id)) continue; // Already merged
    if (seenIds.has(ct.id)) continue;
    seenIds.add(ct.id);
    output.push(ct);
  }

  // Backup idea-queue.json
  if (fs.existsSync(ideaPath)) {
    const bak = ideaPath.replace(/\.json$/, `.pre-unification.${ts()}.bak`);
    fs.copyFileSync(ideaPath, bak);
  }

  // Write flat file
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  return { slug, ideas: ideas.length, nestedCTs: nestedCTs.length, output: output.length };
}

function main() {
  const slugs = targetSlug ? [targetSlug] : listBrandSlugs();
  const results = [];
  for (const slug of slugs) {
    try {
      results.push(migrateBrand(slug));
    } catch (e) {
      console.error(`[${slug}] migration failed:`, e.message);
      results.push({ slug, error: e.message });
    }
  }

  console.log("\n=== Migration summary ===");
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.slug}: ERROR — ${r.error}`);
    } else if (r.alreadyMigrated) {
      console.log(`  ${r.slug}: skipped (already has content-tasks.json with ${r.output} entries)`);
    } else if (r.skipped) {
      console.log(`  ${r.slug}: skipped (no ideas, no nested CTs)`);
    } else {
      console.log(`  ${r.slug}: ${r.ideas} ideas + ${r.nestedCTs} nested CTs → ${r.output} unified`);
    }
  }
}

main();
