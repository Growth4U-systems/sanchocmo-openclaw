#!/usr/bin/env tsx
/**
 * Rewrites the `media[]` of a single draft so its URLs point to
 * /api/local-media (served by Mission Control's own server) instead of the
 * public R2 subdomain. Useful when *.r2.dev is blocked from the user's
 * network (ISP / VPN) but the slide PNGs already exist on disk under
 *   brand/{slug}/content/drafts/{ideaId}/media/{filename}.png
 *
 * Usage:
 *   tsx scripts/migrate-r2-to-local.mts \
 *     --slug=growth4u --ideaId=idea-2026-05-08-2 --channel=linkedin \
 *     [--dry-run]
 *
 * Behavior:
 *   - Lists the .png files inside `brand/{slug}/content/drafts/{ideaId}/media/`
 *     in alphabetical order.
 *   - Maps them 1:1 to the `media[]` entries of the draft (by index).
 *   - Replaces each entry's `url` with
 *       /api/local-media?slug=...&path=content/drafts/{ideaId}/media/{file}
 *   - Aborts if the count doesn't match (so we never half-rewrite).
 *
 * Idempotent: re-running on an already-migrated draft is a no-op
 * (the urls already point to /api/local-media).
 */

import fs from "fs";
import path from "path";
import os from "os";
import * as yaml from "js-yaml";

const HOME = os.homedir();
const BASE =
  process.env.MC_WORKSPACE || path.join(HOME, ".openclaw", "workspace-sancho");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const slug = arg("slug");
const ideaId = arg("ideaId");
const channel = arg("channel");

if (!slug || !ideaId || !channel) {
  console.error(
    "Usage: tsx scripts/migrate-r2-to-local.mts --slug=X --ideaId=Y --channel=Z [--dry-run]",
  );
  process.exit(2);
}

function arg(name: string): string | undefined {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

const draftPath = path.join(
  BASE,
  "brand",
  slug,
  "content",
  "drafts",
  ideaId,
  `${channel}.md`,
);
const mediaDir = path.join(
  BASE,
  "brand",
  slug,
  "content",
  "drafts",
  ideaId,
  "media",
);

if (!fs.existsSync(draftPath)) {
  console.error(`Draft not found: ${draftPath}`);
  process.exit(2);
}
if (!fs.existsSync(mediaDir)) {
  console.error(`Media dir not found: ${mediaDir}`);
  process.exit(2);
}

// Parse frontmatter
const text = fs.readFileSync(draftPath, "utf-8");
const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
if (!fm) {
  console.error("No YAML frontmatter found");
  process.exit(2);
}
const data = (yaml.load(fm[1]) || {}) as Record<string, unknown>;
const body = fm[2] || "";
const media = data.media as Record<string, unknown>[] | undefined;
if (!Array.isArray(media)) {
  console.error("media[] not present");
  process.exit(2);
}

// List local PNGs (alphabetical = chronological for slide-XX-*.png)
const files = fs
  .readdirSync(mediaDir)
  .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
  .sort();

console.log(`Draft media[] entries: ${media.length}`);
console.log(`Local files in media/: ${files.length}`);
files.forEach((f, i) => console.log(`  [${i}] ${f}`));

if (media.length !== files.length) {
  console.error(
    `Mismatch: media[] has ${media.length} entries but ${files.length} local files. ` +
      `Refusing to half-rewrite.`,
  );
  process.exit(2);
}

// Rewrite urls
let changed = 0;
for (let i = 0; i < media.length; i++) {
  const entry = media[i];
  const filename = files[i];
  const newUrl = `/api/local-media?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(
    `content/drafts/${ideaId}/media/${filename}`,
  )}`;
  if (entry.url === newUrl) continue;
  entry.url = newUrl;
  changed++;
}

console.log(`\n${changed} entry(ies) will be rewritten`);

if (DRY_RUN) {
  console.log("\n[DRY-RUN] Re-run without --dry-run to apply.");
  process.exit(0);
}

// Persist
data.updated_at = new Date().toISOString();
const yamlText = yaml.dump(data, { lineWidth: -1, noRefs: true }).trimEnd();
const next = `---\n${yamlText}\n---\n${body.startsWith("\n") ? body : "\n" + body}`;
fs.writeFileSync(draftPath, next);
console.log(`✓ Wrote ${draftPath}`);
