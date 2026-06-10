import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose, canAccessSlug } from "@/lib/api-middleware";
import {
  setPillarStatus,
  normalizePillarStatus,
} from "@/lib/data/pillar-task-sync";
import { provisionYalcBrain } from "@/lib/yalc/provision";

const RESYNC_STATUSES = new Set(["approved", "completed", "done"]);

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
 * POST /api/brand-brain/pillar-status
 *
 * Updates a pillar's status in foundation-state.json AND propagates the
 * change to any matching foundation tasks in tasks.json files across all
 * projects of the slug. Both writes happen via `setPillarStatus` in
 * `lib/data/pillar-task-sync.ts`.
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

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status: " + status });
  }

  const result = setPillarStatus(slug, section, pillar, status, { comment });

  if (!result.ok) {
    const code = result.error?.includes("not found") ? 404 : 500;
    return res.status(code).json({ error: result.error || "sync failed" });
  }

  // An approved pillar changes the brand's doctrine — re-sync the YALC brain
  // so outbound runs on the freshly approved Foundation. Fire-and-forget so
  // the approval response isn't blocked by synthesis; provisioning is
  // idempotent, so repeated approvals are safe.
  if (RESYNC_STATUSES.has(status) && result.pillarChanged) {
    void provisionYalcBrain(slug).catch((err) =>
      console.error(`[pillar-status] YALC brain re-sync failed for ${slug}:`, err),
    );
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
