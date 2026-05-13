import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { readJSON } from "@/lib/data/json-io";
import { foundationStateFile } from "@/lib/data/paths";
import { reconcilePillarTasks } from "@/lib/data/pillar-task-sync";
import type { BrandBrainState } from "@/types";

/**
 * GET /api/brand-brain/state?slug=X
 * Returns the full Brand Brain state (foundation-state.json on disk) for a client.
 *
 * Self-healing: before returning, runs `reconcilePillarTasks(slug)` to detect
 * and repair any drift between foundation-state.json and the per-project
 * tasks.json files.
 *
 * NOTE: the on-disk filename remains foundation-state.json — see plan.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  try {
    reconcilePillarTasks(slug);
  } catch (e) {
    console.error("[brand-brain/state] reconcile failed:", (e as Error).message);
  }

  const state = readJSON<BrandBrainState | null>(foundationStateFile(slug), null);
  if (!state) {
    return res.status(404).json({ error: "Brand Brain state not found" });
  }

  res.status(200).json(state);
}

export default withErrorHandler(handler);
