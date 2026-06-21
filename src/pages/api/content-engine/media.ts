import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { removeDraftMedia, setPrimaryDraftMedia } from "@/lib/media/actions";

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

  if (req.method === "PATCH") {
    if (req.body?.primary !== true) {
      return res.status(400).json({ error: "PATCH requires primary: true" });
    }
    try {
      const result = setPrimaryDraftMedia(slug, ideaId, channel, url);
      return res.status(200).json({ ok: true, draft: result.draft });
    } catch (err) {
      return mediaError(res, err);
    }
  }

  if (req.method === "DELETE") {
    try {
      const result = removeDraftMedia(slug, ideaId, channel, url);
      return res.status(200).json({ ok: true, draft: result.draft });
    } catch (err) {
      return mediaError(res, err);
    }
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

function mediaError(res: NextApiResponse, err: unknown) {
  const message = err instanceof Error ? err.message : "Media update failed";
  const status = message === "Draft not found" || message === "Media not in draft" ? 404 : 400;
  return res.status(status).json({ error: message });
}

export default withErrorHandler(handler);
