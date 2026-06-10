/**
 * GET/PUT /api/content-engine/cron-publish-config?slug=X&cronKey=Y
 *
 * Reads/writes the per-cron publish destination stored in
 * brand/{slug}/client-config.json under crons.<cronKey> (publish_transport /
 * publish_channel). Backs the per-cron "channel de publicación" picker in the
 * Recurring Tasks page. Same fields consumed at publish time by
 * resolvePublishTarget (src/lib/publish/target.ts).
 *
 * GET → { ok, config: { transport, channel_id, channel_name } | null }
 * PUT { slug, cronKey, transport, channel_id, channel_name } → writes it
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { getCronPublishConfig, setCronPublishConfig } from "@/lib/publish/cron-publish-config";
import { registeredTransports } from "@/lib/publish/registry";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Forbidden" });

  const slug = (req.query.slug as string) || req.body?.slug;
  const cronKey = (req.query.cronKey as string) || req.body?.cronKey;
  if (!slug || !cronKey) return res.status(400).json({ error: "Missing slug or cronKey" });

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, config: getCronPublishConfig(slug, cronKey) });
  }

  if (req.method === "PUT") {
    const { transport, channel_id, channel_name } = req.body || {};
    if (!transport || !registeredTransports().includes(transport)) {
      return res.status(400).json({ error: `Invalid transport — registered: [${registeredTransports().join(", ")}]` });
    }
    if (!channel_id) return res.status(400).json({ error: "Missing channel_id" });
    const config = setCronPublishConfig(slug, cronKey, { transport, channel_id, channel_name: channel_name || undefined });
    return res.status(200).json({ ok: true, config });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}

export default compose(withErrorHandler, withAuth)(handler);
