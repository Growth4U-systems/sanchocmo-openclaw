#!/usr/bin/env node
// One-shot backfill: add structured YAML frontmatter to existing
// `QA-REPORT-*.md` files in `brand/{slug}/content/drafts/{idea}/`. Pre-existing
// reports were body-only; the new qa-bot SKILL emits frontmatter going forward.
// Mission Control's UI reads the frontmatter directly when present and falls
// back to body-regex parsing when not — this script gets every legacy file onto
// the structured path so the regex fallback can eventually be retired.
//
// Run from anywhere:
//   node scripts/backfill-qa-frontmatter.mjs              (apply)
//   node scripts/backfill-qa-frontmatter.mjs --dry-run    (preview only)
//
// Idempotent: any file that already starts with `---\n` is skipped.

import fs from "fs";
import path from "path";

const BASE = process.env.MC_WORKSPACE
  || path.join(process.env.HOME || "/Users/ragi", ".openclaw", "workspace-sancho");

const dryRun = process.argv.includes("--dry-run");

function findQaReports(root) {
  const out = [];
  const brandsDir = path.join(root, "brand");
  if (!fs.existsSync(brandsDir)) return out;
  for (const slug of fs.readdirSync(brandsDir)) {
    const draftsDir = path.join(brandsDir, slug, "content", "drafts");
    if (!fs.existsSync(draftsDir)) continue;
    for (const idea of fs.readdirSync(draftsDir)) {
      const ideaDir = path.join(draftsDir, idea);
      if (!fs.statSync(ideaDir).isDirectory()) continue;
      for (const f of fs.readdirSync(ideaDir)) {
        if (f.startsWith("QA-REPORT-") && f.endsWith(".md")) {
          out.push(path.join(ideaDir, f));
        }
      }
    }
  }
  return out;
}

const SCORE_RES = [
  /\*\*\s*qa\s*score\s*:?\s*\*\*\s*(\d+(?:[.,]\d+)?)/i,
  /qa[-\s]?score\s*[:=]\s*(\d+(?:[.,]\d+)?)/i,
  /confidence\s*score\s*:?\s*\*?\*?\s*(\d+(?:[.,]\d+)?)/i,
];
const SOURCE_RES = [
  /\*\*\s*fuentes\s*:?\s*\*\*\s*(\d+)/i,                     // `**Fuentes:** 19`
  /→\s*(\d+)\s+fuentes/i,                                    // `→ 19 fuentes` (post-arrow actual count)
  /(?<![≥≤<>=\d])(\d+)\s+fuentes/i,                          // `19 fuentes` — but NOT `≥10 fuentes` (lookbehind blocks threshold + mid-number digits)
  /fuentes?\s*[:=]\s*(\d+)/i,
  // English fallbacks (older reports written in EN)
  /total\s+unique\s+sources\s*\|\s*(\d+)/i,                  // `| Total unique sources | 14 |`
  /(?<![≥≤<>=\d])(\d+)\s+unique\s+sources/i,                 // `14 unique sources`
  /(?<![≥≤<>=\d])(\d+)\s+sources/i,                          // generic `N sources`
];
const SEARCH_RES = [
  /\*\*\s*b[úu]squedas[^*]*\*\*\s*(\d+)/i,                   // `**Búsquedas ejecutadas:** 12`
  /→\s*(\d+)\s+(?:b[úu]squedas|queries)/i,                   // `→ 12 queries`
  /(?<![≥≤<>=\d])(\d+)\s+(?:b[úu]squedas|queries)/i,         // `12 queries` — skip thresholds + mid-number digits
  /b[úu]squedas?\s*[:=]\s*(\d+)/i,
];

function firstMatch(body, patterns) {
  for (const re of patterns) {
    const m = body.match(re);
    if (m) return m[1];
  }
  return undefined;
}

function detectVerdict(body) {
  // Accept either the body verdict line or the score-line suffix
  // (e.g. `**QA Score:** 8.5/10 — NEEDS REVISION (minor)`).
  if (/MAJOR\s+ISSUES/i.test(body)) return "MAJOR ISSUES";
  if (/NEEDS\s+REVISION/i.test(body)) return "NEEDS REVISION";
  if (/\bPASS\b/.test(body)) return "PASS";
  return undefined;
}

function detectMode(body) {
  if (/\*\*Mode\*\*\s*:\s*Quick/i.test(body)) return "quick";
  if (/\*\*Mode\*\*\s*:\s*Deep/i.test(body)) return "deep";
  return undefined;
}

function detectQaDate(body) {
  // Matches `**Fecha QA:** 2026-05-06` or `**Fecha:** 2026-05-06`
  const m = body.match(/\*\*\s*Fecha(?:\s+QA)?\s*:?\s*\*\*\s*(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : undefined;
}

function deriveTarget(filename) {
  // QA-REPORT-research.md → research.md
  const stem = filename.replace(/^QA-REPORT-/, "").replace(/\.md$/, "");
  return `${stem}.md`;
}

function buildFrontmatter(fields) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") lines.push(`${k}: '${v.replace(/'/g, "''")}'`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function processFile(file) {
  const body = fs.readFileSync(file, "utf-8");
  if (body.startsWith("---\n") || body.startsWith("---\r\n")) {
    return { file, status: "skip", reason: "already has frontmatter" };
  }

  const scoreRaw = firstMatch(body, SCORE_RES);
  const sourcesRaw = firstMatch(body, SOURCE_RES);
  const searchesRaw = firstMatch(body, SEARCH_RES);
  const verdict = detectVerdict(body);
  const mode = detectMode(body);
  const qa_at_date = detectQaDate(body);

  const fields = {
    kind: "qa-report",
    target: deriveTarget(path.basename(file)),
    mode,
    verdict,
    score: scoreRaw ? parseFloat(scoreRaw.replace(",", ".")) : undefined,
    sources: sourcesRaw ? parseInt(sourcesRaw, 10) : undefined,
    searches: searchesRaw ? parseInt(searchesRaw, 10) : undefined,
    qa_at: qa_at_date ? `${qa_at_date}T00:00:00Z` : undefined,
  };

  if (fields.score === undefined && fields.verdict === undefined) {
    return { file, status: "skip", reason: "no parseable score or verdict" };
  }

  const frontmatter = buildFrontmatter(fields);
  const next = frontmatter + body;

  if (!dryRun) {
    fs.writeFileSync(file, next, "utf-8");
  }
  return { file, status: dryRun ? "would-write" : "wrote", fields };
}

function main() {
  const files = findQaReports(BASE);
  if (files.length === 0) {
    console.log("No QA reports found under", BASE);
    return;
  }
  console.log(`Found ${files.length} QA report(s) under ${BASE}`);
  if (dryRun) console.log("(dry-run — no files will be modified)\n");

  let wrote = 0;
  let skipped = 0;
  for (const f of files) {
    const rel = path.relative(BASE, f);
    const r = processFile(f);
    if (r.status === "skip") {
      console.log(`  SKIP   ${rel}  — ${r.reason}`);
      skipped++;
    } else {
      const summary = [
        r.fields.score != null && `score=${r.fields.score}`,
        r.fields.sources != null && `sources=${r.fields.sources}`,
        r.fields.searches != null && `searches=${r.fields.searches}`,
        r.fields.verdict && `verdict=${r.fields.verdict}`,
      ].filter(Boolean).join(" ");
      console.log(`  ${dryRun ? "WOULD" : "WROTE"}  ${rel}  — ${summary}`);
      wrote++;
    }
  }
  console.log(`\n${dryRun ? "Would write" : "Wrote"}: ${wrote}   Skipped: ${skipped}`);
}

main();
