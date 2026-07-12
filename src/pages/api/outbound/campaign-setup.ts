import { createHash } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { getOutboundCampaignChoices } from "@/lib/outreach/campaign-options";
import {
  dispatchOutboundCommand,
  outboundCommandErrorResponse,
} from "@/lib/yalc/outbound-command";
import { resolveYalcConfig, yalcErrorResponse } from "@/lib/yalc/client";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  const result = getOutboundCampaignChoices(slug);
  if (!result.ok) return res.status(422).json({ error: "foundation_outbound_unavailable", message: result.message });

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      ...result.choices,
      options: result.choices.options.map(({ workflowIntent: _workflowIntent, ...option }) => option),
    });
  }

  const optionId = text(req.body?.optionId);
  const requestId = text(req.body?.requestId);
  if (!optionId) return res.status(400).json({ error: "optionId is required" });
  if (!requestId || requestId.length > 160 || !/^[a-zA-Z0-9:_-]+$/.test(requestId)) {
    return res.status(400).json({ error: "A valid requestId is required" });
  }
  const option = result.choices.options.find((candidate) => candidate.id === optionId);
  if (!option) return res.status(400).json({ error: "Unknown outbound audience option" });

  try {
    const { httpStatus, ...payload } = await dispatchOutboundCommand(resolveYalcConfig(slug), {
      command: "outbound.workflow.start",
      idempotencyKey: `linkedin-outbound-ui-v1:${createHash("sha256")
        .update(`${slug}:${requestId}:${option.id}`)
        .digest("hex")
        .slice(0, 32)}`,
      intent: option.workflowIntent,
    });
    return res.status(httpStatus || 200).json(payload);
  } catch (error) {
    const command = outboundCommandErrorResponse(error);
    if (command) return res.status(command.status).json(command.body);
    const yalc = yalcErrorResponse(error);
    return res.status(yalc.status).json(yalc.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
