/**
 * GET/PUT /api/content-engine/dispatch-channel?slug=X
 *
 * Reads/writes brand/{slug}/content/configs/dispatch-channel.yml — the
 * client choice of transport + channel for the Editorial Dispatch.
 *
 * GET → returns current config (or null if unset)
 * PUT { slug, transport, channel_id, channel_name } → writes it
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

interface DispatchChannelConfig {
  transport: "slack" | "discord";
  channel_id: string;
  channel_name?: string;
  configured_at: string;
  configured_by?: string;
}

function pathFor(slug: string): string {
  return path.join(BASE, "brand", slug, "content", "configs", "dispatch-channel.yml");
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Forbidden" });
  const slug = (req.query.slug as string) || req.body?.slug;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const filePath = pathFor(slug);

  if (req.method === "GET") {
    if (!fs.existsSync(filePath)) {
      return res.status(200).json({ ok: true, config: null });
    }
    try {
      const data = yaml.load(fs.readFileSync(filePath, "utf-8")) as DispatchChannelConfig;
      return res.status(200).json({ ok: true, config: data });
    } catch (e) {
      return res.status(200).json({ ok: false, error: `parse error: ${(e as Error).message}`, config: null });
    }
  }

  if (req.method === "PUT") {
    const { transport, channel_id, channel_name, configured_by } = req.body || {};
    if (!transport || !["slack", "discord"].includes(transport)) {
      return res.status(400).json({ error: "Invalid transport" });
    }
    if (!channel_id) return res.status(400).json({ error: "Missing channel_id" });

    const config: DispatchChannelConfig = {
      transport,
      channel_id,
      channel_name: channel_name || undefined,
      configured_at: new Date().toISOString(),
      configured_by: configured_by || "mc-ui",
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const header = `# Dispatch Channel — ${slug}\n# Where the Editorial Dispatch cron sends candidate ideas every morning.\n# Editable from MC UI → Content Creation → Inputs → 📬 Canal de envío\n# Last edited: ${new Date().toISOString().slice(0, 10)} via MC UI\n\n`;
    const body = yaml.dump(config, { lineWidth: 120, quotingType: '"' });
    fs.writeFileSync(filePath, header + body);
    return res.status(200).json({ ok: true, config });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}

export default compose(withErrorHandler, withAuth)(handler);
