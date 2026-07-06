import type { NextApiRequest, NextApiResponse } from "next";
import { compose, getSlug, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import {
  dispatchOutboundCommand,
  outboundCommandErrorResponse,
} from "@/lib/yalc/outbound-command";
import { resolveYalcConfig, yalcErrorResponse } from "@/lib/yalc/client";
import { yalcGuardErrorResponse } from "@/lib/yalc/campaign-guards";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    const { httpStatus, ...payload } = await dispatchOutboundCommand(
      resolveYalcConfig(slug),
      req.body || {},
    );
    return res.status(httpStatus || 200).json(payload);
  } catch (err) {
    const command = outboundCommandErrorResponse(err);
    if (command) return res.status(command.status).json(command.body);
    const guard = yalcGuardErrorResponse(err);
    if (guard) return res.status(guard.status).json(guard.body);
    const out = yalcErrorResponse(err);
    return res.status(out.status).json(out.body);
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
