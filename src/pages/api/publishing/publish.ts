import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadDraft, updateDraft } from "@/lib/data/drafts";
import { findContentTaskByIdAcrossProjects, setChannelPhase } from "@/lib/data/content-tasks";
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

  // Per-channel readiness gate: read from the CT's `channel_phases`
  // (single source of truth). The .md frontmatter no longer carries a
  // `status` field — `tasks.json` does.
  const ctId = draft.meta.content_task_id;
  let parentTaskId: string | null = null;
  let ctMediaPolicy: "required" | "optional" | undefined;
  if (ctId) {
    const found = findContentTaskByIdAcrossProjects(slug, ctId);
    parentTaskId = found?.parentTaskId ?? null;
    ctMediaPolicy = found?.ct.media_policy?.[channel];
    const phase = found?.ct.channel_phases?.[channel];
    if (phase !== "approved" && phase !== "published") {
      return res.status(400).json({
        error: `Channel ${channel} must be in "approved" or "published" before publishing (current: ${phase ?? "unknown"})`,
      });
    }
  }

  // Media Gate: if the draft / CT declares `media_policy=required`, refuse to
  // publish without media. This is the hard stop that prevents a carousel /
  // visual-thread post from going out as text-only when the user (or agent)
  // skipped uploading media. The Ready Queue UI also disables the "Programar"
  // button in this case — this is the server-side enforcement.
  const requiresMedia =
    draft.meta.media_policy === "required" || ctMediaPolicy === "required";
  const mediaCount = Array.isArray(draft.meta.media) ? draft.meta.media.length : 0;
  if (requiresMedia && mediaCount === 0) {
    return res.status(400).json({
      error: `Channel ${channel} requires media (media_policy="required") but draft has no media attached. Upload the carousel / images and retry.`,
    });
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

  // `status` in frontmatter only carries non-terminal states. When the
  // provider reports `publishedAt` (immediate publish succeeded), we OMIT
  // the status field — the terminal "published" state lives in
  // CT.channel_phases (set below via setChannelPhase).
  const wasPublishedNow = Boolean(result.ok && !validSchedule && result.publishedAt);
  const finalMeta: PublishingMeta = result.ok
    ? {
        ...(wasPublishedNow
          ? {}
          : { status: (validSchedule ? "scheduled" : "publishing") as PublishingMeta["status"] }),
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

  const updated = updateDraft(slug, ideaId, channel, {
    meta: { publishing: finalMeta },
  });

  // Promote the channel phase on the CT to "published" only when the post is
  // actually live — keeps "approved" semantics intact for scheduled posts.
  // setChannelPhase auto-promotes ct.status forward (to "Published" once all
  // channels are published).
  if (wasPublishedNow && ctId && parentTaskId) {
    try {
      setChannelPhase(slug, parentTaskId, ctId, channel, "published");
    } catch { /* non-fatal */ }
  }

  return res.status(result.ok ? 200 : 502).json({
    ok: result.ok,
    error: result.ok ? undefined : finalMeta.error || "Publish failed",
    publishing: finalMeta,
    draft: updated,
  });
}

export default withErrorHandler(handler);
