import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { resolveYalcConfig, yalcErrorResponse, yalcFetch } from "@/lib/yalc/client";
import {
  partnerContactPreflightError,
  preflightPartnerContactGate,
} from "@/lib/partnerships/contact-gate";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const config = resolveYalcConfig(slug);

  try {
    if (req.method === "GET") {
      return res.status(200).json(await yalcFetch(config, "/api/gates/awaiting"));
    }

    if (req.method === "POST") {
      const runId = String(req.body?.runId || "");
      const action = String(req.body?.action || "");
      if (!runId) return res.status(400).json({ error: "runId required" });
      if (action === "approve") {
        const preflight = await preflightPartnerContactGate(config, runId, req.body?.edits);
        const preflightError = partnerContactPreflightError(preflight);
        if (preflightError) {
          return res.status(409).json({
            error: "unresolved_template_variables",
            message: preflightError,
            unresolvedVariables: preflight?.unresolvedVariables || [],
          });
        }
        return res.status(200).json(
          await yalcFetch(config, `/api/gates/${encodeURIComponent(runId)}/approve?sync=1`, {
            method: "POST",
            body: { edits: req.body?.edits },
          }),
        );
      }
      if (action === "reject") {
        const reason = String(req.body?.reason || "").trim();
        if (!reason) return res.status(400).json({ error: "reason required" });
        return res.status(200).json(
          await yalcFetch(config, `/api/gates/${encodeURIComponent(runId)}/reject`, {
            method: "POST",
            body: { reason },
          }),
        );
      }
      return res.status(400).json({ error: "action must be approve or reject" });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
