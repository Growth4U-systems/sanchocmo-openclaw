import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";

/**
 * Hilo de conversación de un lead (Inbox SAN-80) — proxy del endpoint de
 * Yalc `GET/POST /api/leads/:id/messages` (patrón SAN-77).
 *
 *   GET  /api/yalc/leads/{id}/messages?slug=…
 *     → { leadId, messages, count }
 *   POST /api/yalc/leads/{id}/messages  { slug, direction, subject?, body, status?, meta? }
 *     → { ok, message } — con status:'draft' guarda EL borrador del lead
 *       (upsert; el Inbox lo usa para 💾 Guardar).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing lead id" });

  const config = resolveYalcConfig(slug);
  try {
    if (req.method === "GET") {
      return res
        .status(200)
        .json(await yalcFetch(config, `/api/leads/${encodeURIComponent(id)}/messages`));
    }
    if (req.method === "POST") {
      return res.status(200).json(
        await yalcFetch(config, `/api/leads/${encodeURIComponent(id)}/messages`, {
          method: "POST",
          body: {
            direction: req.body?.direction,
            subject: req.body?.subject,
            body: req.body?.body,
            status: req.body?.status,
            channel: req.body?.channel,
            meta: req.body?.meta,
          },
        }),
      );
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
