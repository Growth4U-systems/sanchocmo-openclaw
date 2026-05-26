#!/usr/bin/env node
/**
 * content-engine-setup.js — Onboards a client into the Content Engine.
 *
 * Usage:
 *   node scripts/content-engine-setup.js --slug growth4u
 *   node scripts/content-engine-setup.js --slug hulahoop --dry-run
 *   node scripts/content-engine-setup.js --all
 *   node scripts/content-engine-setup.js --list
 *
 * What it does:
 *   1. Checks Foundation readiness (ECPs, Brand Voice, Positioning, etc.)
 *   2. Creates brand/{slug}/content/ folder structure
 *   3. Generates content-pillars.md from Foundation (if not exists)
 *   4. Generates config files from pillars + Foundation data
 *   5. Creates recurring-tasks dirs for cron output
 *   6. Adds Content Engine cron jobs to cron/jobs.json
 *   7. Reports what was created and what's missing
 *
 * Multi-tenant: each client gets their own content/ folder and cron jobs.
 * The skills, protocols, and cron definitions are shared.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WORKSPACE = path.join(__dirname, "..");
const CRON_FILE = path.join(WORKSPACE, "..", "cron", "jobs.json");
const BRANDS_DIR = path.join(WORKSPACE, "brand");

const DRY_RUN = process.argv.includes("--dry-run");
const LIST_ONLY = process.argv.includes("--list");
const ALL = process.argv.includes("--all");
const SLUG_ARG = process.argv.find((a, i) => process.argv[i - 1] === "--slug");
const SYSTEM_BRAND_SLUGS = new Set(["example", "sancho", "sanchocmo", "test", "daily-pulse"]);

function isClientBrandDir(entry) {
  if (!entry.isDirectory() || SYSTEM_BRAND_SLUGS.has(entry.name)) return false;
  const dir = path.join(BRANDS_DIR, entry.name);
  return fs.existsSync(path.join(dir, "foundation-state.json")) ||
    fs.existsSync(path.join(dir, "client-config.json")) ||
    fs.existsSync(path.join(dir, "market-and-us"));
}

// ---------------------------------------------------------------------------
// Foundation checks
// ---------------------------------------------------------------------------

function checkFoundation(slug) {
  const b = path.join(BRANDS_DIR, slug);
  const checks = {
    ecps: glob(b, "**/ecps/*current*"),
    brand_voice: glob(b, "**/brand-voice/*current*"),
    positioning: glob(b, "**/positioning/**/*current*"),
    company_brief: glob(b, "**/company-brief*"),
    strategic_plan: glob(b, "**/strategic-plan*current*"),
    competitors: exists(path.join(b, "market-and-us/competitors/sources.json")),
    client_config: exists(path.join(b, "client-config.json")),
  };
  const ready = Object.values(checks).every(Boolean);
  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return { checks, ready, missing };
}

function glob(dir, pattern) {
  try {
    const parts = pattern.split("/");
    return findFile(dir, parts);
  } catch { return false; }
}

function findFile(dir, parts) {
  if (!fs.existsSync(dir)) return false;
  if (parts.length === 0) return true;
  const [head, ...rest] = parts;
  if (head === "**") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && findFile(path.join(dir, e.name), parts)) return true;
      if (e.isFile() && rest.length === 0) return true;
      if (e.isDirectory() && findFile(path.join(dir, e.name), rest)) return true;
    }
    return false;
  }
  if (head.includes("*")) {
    const regex = new RegExp("^" + head.replace(/\*/g, ".*") + "$");
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (regex.test(e.name)) {
        if (rest.length === 0) return true;
        if (e.isDirectory() && findFile(path.join(dir, e.name), rest)) return true;
      }
    }
    return false;
  }
  return findFile(path.join(dir, head), rest);
}

function exists(p) { return fs.existsSync(p); }

// ---------------------------------------------------------------------------
// Folder creation
// ---------------------------------------------------------------------------

function createFolders(slug) {
  const dirs = [
    `brand/${slug}/content`,
    `brand/${slug}/content/configs/news-prompts`,
    `brand/${slug}/content/configs/paa-queries`,
    `brand/${slug}/content/configs/keywords-seed`,
    `brand/${slug}/content/configs/competitors`,
    `brand/${slug}/content/configs/reference-creators`,
    `brand/${slug}/content/research-signals`,
    `brand/${slug}/content/published`,
    `brand/${slug}/content/performance`,
    `brand/${slug}/recurring-tasks/content-news-monitor`,
    `brand/${slug}/recurring-tasks/content-competitor-monitor`,
    `brand/${slug}/recurring-tasks/content-ideas`,
    `brand/${slug}/recurring-tasks/content-editorial-dispatch`,
    `brand/${slug}/recurring-tasks/content-paa-monitor`,
  ];
  let created = 0;
  for (const d of dirs) {
    const full = path.join(WORKSPACE, d);
    if (!fs.existsSync(full)) {
      if (!DRY_RUN) fs.mkdirSync(full, { recursive: true });
      created++;
    }
  }
  // Empty JSON files
  const files = {
    [`brand/${slug}/content/idea-queue.json`]: "[]",
    [`brand/${slug}/content/clarify-history.json`]: "[]",
  };
  for (const [f, content] of Object.entries(files)) {
    const full = path.join(WORKSPACE, f);
    if (!fs.existsSync(full)) {
      if (!DRY_RUN) fs.writeFileSync(full, content);
      created++;
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Cron job creation
// ---------------------------------------------------------------------------

function getClientName(slug) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BRANDS_DIR, slug, "client-config.json"), "utf-8"));
    return cfg.name || slug;
  } catch {
    // Try foundation-state
    try {
      const fs2 = JSON.parse(fs.readFileSync(path.join(BRANDS_DIR, slug, "foundation-state.json"), "utf-8"));
      return fs2.brand_summary?.name || slug;
    } catch { return slug; }
  }
}

function getContentChannelId(slug) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BRANDS_DIR, slug, "client-config.json"), "utf-8"));
    return cfg.channels?.content || cfg.channels?.general || null;
  } catch { return null; }
}

function loadCronTemplate() {
  const tpl = path.join(WORKSPACE, "_system/content-engine-cron-jobs.json");
  return JSON.parse(fs.readFileSync(tpl, "utf-8"));
}

function clientHasCrons(slug) {
  try {
    const jobs = JSON.parse(fs.readFileSync(CRON_FILE, "utf-8"));
    return jobs.jobs.some(j => j.name && j.name.includes("Content:") && j.name.includes(getClientName(slug)));
  } catch { return false; }
}

function addCronsForClient(slug) {
  const name = getClientName(slug);
  if (clientHasCrons(slug)) {
    console.log(`  [skip] ${slug} already has Content Engine crons`);
    return 0;
  }

  const template = loadCronTemplate();
  const now = Date.now();
  const newJobs = template.jobs.map(job => {
    const j = JSON.parse(JSON.stringify(job));
    j.id = crypto.randomUUID();
    j.createdAtMs = now;
    j.name = j.name.replace("{NAME}", name);
    j.state = {};
    if (j.payload?.message) {
      j.payload.message = j.payload.message
        .replace(/{SLUG}/g, slug)
        .replace(/{NAME}/g, name);
    }
    return j;
  });

  if (!DRY_RUN) {
    const jobs = JSON.parse(fs.readFileSync(CRON_FILE, "utf-8"));
    jobs.jobs.push(...newJobs);
    fs.writeFileSync(CRON_FILE, JSON.stringify(jobs, null, 2));
  }

  return newJobs.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function listClients() {
  const slugs = fs.readdirSync(BRANDS_DIR, { withFileTypes: true })
    .filter(isClientBrandDir)
    .map(d => d.name);

  console.log("\n=== Content Engine — Client Readiness ===\n");
  console.log("Slug".padEnd(20) + "ECPs  Voice Pos   Brief Strat Comp  Cfg   Ready CE-Active");
  console.log("-".repeat(95));

  for (const slug of slugs) {
    const f = checkFoundation(slug);
    const hasCrons = clientHasCrons(slug);
    const hasContent = fs.existsSync(path.join(BRANDS_DIR, slug, "content", "content-pillars.md"));
    const c = f.checks;
    console.log(
      slug.padEnd(20) +
      (c.ecps ? "✅    " : "❌    ") +
      (c.brand_voice ? "✅    " : "❌    ") +
      (c.positioning ? "✅    " : "❌    ") +
      (c.company_brief ? "✅    " : "❌    ") +
      (c.strategic_plan ? "✅    " : "❌    ") +
      (c.competitors ? "✅    " : "❌    ") +
      (c.client_config ? "✅    " : "❌    ") +
      (f.ready ? "✅    " : "❌    ") +
      (hasCrons ? "✅" : hasContent ? "⚠️" : "❌")
    );
  }
  console.log("");
}

function setupClient(slug) {
  console.log(`\n--- ${slug} ---`);

  // 1. Check Foundation
  const f = checkFoundation(slug);
  if (!f.ready) {
    console.log(`  [warn] Foundation incomplete. Missing: ${f.missing.join(", ")}`);
    console.log(`  [info] Creating folder structure anyway (pillars + configs will need manual generation)`);
  }

  // 2. Create folders
  const foldersCreated = createFolders(slug);
  console.log(`  [folders] ${foldersCreated} new dirs/files created`);

  // 3. Check/skip pillars (requires human + agent interaction)
  const pillarsFile = path.join(BRANDS_DIR, slug, "content", "content-pillars.md");
  if (fs.existsSync(pillarsFile)) {
    console.log(`  [pillars] Already exists — skipping`);
  } else {
    console.log(`  [pillars] NOT FOUND — run 'content-pillars' skill for ${slug} to generate`);
  }

  // 4. Add crons
  if (!f.checks.client_config) {
    console.log(`  [crons] SKIPPED — no client-config.json (no Discord channel IDs)`);
  } else {
    const added = addCronsForClient(slug);
    if (added > 0) {
      console.log(`  [crons] ${added} cron jobs added to jobs.json`);
    }
  }

  return { slug, foundationReady: f.ready, missing: f.missing, foldersCreated };
}

// --- Entry point ---

if (LIST_ONLY) {
  listClients();
  process.exit(0);
}

console.log(`\n=== Content Engine Setup (${DRY_RUN ? "DRY RUN" : "APPLY"}) ===`);

const slugs = ALL
  ? fs.readdirSync(BRANDS_DIR, { withFileTypes: true })
      .filter(isClientBrandDir)
      .map(d => d.name)
  : SLUG_ARG ? [SLUG_ARG] : [];

if (slugs.length === 0) {
  console.log("Usage: node scripts/content-engine-setup.js --slug <slug> | --all | --list");
  process.exit(1);
}

const results = slugs.map(setupClient);

console.log("\n=== Summary ===");
console.log(`Clients processed: ${results.length}`);
console.log(`Foundation ready: ${results.filter(r => r.foundationReady).length}`);
console.log(`Need pillars generation: ${results.filter(r => !fs.existsSync(path.join(BRANDS_DIR, r.slug, "content", "content-pillars.md"))).length}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "APPLIED"}\n`);
