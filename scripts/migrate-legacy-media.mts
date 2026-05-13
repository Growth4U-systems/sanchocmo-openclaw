#!/usr/bin/env tsx
/**
 * One-off / repeatable migration that converts legacy `media[]` entries in
 * draft frontmatter to the canonical `MediaAsset` shape.
 *
 * Background
 * ----------
 * The Mission Control frontend expects each `media[]` entry to look like:
 *
 *   { url, type, source, prompt?, model?, aspect_ratio?, created_at }
 *
 * (see src/lib/data/drafts.ts → MediaAsset).
 *
 * An agent that bypassed the `content-image` skill (see
 *   _system/media-persistence-protocol.md) and edited frontmatter by hand
 * persisted entries with a different shape:
 *
 *   { type: image, role: header, localPath: ..., alt: ... }
 *
 * That breaks the renderer because there is no `url`. This script:
 *
 *   1. Walks every draft under `brand/{slug}/content/drafts/{ideaId}/{ch}.md`.
 *   2. Detects `media[]` entries with `localPath` (or missing `url`).
 *   3. Uploads the local file to R2 (`uploadToR2`).
 *   4. Rewrites the entry to the canonical shape and writes the draft back.
 *   5. Deletes the local file once the upload + rewrite succeed.
 *
 * It NEVER touches entries that are already canonical.
 *
 * Usage:
 *   pnpm migrate:media -- --dry-run            # report only, no side effects
 *   pnpm migrate:media -- --upload-only        # upload + show URLs, do NOT
 *                                                rewrite frontmatter or delete
 *   pnpm migrate:media                         # full migration
 *   pnpm migrate:media -- --slug=growth4u      # restrict to one brand
 *   pnpm migrate:media -- --verbose
 *
 * Environment:
 *   Requires R2 credentials in env. Load them first:
 *       set -a; source ~/.openclaw/.env; set +a
 */

import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const HOME = os.homedir();
const BASE =
  process.env.MC_WORKSPACE || path.join(HOME, ".openclaw", "workspace-sancho");
const BRAND_DIR = path.join(BASE, "brand");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const UPLOAD_ONLY = args.includes("--upload-only");
const VERBOSE = args.includes("--verbose");
const slugFilter = args.find((a) => a.startsWith("--slug="))?.split("=")[1];

if (DRY_RUN && UPLOAD_ONLY) {
  console.error("Choose either --dry-run or --upload-only, not both.");
  process.exit(2);
}

const FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const match = text.match(FENCE_RE);
  if (!match) return { data: {}, body: text };
  try {
    return { data: (yaml.load(match[1]) || {}) as Record<string, unknown>, body: match[2] || "" };
  } catch {
    return { data: {}, body: match[2] || "" };
  }
}

function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const yamlText = yaml.dump(data, { lineWidth: -1, noRefs: true }).trimEnd();
  return `---\n${yamlText}\n---\n${body.startsWith("\n") ? body : "\n" + body}`;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function isLegacyMedia(entry: unknown): entry is Record<string, unknown> {
  if (!entry || typeof entry !== "object") return false;
  const m = entry as Record<string, unknown>;
  if ("localPath" in m) return true;
  if (typeof m.url !== "string" || !m.url) return true;
  return false;
}

function buildMediaKey(slug: string, ideaId: string, channel: string, ext: string): string {
  const safeExt = ext.replace(/^\./, "").toLowerCase() || "png";
  const ts = Date.now();
  return `brand/${slug}/content/drafts/${ideaId}/${channel}-${ts}.${safeExt}`;
}

let r2Client: S3Client | null = null;
function r2(): S3Client {
  if (r2Client) return r2Client;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_UPLOAD_IMAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY;
  if (!account || !accessKeyId || !secretAccessKey) {
    console.error(
      "Missing R2 env. Run:  set -a; source ~/.openclaw/.env; set +a",
    );
    process.exit(2);
  }
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2Client;
}

async function uploadFile(localAbs: string, key: string, contentType: string): Promise<string> {
  const bucket = process.env.R2_UPLOAD_IMAGE_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicBase) {
    console.error(
      "Missing R2_UPLOAD_IMAGE_BUCKET_NAME or R2_PUBLIC_URL. Source ~/.openclaw/.env first.",
    );
    process.exit(2);
  }
  const buffer = fs.readFileSync(localAbs);
  await r2().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }),
  );
  return `${publicBase}/${key}`;
}

interface MigrationResult {
  file: string;
  slug: string;
  ideaId: string;
  channel: string;
  uploadedUrls: string[];
  warnings: string[];
}

async function migrateFile(
  absPath: string,
  slug: string,
  ideaId: string,
  channel: string,
): Promise<MigrationResult | null> {
  const text = fs.readFileSync(absPath, "utf-8");
  const { data, body } = parseFrontmatter(text);
  const media = data.media;
  if (!Array.isArray(media)) return null;
  const legacyIdx = media
    .map((entry, i) => (isLegacyMedia(entry) ? i : -1))
    .filter((i) => i >= 0);
  if (legacyIdx.length === 0) return null;

  const result: MigrationResult = {
    file: absPath,
    slug,
    ideaId,
    channel,
    uploadedUrls: [],
    warnings: [],
  };

  const draftDir = path.dirname(absPath);
  const updatedMedia = [...(media as unknown[])];
  const filesToDelete: string[] = [];

  for (const i of legacyIdx) {
    const entry = updatedMedia[i] as Record<string, unknown>;
    const localPath = typeof entry.localPath === "string" ? entry.localPath : null;
    if (!localPath) {
      result.warnings.push(`media[${i}] has no localPath and no url — manual fix required`);
      continue;
    }
    // localPath in the frontmatter is workspace-relative ("content/drafts/...").
    // Resolve from the brand root so we find the binary on disk.
    const brandRoot = path.join(BRAND_DIR, slug);
    const localAbs = path.isAbsolute(localPath)
      ? localPath
      : path.join(brandRoot, localPath);
    if (!fs.existsSync(localAbs)) {
      result.warnings.push(`media[${i}].localPath not found on disk: ${localAbs}`);
      continue;
    }

    const ext = path.extname(localAbs).slice(1) || "jpg";
    const mime = mimeFor(localAbs);
    const key = buildMediaKey(slug, ideaId, channel, ext);

    if (DRY_RUN) {
      result.uploadedUrls.push(`(dry-run) would upload ${localAbs} → key ${key}`);
      continue;
    }

    const url = await uploadFile(localAbs, key, mime);
    result.uploadedUrls.push(url);

    if (!UPLOAD_ONLY) {
      const stat = fs.statSync(localAbs);
      const canonical = {
        url,
        type: mime,
        source: "uploaded" as const,
        created_at: stat.mtime.toISOString(),
      };
      updatedMedia[i] = canonical;
      filesToDelete.push(localAbs);
    }
  }

  if (UPLOAD_ONLY || DRY_RUN) return result;

  // Write the draft back.
  data.media = updatedMedia;
  data.updated_at = new Date().toISOString();
  fs.writeFileSync(absPath, serializeFrontmatter(data, body));

  // Delete local files once the rewrite succeeded.
  for (const p of filesToDelete) {
    try {
      fs.unlinkSync(p);
    } catch (e) {
      result.warnings.push(`failed to delete ${p}: ${(e as Error).message}`);
    }
  }
  return result;
}

async function main() {
  if (!fs.existsSync(BRAND_DIR)) {
    console.error(`Brand directory not found: ${BRAND_DIR}`);
    process.exit(2);
  }

  const slugs = fs
    .readdirSync(BRAND_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((s) => !slugFilter || s === slugFilter);

  const results: MigrationResult[] = [];
  let scanned = 0;

  for (const slug of slugs) {
    const draftsRoot = path.join(BRAND_DIR, slug, "content", "drafts");
    if (!fs.existsSync(draftsRoot)) continue;
    for (const ideaEntry of fs.readdirSync(draftsRoot, { withFileTypes: true })) {
      if (!ideaEntry.isDirectory()) continue;
      const ideaId = ideaEntry.name;
      const ideaDir = path.join(draftsRoot, ideaId);
      for (const entry of fs.readdirSync(ideaDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const channel = entry.name.replace(/\.md$/, "");
        // Skip versioned snapshots (channel.v3.md).
        if (channel.includes(".v")) continue;
        const abs = path.join(ideaDir, entry.name);
        scanned++;
        try {
          const r = await migrateFile(abs, slug, ideaId, channel);
          if (r) results.push(r);
        } catch (e) {
          console.error(`[error] ${abs}: ${(e as Error).message}`);
        }
      }
    }
  }

  const tag = DRY_RUN ? "[DRY-RUN]" : UPLOAD_ONLY ? "[UPLOAD-ONLY]" : "[APPLIED]";
  console.log("");
  console.log(`${tag} Workspace: ${BASE}`);
  console.log(
    `${tag} Scanned ${scanned} draft files across ${slugs.length} brand(s)`,
  );
  console.log(`${tag} ${results.length} file(s) had legacy media\n`);

  if (results.length === 0) {
    console.log("No legacy media found. Nothing to do.\n");
    process.exit(0);
  }

  for (const r of results) {
    console.log(`  ${r.file.replace(BASE + "/", "")}`);
    for (const u of r.uploadedUrls) console.log(`    ↑ ${u}`);
    for (const w of r.warnings) console.log(`    ⚠ ${w}`);
  }

  if (DRY_RUN) {
    console.log("\nRe-run without --dry-run (and without --upload-only) to apply.\n");
  } else if (UPLOAD_ONLY) {
    console.log(
      "\nUpload-only run finished. Frontmatter NOT modified, local files NOT deleted.",
    );
    console.log(
      "Re-run without --upload-only to rewrite the drafts and delete the originals.\n",
    );
  } else {
    console.log("\nDone. Local files deleted; drafts updated.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
