import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { loadClients } from "@/lib/data/clients";
import { loadAllProjects } from "@/lib/data/projects";
import { loadIdeas } from "@/lib/data/ideas";
import { readJSON } from "@/lib/data/json-io";
import { foundationStateFile } from "@/lib/data/paths";
import type { FoundationState } from "@/types";

/**
 * GET /api/dashboard/stats?slug=X
 * Returns dashboard stats for a client or global (admin)
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = (req.query.slug as string) || req.ctx?.clientSlug;

  if (slug) {
    // Client-specific stats
    const stats = getClientStats(slug);
    return res.status(200).json({ ok: true, slug, ...stats });
  }

  // Global stats (admin only)
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only for global stats" });
  }

  const clients = loadClients().filter((c) => c.active);
  let totalPillars = 0;
  let approvedPillars = 0;
  let totalProjects = 0;
  let activeProjects = 0;
  let pendingTasks = 0;
  let totalIdeas = 0;

  for (const client of clients) {
    const s = getClientStats(client.slug);
    totalPillars += s.totalPillars;
    approvedPillars += s.approvedPillars;
    totalProjects += s.totalProjects;
    activeProjects += s.activeProjects;
    pendingTasks += s.pendingTasks;
    totalIdeas += s.totalIdeas;
  }

  res.status(200).json({
    ok: true,
    activeClients: clients.length,
    totalPillars,
    approvedPillars,
    totalProjects,
    activeProjects,
    pendingTasks,
    totalIdeas,
  });
}

function getClientStats(slug: string) {
  // Foundation
  const state = readJSON<FoundationState>(foundationStateFile(slug), {
    version: "3.0",
    started_at: "",
    updated_at: "",
    brand_summary: { company_name: "", sector: "", description: "", north_star: "", icps: [], competitors: [], positioning: "" },
    sections: {},
    presentations: [],
  });

  let totalPillars = 0;
  let approvedPillars = 0;
  for (const section of Object.values(state.sections || {})) {
    const pillars = section.pillars || {};
    for (const pillar of Object.values(pillars)) {
      totalPillars++;
      if (pillar.status === "approved") approvedPillars++;
    }
  }

  // Projects
  const projectData = loadAllProjects(slug);
  const totalProjects = projectData.length;
  const activeProjects = projectData.filter((p) => p.project.status === "active").length;
  let pendingTasks = 0;
  for (const p of projectData) {
    // Pending = anything that is not completed. Uses the canonical
    // TaskStatus set (todo / in-progress / blocked / cancelled all count
    // as pending for dashboard stats purposes — only "completed" is done).
    pendingTasks += p.tasks.filter((t) => t.status !== "completed").length;
  }

  // Ideas
  const ideas = loadIdeas(slug);
  const totalIdeas = ideas.length;

  return {
    totalPillars,
    approvedPillars,
    totalProjects,
    activeProjects,
    pendingTasks,
    totalIdeas,
    brandSummary: state.brand_summary,
  };
}

export default compose(withErrorHandler, withAuth)(handler);
