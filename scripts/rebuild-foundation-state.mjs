#!/usr/bin/env node
/**
 * rebuild-foundation-state.mjs — Recovery tool for foundation-state.json.
 *
 * Rebuilds a brand's `foundation-state.json` into the canonical v3.0 schema
 * (`sections[*].pillars[*].output_file`) that the Brand Brain / dashboard /
 * foundation APIs read. Use it when an agent run wrote the foundation docs to
 * disk but produced a non-canonical state index (e.g. a flat `pillars`/`path`
 * map without `sections`), which makes the work invisible in the UI even
 * though the `.md` files exist.
 *
 * It does NOT touch the generated documents — only the index that points at
 * them. It maps the canonical pillar taxonomy to whatever doc files exist on
 * disk, carrying over per-pillar status from the previous state when the path
 * matches (default `pending-review` for a freshly-found doc).
 *
 * Usage:
 *   node scripts/rebuild-foundation-state.mjs <slug>            # dry-run (prints diff)
 *   node scripts/rebuild-foundation-state.mjs <slug> --apply    # writes (with backup)
 *   node scripts/rebuild-foundation-state.mjs <slug> --apply --force   # overwrite even a v3.0 state
 *
 * Honors MC_WORKSPACE (defaults to ~/.openclaw/workspace-sancho), matching
 * src/lib/data/paths.ts.
 */

import fs from "fs";
import path from "path";

const BASE =
  process.env.MC_WORKSPACE ||
  path.join(process.env.HOME || "/root", ".openclaw", "workspace-sancho");

const slug = process.argv[2];
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

if (!slug || slug.startsWith("--")) {
  console.error("Usage: node scripts/rebuild-foundation-state.mjs <slug> [--apply] [--force]");
  process.exit(1);
}

const brandDir = path.join(BASE, "brand", slug);
const stateFile = path.join(brandDir, "foundation-state.json");

if (!fs.existsSync(brandDir)) {
  console.error(`Brand dir not found: ${brandDir}`);
  process.exit(1);
}

/**
 * Canonical taxonomy. Keys/pillar-names mirror what the dashboard renders
 * (src/components/brand-brain/file-tree.tsx SECTION_DEFS + FF_PILLAR_MAP and
 * the shape of an established brand's state). For each pillar, a list of
 * directory/file stems (relative to the brand dir) to probe for a main doc.
 */
const TAXONOMY = {
  // Layer 0 — company-brief is the single kickoff pillar.
  "company-brief": {
    layer: 0,
    skill: "kickoff",
    pillars: { "company-brief": ["company-brief"] },
  },
  "site-audit": {
    layer: 0,
    pillars: { "site-audit": ["seo-audit", "site-audit"] },
  },
  "market-and-us": {
    layer: 1,
    pillars: {
      "market-analysis": ["market-and-us/market"],
      "competitor-analysis": ["market-and-us/competitors"],
      "self-analysis": ["market-and-us/self"],
      "market-synthesis": ["market-and-us/swot", "market-and-us/market-synthesis"],
    },
  },
  "go-to-market": {
    layer: 3,
    pillars: {
      "niche-discovery": ["go-to-market/ecps"],
      "positioning": ["go-to-market/positioning"],
      "pricing": ["go-to-market/pricing"],
    },
  },
  "brand-book": {
    layer: 5,
    pillars: {
      "brand-voice": ["brand-book/brand-voice", "brand-identity/voice-profile", "brand-voice"],
      "visual-identity": ["brand-identity/visual-identity", "brand-book/visual-identity"],
    },
  },
  "metrics-setup": {
    layer: 6,
    pillars: { "metrics-setup": ["go-to-market/metrics-plan", "metrics-plan"] },
  },
  "strategic-plan": {
    layer: 7,
    pillars: { "strategic-plan": ["strategic-plan"] },
  },
};

/** Resolve a pillar stem to an existing doc path, returned relative to BASE. */
function resolveDoc(stem) {
  const base = path.basename(stem);
  const candidates = [
    `${stem}/current.md`,
    `${stem}/${base}.current.md`,
    `${stem}.md`,
    `${stem}/${base}.md`,
    `${stem}/current.html`,
    `${stem}.html`,
  ];
  for (const rel of candidates) {
    if (fs.existsSync(path.join(brandDir, rel))) {
      return { rel, outputFile: `brand/${slug}/${rel}` };
    }
  }
  return null;
}

// --- carry over statuses from the previous state (any schema) ---
let prev = null;
if (fs.existsSync(stateFile)) {
  try {
    prev = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    console.warn("[warn] existing foundation-state.json is not valid JSON; ignoring it");
  }
}

if (prev && prev.version === "3.0" && prev.sections && !FORCE) {
  console.error(
    "[abort] existing foundation-state.json is already canonical v3.0. " +
      "Re-run with --force only if you intend to rebuild it from disk."
  );
  process.exit(2);
}

/** Map of doc path (relative to brand dir) -> previous status. */
const prevStatusByRel = {};
if (prev) {
  // flat improvised schema: { pillars: { name: { path, status } } }
  for (const p of Object.values(prev.pillars || {})) {
    if (p && p.path && p.status) prevStatusByRel[p.path] = p.status;
  }
  // canonical schema: { sections: { sec: { pillars: { name: { output_file, status } } } } }
  for (const sec of Object.values(prev.sections || {})) {
    for (const p of Object.values(sec.pillars || {})) {
      if (p && p.output_file && p.status) {
        prevStatusByRel[p.output_file.replace(`brand/${slug}/`, "")] = p.status;
      }
    }
  }
}

function statusForDoc(rel) {
  return prevStatusByRel[rel] || "pending-review";
}

// --- build canonical sections ---
const sections = {};
for (const [secKey, secDef] of Object.entries(TAXONOMY)) {
  const pillars = {};
  for (const [pKey, stems] of Object.entries(secDef.pillars)) {
    let resolved = null;
    for (const stem of stems) {
      resolved = resolveDoc(stem);
      if (resolved) break;
    }
    if (resolved) {
      pillars[pKey] = {
        status: statusForDoc(resolved.rel),
        output_file: resolved.outputFile,
        skill: secDef.skill || undefined,
      };
    } else {
      pillars[pKey] = { status: "not-started", skill: secDef.skill || undefined };
    }
    if (!pillars[pKey].skill) delete pillars[pKey].skill;
  }
  const present = Object.values(pillars).filter((p) => p.output_file);
  const allApproved =
    present.length > 0 && present.every((p) => ["approved", "done"].includes(p.status));
  sections[secKey] = {
    status: present.length === 0 ? "not-started" : allApproved ? "approved" : "pending-review",
    layer: secDef.layer,
    output_dir: `brand/${slug}/${secKey}/`,
    ...(secDef.skill ? { skill: secDef.skill } : {}),
    pillars,
  };
}

// --- brand_summary (faithful: only known facts, no invented content) ---
let companyName = slug;
let url = "";
try {
  const clientsFile = path.join(BASE, "clients.json");
  if (fs.existsSync(clientsFile)) {
    const raw = JSON.parse(fs.readFileSync(clientsFile, "utf8"));
    const list = Array.isArray(raw) ? raw : raw.clients || Object.values(raw);
    const c = list.find((x) => x && x.slug === slug);
    if (c) {
      companyName = c.name || companyName;
      url = c.url || c.website || "";
    }
  }
} catch {
  /* best effort */
}

const prevSummary = (prev && prev.brand_summary) || {};
const now = new Date().toISOString();

const next = {
  version: "3.0",
  started_at: (prev && prev.started_at) || now,
  updated_at: now,
  brand_summary: {
    company_name: prevSummary.company_name || companyName,
    sector: prevSummary.sector || "",
    description: prevSummary.description || "",
    north_star: prevSummary.north_star || "",
    icps: prevSummary.icps || [],
    competitors: prevSummary.competitors || [],
    positioning: prevSummary.positioning || "",
    ...(url ? { url } : prevSummary.url ? { url: prevSummary.url } : {}),
  },
  sections,
  presentations: (prev && prev.presentations) || [],
};

// --- report ---
let found = 0;
let missing = 0;
console.log(`\nfoundation-state rebuild for "${slug}"  (BASE=${BASE})\n`);
for (const [secKey, sec] of Object.entries(next.sections)) {
  console.log(`  ${secKey}  [${sec.status}]`);
  for (const [pKey, p] of Object.entries(sec.pillars)) {
    if (p.output_file) {
      found++;
      console.log(`    ✓ ${pKey}  →  ${p.output_file}  (${p.status})`);
    } else {
      missing++;
      console.log(`    · ${pKey}  →  (no doc on disk)`);
    }
  }
}
console.log(`\n  resolved ${found} pillar docs, ${missing} pillars with no doc.\n`);

if (!APPLY) {
  console.log("DRY RUN — no file written. Re-run with --apply to write.\n");
  process.exit(0);
}

if (fs.existsSync(stateFile)) {
  const bak = `${stateFile}.bak-rebuild-${now.replace(/[:.]/g, "-")}`;
  fs.copyFileSync(stateFile, bak);
  console.log(`backup: ${bak}`);
}
fs.writeFileSync(stateFile, JSON.stringify(next, null, 2) + "\n");
console.log(`written: ${stateFile}\n`);
