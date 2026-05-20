import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { CLIENTS_FILE } from "@/lib/data/paths";
import { writeClientsFile } from "@/lib/data/clients";

/**
 * POST /api/clients/update
 * Admin only — update client fields (active, name, emoji, phase, url, language)
 * Body: { slug, updates: { active?, name?, emoji?, phase?, url?, language? } }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const { slug, updates } = req.body;
  if (!slug || !updates) return res.status(400).json({ error: "Missing slug or updates" });

  const data = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8"));
  const client = (data.clients || []).find((c: { slug: string }) => c.slug === slug);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const allowed = ["active", "name", "emoji", "phase", "url", "language"];
  for (const key of allowed) {
    if (key in updates) {
      client[key] = updates[key];
    }
  }

  writeClientsFile(data);
  res.status(200).json({ ok: true, client: { slug: client.slug, name: client.name, active: client.active } });
}

export default compose(withErrorHandler, withAuth)(handler);
