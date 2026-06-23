import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { generateDraftImage } from "@/lib/media/actions";

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
  try {
    const result = await generateDraftImage({ slug, ideaId, channel, prompt, aspectRatio, providerId, model });
    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = message === "Draft not found" ? 404 : message.startsWith("Storage unavailable") ? 503 : 400;
    return res.status(status).json({ error: message });
  }
}

export default withErrorHandler(handler);
