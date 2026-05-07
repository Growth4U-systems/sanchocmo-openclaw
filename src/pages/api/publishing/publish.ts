import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadDraft, updateDraft } from "@/lib/data/drafts";
import { getProvider } from "@/lib/publishing/registry";
import type { Channel } from "@/lib/publishing/types";
import type { PublishingMeta } from "@/lib/data/drafts";

/**
 * POST /api/publishing/publish
 *   body: { slug, ideaId, channel, providerId, schedule? }
 *
 * Pipes the approved draft through the chosen provider and writes a
 * `publishing` block into the draft frontmatter so the UI can show state
 * across reloads. When `schedule.publishAt` is omitted the provider
 * publishes immediately.
 */

interface Body {
  slug?: string;
  ideaId?: string;
  channel?: Channel;
  providerId?: string;
  schedule?: { publishAt?: string };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { slug, ideaId, channel, providerId, schedule } = (req.body || {}) as Body;
  if (!slug || !ideaId || !channel || !providerId) {
    return res.status(400).json({ error: "Missing slug, ideaId, channel or providerId" });
  }

  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  if (draft.meta.status !== "approved" && draft.meta.status !== "published") {
    return res.status(400).json({ error: `Draft must be approved before publishing (current: ${draft.meta.status})` });
  }

  const provider = getProvider(providerId);
  if (!provider) return res.status(400).json({ error: `Unknown provider: ${providerId}` });
  if (!provider.supportedChannels.includes(channel)) {
    return res.status(400).json({ error: `Provider ${provider.name} does not support channel ${channel}` });
  }
  const inspect = provider.inspect(slug);
  if (!inspect.configured) {
    return res.status(400).json({ error: inspect.missing || `Provider ${provider.name} not configured` });
  }

  // Optimistic frontmatter update so the UI reflects the in-flight state
  // even if the provider call is slow. We finalize after the call returns.
  const optimistic: PublishingMeta = {
    status: schedule?.publishAt ? "scheduled" : "publishing",
    provider: provider.id,
    scheduled_at: schedule?.publishAt,
    published_at: null,
    external_url: null,
    error: null,
  };
  updateDraft(slug, ideaId, channel, { meta: { publishing: optimistic } });

  const validSchedule = schedule?.publishAt ? { publishAt: schedule.publishAt } : undefined;
  const result = await provider.publish({
    slug,
    draft: { ideaId, channel, body: draft.body },
    media: draft.meta.media || [],
    schedule: validSchedule,
  });

  const finalMeta: PublishingMeta = result.ok
    ? {
        status: validSchedule
          ? "scheduled"
          : result.publishedAt
            ? "published"
            : "publishing",
        provider: provider.id,
        scheduled_at: result.scheduledAt ?? validSchedule?.publishAt,
        published_at: result.publishedAt ?? null,
        external_job_id: result.externalJobId,
        external_url: result.externalUrl ?? null,
        error: null,
      }
    : {
        status: "failed",
        provider: provider.id,
        scheduled_at: validSchedule?.publishAt,
        published_at: null,
        error: result.error || "Provider returned no error message",
      };

  // Promote the top-level draft status to "published" only when the post is
  // actually live — keeps "approved" semantics intact for scheduled posts.
  const topStatus = finalMeta.status === "published" ? "published" : draft.meta.status;
  const updated = updateDraft(slug, ideaId, channel, {
    meta: { publishing: finalMeta, status: topStatus },
  });

  return res.status(result.ok ? 200 : 502).json({
    ok: result.ok,
    error: result.ok ? undefined : finalMeta.error || "Publish failed",
    publishing: finalMeta,
    draft: updated,
  });
}

export default withErrorHandler(handler);
