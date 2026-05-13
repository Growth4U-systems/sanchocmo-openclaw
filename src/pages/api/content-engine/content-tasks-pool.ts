/**
 * GET /api/content-engine/content-tasks-pool — unified ContentTask list per brand.
 *
 * Replaces `GET /api/content-engine/ideas` for the Idea Tab. Reads idea-queue
 * + nested ContentTasks via `loadUnifiedContentTasks` so the UI sees every
 * ContentTask in one shot — discovery (status=New, orphans) and execution
 * (status=Approved/Draft/Pending Media/Ready/Published) — with the real
 * downstream status, not just `Approved`.
 *
 * Query params:
 *   slug    — required
 *   status  — filter by ContentTaskStatus (case-insensitive, accepts legacy lowercase)
 *   pillar  — pillar_id filter
 *   channel — target_channel filter
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { loadUnifiedContentTasks } from "@/lib/data/content-tasks-flat";
import type { ContentTask, ContentTaskStatus } from "@/types";
import { VALID_CONTENT_TASK_STATUSES } from "@/types";

const STATUS_ALIASES: Record<string, ContentTaskStatus> = {
  // Legacy idea-queue lowercase
  new: "New",
  approved: "Approved",
  draft: "Draft",
  ready: "Ready",
  published: "Published",
  discarded: "Discarded",
  deferred: "Deferred",
  // Pending Media — accept both forms
  "pending media": "Pending Media",
  "pending-media": "Pending Media",
  pendingmedia: "Pending Media",
};

function canonicalizeStatus(raw: unknown): ContentTaskStatus | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if ((VALID_CONTENT_TASK_STATUSES as readonly string[]).includes(trimmed)) {
    return trimmed as ContentTaskStatus;
  }
  return STATUS_ALIASES[trimmed.toLowerCase()] || null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const all = loadUnifiedContentTasks(slug);

  // Counts (always over the unfiltered list, so filter badges stay stable).
  const counts: Record<string, number> = {
    total: all.length,
    New: 0, Approved: 0, Draft: 0, "Pending Media": 0,
    Ready: 0, Published: 0, Discarded: 0, Deferred: 0,
  };
  for (const ct of all) counts[ct.status] = (counts[ct.status] || 0) + 1;

  // Apply filters.
  const { status, pillar, channel } = req.query;
  let filtered: ContentTask[] = all;
  if (status) {
    const canonical = canonicalizeStatus(status);
    if (canonical) filtered = filtered.filter((c) => c.status === canonical);
    else return res.status(400).json({ error: `Unknown status: ${status}` });
  }
  if (pillar) filtered = filtered.filter((c) => c.pillar_id === pillar);
  if (channel) filtered = filtered.filter((c) => c.target_channel === channel || c.target_channels?.includes(channel as string));

  return res.status(200).json({
    ok: true,
    contentTasks: filtered,
    counts,
  });
}

export default withErrorHandler(handler);
