import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { readJSON } from "@/lib/data/json-io";
import { foundationStateFile } from "@/lib/data/paths";
import { reconcilePillarTasks } from "@/lib/data/pillar-task-sync";
import type { FoundationState } from "@/types";

/**
 * GET /api/foundation/state?slug=X
 * Returns the full foundation-state.json for a client.
 *
 * Self-healing: before returning, runs `reconcilePillarTasks(slug)` to detect
 * and repair any drift between foundation-state.json and the per-project
 * tasks.json files. This catches cases where Sancho (or any other actor)
 * writes to foundation-state.json directly without going through the
 * `setPillarStatus` helper.
 *
 * Cheap when in sync (just reads + string compares). Logs to stdout when it
 * has to repair something.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  // Self-healing pass: repair any drift before reading.
  // Safe to fail — we still want to return the state even if the pass errors.
  try {
    reconcilePillarTasks(slug);
  } catch (e) {
    console.error("[foundation/state] reconcile failed:", (e as Error).message);
  }

  const state = readJSON<FoundationState | null>(foundationStateFile(slug), null);
  if (!state) {
    return res.status(404).json({ error: "Foundation state not found" });
  }

  res.status(200).json(state);
}

export default withErrorHandler(handler);
