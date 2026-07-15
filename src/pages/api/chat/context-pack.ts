import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { assembleContextPack } from "@/lib/data/context-pack";
import { getRuntime } from "@/lib/runtime";

/**
 * POST /api/chat/context-pack  (SAN-246)
 *
 * Server-to-server endpoint consumed by the mc-chat gateway plugin to GROUND a
 * directly-dispatched specialist. The plugin (ESM, cannot import `src/lib/…`)
 * posts `{ slug, skill }` with the shared secret; we return the assembled
 * context pack `{ slug, skill, summary, docPaths, verdict }`.
 *
 * Auth: same fail-closed shared-secret contract as /api/chat/webhook — the
 * `X-MC-Secret` header must equal the active runtime's shared secret.
 */
export async function contextPackHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify shared secret (identical guard to /api/chat/webhook).
  const secret = getRuntime().messaging.getSharedSecret?.();
  if (!secret) {
    return res.status(503).json({ error: "MC_CHAT_SECRET not configured" });
  }
  const suppliedSecret = Array.isArray(req.headers["x-mc-secret"])
    ? req.headers["x-mc-secret"][0]
    : req.headers["x-mc-secret"];
  if (suppliedSecret !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { slug, skill } = req.body ?? {};
  if (!slug || typeof slug !== "string") {
    return res.status(400).json({ error: "Missing required field: slug" });
  }
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    return res.status(400).json({ error: "Invalid slug" });
  }

  const skillArg = typeof skill === "string" && skill.trim() ? skill.trim() : null;
  const pack = assembleContextPack(slug, skillArg);
  return res.status(200).json(pack);
}

export default withErrorHandler(contextPackHandler);
