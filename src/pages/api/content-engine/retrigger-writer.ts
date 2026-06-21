/**
 * /api/content-engine/retrigger-writer
 *
 *   POST { slug, contentTaskId }            → re-fire kind="initial" trigger
 *   POST { slug, contentTaskId, channel,    → re-fire kind="iterate"
 *          instruction }
 *
 * Used when the gateway was down (or the previous trigger failed) and the
 * user clicks "Reintentar" in the chat sidebar. Looks up the ContentTask
 * + parent + linked idea and re-invokes `triggerWriter` with the same shape
 * `generate-drafts.ts` uses for new approvals.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { retriggerContentWriter } from "@/lib/content/actions";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, contentTaskId, channel, instruction } = req.body || {};
  if (!slug || !contentTaskId) {
    return res.status(400).json({ error: "Missing slug or contentTaskId" });
  }

  try {
    const result = await retriggerContentWriter(slug, contentTaskId, { channel, instruction });
    return res.status(200).json({
      ok: true,
      contentTaskId: result.contentTaskId,
      parentTaskId: result.parentTaskId,
      writerTriggered: result.writerTriggered,
      writerError: result.writerError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "ContentTask not found") return res.status(404).json({ error: message });
    return res.status(400).json({ error: message });
  }
}

export default withErrorHandler(handler);
