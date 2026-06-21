import { getContentConfig } from "@/lib/data/content-config";
import { loadDraft, updateDraft, type Draft, type MediaAsset } from "@/lib/data/drafts";
import {
  findContentTaskByIdAcrossProjects,
  maybePromoteContentTaskFromMedia,
} from "@/lib/data/content-tasks";
import {
  attachMediaToDraft,
  buildMediaKey,
  readVisualIdentityPrefix,
} from "@/lib/publishing/media-helpers";
import { getAvailableImageProviders, getImageProvider } from "@/lib/image-gen/registry";
import { uploadToR2 } from "@/lib/upload-r2";

const REQUIRED_R2_VARS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_UPLOAD_IMAGE_ACCESS_KEY_ID",
  "R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY",
  "R2_UPLOAD_IMAGE_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

export interface DraftMediaSummary {
  ideaId: string;
  channel: string;
  relPath: string;
  media: MediaAsset[];
  mediaPolicy: "required" | "optional" | null;
  contentTask: {
    id: string;
    parentTaskId: string;
    phase: string | null;
    mediaPolicy: "required" | "optional" | null;
  } | null;
}

export interface MediaAssetInput {
  url: string;
  type: string;
  source?: MediaAsset["source"];
  prompt?: string | null;
  model?: string | null;
  aspectRatio?: string | null;
  createdAt?: string | null;
}

export interface ImageGenerationInput {
  slug: string;
  ideaId: string;
  channel: string;
  prompt: string;
  aspectRatio?: string;
  providerId?: string;
  model?: string;
}

export function checkMediaStorage(): { ok: boolean; missing: string[] } {
  const missing = REQUIRED_R2_VARS.filter((key) => !process.env[key]);
  return { ok: missing.length === 0, missing };
}

export function listDraftMedia(slug: string, ideaId: string, channel: string): DraftMediaSummary {
  const draft = requireDraft(slug, ideaId, channel);
  return summarizeDraftMedia(slug, draft);
}

export function previewAttachDraftMedia(
  slug: string,
  ideaId: string,
  channel: string,
  input: MediaAssetInput,
): { summary: DraftMediaSummary; asset: MediaAsset; alreadyAttached: boolean; preview: MediaAsset[] } {
  const draft = requireDraft(slug, ideaId, channel);
  const asset = normalizeMediaAsset(input);
  const current = draft.meta.media || [];
  const alreadyAttached = current.some((media) => media.url === asset.url);
  return {
    summary: summarizeDraftMedia(slug, draft),
    asset,
    alreadyAttached,
    preview: alreadyAttached ? current : [...current, asset],
  };
}

export function attachDraftMedia(
  slug: string,
  ideaId: string,
  channel: string,
  input: MediaAssetInput,
): { draft: Draft; asset: MediaAsset; alreadyAttached: boolean } {
  const preview = previewAttachDraftMedia(slug, ideaId, channel, input);
  const draft = attachMediaToDraft(slug, ideaId, channel, preview.asset);
  return { draft, asset: preview.asset, alreadyAttached: preview.alreadyAttached };
}

export function previewRemoveDraftMedia(
  slug: string,
  ideaId: string,
  channel: string,
  url: string,
): { summary: DraftMediaSummary; removed: MediaAsset; preview: MediaAsset[] } {
  const draft = requireDraft(slug, ideaId, channel);
  const { media, index } = findDraftMedia(draft, url);
  return {
    summary: summarizeDraftMedia(slug, draft),
    removed: media,
    preview: (draft.meta.media || []).filter((_, i) => i !== index),
  };
}

export function removeDraftMedia(
  slug: string,
  ideaId: string,
  channel: string,
  url: string,
): { draft: Draft; removed: MediaAsset } {
  const draft = requireDraft(slug, ideaId, channel);
  const { media, index } = findDraftMedia(draft, url);
  const next = (draft.meta.media || []).filter((_, i) => i !== index);
  const updated = updateDraft(slug, ideaId, channel, { meta: { media: next } });
  syncMediaPipeline(slug, updated);
  return { draft: updated, removed: media };
}

export function previewSetPrimaryDraftMedia(
  slug: string,
  ideaId: string,
  channel: string,
  url: string,
): { summary: DraftMediaSummary; primary: MediaAsset; preview: MediaAsset[]; alreadyPrimary: boolean } {
  const draft = requireDraft(slug, ideaId, channel);
  const { media, index } = findDraftMedia(draft, url);
  const current = draft.meta.media || [];
  return {
    summary: summarizeDraftMedia(slug, draft),
    primary: media,
    preview: index === 0 ? current : [media, ...current.filter((_, i) => i !== index)],
    alreadyPrimary: index === 0,
  };
}

export function setPrimaryDraftMedia(
  slug: string,
  ideaId: string,
  channel: string,
  url: string,
): { draft: Draft; primary: MediaAsset; alreadyPrimary: boolean } {
  const preview = previewSetPrimaryDraftMedia(slug, ideaId, channel, url);
  if (preview.alreadyPrimary) {
    return { draft: requireDraft(slug, ideaId, channel), primary: preview.primary, alreadyPrimary: true };
  }
  const updated = updateDraft(slug, ideaId, channel, { meta: { media: preview.preview } });
  return { draft: updated, primary: preview.primary, alreadyPrimary: false };
}

export function listImageGenerationProviders(slug: string) {
  return {
    providers: getAvailableImageProviders(slug),
    config: getContentConfig(slug).image_generation,
    storage: checkMediaStorage(),
  };
}

export function previewGenerateDraftImage(input: ImageGenerationInput) {
  const draft = requireDraft(input.slug, input.ideaId, input.channel);
  const plan = resolveImageGenerationPlan(input);
  const brandPrefix = readVisualIdentityPrefix(input.slug);
  return {
    ideaId: input.ideaId,
    channel: input.channel,
    draftPath: draft.relPath,
    providerId: plan.providerId,
    providerName: plan.providerName,
    model: plan.model,
    aspectRatio: plan.aspectRatio,
    prompt: input.prompt,
    fullPromptChars: buildImagePrompt(input.slug, input.prompt, brandPrefix).length,
    usesBrandVisualIdentity: Boolean(brandPrefix),
    storage: checkMediaStorage(),
  };
}

export async function generateDraftImage(input: ImageGenerationInput) {
  const draft = requireDraft(input.slug, input.ideaId, input.channel);
  const plan = resolveImageGenerationPlan(input);
  const storage = checkMediaStorage();
  if (!storage.ok) {
    throw new Error(
      `Storage unavailable: missing ${storage.missing.join(", ")}. Refusing to call the image provider since the result cannot be persisted.`,
    );
  }

  const provider = getImageProvider(plan.providerId);
  if (!provider) throw new Error(`Provider not in registry: ${plan.providerId}`);
  const brandPrefix = readVisualIdentityPrefix(input.slug);
  const fullPrompt = buildImagePrompt(input.slug, input.prompt, brandPrefix);
  const result = await provider.generate({
    slug: input.slug,
    prompt: fullPrompt,
    aspectRatio: plan.aspectRatio,
    model: plan.model,
  });
  if (!result.ok || !result.buffer) {
    throw new Error(result.error || "Generation failed");
  }

  const mimeType = result.mimeType || "image/png";
  const ext = mimeType.split("/")[1] || "png";
  const key = buildMediaKey(input.slug, input.ideaId, input.channel, ext);
  const publicUrl = await uploadToR2(result.buffer, key, mimeType);
  const asset: MediaAsset = {
    url: publicUrl,
    type: mimeType,
    source: "ai-generated",
    prompt: input.prompt,
    model: result.model || plan.model,
    aspect_ratio: plan.aspectRatio,
    created_at: new Date().toISOString(),
  };
  const updated = attachMediaToDraft(input.slug, input.ideaId, input.channel, asset);
  return {
    ok: true,
    url: publicUrl,
    draft: updated,
    asset,
    providerId: plan.providerId,
    model: result.model || plan.model,
    previousMediaCount: draft.meta.media?.length ?? 0,
  };
}

function requireDraft(slug: string, ideaId: string, channel: string): Draft {
  const draft = loadDraft(slug, ideaId, channel);
  if (!draft) throw new Error("Draft not found");
  return draft;
}

function normalizeMediaAsset(input: MediaAssetInput): MediaAsset {
  if (!input.url.trim()) throw new Error("Media URL is required");
  if (!input.type.trim() || !input.type.includes("/")) {
    throw new Error("Media type must be a MIME string like image/png or application/pdf");
  }
  return {
    url: input.url.trim(),
    type: input.type.trim(),
    source: input.source || "uploaded",
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
    created_at: input.createdAt || new Date().toISOString(),
  };
}

function findDraftMedia(draft: Draft, url: string): { media: MediaAsset; index: number } {
  const current = draft.meta.media || [];
  const index = current.findIndex((media) => media.url === url);
  if (index < 0) throw new Error("Media not in draft");
  return { media: current[index], index };
}

function summarizeDraftMedia(slug: string, draft: Draft): DraftMediaSummary {
  const contentTaskId = draft.meta.content_task_id;
  const found = contentTaskId ? findContentTaskByIdAcrossProjects(slug, contentTaskId) : null;
  const channel = draft.meta.channel;
  return {
    ideaId: draft.meta.idea_id,
    channel,
    relPath: draft.relPath,
    media: draft.meta.media || [],
    mediaPolicy: draft.meta.media_policy || found?.ct.media_policy?.[channel] || null,
    contentTask: found
      ? {
          id: found.ct.id,
          parentTaskId: found.parentTaskId,
          phase: found.ct.channel_phases?.[channel] || null,
          mediaPolicy: found.ct.media_policy?.[channel] || null,
        }
      : null,
  };
}

function syncMediaPipeline(slug: string, draft: Draft): void {
  const contentTaskId = draft.meta.content_task_id;
  if (!contentTaskId) return;
  try {
    maybePromoteContentTaskFromMedia(slug, contentTaskId);
  } catch {
    // Non-fatal: the draft media mutation is the source of truth and sync can lag.
  }
}

function resolveImageGenerationPlan(input: ImageGenerationInput): {
  providerId: string;
  providerName: string;
  model: string | undefined;
  aspectRatio: string;
} {
  const config = getContentConfig(input.slug);
  const available = getAvailableImageProviders(input.slug);
  let providerId = input.providerId;
  if (!providerId && config.image_generation.mode === "fixed" && config.image_generation.provider) {
    providerId = config.image_generation.provider;
  }
  if (!providerId) providerId = available.find((provider) => provider.configured)?.id;
  if (!providerId) throw new Error("No image-gen provider configured. Connect one in Settings -> APIs.");

  const providerInfo = available.find((provider) => provider.id === providerId);
  if (!providerInfo) throw new Error(`Unknown provider: ${providerId}`);
  if (!providerInfo.configured) {
    throw new Error(providerInfo.missing || `Provider ${providerId} not configured`);
  }

  const provider = getImageProvider(providerId);
  if (!provider) throw new Error(`Provider not in registry: ${providerId}`);
  const defaultModel = provider.models.find((model) => model.default)?.id || provider.models[0]?.id;
  let model = input.model;
  if (!model && config.image_generation.mode === "fixed" && config.image_generation.provider === providerId) {
    model = config.image_generation.model || undefined;
  }
  if (!model) model = defaultModel;
  const aspectRatio =
    input.aspectRatio && provider.capabilities.aspectRatios.includes(input.aspectRatio)
      ? input.aspectRatio
      : provider.capabilities.aspectRatios[0] || "1:1";
  return { providerId, providerName: provider.name, model, aspectRatio };
}

function buildImagePrompt(slug: string, prompt: string, visualIdentityPrefix = readVisualIdentityPrefix(slug)): string {
  return visualIdentityPrefix
    ? `Brand visual style:\n${visualIdentityPrefix}\n\nGenerate:\n${prompt}`
    : prompt;
}
