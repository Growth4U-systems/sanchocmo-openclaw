import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { disconnectSlack, loadIntegrations } from "@/lib/data/integrations";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = (req.query.slug as string) || (req.body?.slug as string);
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const before = loadIntegrations(slug);
  if (!before.slack) {
    return res.status(200).json({ status: "disconnected", changed: false });
  }

  disconnectSlack(slug);
  return res.status(200).json({ status: "disconnected", changed: true });
}

export default compose(withErrorHandler, withSlugAuth)(handler);
