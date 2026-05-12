/**
 * GET/PUT /api/content-engine/pillars — Read/write content-pillars.md
 *
 * GET ?slug=X → returns pillars YAML parsed as JSON + raw markdown
 * PUT { slug, content } → writes content-pillars.md
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug || req.body?.slug) as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const filePath = path.join(BASE, "brand", slug, "content", "content-pillars.md");

  if (req.method === "GET") {
    if (!fs.existsSync(filePath)) {
      return res.status(200).json({ ok: true, exists: false, content: null, pillars: [] });
    }
    const content = fs.readFileSync(filePath, "utf-8");
    // Extract YAML block between ```yaml and ```
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
    let pillars: unknown[] = [];
    if (yamlMatch) {
      // Simple YAML-like parsing for the pillars array
      const yamlText = yamlMatch[1];
      const pillarBlocks = yamlText.split(/\n  - id:/);
      pillars = pillarBlocks.slice(1).map((block) => {
        const lines = ("  - id:" + block).split("\n");
        const obj: Record<string, unknown> = {};
        for (const line of lines) {
          const m = line.match(/^\s{4}(\w+):\s*"?(.+?)"?\s*$/);
          if (m) obj[m[1]] = m[2];
        }
        return obj;
      });
    }
    return res.status(200).json({ ok: true, exists: true, content, pillars });
  }

  if (req.method === "PUT") {
    const { content } = req.body;
    if (typeof content !== "string") return res.status(400).json({ error: "Missing content" });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
