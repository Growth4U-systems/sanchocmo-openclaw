import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getAvailableImageProviders } from "@/lib/image-gen/registry";
import { getContentConfig } from "@/lib/data/content-config";

const REQUIRED_R2_VARS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_UPLOAD_IMAGE_ACCESS_KEY_ID",
  "R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY",
  "R2_UPLOAD_IMAGE_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

function checkStorage(): { ok: boolean; missing: string[] } {
  const missing = REQUIRED_R2_VARS.filter((k) => !process.env[k]);
  return { ok: missing.length === 0, missing };
}

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

  const providers = getAvailableImageProviders(slug);
  const config = getContentConfig(slug);
  const storage = checkStorage();
  return res
    .status(200)
    .json({ providers, config: config.image_generation, storage });
}

export default withErrorHandler(handler);
