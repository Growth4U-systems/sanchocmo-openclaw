import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadDraft, updateDraft } from "@/lib/data/drafts";

/**
 * /api/content-engine/media
 *
 *   PATCH  body: { slug, ideaId, channel, url, primary: true }
 *     → moves the matching media[] entry to index 0 (the channel preview's
 *       primary image).
 *   DELETE body: { slug, ideaId, channel, url }
 *     → removes the entry from media[]. Doesn't touch R2 — leaves the asset
 *       so other drafts could still reference it if we ever cross-link.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.body?.slug as string;
  const ideaId = req.body?.ideaId as string;
  const channel = req.body?.channel as string;
  const url = req.body?.url as string;
  if (!slug || !ideaId || !channel || !url) {
    return res.status(400).json({ error: "Missing slug, ideaId, channel or url" });
  }

  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  const current = draft.meta.media || [];
  const idx = current.findIndex((m) => m.url === url);
  if (idx === -1) return res.status(404).json({ error: "Media not in draft" });

  if (req.method === "PATCH") {
    if (req.body?.primary !== true) {
      return res.status(400).json({ error: "PATCH requires primary: true" });
    }
    if (idx === 0) return res.status(200).json({ ok: true, draft });
    const next = [current[idx], ...current.filter((_, i) => i !== idx)];
    const updated = updateDraft(slug, ideaId, channel, { meta: { media: next } });
    return res.status(200).json({ ok: true, draft: updated });
  }

  if (req.method === "DELETE") {
    const next = current.filter((_, i) => i !== idx);
    const updated = updateDraft(slug, ideaId, channel, { meta: { media: next } });
    return res.status(200).json({ ok: true, draft: updated });
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
