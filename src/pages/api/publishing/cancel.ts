import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { cancelScheduledPost } from "@/lib/publishing/actions";

/**
 * POST /api/publishing/cancel
 *   body: { slug, ideaId, channel }
 *
 * Cancels a scheduled post via the provider that owns it. Only valid when
 * the draft's `publishing.status` is "scheduled".
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { slug, ideaId, channel } = req.body || {};
  if (!slug || !ideaId || !channel) {
    return res.status(400).json({ error: "Missing slug, ideaId or channel" });
  }

  try {
    const result = await cancelScheduledPost(slug, ideaId, channel);
    return res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cancel failed";
    const status = message === "Draft not found" ? 404 : 400;
    return res.status(status).json({ error: message });
  }
}

export default withErrorHandler(handler);
