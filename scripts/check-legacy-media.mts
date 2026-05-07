#!/usr/bin/env tsx
/**
 * CI guard: scan every draft frontmatter under
 *   {workspace}/brand/{slug}/content/drafts/{ideaId}/{channel}.md
 * and fail (exit 1) if any `media[]` entry uses the legacy schema
 * (`localPath`, `role`, missing `url`).
 *
 * Run on its own:
 *   pnpm check:drafts
 *
 * Wire it into CI alongside `pnpm typecheck` / `pnpm lint`. The fix command
 * is `pnpm migrate:media`. Background and the canonical schema live in
 *   _system/media-persistence-protocol.md.
 */

import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";

const HOME = os.homedir();
const BASE =
  process.env.MC_WORKSPACE || path.join(HOME, ".openclaw", "workspace-sancho");
const BRAND_DIR = path.join(BASE, "brand");

const FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(text: string): Record<string, unknown> {
  const match = text.match(FENCE_RE);
  if (!match) return {};
  try {
    return (yaml.load(match[1]) || {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface Violation {
  file: string;
  index: number;
  reason: string;
}

function inspectMedia(media: unknown, file: string): Violation[] {
  if (!Array.isArray(media)) return [];
  const out: Violation[] = [];
  media.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") return;
    const m = entry as Record<string, unknown>;
    const legacyFields = ["localPath", "role", "alt"].filter((f) => f in m);
    if (legacyFields.length > 0) {
      out.push({ file, index: i, reason: `legacy fields: ${legacyFields.join(", ")}` });
      return;
    }
    if (typeof m.url !== "string" || !m.url) {
      out.push({ file, index: i, reason: "missing url" });
    }
  });
  return out;
}

function main() {
  if (!fs.existsSync(BRAND_DIR)) {
    console.log(`No brand directory at ${BRAND_DIR} — nothing to check.`);
    process.exit(0);
  }
  const violations: Violation[] = [];
  let scanned = 0;
  for (const slugEntry of fs.readdirSync(BRAND_DIR, { withFileTypes: true })) {
    if (!slugEntry.isDirectory()) continue;
    const draftsRoot = path.join(BRAND_DIR, slugEntry.name, "content", "drafts");
    if (!fs.existsSync(draftsRoot)) continue;
    for (const ideaEntry of fs.readdirSync(draftsRoot, { withFileTypes: true })) {
      if (!ideaEntry.isDirectory()) continue;
      const ideaDir = path.join(draftsRoot, ideaEntry.name);
      for (const entry of fs.readdirSync(ideaDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        if (entry.name.includes(".v")) continue;
        const abs = path.join(ideaDir, entry.name);
        scanned++;
        const text = fs.readFileSync(abs, "utf-8");
        const data = parseFrontmatter(text);
        violations.push(...inspectMedia(data.media, abs));
      }
    }
  }

  console.log(`Scanned ${scanned} draft file(s) under ${BRAND_DIR}`);
  if (violations.length === 0) {
    console.log("✓ No legacy media schema found.");
    process.exit(0);
  }

  console.error(`✗ ${violations.length} violation(s) found:`);
  for (const v of violations) {
    const rel = v.file.replace(BASE + "/", "");
    console.error(`  ${rel}  media[${v.index}]  ${v.reason}`);
  }
  console.error(
    "\nFix with:  pnpm migrate:media\n" +
      "Or read:   _system/media-persistence-protocol.md",
  );
  process.exit(1);
}

main();
