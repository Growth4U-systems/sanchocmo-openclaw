import { loadDraft, listDrafts, updateDraft, type Draft, type PublishingMeta } from "@/lib/data/drafts";
import {
  findContentTaskByIdAcrossProjects,
  listAllContentTasks,
  setChannelPhase,
} from "@/lib/data/content-tasks";
import { getVoiceMetricoolProfileId } from "@/lib/data/voice-routing";
import { getProvider } from "@/lib/publishing/registry";
import { reconcileScheduledDrafts, type ReconcileResult } from "@/lib/publishing/reconciliation";
import type { Channel, PublishProvider, PublishResult } from "@/lib/publishing/types";

export interface PublishDraftInput {
  slug: string;
  ideaId: string;
  channel: Channel;
  providerId: string;
  schedule?: { publishAt?: string };
}

export interface PublishDraftPreview {
  ideaId: string;
  channel: Channel;
  providerId: string;
  providerName: string;
  draftPath: string;
  bodyChars: number;
  schedule: { publishAt: string } | null;
  publishing: PublishingMeta | null;
  contentTask: {
    id: string;
    parentTaskId: string | null;
    phase: string | null;
    mediaPolicy: "required" | "optional" | null;
  } | null;
  media: {
    count: number;
    requiresMedia: boolean;
    skipped: boolean;
  };
}

export interface PublishDraftActionResult {
  ok: boolean;
  error?: string;
  publishing: PublishingMeta;
  draft: Draft;
}

interface PreparedPublishDraft {
  draft: Draft;
  provider: PublishProvider;
  parentTaskId: string | null;
  contentTaskId: string | null;
  accountId?: string;
  validSchedule?: { publishAt: string };
  preview: PublishDraftPreview;
}

export function previewPublishDraft(input: PublishDraftInput): PublishDraftPreview {
  return preparePublishDraft(input).preview;
}

export async function publishDraft(input: PublishDraftInput): Promise<PublishDraftActionResult> {
  const prepared = preparePublishDraft(input);
  const { draft, provider, parentTaskId, contentTaskId, accountId, validSchedule } = prepared;

  const optimistic: PublishingMeta = {
    status: validSchedule ? "scheduled" : "publishing",
    provider: provider.id,
    scheduled_at: validSchedule?.publishAt,
    published_at: null,
    external_url: null,
    error: null,
  };
  updateDraft(input.slug, input.ideaId, input.channel, { meta: { publishing: optimistic } });

  let result: PublishResult;
  try {
    result = await provider.publish({
      slug: input.slug,
      draft: { ideaId: input.ideaId, channel: input.channel, body: draft.body },
      media: draft.meta.media || [],
      schedule: validSchedule,
      accountId,
    });
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof Error ? err.message : "Publish failed",
    };
  }

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
        account_id: accountId,
        error: null,
      }
    : {
        status: "failed",
        provider: provider.id,
        scheduled_at: validSchedule?.publishAt,
        published_at: null,
        error: result.error || "Provider returned no error message",
      };

  const updated = updateDraft(input.slug, input.ideaId, input.channel, {
    meta: { publishing: finalMeta },
  });

  if (wasPublishedNow && contentTaskId && parentTaskId) {
    try {
      setChannelPhase(input.slug, parentTaskId, contentTaskId, input.channel, "published");
    } catch {
      // Non-fatal: publishing metadata is still persisted on the draft.
    }
  }

  return {
    ok: result.ok,
    error: result.ok ? undefined : finalMeta.error || "Publish failed",
    publishing: finalMeta,
    draft: updated,
  };
}

export function getStoredPublishingStatus(
  slug: string,
  ideaId: string,
  channel: string,
): { publishing: PublishingMeta | null; draft: Draft | null } {
  const draft = loadDraft(slug, ideaId, channel);
  return { draft, publishing: draft?.meta.publishing ?? null };
}

export async function refreshPublishingStatus(
  slug: string,
  ideaId: string,
  channel: string,
): Promise<{ publishing: PublishingMeta | null; draft: Draft | null; changed: boolean }> {
  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) return { draft: null, publishing: null, changed: false };
  const pub = draft.meta.publishing;
  if (!pub) return { draft, publishing: null, changed: false };

  const provider = pub.provider ? getProvider(pub.provider) : null;
  if (!provider?.getStatus || !pub.external_job_id) {
    return { draft, publishing: pub, changed: false };
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

  const changed =
    next.status !== pub.status ||
    next.external_url !== pub.external_url ||
    next.published_at !== pub.published_at ||
    next.error !== pub.error;

  if (!changed) return { draft, publishing: next, changed: false };

  const updated = updateDraft(slug, ideaId, channel, { meta: { publishing: next } });
  if (remote.status === "published" && draft.meta.content_task_id) {
    try {
      const found = findContentTaskByIdAcrossProjects(slug, draft.meta.content_task_id);
      if (found?.parentTaskId) {
        setChannelPhase(slug, found.parentTaskId, draft.meta.content_task_id, channel, "published");
      }
    } catch {
      // Non-fatal: status refresh should still return updated publishing meta.
    }
  }

  return { draft: updated, publishing: next, changed: true };
}

export function previewCancelScheduledPost(
  slug: string,
  ideaId: string,
  channel: string,
): { ideaId: string; channel: string; draftPath: string; publishing: PublishingMeta } {
  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) throw new Error("Draft not found");
  const pub = draft.meta.publishing;
  if (!pub || pub.status !== "scheduled") throw new Error("Draft is not currently scheduled");
  return { ideaId, channel, draftPath: draft.relPath, publishing: pub };
}

export async function cancelScheduledPost(
  slug: string,
  ideaId: string,
  channel: string,
): Promise<{ ok: boolean; error?: string; draft?: Draft; publishing?: PublishingMeta }> {
  const preview = previewCancelScheduledPost(slug, ideaId, channel);
  const provider = preview.publishing.provider ? getProvider(preview.publishing.provider) : null;
  if (provider?.cancel && preview.publishing.external_job_id) {
    const result = await provider.cancel(slug, preview.publishing.external_job_id, preview.publishing.account_id);
    if (!result.ok) return { ok: false, error: result.error || "Cancel failed" };
  }

  const publishing: PublishingMeta = { ...preview.publishing, status: "canceled", error: null };
  const draft = updateDraft(slug, ideaId, channel, { meta: { publishing } });
  return { ok: true, draft, publishing };
}

export function previewPublishingReconciliation(
  slug: string,
  limit = 50,
): {
  scanned: number;
  pending: Array<{ ideaId: string; channel: string; scheduledAt: string | null; provider: string | null }>;
  limit: number;
  truncated: boolean;
} {
  const now = Date.now();
  const seen = new Set<string>();
  const pending: Array<{ ideaId: string; channel: string; scheduledAt: string | null; provider: string | null }> = [];
  for (const { ct } of listAllContentTasks(slug)) {
    for (const draft of listDrafts(slug, ct.idea_id)) {
      const pub = draft.meta.publishing;
      if (!pub || pub.status !== "scheduled") continue;
      const scheduledAt = pub.scheduled_at || null;
      const scheduledMs = scheduledAt ? Date.parse(scheduledAt) : NaN;
      if (Number.isNaN(scheduledMs) || scheduledMs > now) continue;
      const key = `${ct.idea_id}:${draft.meta.channel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push({
        ideaId: ct.idea_id,
        channel: draft.meta.channel,
        scheduledAt,
        provider: pub.provider || null,
      });
    }
  }
  return {
    scanned: pending.length,
    pending: pending.slice(0, limit),
    limit,
    truncated: pending.length > limit,
  };
}

export async function reconcilePublishing(slug: string): Promise<ReconcileResult> {
  return reconcileScheduledDrafts(slug);
}

function preparePublishDraft(input: PublishDraftInput): PreparedPublishDraft {
  const draft = loadDraft(input.slug, input.ideaId, input.channel);
  if (!draft) throw new Error("Draft not found");

  const provider = getProvider(input.providerId);
  if (!provider) throw new Error(`Unknown provider: ${input.providerId}`);
  if (!provider.supportedChannels.includes(input.channel)) {
    throw new Error(`Provider ${provider.name} does not support channel ${input.channel}`);
  }

  const publishAt = input.schedule?.publishAt?.trim();
  const validSchedule = publishAt ? { publishAt: parsePublishAt(publishAt) } : undefined;
  if (validSchedule && !provider.capabilities.schedule) {
    throw new Error(`Provider ${provider.name} does not support scheduling`);
  }
  if (!validSchedule && !provider.capabilities.publishNow) {
    throw new Error(`Provider ${provider.name} does not support publish-now`);
  }

  const inspect = provider.inspect(input.slug);
  if (!inspect.configured) {
    throw new Error(inspect.missing || `Provider ${provider.name} not configured`);
  }

  const { parentTaskId, contentTaskId, phase, mediaPolicy, mediaStatus, authorId } = assertDraftPublishingReadiness(
    input.slug,
    draft,
    input.channel,
  );
  const requiresMedia = assertDraftMediaReadiness(draft, input.channel, mediaPolicy, mediaStatus);
  const accountId = getVoiceMetricoolProfileId(input.slug, input.channel, authorId) ?? undefined;

  return {
    draft,
    provider,
    parentTaskId,
    contentTaskId,
    accountId,
    validSchedule,
    preview: {
      ideaId: input.ideaId,
      channel: input.channel,
      providerId: provider.id,
      providerName: provider.name,
      draftPath: draft.relPath,
      bodyChars: draft.body.length,
      schedule: validSchedule ?? null,
      publishing: draft.meta.publishing ?? null,
      contentTask: contentTaskId
        ? { id: contentTaskId, parentTaskId, phase, mediaPolicy: mediaPolicy ?? null }
        : null,
      media: {
        count: draft.meta.media?.length ?? 0,
        requiresMedia,
        skipped: mediaStatus === "skipped",
      },
    },
  };
}

function parsePublishAt(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error("schedule.publishAt must be a valid ISO date");
  return new Date(timestamp).toISOString();
}

function assertDraftPublishingReadiness(
  slug: string,
  draft: Draft,
  channel: Channel,
): {
  parentTaskId: string | null;
  contentTaskId: string | null;
  phase: string | null;
  mediaPolicy?: "required" | "optional";
  mediaStatus?: "pending" | "skipped";
  authorId?: string;
} {
  const contentTaskId = draft.meta.content_task_id || null;
  if (!contentTaskId) {
    return { parentTaskId: null, contentTaskId: null, phase: null };
  }
  const found = findContentTaskByIdAcrossProjects(slug, contentTaskId);
  const parentTaskId = found?.parentTaskId ?? null;
  const mediaPolicy = found?.ct.media_policy?.[channel];
  const mediaStatus = found?.ct.media_status;
  const authorId = found?.ct.author;
  const phase = found?.ct.channel_phases?.[channel] ?? null;
  if (phase !== "approved" && phase !== "published") {
    throw new Error(
      `Channel ${channel} must be in "approved" or "published" before publishing (current: ${phase ?? "unknown"})`,
    );
  }
  return { parentTaskId, contentTaskId, phase, mediaPolicy, mediaStatus, authorId };
}

function assertDraftMediaReadiness(
  draft: Draft,
  channel: Channel,
  contentTaskMediaPolicy?: "required" | "optional",
  mediaStatus?: "pending" | "skipped",
): boolean {
  if (mediaStatus === "skipped") return false;
  const requiresMedia = draft.meta.media_policy === "required" || contentTaskMediaPolicy === "required";
  const mediaList = Array.isArray(draft.meta.media) ? draft.meta.media : [];
  if (!requiresMedia) return false;

  if (mediaList.length === 0) {
    throw new Error(
      `Channel ${channel} requires media (media_policy="required") but draft has no media attached. ` +
        "Upload the carousel / images and retry.",
    );
  }
  if (channel === "linkedin") {
    const hasPdf = mediaList.some((media) => media.type === "application/pdf");
    if (!hasPdf) {
      throw new Error(
        `Channel linkedin requires a multi-page PDF for carousel posts (media_policy="required"). ` +
          `Found ${mediaList.length} non-PDF asset(s).`,
      );
    }
  } else if (channel === "twitter" || channel === "x" || channel === "instagram") {
    const hasImage = mediaList.some((media) => typeof media.type === "string" && media.type.startsWith("image/"));
    if (!hasImage) {
      throw new Error(
        `Channel ${channel} requires at least one image (media_policy="required"). No image-type asset found in draft media.`,
      );
    }
  }
  return true;
}
