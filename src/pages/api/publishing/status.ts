import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadDraft, updateDraft } from "@/lib/data/drafts";
import { getProvider } from "@/lib/publishing/registry";
import type { PublishingMeta } from "@/lib/data/drafts";

/**
 * GET /api/publishing/status?slug=X&ideaId=Y&channel=Z
 *
 * Asks the provider where its job is at and refreshes the draft's
 * `publishing` frontmatter if the state changed (e.g. scheduled → published).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.query.slug as string;
  const ideaId = req.query.ideaId as string;
  const channel = req.query.channel as string;
  if (!slug || !ideaId || !channel) {
    return res.status(400).json({ error: "Missing slug, ideaId or channel" });
  }

  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  const pub = draft.meta.publishing;
  if (!pub) return res.status(200).json({ publishing: null });

  const provider = pub.provider ? getProvider(pub.provider) : null;
  if (!provider || !provider.getStatus || !pub.external_job_id) {
    return res.status(200).json({ publishing: pub });
  }

  const remote = await provider.getStatus(slug, pub.external_job_id);
  const next: PublishingMeta = {
    ...pub,
    status: remote.status,
    external_url: remote.externalUrl ?? pub.external_url ?? null,
    published_at: remote.publishedAt ?? pub.published_at ?? null,
    error: remote.error ?? null,
  };

  // Only persist when something changed to avoid pointless writes.
  const changed =
    next.status !== pub.status ||
    next.external_url !== pub.external_url ||
    next.published_at !== pub.published_at ||
    next.error !== pub.error;

  if (changed) {
    const topStatus = next.status === "published" ? "published" : draft.meta.status;
    updateDraft(slug, ideaId, channel, { meta: { publishing: next, status: topStatus } });
  }

  return res.status(200).json({ publishing: next });
}

export default withErrorHandler(handler);
