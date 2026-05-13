import path from "path";
import fs from "fs";
import { brandDir } from "@/lib/data/paths";
import { loadDraft, updateDraft, validateMediaArray } from "@/lib/data/drafts";
import { maybePromoteContentTaskFromMedia } from "@/lib/data/content-tasks";
import type { MediaAsset } from "@/lib/data/drafts";

/**
 * Shared helpers for media management on drafts. Used by upload-media,
 * generate-image and media endpoints to keep frontmatter writes consistent.
 */

/** Slug-friendly key for R2: `brand/{slug}/content/drafts/{ideaId}/{channel}-{timestamp}-{n}.{ext}`. */
export function buildMediaKey(
  slug: string,
  ideaId: string,
  channel: string,
  ext: string,
  index = 0,
): string {
  const safeExt = ext.replace(/^\./, "").toLowerCase() || "png";
  const ts = Date.now();
  const suffix = index > 0 ? `-${index}` : "";
  return `brand/${slug}/content/drafts/${ideaId}/${channel}-${ts}${suffix}.${safeExt}`;
}

/** Try to read the brand's visual identity to prefix the prompt with brand
 *  voice. Best-effort: if the file is missing we just send the raw prompt. */
export function readVisualIdentityPrefix(slug: string): string {
  const candidates = [
    path.join(brandDir(slug), "brand-book", "visual-identity.md"),
    path.join(brandDir(slug), "brand-book", "brand-voice.md"),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, "utf-8");
      const trimmed = raw.replace(/^---[\s\S]*?---\n/, "").trim();
      if (trimmed) return trimmed.slice(0, 800);
    } catch {
      /* missing file — keep going */
    }
  }
  return "";
}

/** Append a MediaAsset to the draft's `media[]`. Idempotent on URL.
 *
 *  Side effect: bumps the parent ContentTask to `Media` status (best-effort)
 *  the first time any channel of the idea picks up media. This matches the
 *  CT lifecycle: New → Approved → Draft → **Media** → Review → Ready.
 */
export function attachMediaToDraft(
  slug: string,
  ideaId: string,
  channel: string,
  asset: MediaAsset,
) {
  validateMediaArray([asset], `attachMediaToDraft ${ideaId}/${channel}`);
  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) throw new Error("Draft not found");
  const current = draft.meta.media || [];
  if (current.some((m) => m.url === asset.url)) return draft;
  const next = [...current, asset];
  const updated = updateDraft(slug, ideaId, channel, { meta: { media: next } });

  const ctId = updated.meta.content_task_id;
  if (ctId) {
    try {
      maybePromoteContentTaskFromMedia(slug, ctId);
    } catch { /* non-fatal — the draft is saved, status sync can lag */ }
  }
  return updated;
}
