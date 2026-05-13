import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadDraft, updateDraft } from "@/lib/data/drafts";
import { getProvider } from "@/lib/publishing/registry";

/**
 * POST /api/publishing/cancel
 *   body: { slug, ideaId, channel }
 *
 * Cancels a scheduled post via the provider that owns it. Only valid when
 * the draft's `publishing.status` is "scheduled".
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { slug, ideaId, channel } = req.body || {};
  if (!slug || !ideaId || !channel) {
    return res.status(400).json({ error: "Missing slug, ideaId or channel" });
  }

  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  const pub = draft.meta.publishing;
  if (!pub || pub.status !== "scheduled") {
    return res.status(400).json({ error: "Draft is not currently scheduled" });
  }

  const provider = pub.provider ? getProvider(pub.provider) : null;
  if (provider?.cancel && pub.external_job_id) {
    const r = await provider.cancel(slug, pub.external_job_id);
    if (!r.ok) return res.status(502).json({ error: r.error || "Cancel failed" });
  }

  const updated = updateDraft(slug, ideaId, channel, {
    meta: {
      publishing: { ...pub, status: "canceled", error: null },
    },
  });
  return res.status(200).json({ ok: true, draft: updated });
}

export default withErrorHandler(handler);
