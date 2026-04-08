import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { foundationStateFile, BASE } from "@/lib/data/paths";
import { safeWriteJSON } from "@/lib/data/json-io";

const VALID_STATUSES = [
  "approved",
  "pending-review",
  "not-started",
  "in-progress",
  "generated",
  "request-changes",
  "request-refresh",
];

const PILLAR_TO_TASK: Record<string, string> = {
  approved: "completed",
  "in-progress": "in-progress",
  "not-started": "todo",
  "pending-review": "in-progress",
  generated: "in-progress",
};

/**
 * POST /api/foundation/pillar-status
 * Ported from mc-server.js:5889-5979
 * Updates a pillar's status in foundation-state.json,
 * syncs to P00 foundation tasks, and regenerates mc-data.js
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, section, pillar, status, comment } = req.body;

  if (!slug || !section || !pillar || !status) {
    return res.status(400).json({ error: "Missing slug, section, pillar, or status" });
  }

  // Portal clients can only access their own slug
  if (req.ctx?.clientSlug && req.ctx.clientSlug !== slug) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status: " + status });
  }

  const stateFile = foundationStateFile(slug);
  if (!fs.existsSync(stateFile)) {
    return res.status(404).json({ error: "foundation-state.json not found" });
  }

  const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  const sec = (state.sections || {})[section];
  if (!sec) {
    return res.status(404).json({ error: "Section not found: " + section });
  }

  const pillars = sec.pillars || sec.skills || {};
  if (!pillars[pillar]) {
    return res.status(404).json({ error: "Pillar not found: " + pillar });
  }

  const oldStatus = pillars[pillar].status;
  pillars[pillar].status = status;
  pillars[pillar].updated_at = new Date().toISOString();
  if (comment) pillars[pillar].comment = comment;
  if (status === "approved") pillars[pillar].approved_at = new Date().toISOString();

  safeWriteJSON(stateFile, state, (d: unknown) => {
    const s = d as { sections?: unknown };
    return !!s.sections;
  });

  // Sync: update matching P00 foundation task status
  const syncTaskStatus = PILLAR_TO_TASK[status] || "todo";
  try {
    const projectsDir = path.join(BASE, "brand", slug, "projects");
    if (fs.existsSync(projectsDir)) {
      const dirs = fs
        .readdirSync(projectsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith("P00"));
      for (const d of dirs) {
        const tf = path.join(projectsDir, d.name, "tasks.json");
        if (!fs.existsSync(tf)) continue;
        const td = JSON.parse(fs.readFileSync(tf, "utf-8"));
        const tasks = Array.isArray(td) ? td : td.tasks || [];
        const match = tasks.find((t: { pillar?: string }) => t.pillar === pillar);
        if (match && match.status !== syncTaskStatus) {
          match.status = syncTaskStatus;
          if (syncTaskStatus === "completed") {
            match.completed = new Date().toISOString().slice(0, 10);
          }
          const writeData = Array.isArray(td) ? tasks : { ...td, tasks };
          fs.writeFileSync(tf, JSON.stringify(writeData, null, 2));
        }
      }
    }
  } catch (e) {
    console.error("[api] sync pillar→task failed:", e instanceof Error ? e.message : e);
  }

  res.status(200).json({ ok: true, slug, section, pillar, oldStatus, newStatus: status });
}

export default compose(withErrorHandler, withAuth)(handler);
