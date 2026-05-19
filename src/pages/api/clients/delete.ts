import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE, CLIENTS_FILE } from "@/lib/data/paths";
import { writeClientsFile } from "@/lib/data/clients";
import {
  archiveBrandDir,
  archiveClientNeonData,
  archiveClientSystemFiles,
  disableClientCrons,
} from "@/lib/data/client-lifecycle";
import { invalidateMetricsCache } from "@/pages/api/metrics";

type ClientsFileData = {
  clients?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

/**
 * POST /api/clients/delete
 * Admin only — archives a client so the slug can be reused cleanly.
 *
 * Steps (in order):
 *  1. Archive `brand/<slug>/` → `brand/_archived/<slug>__<ts>/` AND
 *     `git rm --cached` the path so a redeploy doesn't restore the folder
 *     from the staging branch's tracked tree.
 *  2. Soft-archive Neon rows: rename slug to `<slug>__archived_<ts>` (and the
 *     ids that derive from slug) so the active slug is freed for reuse while
 *     POV Bank + Meeting Intelligence data stays recoverable.
 *  3. Strip slug-tagged entries from shared system files (mc-data.js,
 *     costs-daily.json, costs-global.json) — extracted to the archive folder.
 *  4. Disable OpenClaw cron jobs registered for this slug — otherwise they
 *     keep firing on schedule and repopulate `brand/<slug>/recurring-tasks/`.
 *  5. Invalidate the in-process metrics cache for this slug.
 *  6. Remove the entry from clients.json (atomic write that preserves the
 *     `workspace-sancho/clients.json → config/clients.json` symlink).
 *
 * The `confirmSlug === slug` guard remains as a double-check.
 *
 * Body: { slug, confirmSlug }
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

  const clientName = String(clients[idx].name || "");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archive = archiveBrandDir(slug, timestamp);
  const neon = await archiveClientNeonData(slug, timestamp);

  // Step 3 uses the brand archive path as the snapshot dir for recoverable
  // system-file extracts. When the brand folder didn't exist (already archived
  // on a previous run, or never created), fall back to a fresh archive dir.
  const systemArchiveDir = archive.archivePath
    || path.join(BASE, "brand", "_archived", `${slug}__${timestamp}`);
  const systemFiles = archiveClientSystemFiles(slug, systemArchiveDir);

  const crons = disableClientCrons(slug, clientName);

  invalidateMetricsCache(slug);

  data.clients = clients.filter((_, i) => i !== idx);
  writeClientsFile(data);

  return res.status(200).json({
    ok: true,
    slug,
    archive,
    neon,
    systemFiles,
    crons,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
