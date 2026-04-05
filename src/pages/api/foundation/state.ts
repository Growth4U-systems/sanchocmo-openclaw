import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { readJSON } from "@/lib/data/json-io";
import { foundationStateFile } from "@/lib/data/paths";
import type { FoundationState } from "@/types";

/**
 * GET /api/foundation/state?slug=X
 * Returns the full foundation-state.json for a client
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const state = readJSON<FoundationState | null>(foundationStateFile(slug), null);
  if (!state) {
    return res.status(404).json({ error: "Foundation state not found" });
  }

  res.status(200).json(state);
}

export default withErrorHandler(handler);
