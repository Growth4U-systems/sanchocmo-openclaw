import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { getUnsentNotifications, markNotificationsSent } from "@/lib/data/notifications";

/**
 * POST /api/notifications/sent
 * Ported from mc-server.js:5717-5739
 * Marks notifications as sent
 * Body: { slug, ids: string[] }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, ids } = req.body;
  if (!slug || !ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Missing slug or ids array" });
  }

  const before = getUnsentNotifications(slug);
  markNotificationsSent(slug, ids);
  const marked = before.filter((n) => ids.includes(n.id)).length;

  res.status(200).json({ ok: true, marked });
}

export default compose(withErrorHandler, withAuth)(handler);
