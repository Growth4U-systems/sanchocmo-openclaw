import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { dispatchYalcReply, parseYalcReplyWebhook } from "@/lib/yalc/reply-webhook";

function bearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim() || null;
  const secretHeader = req.headers["x-yalc-secret"];
  return typeof secretHeader === "string" && secretHeader.trim() ? secretHeader.trim() : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const expectedToken = process.env.SANCHO_REPLY_WEBHOOK_TOKEN || process.env.YALC_CALLBACK_SECRET;
  if (expectedToken && bearerToken(req) !== expectedToken) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const payload = parseYalcReplyWebhook(req.body);
  return res.status(200).json(dispatchYalcReply(payload));
}

export default withErrorHandler(handler);
