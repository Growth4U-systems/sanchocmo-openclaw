/**
 * POST /api/integrations/publish
 *
 * Channel-agnostic publish endpoint. Resolves transport+channel from the
 * brand's client-config.json (by cronKey) — or from explicit transport+channel
 * in the body — and dispatches via the transport registry. Today only Slack is
 * registered; the cron prompts/skills call this with a cronKey and never name a
 * channel or transport directly.
 *
 * Body: { slug, cronKey?, transport?, channel?, title, body }
 *   - cronKey           → looks up crons.<cronKey> in client-config.json
 *   - transport+channel → explicit override (testing / ad-hoc)
 *   - title → root message · body → threaded detail
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { resolveTransport } from "@/lib/publish/registry";
import { resolvePublishTarget } from "@/lib/publish/target";
import type { PublishTarget } from "@/lib/publish/types";
import { logActivity } from "@/lib/data/activity-log";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Forbidden" });

  const { slug, cronKey, transport, channel, title, body } = req.body || {};
  if (!slug || !title || !body) {
    return res.status(400).json({ error: "Missing slug, title or body" });
  }

  let target: PublishTarget;
  try {
    if (cronKey) {
      target = resolvePublishTarget(slug, cronKey);
    } else if (transport && channel) {
      target = { transport, channel };
    } else {
      return res.status(400).json({ error: "Provide cronKey, or transport + channel" });
    }
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  let result;
  try {
    result = await resolveTransport(target.transport).publish(slug, target, { title, body });
  } catch (e) {
    // Unregistered transport (e.g. "discord" today) lands here.
    return res.status(400).json({ error: (e as Error).message });
  }

  if (result.ok) {
    try {
      logActivity(slug, {
        type: "publish",
        text: `Publicado vía ${target.transport}${cronKey ? ` (${cronKey})` : ""}`,
        icon: "📤",
        accent: "navy",
        meta: { transport: target.transport, channel: target.channel, cronKey, rootId: result.rootId },
      });
    } catch (e) {
      console.error("[publish] activity log failed:", (e as Error).message);
    }
  }

  return res.status(result.ok ? 200 : 502).json({ ...result, transport: target.transport, channel: target.channel });
}

export default compose(withErrorHandler, withAuth)(handler);
