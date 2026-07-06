import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

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

  const notifsFile = path.join(BASE, "brand", slug, "idea-generation", "notifications.json");
  let notifs: { id: string; sent?: boolean }[] = [];
  try {
    notifs = JSON.parse(fs.readFileSync(notifsFile, "utf-8"));
  } catch {
    // empty
  }

  let marked = 0;
  notifs.forEach((n) => {
    if (ids.includes(n.id)) {
      n.sent = true;
      marked++;
    }
  });

  fs.mkdirSync(path.dirname(notifsFile), { recursive: true });
  fs.writeFileSync(notifsFile, JSON.stringify(notifs, null, 2));

  res.status(200).json({ ok: true, marked });
}

export default compose(withErrorHandler, withAuth)(handler);
