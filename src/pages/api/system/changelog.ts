import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/system/changelog
 * Returns CHANGELOG.md content from workspace root
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const filePath = path.join(BASE, "CHANGELOG.md");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.status(200).json({ content });
  } catch {
    res.status(404).json({ error: "CHANGELOG.md not found" });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
