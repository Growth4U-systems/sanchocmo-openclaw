import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const slug = (req.query.slug as string) || req.body?.slug || "";
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const srcPath = path.join(BASE, "brand", slug, "market-and-us", "competitors", "sources.json");

  if (req.method === "GET") {
    const data = readJSON(srcPath, { competitors: { direct: [], indirect: [] } });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const data = req.body;
    const srcDir = path.dirname(srcPath);
    fs.mkdirSync(srcDir, { recursive: true });

    // Preserve confirmed_at/confirmed_by from existing file
    const existing = readJSON<Record<string, unknown>>(srcPath, {});
    data.confirmed_at = existing.confirmed_at || data.confirmed_at;
    data.confirmed_by = existing.confirmed_by || data.confirmed_by;
    data.updated_at = new Date().toISOString();

    writeJSON(srcPath, data);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
