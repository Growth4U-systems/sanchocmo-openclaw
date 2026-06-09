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
  if (cronKey) {
    try {
      target = resolvePublishTarget(slug, cronKey);
    } catch {
      // A publishing cron with no channel configured is a benign "pending
      // config" state, not a failure — skip the publish, but surface it (log +
      // skipped response) so it shows in history and the UI, never silently.
      try {
        logActivity(slug, {
          type: "publish",
          text: `Publicación omitida — sin canal configurado para "${cronKey}" (configuralo en Recurring Tasks → 📢 Canal)`,
          icon: "⏭️",
          accent: "sun",
          meta: { cronKey, skipped: true, reason: "no_publish_channel" },
        });
      } catch (e) {
        console.error("[publish] skip-log failed:", (e as Error).message);
      }
      return res.status(200).json({ ok: true, skipped: true, reason: "no_publish_channel", cronKey });
    }
  } else if (transport && channel) {
    target = { transport, channel };
  } else {
    return res.status(400).json({ error: "Provide cronKey, or transport + channel" });
  }

  let result;
  try {
    result = await resolveTransport(target.transport).publish(slug, target, { title, body });
  } catch (e) {
    // Unregistered transport (e.g. "discord" today) lands here.
    return res.status(400).json({ error: (e as Error).message });
  }

  // Log whenever a root message reached the channel — including the partial
  // case (root posted but the threaded body failed). Without this, a partial
  // publish leaves a live message in the channel with no activity-log record.
  if (result.rootId) {
    try {
      logActivity(slug, {
        type: "publish",
        text: `Publicado vía ${target.transport}${cronKey ? ` (${cronKey})` : ""}${result.ok ? "" : " — parcial (falló el hilo)"}`,
        icon: "📤",
        accent: result.ok ? "navy" : "rust",
        meta: { transport: target.transport, channel: target.channel, cronKey, rootId: result.rootId, partial: !result.ok },
      });
    } catch (e) {
      console.error("[publish] activity log failed:", (e as Error).message);
    }
  }

  return res.status(result.ok ? 200 : 502).json({ ...result, transport: target.transport, channel: target.channel });
}

export default compose(withErrorHandler, withAuth)(handler);
