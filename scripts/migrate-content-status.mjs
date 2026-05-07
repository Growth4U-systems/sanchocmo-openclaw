#!/usr/bin/env node
// One-shot migration: rewrite legacy ContentTask statuses to the new state
// machine after the Review-removal / Media-rename refactor.
//
// Mapping:
//   "Review" → "Pending Media" + pipeline_state ("media-review" if any draft
//                                has media, else "generating-media")
//   "Media"  → "Pending Media" + pipeline_state="media-review" (had media when
//                                marked Media originally)
//   anything else → preserved as-is
//
// Walks every brand's project tasks.json and patches `content_tasks[]` in
// place. Idempotent — re-running on already-migrated data is a no-op.
//
// Run from repo root:
//   node scripts/migrate-content-status.mjs              (apply)
//   node scripts/migrate-content-status.mjs --dry-run    (preview only)

import fs from "fs";
import path from "path";

const BASE = process.env.MC_WORKSPACE
  || path.join(process.env.HOME || "/Users/ragi", ".openclaw", "workspace-sancho");

const dryRun = process.argv.includes("--dry-run");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); }
  catch { return null; }
}

function parseFrontmatter(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const yaml = raw.slice(4, end);
  // Minimal: we only need to detect `media:` lines with at least one entry.
  // A `media:` field can be `media: []` (empty) or a multiline list.
  const lines = yaml.split("\n");
  let inMedia = false;
  let mediaCount = 0;
  for (const line of lines) {
    if (/^media:\s*\[\s*\]\s*$/.test(line)) return { hasMedia: false };
    if (/^media:\s*$/.test(line)) { inMedia = true; continue; }
    if (inMedia) {
      if (/^\s+-\s/.test(line)) { mediaCount++; continue; }
      if (/^\S/.test(line)) inMedia = false;
    }
  }
  return { hasMedia: mediaCount > 0 };
}

function ideaHasMedia(slug, ideaId, channels) {
  const draftsDir = path.join(BASE, "brand", slug, "content", "drafts", ideaId);
  if (!fs.existsSync(draftsDir)) return false;

  // Source 1: frontmatter media[] field on each per-channel draft.
  const list = channels && channels.length > 0
    ? channels.map((c) => `${c}.md`)
    : fs.readdirSync(draftsDir).filter((n) => n.endsWith(".md") && !n.includes(".v"));
  for (const name of list) {
    const fm = parseFrontmatter(path.join(draftsDir, name));
    if (fm?.hasMedia) return true;
  }

  // Source 2: per-idea media/ subdirectory (carousel renderer + image gen
  // sometimes drop assets here without populating the frontmatter array).
  const mediaSubdir = path.join(draftsDir, "media");
  if (fs.existsSync(mediaSubdir)) {
    const assets = fs.readdirSync(mediaSubdir).filter(
      (n) => /\.(webp|png|jpg|jpeg|gif|mp4|pdf)$/i.test(n),
    );
    if (assets.length > 0) return true;
  }
  return false;
}

const brandsDir = path.join(BASE, "brand");
if (!fs.existsSync(brandsDir)) {
  console.error(`! brands dir not found: ${brandsDir}`);
  process.exit(1);
}
const brands = fs.readdirSync(brandsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let filesScanned = 0, filesChanged = 0, ctsScanned = 0, ctsChanged = 0;
const summary = [];

for (const brand of brands) {
  const projectsDir = path.join(brandsDir, brand, "projects");
  if (!fs.existsSync(projectsDir)) continue;
  const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const project of projects) {
    const tasksFile = path.join(projectsDir, project, "tasks.json");
    if (!fs.existsSync(tasksFile)) continue;
    const tasks = readJson(tasksFile);
    if (!Array.isArray(tasks)) continue;
    filesScanned++;

    let dirty = false;
    for (const t of tasks) {
      const cts = Array.isArray(t.content_tasks) ? t.content_tasks : null;
      if (!cts) continue;

      for (const ct of cts) {
        ctsScanned++;
        const old = ct.status;
        if (old !== "Review" && old !== "Media") continue;

        const hasMedia = ideaHasMedia(brand, ct.idea_id, ct.target_channels || []);
        const newStatus = "Pending Media";
        const newPipeline = hasMedia ? "media-review" : "generating-media";

        ct.status = newStatus;
        ct.pipeline_state = newPipeline;
        if (!ct.pending_media_at) ct.pending_media_at = new Date().toISOString();
        dirty = true;
        ctsChanged++;
        summary.push(`${brand}/${project}/${ct.id}: ${old} → ${newStatus}/${newPipeline}`);
      }
    }

    if (dirty) {
      filesChanged++;
      if (!dryRun) {
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
      }
    }
  }
}

console.log(dryRun ? "DRY RUN — no files written\n" : "MIGRATION APPLIED\n");
for (const line of summary) console.log("  " + line);
console.log(`\nFiles scanned: ${filesScanned}, files ${dryRun ? "would change" : "changed"}: ${filesChanged}`);
console.log(`Content tasks scanned: ${ctsScanned}, ${dryRun ? "would migrate" : "migrated"}: ${ctsChanged}`);
