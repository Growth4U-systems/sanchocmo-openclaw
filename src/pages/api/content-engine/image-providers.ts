import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { listImageGenerationProviders } from "@/lib/media/actions";

/**
 * GET /api/content-engine/image-providers?slug=X
 *   → { providers, config, storage }
 *
 * `storage.ok === false` means R2 isn't configured. Skills (notably
 * `content-image`) MUST check this before generating or uploading: without
 * R2 the persisted URL would be empty and the agent would be tempted to
 * fall back to writing `localPath` into the frontmatter. See
 * `_system/media-persistence-protocol.md`.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  return res.status(200).json(listImageGenerationProviders(slug));
}

export default withErrorHandler(handler);
