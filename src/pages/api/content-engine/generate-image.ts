import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { uploadToR2 } from "@/lib/upload-r2";
import {
  attachMediaToDraft,
  buildMediaKey,
  readVisualIdentityPrefix,
} from "@/lib/publishing/media-helpers";
import { loadDraft } from "@/lib/data/drafts";
import { getAvailableImageProviders, getImageProvider } from "@/lib/image-gen/registry";
import { getContentConfig } from "@/lib/data/content-config";

/**
 * POST /api/content-engine/generate-image
 *   body: { slug, ideaId, channel, prompt, aspectRatio?, providerId?, model? }
 *
 * Provider-agnostic image generation. Resolution rules for `providerId`:
 *   1. Explicit `providerId` from the request wins.
 *   2. Brand content-config: if mode === "fixed", use config.provider.
 *   3. Auto-pick: first configured provider in registry order.
 * Same logic for `model` (request → config → provider's default).
 *
 * The brand's `brand-book/visual-identity.md` is prepended to the prompt so
 * output matches brand voice without the user having to re-state it.
 */

interface Body {
  slug?: string;
  ideaId?: string;
  channel?: string;
  prompt?: string;
  aspectRatio?: string;
  providerId?: string;
  model?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { slug, ideaId, channel, prompt, aspectRatio, providerId, model } = (req.body || {}) as Body;
  if (!slug || !ideaId || !channel || !prompt) {
    return res.status(400).json({ error: "Missing slug, ideaId, channel or prompt" });
  }
  if (!loadDraft(slug, ideaId, channel)) {
    return res.status(404).json({ error: "Draft not found" });
  }

  const config = getContentConfig(slug);
  const available = getAvailableImageProviders(slug);

  // Resolve provider: explicit > config.fixed > first configured
  let resolvedProviderId = providerId;
  if (!resolvedProviderId && config.image_generation.mode === "fixed" && config.image_generation.provider) {
    resolvedProviderId = config.image_generation.provider;
  }
  if (!resolvedProviderId) {
    resolvedProviderId = available.find((p) => p.configured)?.id;
  }
  if (!resolvedProviderId) {
    return res.status(400).json({
      error: "No image-gen provider configured. Conecta uno en Ajustes → APIs.",
    });
  }

  const providerInfo = available.find((p) => p.id === resolvedProviderId);
  if (!providerInfo) return res.status(400).json({ error: `Unknown provider: ${resolvedProviderId}` });
  if (!providerInfo.configured) {
    return res.status(400).json({ error: providerInfo.missing || `Provider ${resolvedProviderId} not configured` });
  }

  const provider = getImageProvider(resolvedProviderId);
  if (!provider) return res.status(400).json({ error: `Provider not in registry: ${resolvedProviderId}` });

  // Resolve model: explicit > config.fixed (only if matching provider) > provider default
  const defaultModel = provider.models.find((m) => m.default)?.id || provider.models[0]?.id;
  let resolvedModel = model;
  if (!resolvedModel && config.image_generation.mode === "fixed" && config.image_generation.provider === resolvedProviderId) {
    resolvedModel = config.image_generation.model || undefined;
  }
  if (!resolvedModel) resolvedModel = defaultModel;

  // Resolve aspect ratio: explicit > provider's first supported
  const resolvedRatio = aspectRatio && provider.capabilities.aspectRatios.includes(aspectRatio)
    ? aspectRatio
    : provider.capabilities.aspectRatios[0] || "1:1";

  // Hard pre-flight: refuse to spend provider credits if R2 isn't configured
  // — without storage we couldn't persist the result anyway, and falling back
  // to localPath in the frontmatter is forbidden by media-persistence-protocol.
  const missingR2 = [
    "CLOUDFLARE_ACCOUNT_ID",
    "R2_UPLOAD_IMAGE_ACCESS_KEY_ID",
    "R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY",
    "R2_UPLOAD_IMAGE_BUCKET_NAME",
    "R2_PUBLIC_URL",
  ].filter((k) => !process.env[k]);
  if (missingR2.length > 0) {
    return res.status(503).json({
      error:
        `Storage unavailable: missing ${missingR2.join(", ")}. ` +
        `Set them in ~/.openclaw/.env.local and restart 'next dev'. ` +
        `Refusing to call the image provider since the result cannot be persisted.`,
      storage: { ok: false, missing: missingR2 },
    });
  }

  const brandPrefix = readVisualIdentityPrefix(slug);
  const fullPrompt = brandPrefix
    ? `Brand visual style:\n${brandPrefix}\n\nGenerate:\n${prompt}`
    : prompt;

  const result = await provider.generate({
    slug,
    prompt: fullPrompt,
    aspectRatio: resolvedRatio,
    model: resolvedModel,
  });
  if (!result.ok || !result.buffer) {
    return res.status(502).json({ error: result.error || "Generation failed" });
  }

  const ext = (result.mimeType || "image/png").split("/")[1] || "png";
  const key = buildMediaKey(slug, ideaId, channel, ext);
  const publicUrl = await uploadToR2(result.buffer, key, result.mimeType || "image/png");

  const draft = attachMediaToDraft(slug, ideaId, channel, {
    url: publicUrl,
    type: result.mimeType || "image/png",
    source: "ai-generated",
    prompt,
    model: result.model || resolvedModel,
    aspect_ratio: resolvedRatio,
    created_at: new Date().toISOString(),
  });

  return res.status(200).json({
    ok: true,
    url: publicUrl,
    draft,
    providerId: resolvedProviderId,
    model: result.model || resolvedModel,
  });
}

export default withErrorHandler(handler);
