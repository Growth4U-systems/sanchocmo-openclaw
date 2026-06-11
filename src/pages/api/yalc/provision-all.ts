import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { loadClients } from "@/lib/data/clients";
import { provisionYalcBrain } from "@/lib/yalc/provision";

/**
 * POST /api/yalc/provision-all  (admin only)
 * One-time backfill: provision the YALC brain for every existing brand from
 * its website. Fire-and-forget per brand (synthesis is slow); returns the list
 * of slugs whose provisioning was started. New brands are handled automatically
 * at create time, so this is only needed once for the current roster.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const slugs = loadClients().map((c) => c.slug);
  for (const slug of slugs) {
    void provisionYalcBrain(slug).catch((err) =>
      console.error(`[provision-all] ${slug} failed:`, err),
    );
  }

  return res.status(202).json({ ok: true, started: slugs, count: slugs.length });
}

export default compose(withErrorHandler, withAuth)(handler);
