import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import pathModule from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

const DOC_ROOTS: Record<string, string> = {
  brand: pathModule.join(BASE, "brand"),
  prds: pathModule.join(BASE, "_system", "prds"),
  skills: pathModule.join(BASE, "skills"),
  memory: pathModule.join(BASE, "memory"),
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pathParts = req.query.path as string[];
  if (!pathParts || pathParts.length === 0) {
    return res.status(400).json({ error: "Missing path" });
  }

  const rootKey = pathParts[0];
  if (!DOC_ROOTS[rootKey]) {
    return res.status(404).json({ error: "Not found" });
  }

  const rootPath = DOC_ROOTS[rootKey];
  const subPath = pathParts.slice(1).join("/");
  const fullPath = pathModule.join(rootPath, subPath);

  // Security: validate path
  if (
    !pathModule.resolve(fullPath).startsWith(pathModule.resolve(rootPath)) ||
    subPath.includes("..")
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "GET") {
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      return res.status(200).json({ ok: true, content, path: pathParts.join("/") });
    } catch {
      return res.status(404).json({ error: "File not found" });
    }
  }

  if (req.method === "PUT") {
    // Only allow .md and .html files
    if (!fullPath.endsWith(".md") && !fullPath.endsWith(".html")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const body = typeof req.body === "string" ? req.body : req.body?.content;
    if (body === undefined) {
      return res.status(400).json({ error: "Missing content" });
    }

    try {
      const dir = pathModule.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, body, "utf-8");
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: "Write failed: " + (e instanceof Error ? e.message : String(e)) });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
