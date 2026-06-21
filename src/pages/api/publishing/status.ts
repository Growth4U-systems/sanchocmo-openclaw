import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { refreshPublishingStatus } from "@/lib/publishing/actions";

/**
 * GET /api/publishing/status?slug=X&ideaId=Y&channel=Z
 *
 * Asks the provider where its job is at and refreshes the draft's
 * `publishing` frontmatter if the state changed (e.g. scheduled → published).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.query.slug as string;
  const ideaId = req.query.ideaId as string;
  const channel = req.query.channel as string;
  if (!slug || !ideaId || !channel) {
    return res.status(400).json({ error: "Missing slug, ideaId or channel" });
  }

  const result = await refreshPublishingStatus(slug, ideaId, channel);
  if (!result.draft) return res.status(404).json({ error: "Draft not found" });
  return res.status(200).json({ publishing: result.publishing });
}

export default withErrorHandler(handler);
