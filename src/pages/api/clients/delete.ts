import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { CLIENTS_FILE } from "@/lib/data/paths";

type ClientsFileData = {
  clients?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

function writeClientsFile(data: ClientsFileData): void {
  const json = JSON.stringify(data, null, 2);
  JSON.parse(json);

  const backupPath = `${CLIENTS_FILE}.bak.${Date.now()}`;
  fs.copyFileSync(CLIENTS_FILE, backupPath);

  const tmpPath = `${CLIENTS_FILE}.tmp`;
  fs.writeFileSync(tmpPath, json);
  fs.renameSync(tmpPath, CLIENTS_FILE);
}

/**
 * POST /api/clients/delete
 * Admin only — removes a client entry from clients.json.
 * The brand/<slug> folder on disk is preserved (deletion would be irreversible).
 * Body: { slug, confirmSlug } — confirmSlug must equal slug as an explicit double-check.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const slug = String(req.body?.slug || "").trim().toLowerCase();
  const confirmSlug = String(req.body?.confirmSlug || "").trim().toLowerCase();

  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (slug !== confirmSlug) {
    return res.status(400).json({ error: "Confirmation slug does not match" });
  }

  const data = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8")) as ClientsFileData;
  const clients = data.clients || [];
  const idx = clients.findIndex((c) => c.slug === slug);
  if (idx === -1) return res.status(404).json({ error: "Client not found" });

  data.clients = clients.filter((_, i) => i !== idx);
  writeClientsFile(data);

  return res.status(200).json({ ok: true, slug });
}

export default compose(withErrorHandler, withAuth)(handler);
