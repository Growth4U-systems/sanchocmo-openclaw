import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import {
  setPillarStatus,
  normalizePillarStatus,
} from "@/lib/data/pillar-task-sync";

/**
 * Statuses accepted by the API. Aliases like `done` and `completed` are
 * normalized to `approved` inside the helper, but we still validate the
 * incoming string against this list to reject obvious garbage.
 *
 * NOTE: `done` and `completed` are explicitly accepted here because Sancho
 * writes `done` to foundation-state.json directly. Rejecting them would
 * force Sancho back to direct file writes (which is exactly the bug we are
 * fixing).
 */
const VALID_STATUSES = [
  "approved",
  "completed",
  "done",
  "pending-review",
  "not-started",
  "in-progress",
  "generated",
  "request-changes",
  "request-refresh",
];

/**
 * POST /api/foundation/pillar-status
 *
 * Updates a pillar's status in foundation-state.json AND propagates the
 * change to any matching foundation tasks in tasks.json files across all
 * projects of the slug.
 *
 * Both writes happen via the centralized `setPillarStatus` helper in
 * `lib/data/pillar-task-sync.ts` — see that module for the full sync
 * contract and rationale.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, section, pillar, status, comment } = req.body;

  if (!slug || !section || !pillar || !status) {
    return res
      .status(400)
      .json({ error: "Missing slug, section, pillar, or status" });
  }

  // Portal clients can only access their own slug
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status: " + status });
  }

  const result = setPillarStatus(slug, section, pillar, status, { comment });

  if (!result.ok) {
    // Helper failed (file not found, section/pillar missing, write error...).
    const code = result.error?.includes("not found") ? 404 : 500;
    return res.status(code).json({ error: result.error || "sync failed" });
  }

  return res.status(200).json({
    ok: true,
    slug,
    section,
    pillar,
    oldStatus: result.oldStatus,
    newStatus: result.newStatus,
    canonicalStatus: normalizePillarStatus(status),
    pillarChanged: result.pillarChanged,
    tasksChanged: result.tasksChanged,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
