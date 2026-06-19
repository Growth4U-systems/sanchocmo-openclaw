import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadDraft, updateDraft } from "@/lib/data/drafts";
import { findContentTaskByIdAcrossProjects, setChannelPhase } from "@/lib/data/content-tasks";
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

  const remote = await provider.getStatus(slug, pub.external_job_id, pub.account_id);
  const next: PublishingMeta = {
    ...pub,
    external_url: remote.externalUrl ?? pub.external_url ?? null,
    published_at:
      remote.status === "published"
        ? remote.publishedAt ?? pub.published_at ?? new Date().toISOString()
        : remote.publishedAt ?? pub.published_at ?? null,
    error: remote.error ?? null,
  };
  if (remote.status === "published") {
    delete next.status;
  } else {
    next.status = remote.status;
  }

  // Only persist when something changed to avoid pointless writes.
  const changed =
    next.status !== pub.status ||
    next.external_url !== pub.external_url ||
    next.published_at !== pub.published_at ||
    next.error !== pub.error;

  if (changed) {
    updateDraft(slug, ideaId, channel, { meta: { publishing: next } });
    if (remote.status === "published" && draft.meta.content_task_id) {
      try {
        const found = findContentTaskByIdAcrossProjects(slug, draft.meta.content_task_id);
        if (found?.parentTaskId) {
          setChannelPhase(slug, found.parentTaskId, draft.meta.content_task_id, channel, "published");
        }
      } catch { /* non-fatal */ }
    }
  }

  return res.status(200).json({ publishing: next });
}

export default withErrorHandler(handler);
