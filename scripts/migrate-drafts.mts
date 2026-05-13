#!/usr/bin/env tsx
/**
 * One-off / repeatable migration for content drafts under
 *   {workspace}/brand/{slug}/content/drafts/{ideaId}/{channel}.md
 *
 * Why:
 *   Older drafts include three patterns that violate the new file-format
 *   spec at _system/draft-file-format.md:
 *
 *     1. An inline `<!-- Self-QA: PASS|FAIL ... -->` HTML comment block.
 *     2. A leading H1 like `# LinkedIn Draft — ...` on social channels
 *        (linkedin, twitter, x, instagram, threads, bluesky, reddit).
 *     3. A trailing `---` decorative separator left behind after stripping
 *        the comment.
 *
 *   The new renderer hides these in the UI, but the files on disk still
 *   carry the noise. This script:
 *
 *     - Parses the `<!-- Self-QA -->` block, extracts PASS/FAIL + bullet
 *       notes, and writes them to the frontmatter as `self_qa` and
 *       `self_qa_notes`.
 *     - Strips the comment from the body.
 *     - Removes a leading H1/H2 line on social channels.
 *     - Trims trailing decorative `---` separators.
 *
 *   Idempotent: if a file is already clean (or already has `self_qa` in
 *   the frontmatter), it is left alone.
 *
 * Usage:
 *   tsx scripts/migrate-drafts.mts --dry-run
 *   tsx scripts/migrate-drafts.mts                         # apply
 *   tsx scripts/migrate-drafts.mts --slug=growth4u
 *   tsx scripts/migrate-drafts.mts --verbose
 */

import fs from "fs";
import path from "path";
import os from "os";

const HOME = os.homedir();
const BASE =
  process.env.MC_WORKSPACE || path.join(HOME, ".openclaw", "workspace-sancho");
const BRAND_DIR = path.join(BASE, "brand");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const slugFilter = args
  .find((a) => a.startsWith("--slug="))
  ?.split("=")[1];

const SOCIAL_CHANNELS = new Set([
  "linkedin",
  "twitter",
  "x",
  "instagram",
  "threads",
  "bluesky",
  "reddit",
]);

// Special docs that live alongside per-channel drafts but are NOT channel
// drafts (they have their own structure — e.g. `---` separators are
// meaningful in clarify.md). Skip them.
const SPECIAL_DOCS = new Set(["clarify", "proposal", "research"]);

interface MigrationResult {
  file: string;
  channel: string;
  changes: string[];
}

function listIdeaDirs(slug: string): string[] {
  const dir = path.join(BRAND_DIR, slug, "content", "drafts");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name));
}

function listSlugs(): string[] {
  if (!fs.existsSync(BRAND_DIR)) return [];
  return fs
    .readdirSync(BRAND_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): { fm: string; body: string } | null {
  const m = raw.match(FENCE);
  if (!m) return null;
  return { fm: m[1], body: m[2] };
}

// Detect if the frontmatter already has a `self_qa:` key at top level.
function hasSelfQA(fm: string): boolean {
  return /^self_qa\s*:/m.test(fm);
}

// Extract a `<!-- Self-QA: PASS|FAIL ... -->` block, parse its bullets.
const SELF_QA_COMMENT =
  /<!--\s*Self-QA\s*:\s*(PASS|FAIL|PENDING)[^\n]*\n([\s\S]*?)-->/i;

// Drop a leading H1/H2 (and the blank line after it) from the body. Only
// runs on social channels. Returns null if no leading heading was found.
function stripLeadingHeading(body: string): string | null {
  const m = body.match(/^\s*\n*#{1,2}\s+.*\n+/);
  if (!m) return null;
  return body.slice(m[0].length);
}

// Insert self_qa fields into a frontmatter block (just before the closing).
function injectSelfQA(
  fm: string,
  verdict: "PASS" | "FAIL",
  notes: string[],
): string {
  const lines: string[] = [`self_qa: ${verdict}`];
  if (notes.length > 0) {
    lines.push("self_qa_notes:");
    for (const n of notes) {
      lines.push(`  - ${JSON.stringify(n)}`);
    }
  }
  // Append before any closing newline.
  return fm.replace(/\s*$/, "") + "\n" + lines.join("\n");
}

function migrateFile(absPath: string): MigrationResult | null {
  const channel = path.basename(absPath, ".md").toLowerCase();
  if (SPECIAL_DOCS.has(channel)) return null;
  const isSocial = SOCIAL_CHANNELS.has(channel);
  const raw = fs.readFileSync(absPath, "utf8");
  const parsed = parseFrontmatter(raw);
  if (!parsed) return null; // not a frontmatter doc, skip

  let { fm, body } = parsed;
  const changes: string[] = [];

  // 1. Self-QA HTML comment → frontmatter.
  const selfQAMatch = body.match(SELF_QA_COMMENT);
  if (selfQAMatch) {
    const rawVerdict = selfQAMatch[1].toUpperCase();
    const notesText = selfQAMatch[2];
    const notes = notesText
      .split("\n")
      .map((l) => l.replace(/^\s*-\s+/, "").trim())
      .filter((l) => l.length > 0);

    body = body.replace(SELF_QA_COMMENT, "");
    changes.push("removed inline Self-QA comment");

    if (rawVerdict === "PASS" || rawVerdict === "FAIL") {
      if (!hasSelfQA(fm)) {
        fm = injectSelfQA(fm, rawVerdict as "PASS" | "FAIL", notes);
        changes.push(
          `wrote self_qa=${rawVerdict} (${notes.length} notes) to frontmatter`,
        );
      } else {
        changes.push("skipped frontmatter inject (self_qa already present)");
      }
    } else {
      changes.push(`dropped PENDING self-qa stub (no verdict to migrate)`);
    }
  }

  // 2. Leading H1/H2 on social channels.
  if (isSocial) {
    const stripped = stripLeadingHeading(body);
    if (stripped !== null) {
      body = stripped;
      changes.push("removed leading H1/H2 from social body");
    }
  }

  // 3. Strip stray HTML comments other than Self-QA (defensive).
  if (/<!--[\s\S]*?-->/.test(body)) {
    const before = body;
    body = body.replace(/<!--[\s\S]*?-->/g, "");
    if (body !== before) changes.push("removed other HTML comments");
  }

  // 4a. Trailing decorative `---`.
  const hrTrimmed = body.replace(/(?:\n+\s*-{3,}\s*)+$/, "\n");
  if (hrTrimmed !== body) {
    body = hrTrimmed;
    changes.push("removed trailing decorative ---");
  }
  // 4b. Trailing whitespace cleanup (cosmetic).
  const wsTrimmed = body.replace(/\s+$/, "\n");
  if (wsTrimmed !== body) {
    body = wsTrimmed;
    changes.push("trimmed trailing whitespace");
  }

  if (changes.length === 0) return null;

  const newRaw = `---\n${fm}\n---\n\n${body.replace(/^\s+/, "")}`;
  if (!DRY_RUN) {
    fs.writeFileSync(absPath, newRaw, "utf8");
  }
  return { file: absPath, channel, changes };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

const slugs = slugFilter ? [slugFilter] : listSlugs();
const results: MigrationResult[] = [];
let scanned = 0;

for (const slug of slugs) {
  for (const ideaDir of listIdeaDirs(slug)) {
    for (const entry of fs.readdirSync(ideaDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const channel = path.basename(entry.name, ".md").toLowerCase();
      if (SPECIAL_DOCS.has(channel)) continue;
      const abs = path.join(ideaDir, entry.name);
      scanned++;
      const r = migrateFile(abs);
      if (r) results.push(r);
    }
  }
}

const tag = DRY_RUN ? "[DRY-RUN]" : "[APPLIED]";
console.log("");
console.log(`${tag} Workspace: ${BASE}`);
console.log(
  `${tag} Scanned ${scanned} draft files across ${slugs.length} brand(s)`,
);
console.log(`${tag} ${results.length} file(s) need / received changes\n`);

if (results.length === 0) {
  console.log("All drafts already clean. Nothing to do.\n");
  process.exit(0);
}

const byChannel: Record<string, number> = {};
const byChange: Record<string, number> = {};
for (const r of results) {
  byChannel[r.channel] = (byChannel[r.channel] ?? 0) + 1;
  for (const c of r.changes) byChange[c] = (byChange[c] ?? 0) + 1;
}

console.log("By channel:");
for (const [ch, n] of Object.entries(byChannel).sort()) {
  console.log(`  ${ch.padEnd(12)} ${n}`);
}
console.log("\nBy change type:");
for (const [c, n] of Object.entries(byChange).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${c}`);
}

if (VERBOSE) {
  console.log("\nDetails:");
  for (const r of results) {
    console.log(`  ${r.file.replace(BASE + "/", "")}`);
    for (const c of r.changes) console.log(`    - ${c}`);
  }
}

if (DRY_RUN) {
  console.log("\nRe-run without --dry-run to apply.\n");
} else {
  console.log("\nDone.\n");
}
