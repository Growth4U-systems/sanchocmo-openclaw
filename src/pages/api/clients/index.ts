import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { loadClients } from "@/lib/data/clients";

/**
 * GET /api/clients
 * Returns list of clients (without sensitive tokens)
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clients = loadClients();

  // Strip sensitive fields
  const safe = clients.map((c) => ({
    slug: c.slug,
    name: c.name,
    emoji: c.emoji || "",
    phase: c.phase,
    active: c.active,
    language: c.language || "es",
    url: c.url || "",
    enabledFeatures: c.enabledFeatures || [],
  }));

  // Multi-client team members only see their assigned clients
  if (req.ctx?.allowedSlugs) {
    const allowed = req.ctx.allowedSlugs;
    const subset = safe.filter((c) => allowed.includes(c.slug));
    return res.status(200).json({ ok: true, clients: subset });
  }

  // Portal clients only see their own
  if (req.ctx?.clientSlug) {
    const own = safe.filter((c) => c.slug === req.ctx!.clientSlug);
    return res.status(200).json({ ok: true, clients: own });
  }

  res.status(200).json({ ok: true, clients: safe });
}

export default compose(withErrorHandler, withAuth)(handler);
