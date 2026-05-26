/**
 * /api/content-engine/drafts
 *
 * Drafts-as-documents storage. Each draft is a markdown file with YAML
 * frontmatter at `brand/{slug}/content/drafts/{idea-id}/{channel}.md`.
 *
 *   GET   ?slug=X&ideaId=Y                  → list drafts for an idea
 *   GET   ?slug=X&ideaId=Y&channel=Z        → single draft
 *   PATCH { slug, ideaId, channel, meta?, body? }  → update frontmatter or body
 *
 * POST is no longer supported here — drafts are provisioned by
 * `/api/content-engine/generate-drafts` when an idea is approved.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadDraft, listDrafts, updateDraft } from "@/lib/data/drafts";
import { maybePromoteContentTaskFromMedia } from "@/lib/data/content-tasks";
import { reconcileClarifyToPovBank } from "@/lib/data/pov-bank";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    const ideaId = req.query.ideaId as string;
    const channel = req.query.channel as string | undefined;
    if (!ideaId) return res.status(400).json({ error: "Missing ideaId" });

    if (channel) {
      const draft = loadDraft(slug, ideaId, channel);
      if (!draft) return res.status(404).json({ error: "Draft not found" });
      return res.status(200).json({ ok: true, draft });
    }
    const drafts = listDrafts(slug, ideaId);
    return res.status(200).json({ ok: true, drafts });
  }

  if (req.method === "PATCH") {
    const { ideaId, channel, meta, body } = req.body || {};
    if (!ideaId || !channel) return res.status(400).json({ error: "Missing ideaId or channel" });
    try {
      const updated = updateDraft(slug, ideaId, channel, { meta, body });
      let povReconcile = null;

      // Re-check the media pipeline_state so any drafts.PATCH that mutates
      // `media[]` (uploads, deletes, migrations) flips `generating-media` ↔
      // `media-review` correctly without needing the dedicated upload-media
      // / delete-media endpoints. The CT.status / channel_phases are owned
      // by the writer skill (PATCH content-tasks) — drafts.ts no longer
      // promotes the CT from frontmatter inference.
      const ctId = updated.meta.content_task_id;
      if (ctId) {
        try {
          maybePromoteContentTaskFromMedia(slug, ctId);
        } catch { /* non-fatal */ }
      }

      if (channel === "clarify") {
        try {
          povReconcile = await reconcileClarifyToPovBank(slug, { ideaId });
        } catch (error) {
          povReconcile = {
            configured: false,
            source: "clarify",
            error: error instanceof Error ? error.message : "Clarify extraction failed",
          };
        }
      }

      return res.status(200).json({ ok: true, draft: updated, povReconcile });
    } catch (e) {
      return res.status(404).json({ error: (e as Error).message });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
