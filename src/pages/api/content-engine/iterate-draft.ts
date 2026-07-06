/**
 * POST /api/content-engine/iterate-draft
 *
 * Records a user iteration request against an existing draft. The actual
 * regeneration runs out-of-band: Dulcinea picks up drafts whose
 * `clarify_answers.iteration_request` is non-empty and produces a new
 * version.
 *
 * What this endpoint does today:
 *   1. Snapshots the current draft to `{channel}.v{N}.md`.
 *   2. Increments `iteration` on the live draft and stamps the request
 *      as a `clarify_answers.iteration_request` field for the writer to
 *      consume on its next run.
 *   3. Posts a marker message to the ContentTask's chat thread so the
 *      iteration is visible in the conversation history.
 *
 * Body: { slug: string, ideaId: string, channel: string, instruction: string }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { requestDraftIteration } from "@/lib/content/actions";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, ideaId, channel, instruction } = req.body || {};
  if (!slug || !ideaId || !channel || !instruction) {
    return res.status(400).json({ error: "Missing slug, ideaId, channel, or instruction" });
  }

  try {
    const result = requestDraftIteration(slug, ideaId, channel, instruction);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Draft not found") return res.status(404).json({ error: message });
    return res.status(400).json({ error: message });
  }
}

export default withErrorHandler(handler);
