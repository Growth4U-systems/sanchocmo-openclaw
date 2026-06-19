import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { dispatchJobResult, parseCallback } from "@/lib/yalc/job-callback";

/**
 * POST /api/yalc/job-callback
 *
 * YALC POSTs here when an async job (enrich/publish/skill run/gate resume)
 * completes or fails. We re-engage the agent that owns the originating chat
 * thread (carried in callbackContext) so it reports the result to the user.
 *
 * No withAuth: YALC authenticates with a dedicated shared secret, not a Sancho
 * session/token. Mirrors the x-mc-secret check in src/pages/api/chat/webhook.ts
 * but uses a dedicated YALC_CALLBACK_SECRET + x-yalc-secret header. When the
 * secret is unset we allow the request (dev convenience), same as the chat
 * webhook does when MC_CHAT_SECRET is unset.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.YALC_CALLBACK_SECRET;
  if (secret && req.headers["x-yalc-secret"] !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const payload = parseCallback(req.body);
  await dispatchJobResult(payload);

  return res.status(200).json({ ok: true });
}

export default withErrorHandler(handler);
