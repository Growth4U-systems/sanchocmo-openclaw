#!/usr/bin/env node
// One-shot backfill: populate `ContentTask.channel_phases` in tasks.json from
// the legacy `meta.status` field on each `content/drafts/{ideaId}/{channel}.md`.
//
// Context: the draft frontmatter `status` field was removed in favor of
// per-channel phases tracked under the parent ContentTask in tasks.json.
// Existing CTs created before the refactor have no `channel_phases` set —
// this script reads the per-channel `.md` frontmatters once and copies their
// phase forward.
//
// Run from anywhere:
//   node scripts/backfill-channel-phases.mjs              (apply)
//   node scripts/backfill-channel-phases.mjs --dry-run    (preview only)
//
// Idempotent: a CT that already has channel_phases for a given channel is
// not overwritten — re-running is safe.

import fs from "fs";
import path from "path";

const BASE = process.env.MC_WORKSPACE
  || path.join(process.env.HOME || "/Users/ragi", ".openclaw", "workspace-sancho");

const dryRun = process.argv.includes("--dry-run");

const VALID_PHASES = new Set([
  "researching",
  "clarify-needed",
  "drafting",
  "draft",
  "approved",
  "published",
]);

// Map legacy "pending" → "researching" (the canonical entry phase). Anything
// else passes through if valid; unknown values are dropped (conservative).
function normalizePhase(raw) {
  if (raw === "pending") return "researching";
  if (typeof raw === "string" && VALID_PHASES.has(raw)) return raw;
  return null;
}

function readDraftStatus(slug, ideaId, channel) {
  const filePath = path.join(BASE, "brand", slug, "content", "drafts", ideaId, `${channel}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  // Minimal frontmatter reader: first --- block.
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const statusLine = fm.match(/^status:\s*"?([a-z\-]+)"?\s*$/m);
  return statusLine ? statusLine[1] : null;
}

function listBrands() {
  const brandsDir = path.join(BASE, "brand");
  if (!fs.existsSync(brandsDir)) return [];
  return fs.readdirSync(brandsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function listProjectTaskFiles(slug) {
  const projectsDir = path.join(BASE, "brand", slug, "projects");
  if (!fs.existsSync(projectsDir)) return [];
  const out = [];
  for (const d of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const tasksPath = path.join(projectsDir, d.name, "tasks.json");
    if (fs.existsSync(tasksPath)) out.push(tasksPath);
  }
  return out;
}

let totalCts = 0;
let totalPatched = 0;
let totalUnchanged = 0;
const sample = [];

for (const slug of listBrands()) {
  for (const tasksPath of listProjectTaskFiles(slug)) {
    let tasks;
    try {
      tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    } catch (e) {
      console.warn(`[skip] ${tasksPath}: ${e.message}`);
      continue;
    }
    if (!Array.isArray(tasks)) continue;
    let mutated = false;

    for (const task of tasks) {
      const cts = task.content_tasks;
      if (!Array.isArray(cts)) continue;
      for (const ct of cts) {
        totalCts += 1;
        const channels = Array.isArray(ct.target_channels) ? ct.target_channels : [];
        if (channels.length === 0) {
          totalUnchanged += 1;
          continue;
        }
        const existing = ct.channel_phases && typeof ct.channel_phases === "object"
          ? { ...ct.channel_phases }
          : {};
        let touched = false;
        for (const ch of channels) {
          if (existing[ch]) continue; // Don't overwrite an already-set phase.
          const raw = readDraftStatus(slug, ct.idea_id, ch);
          const phase = normalizePhase(raw);
          if (phase) {
            existing[ch] = phase;
            touched = true;
          } else {
            // No .md or unrecognized status → assume "researching" so the CT
            // has a coherent map. Conservative; the agent will overwrite.
            existing[ch] = "researching";
            touched = true;
          }
        }
        if (touched) {
          ct.channel_phases = existing;
          ct.updated_at = new Date().toISOString();
          mutated = true;
          totalPatched += 1;
          if (sample.length < 5) {
            sample.push({ slug, ctId: ct.id, channel_phases: existing });
          }
        } else {
          totalUnchanged += 1;
        }
      }
    }

    if (mutated && !dryRun) {
      fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
    }
  }
}

console.log(`[backfill-channel-phases] CTs scanned: ${totalCts}`);
console.log(`[backfill-channel-phases] Patched:    ${totalPatched}`);
console.log(`[backfill-channel-phases] Unchanged:  ${totalUnchanged}`);
console.log(`[backfill-channel-phases] Mode:       ${dryRun ? "DRY-RUN" : "WRITE"}`);
if (sample.length) {
  console.log(`[backfill-channel-phases] Sample patches:`);
  for (const s of sample) {
    console.log(`  ${s.slug}/${s.ctId}: ${JSON.stringify(s.channel_phases)}`);
  }
}
