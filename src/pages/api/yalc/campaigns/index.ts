import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import {
  normalizeYalcCampaign,
  resolveCampaignKind,
  type YalcCampaignKind,
} from "@/lib/yalc/campaign-kind";

function kindFromQuery(type?: string): YalcCampaignKind {
  if (type === "B2B") return "b2b";
  if (type === "Partnerships") return "creator";
  return "unknown";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    const config = resolveYalcConfig(slug);
    if (req.method === "POST") {
      const body = (req.body || {}) as Record<string, unknown>;
      return res.status(201).json(
        await yalcFetch(config, "/api/campaigns", {
          method: "POST",
          body,
        }).then((campaign) =>
          campaign && typeof campaign === "object"
            ? normalizeYalcCampaign({ ...body, ...(campaign as Record<string, unknown>) })
            : campaign,
        ),
      );
    }
    // Forward YALC list filters — `type` ('B2B'|'Partnerships', SAN-77/78)
    // and `status` keep the selector Tipo server-side instead of client-only.
    const params = new URLSearchParams();
    let requestedType = "";
    for (const key of ["type", "status"] as const) {
      const value = req.query[key];
      const single = Array.isArray(value) ? value[0] : value;
      if (typeof single === "string" && single.trim()) {
        const normalized = single.trim();
        params.set(key, normalized);
        if (key === "type") requestedType = normalized;
      }
    }
    const query = params.toString();
    const payload = await yalcFetch<Record<string, unknown>>(config, `/api/campaigns${query ? `?${query}` : ""}`);
    const expectedKind = kindFromQuery(requestedType);
    const campaigns = Array.isArray(payload.campaigns)
      ? payload.campaigns
          .filter((campaign): campaign is Record<string, unknown> => Boolean(campaign) && typeof campaign === "object")
          .map((campaign) => normalizeYalcCampaign(campaign))
          .filter((campaign) => expectedKind === "unknown" || resolveCampaignKind(campaign) === expectedKind)
      : undefined;
    return res.status(200).json(campaigns ? { ...payload, campaigns } : payload);
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
