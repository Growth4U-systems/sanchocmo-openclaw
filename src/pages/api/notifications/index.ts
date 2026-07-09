import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose, canAccessSlug } from "@/lib/api-middleware";
import { getUnsentNotifications } from "@/lib/data/notifications";

/**
 * GET /api/notifications?slug=<slug>
 * Ported from mc-server.js:5698-5713
 * Returns unsent notifications for a client
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slugParam = (req.query.slug as string) || req.ctx?.clientSlug;
  const result: Record<string, unknown[]> = {};

  if (slugParam) {
    if (!canAccessSlug(req.ctx, slugParam)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    result[slugParam] = getUnsentNotifications(slugParam);
  }

  res.status(200).json({ ok: true, notifications: result });
}

export default compose(withErrorHandler, withAuth)(handler);
