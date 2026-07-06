import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { buildLeadReplyNotifications, type LeadForNotification } from "@/lib/notifications/lead-replies";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import { normalizeYalcLead, resolveCampaignKind } from "@/lib/yalc/campaign-kind";

const TYPE_TO_PATH = {
  partnerships: "Partnerships",
  b2b: "B2B",
} as const;

function leadsFromPayload(payload: Record<string, unknown>, expected: "creator" | "b2b"): LeadForNotification[] {
  return Array.isArray(payload.leads)
    ? payload.leads
        .filter((lead): lead is Record<string, unknown> => Boolean(lead) && typeof lead === "object")
        .map((lead) => normalizeYalcLead(lead, expected))
        .filter((lead) => resolveCampaignKind(lead, expected) === expected)
        .map((lead) => lead as LeadForNotification)
    : [];
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const config = resolveYalcConfig(slug);

  try {
    const [partnershipsPayload, b2bPayload] = await Promise.all([
      yalcFetch<Record<string, unknown>>(config, `/api/leads?type=${TYPE_TO_PATH.partnerships}&include=lastMessage`),
      yalcFetch<Record<string, unknown>>(config, `/api/leads?type=${TYPE_TO_PATH.b2b}&include=lastMessage`),
    ]);

    const notifications = buildLeadReplyNotifications({
      partnerships: leadsFromPayload(partnershipsPayload, "creator"),
      b2b: leadsFromPayload(b2bPayload, "b2b"),
    });

    return res.status(200).json({
      ok: true,
      count: notifications.length,
      notifications,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
