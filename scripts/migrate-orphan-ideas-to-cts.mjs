#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "workspace-sancho", "brand");
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = args.has("--dry-run");

if (!apply && !dryRun) {
  console.error("Usage: node scripts/migrate-orphan-ideas-to-cts.mjs --dry-run | --apply");
  process.exit(1);
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function toContentTask(idea) {
  return {
    id: idea.id,
    idea_id: idea.id,
    name: String(idea.title || idea.angle_draft || idea.signal?.summary || idea.id).slice(0, 160),
    status: "New",
    target_channels: idea.target_channel ? [String(idea.target_channel)] : [],
    documents: [],
    created_at: idea.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    title: idea.title,
    pillar_id: idea.pillar_id,
    content_type: idea.content_type,
    target_channel: idea.target_channel,
    signal: idea.signal,
    angle_draft: idea.angle_draft,
    pov_confidence: idea.pov_confidence,
    signal_type: idea.signal_type,
    source_signals: idea.source_signals,
    dispatch_date: idea.dispatch_date,
    dispatch_slot: idea.dispatch_slot,
    approved_via: idea.approved_via,
    approved_by: idea.approved_by,
    archived_at: idea.archived_at,
    archived_via: idea.archived_via,
    archived_by: idea.archived_by,
    deferred_by: idea.deferred_by,
    target_date: idea.target_date,
  };
}

let scannedBrands = 0;
let orphanIdeas = 0;
let inserted = 0;
let skipped = 0;

for (const slug of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) {
  const contentDir = path.join(ROOT, slug, "content");
  const ideasFile = path.join(contentDir, "idea-queue.json");
  if (!fs.existsSync(ideasFile)) continue;
  scannedBrands++;

  const ideas = readJSON(ideasFile, []);
  if (!Array.isArray(ideas)) {
    console.warn(`[skip] ${slug}: idea-queue.json is not an array`);
    continue;
  }

  const ctFile = path.join(contentDir, "content-tasks.json");
  const cts = readJSON(ctFile, []);
  const existing = new Set(Array.isArray(cts) ? cts.map((ct) => ct.id) : []);
  const next = Array.isArray(cts) ? [...cts] : [];

  for (const idea of ideas) {
    if (!idea?.id) continue;
    if (idea.status !== "New" || idea.content_task_id) {
      skipped++;
      continue;
    }
    orphanIdeas++;
    if (existing.has(idea.id)) {
      skipped++;
      continue;
    }
    inserted++;
    existing.add(idea.id);
    next.push(toContentTask(idea));
    console.log(`${apply ? "[add]" : "[dry-run]"} ${slug}: ${idea.id}`);
  }

  if (apply && next.length !== cts.length) {
    writeJSON(ctFile, next);
  }
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  scannedBrands,
  orphanIdeas,
  inserted,
  skipped,
}, null, 2));
