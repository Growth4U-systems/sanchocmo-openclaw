/**
 * GET /api/intake-link/:slug — Mint the public intake-form URL for a client (SAN-17).
 *
 * Admin-only (withAuth + canAccessSlug). The intake token is a stateless HMAC
 * signed server-side, so the signing secret never reaches the browser — the
 * dashboard fetches the ready URL from here instead of calling buildIntakeUrl
 * client-side. Mirrors /api/docs/share.
 *
 * Returns: { ok, url }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { buildIntakeUrl } from "@/lib/intake-tokens";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const raw = req.query.slug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const url = buildIntakeUrl(slug);
  return res.status(200).json({ ok: true, url });
}

export default compose(withErrorHandler, withAuth)(handler);
