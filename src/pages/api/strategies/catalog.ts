import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { strategiesCatalogFile } from "@/lib/data/paths";

/**
 * GET/POST /api/strategies/catalog
 * Ported from mc-server.js:5743-5771
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const catalogPath = strategiesCatalogFile();

  if (req.method === "GET") {
    try {
      const data = fs.readFileSync(catalogPath, "utf-8");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(200).end(data);
    } catch {
      res.status(200).json({ strategies: [], quadrants: [], clientStrategies: {} });
    }
    return;
  }

  if (req.method === "POST") {
    const data = req.body;
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify(data, null, 2), "utf-8");
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
