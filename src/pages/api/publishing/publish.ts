import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { publishDraft } from "@/lib/publishing/actions";
import type { Channel } from "@/lib/publishing/types";

/**
 * POST /api/publishing/publish
 *   body: { slug, ideaId, channel, providerId, schedule? }
 *
 * Pipes the approved draft through the chosen provider and writes a
 * `publishing` block into the draft frontmatter so the UI can show state
 * across reloads. When `schedule.publishAt` is omitted the provider
 * publishes immediately.
 */

interface Body {
  slug?: string;
  ideaId?: string;
  channel?: Channel;
  providerId?: string;
  schedule?: { publishAt?: string };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { slug, ideaId, channel, providerId, schedule } = (req.body || {}) as Body;
  if (!slug || !ideaId || !channel || !providerId) {
    return res.status(400).json({ error: "Missing slug, ideaId, channel or providerId" });
  }

  try {
    const result = await publishDraft({ slug, ideaId, channel, providerId, schedule });
    return res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    const status = message === "Draft not found" ? 404 : 400;
    return res.status(status).json({ error: message });
  }
}

export default withErrorHandler(handler);
