import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getAvailableProviders } from "@/lib/publishing/registry";
import type { Channel } from "@/lib/publishing/types";

/**
 * GET /api/publishing/providers?slug=X&channel=linkedin
 *   → { providers: ProviderInfo[] }
 *
 * Lists every provider the registry knows about, with `configured: true|false`
 * so the UI can render the dropdown and decide whether to show the
 * "Connect a publishing tool" CTA.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const channel = req.query.channel as Channel | undefined;
  const providers = getAvailableProviders(slug, channel);
  return res.status(200).json({ providers });
}

export default withErrorHandler(handler);
