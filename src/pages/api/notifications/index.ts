import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose, canAccessSlug } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

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
    const notifsFile = path.join(BASE, "brand", slugParam, "idea-generation", "notifications.json");
    try {
      const notifs = JSON.parse(fs.readFileSync(notifsFile, "utf-8"));
      result[slugParam] = notifs.filter((n: { sent?: boolean }) => !n.sent);
    } catch {
      result[slugParam] = [];
    }
  }

  res.status(200).json({ ok: true, notifications: result });
}

export default compose(withErrorHandler, withAuth)(handler);
