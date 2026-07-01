import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import { normalizeYalcLeadPayload, type YalcCampaignKind } from "@/lib/yalc/campaign-kind";

// Forwarded YALC filters — see YALC GET /api/leads:
//   campaignId, lifecycleStatus (comma-separated, incl. Disqualified), type
//   ('B2B'|'Partnerships'), q (search). Disqualified leads are excluded unless
//   explicitly requested via lifecycleStatus. include=lastMessage (SAN-80)
//   adjunta el último mensaje del hilo por lead (snippets del Inbox).
const FORWARDED_QUERY_PARAMS = ["campaignId", "lifecycleStatus", "type", "q", "include"] as const;

function kindFromQuery(type?: string): YalcCampaignKind {
  if (type === "B2B") return "b2b";
  if (type === "Partnerships") return "creator";
  return "unknown";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const params = new URLSearchParams();
  let requestedType = "";
  for (const key of FORWARDED_QUERY_PARAMS) {
    const value = req.query[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string" && single.trim()) {
      const normalized = single.trim();
      params.set(key, normalized);
      if (key === "type") requestedType = normalized;
    }
  }
  const query = params.toString();

  try {
    const payload = await yalcFetch<Record<string, unknown>>(
      resolveYalcConfig(slug),
      `/api/leads${query ? `?${query}` : ""}`,
    );
    return res.status(200).json(normalizeYalcLeadPayload(payload, kindFromQuery(requestedType)));
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
