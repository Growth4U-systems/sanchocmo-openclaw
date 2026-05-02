import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getAvailableImageProviders } from "@/lib/image-gen/registry";
import { getContentConfig } from "@/lib/data/content-config";

/**
 * GET /api/content-engine/image-providers?slug=X
 *   → { providers: ImageProviderInfo[], config: ContentConfig.image_generation }
 *
 * The UI uses `config.mode === "fixed"` to hide the provider dropdown and
 * `config.provider/model` to pre-select. `providers[]` always lists every
 * registered provider with a `configured: boolean` flag so the user knows
 * which ones to connect from the API panel.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const providers = getAvailableImageProviders(slug);
  const config = getContentConfig(slug);
  return res.status(200).json({ providers, config: config.image_generation });
}

export default withErrorHandler(handler);
