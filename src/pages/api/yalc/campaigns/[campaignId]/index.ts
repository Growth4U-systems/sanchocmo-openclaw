import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import {
  normalizeYalcCampaign,
  resolveCampaignKind,
  type YalcCampaignKind,
} from "@/lib/yalc/campaign-kind";

function expectedKindFromRequest(req: NextApiRequest): YalcCampaignKind {
  const value = String(req.query.expectedKind || req.body?.expectedKind || "").trim();
  if (value === "b2b" || value === "creator") return value;
  if (value === "B2B") return "b2b";
  if (value === "Partnerships") return "creator";
  return "unknown";
}

function mutableCampaignBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof body.title === "string") out.title = body.title.trim();
  if (typeof body.name === "string" && !out.title) out.title = body.name.trim();
  return out;
}

async function assertCampaignKind(
  config: ReturnType<typeof resolveYalcConfig>,
  campaignId: string,
  expectedKind: YalcCampaignKind,
) {
  if (expectedKind === "unknown") return;
  const current = await yalcFetch<Record<string, unknown>>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}`,
  );
  const normalized = normalizeYalcCampaign(current);
  const actualKind = resolveCampaignKind(normalized);
  if (actualKind !== expectedKind) {
    const expectedLabel = expectedKind === "b2b" ? "B2B" : "Partnerships";
    const actualLabel = actualKind === "b2b" ? "B2B" : actualKind === "creator" ? "Partnerships" : "desconocida";
    const error = new Error(`La campaña pertenece a ${actualLabel}; no se puede modificar desde ${expectedLabel}.`);
    (error as Error & { status?: number }).status = 409;
    throw error;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const campaignId = req.query.campaignId as string;
  if (!campaignId) return res.status(400).json({ error: "Missing campaignId" });

  const config = resolveYalcConfig(slug);
  try {
    if (req.method === "GET") {
      const campaign = await yalcFetch<Record<string, unknown>>(
        config,
        `/api/campaigns/${encodeURIComponent(campaignId)}`,
      );
      return res.status(200).json(normalizeYalcCampaign(campaign));
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "");
      if (action !== "pause" && action !== "resume") {
        return res.status(400).json({ error: "action must be pause or resume" });
      }
      return res.status(200).json(
        await yalcFetch(config, `/api/campaigns/${encodeURIComponent(campaignId)}/${action}`, {
          method: "POST",
          body: {},
        }),
      );
    }

    if (req.method === "PATCH") {
      const body = mutableCampaignBody((req.body || {}) as Record<string, unknown>);
      if (Object.keys(body).length === 0) {
        return res.status(400).json({ error: "No editable campaign fields provided" });
      }
      await assertCampaignKind(config, campaignId, expectedKindFromRequest(req));
      const campaign = await yalcFetch<Record<string, unknown>>(
        config,
        `/api/campaigns/${encodeURIComponent(campaignId)}`,
        {
          method: "PATCH",
          body,
        },
      );
      return res.status(200).json(normalizeYalcCampaign(campaign));
    }

    if (req.method === "DELETE") {
      await assertCampaignKind(config, campaignId, expectedKindFromRequest(req));
      await yalcFetch(config, `/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "DELETE",
      });
      return res.status(200).json({ ok: true, campaignId });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    if (err instanceof Error && (err as Error & { status?: number }).status) {
      return res.status((err as Error & { status: number }).status).json({ error: err.message });
    }
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
