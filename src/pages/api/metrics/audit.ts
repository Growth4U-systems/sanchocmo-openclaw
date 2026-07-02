import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import { getMetricsRuntimeAudit } from "@/lib/data/metrics-audit";

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.ctx?.clientSlug || firstString(req.query.slug);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });

  return res.status(200).json(await getMetricsRuntimeAudit(slug, {
    from: firstString(req.query.from),
    range: firstString(req.query.range),
    to: firstString(req.query.to),
  }));
}

export default compose(withErrorHandler, withAuth)(handler);
