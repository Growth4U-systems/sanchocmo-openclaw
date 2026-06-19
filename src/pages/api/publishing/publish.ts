import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadDraft, updateDraft } from "@/lib/data/drafts";
import { findContentTaskByIdAcrossProjects, setChannelPhase } from "@/lib/data/content-tasks";
import { getProvider } from "@/lib/publishing/registry";
import { getVoiceMetricoolProfileId } from "@/lib/data/voice-routing";
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
  let mediaStatus: "pending" | "skipped" | undefined;
  let authorId: string | undefined;
  if (ctId) {
    const found = findContentTaskByIdAcrossProjects(slug, ctId);
    parentTaskId = found?.parentTaskId ?? null;
    ctMediaPolicy = found?.ct.media_policy?.[channel];
    mediaStatus = found?.ct.media_status;
    authorId = found?.ct.author;
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
  //
  // SAN-244 escape: an explicit CT-wide `media_status:"skipped"` means the user
  // deliberately chose to ship text-only. The phase gate (assertMediaReady)
  // already let the channel reach `approved` under this escape, so the publish
  // gate must honor the same flag — otherwise a deliberately-skipped channel
  // gets stuck at "approved" and fails here with "requires media". Bypasses the
  // whole block, including the per-network PDF/image sub-checks.
  const mediaSkipped = mediaStatus === "skipped";
  const requiresMedia =
    !mediaSkipped &&
    (draft.meta.media_policy === "required" || ctMediaPolicy === "required");
  const mediaList = Array.isArray(draft.meta.media) ? draft.meta.media : [];
  if (requiresMedia) {
    // Per-network media contract — different platforms expect different
    // artifacts for a carousel/visual post:
    //   - LinkedIn: needs a multi-page PDF (native scheduler only supports
    //     document-style carousels). N standalone images won't render as
    //     a carousel — Metricool would only publish the first image.
    //   - Twitter/X: needs at least 1 image (native carousels are arrays
    //     of up to 4 images, no PDF support).
    //   - Instagram: needs at least 1 image (native arrays up to 10).
    //   - Other channels: at least 1 media asset of any type.
    if (mediaList.length === 0) {
      return res.status(400).json({
        error: `Channel ${channel} requires media (media_policy="required") but draft has no media attached. Upload the carousel / images and retry.`,
      });
    }
    if (channel === "linkedin") {
      const hasPdf = mediaList.some((m) => m.type === "application/pdf");
      if (!hasPdf) {
        return res.status(400).json({
          error:
            `Channel linkedin requires a multi-page PDF for carousel posts (media_policy="required"). ` +
            `Found ${mediaList.length} non-PDF asset(s) — bundle the slides into a PDF and attach it. ` +
            `LinkedIn's API does not render arrays of images as native carousels.`,
        });
      }
    } else if (channel === "twitter" || channel === "x" || channel === "instagram") {
      const hasImage = mediaList.some((m) => typeof m.type === "string" && m.type.startsWith("image/"));
      if (!hasImage) {
        return res.status(400).json({
          error: `Channel ${channel} requires at least one image (media_policy="required"). No image-type asset found in draft media.`,
        });
      }
    }
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

  // SAN-162 — route to the voice's own publishing account. The author (voice)
  // resolves to its `metricool_profile_id` in cadence-config; absent → the
  // provider's default account (back-compat for channels without voices).
  const accountId = getVoiceMetricoolProfileId(slug, channel, authorId) ?? undefined;

  const validSchedule = schedule?.publishAt ? { publishAt: schedule.publishAt } : undefined;
  const result = await provider.publish({
    slug,
    draft: { ideaId, channel, body: draft.body },
    media: draft.meta.media || [],
    schedule: validSchedule,
    accountId,
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
        account_id: accountId,  // SAN-162 — remember the account for the lifecycle
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
