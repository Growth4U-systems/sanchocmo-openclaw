import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON } from "@/lib/data/json-io";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const slug = (req.query.slug as string) || "";
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const pendingPath = path.join(BASE, "brand", slug, "atalaya", "pending-ideas.json");
  const raw = readJSON<unknown[] | { ideas_generated?: unknown[] }>(pendingPath, []);
  const pending = Array.isArray(raw) ? raw : (raw.ideas_generated || []);

  return res.status(200).json({ pendingCount: pending.length });
}

export default compose(withErrorHandler, withAuth)(handler);
