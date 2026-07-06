import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  getContentConfig,
  updateContentConfig,
  type ContentConfig,
  type ImageGenMode,
} from "@/lib/data/content-config";
import {
  getEffectiveContentConfig,
  readBrandBookSnapshot,
} from "@/lib/data/content-config-effective";
import { getAvailableImageProviders } from "@/lib/image-gen/registry";

/**
 * /api/content-engine/setup-config
 *   GET   ?slug=X                                       → current config
 *   PATCH { slug, image_generation?: ..., carousel?: ... }  → merge & persist
 *
 * Used by the Content Setup UI. Validates that any chosen image provider/model
 * exists in the registry. Carousel overrides are persisted as-is — colors and
 * URLs are free-form by design (brand assets evolve).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  if (req.method === "GET") {
    return res.status(200).json({
      config: getContentConfig(slug),
      effective: getEffectiveContentConfig(slug),
      brand_book: readBrandBookSnapshot(slug),
    });
  }

  if (req.method === "PATCH") {
    const patch: Partial<ContentConfig> = {};

    if (req.body?.image_generation) {
      const ig = req.body.image_generation as Partial<ContentConfig["image_generation"]>;
      if (ig.mode && !["ask", "fixed"].includes(ig.mode as ImageGenMode)) {
        return res.status(400).json({ error: "image_generation.mode must be 'ask' or 'fixed'" });
      }
      if (ig.provider) {
        const providers = getAvailableImageProviders(slug);
        const found = providers.find((p) => p.id === ig.provider);
        if (!found) return res.status(400).json({ error: `Unknown provider: ${ig.provider}` });
        if (ig.model && !found.models.some((m) => m.id === ig.model)) {
          return res.status(400).json({ error: `Provider ${ig.provider} doesn't expose model ${ig.model}` });
        }
      }
      patch.image_generation = ig as ContentConfig["image_generation"];
    }

    if (req.body?.carousel) {
      patch.carousel = req.body.carousel as ContentConfig["carousel"];
    }

    if (!patch.image_generation && !patch.carousel) {
      return res.status(400).json({ error: "Nothing to update — pass image_generation and/or carousel" });
    }

    const next = updateContentConfig(slug, patch);
    return res.status(200).json({ config: next });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
