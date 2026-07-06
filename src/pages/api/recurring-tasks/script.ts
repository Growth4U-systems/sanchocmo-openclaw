import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const allowedPrefixes = [BASE, path.join(process.env.HOME || "", ".openclaw")];

  if (req.method === "GET") {
    const scriptPath = req.query.path as string;
    if (!scriptPath) {
      return res.status(400).json({ error: "Missing path" });
    }

    let absPath = scriptPath;
    if (scriptPath.startsWith("~/")) absPath = scriptPath.replace("~", process.env.HOME || "/Users/ragi");
    else if (!scriptPath.startsWith("/")) absPath = path.join(BASE, scriptPath);

    try { absPath = fs.realpathSync(absPath); } catch {
      return res.status(404).json({ error: "File not found" });
    }

    if (!allowedPrefixes.some((p) => absPath.startsWith(p))) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const content = fs.readFileSync(absPath, "utf-8");
      const lang = absPath.endsWith(".py") ? "python" : absPath.endsWith(".sh") ? "bash" : "javascript";
      return res.status(200).json({
        ok: true,
        path: scriptPath,
        absPath,
        content,
        lang,
        lines: content.split("\n").length,
      });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (req.method === "POST") {
    const { path: scriptPath, content } = req.body;
    if (!scriptPath || content === undefined) {
      return res.status(400).json({ error: "Missing path or content" });
    }

    let absPath = scriptPath;
    if (scriptPath.startsWith("~/")) absPath = scriptPath.replace("~", process.env.HOME || "/Users/ragi");
    else if (!scriptPath.startsWith("/")) absPath = path.join(BASE, scriptPath);

    if (!allowedPrefixes.some((p) => absPath.startsWith(p))) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Backup original
    if (fs.existsSync(absPath)) {
      const backupPath = absPath + ".bak." + Date.now();
      fs.copyFileSync(absPath, backupPath);
    }

    fs.writeFileSync(absPath, content);

    // Preserve execute permission for .sh files
    if (absPath.endsWith(".sh")) {
      try { fs.chmodSync(absPath, 0o755); } catch { /* empty */ }
    }

    return res.status(200).json({
      ok: true,
      path: scriptPath,
      lines: content.split("\n").length,
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
