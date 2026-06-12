import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { brandDir } from "@/lib/data/paths";
import {
  applyTaskAnchors,
  applyProjectAnchors,
  TaskAnchorError,
  type ProjectCreateInput,
} from "@/lib/data/task-create-helpers";
import { instantiateTaskSet } from "@/lib/data/task-blueprints";

/**
 * POST /api/content-creation/create-project
 * Creates a Content Engine project mirroring the canonical 5-task flow that
 * ships in growth4u/P14-Content-Engine: Strategy → Pillars → POV Bank →
 * Setup configs → Visual Templates. T03 (Setup configs) runs the
 * `content-engine-setup` skill whose step 6 seeds the runtime cron jobs.
 *
 * The ConfigurationPipeline UI consumes this exact structure — it looks up
 * docs by `deliverable_file` basename (strategy-decisions.md / content-
 * pillars.md / setup.md / pov-bank.json), so deviating breaks the 4-step
 * pipeline view.
 *
 * `nicheSlug` / `nicheName` are accepted for backward compatibility with
 * the empty-state CTA but ignored: canonical tasks are niche-agnostic
 * (`niche: null`). Niche-scoped production lives in weekly P-Content-
 * Semana-NN projects or ad-hoc channel projects (P{N}-seo-bofu, etc.).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug } = req.body;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  const projectsDir = path.join(brandDir(slug), "projects");

  // Find next available project ID
  let nextId = 1;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const match = d.name.match(/^P(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= nextId) nextId = num + 1;
      }
    }
  } catch {
    // projects dir doesn't exist yet
    fs.mkdirSync(projectsDir, { recursive: true });
  }

  const projectId = `P${String(nextId).padStart(2, "0")}`;
  const projectSlug = `${projectId}-Content-Engine`;
  const projectDir = path.join(projectsDir, projectSlug);

  // Check if already exists
  if (fs.existsSync(projectDir)) {
    return res.status(409).json({ error: "Project already exists", projectId, projectSlug });
  }

  fs.mkdirSync(projectDir, { recursive: true });

  // project.json — mirrors growth4u/P14-Content-Engine. Setup-only project
  // (target 3 essential tasks: Strategy + Pillars + POV Bank); continuous
  // production lives in weekly P-Content-Semana-NN projects.
  const project: ProjectCreateInput = {
    id: projectId,
    name: "Content Engine",
    description: "Content Engine Setup — Proceso 1: Strategy + Pillars + Configs. Se ejecuta 1 vez. La produccion continua (Proceso 2) vive en proyectos semanales P-Content-Semana-NN.",
    approach: "4 procesos independientes: Setup (1 vez), Produccion (continuo semanal), Ad-hoc (bajo demanda), Performance (periodico). Ver _system/content-engine-architecture.md.",
    objective: {
      description: "Content Engine Setup completado: strategy + pillars + configs + crons activos",
      metric: "tasks_completed",
      baseline: 0,
      target: 3,
      unit: "tareas",
    },
    origin: "strategic-plan-v2",
    phase: 0,
    strategy: "#26",
    category: "content",
    review_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "active",
    mc_chat_thread_id: `project-${projectId.toLowerCase()}`,
  };

  // tasks.json — the canonical 5-task Content Engine flow, derived from the
  // declarative registry (config/pillar-manifest.json → taskSets.content) via
  // instantiateTaskSet. Each task is born with its anchors (skill +
  // deliverable_file + mc_chat_thread_id) AND its owner agent co-located.
  const tasks = instantiateTaskSet("content", { slug, projectId });

  // Apply anchors (validates + creates empty chat thread files).
  try {
    applyProjectAnchors(slug, project);
    for (const task of tasks) {
      applyTaskAnchors(slug, task);
    }
  } catch (err) {
    if (err instanceof TaskAnchorError) {
      return res.status(400).json({ error: err.message, missing: err.missing });
    }
    throw err;
  }

  fs.writeFileSync(path.join(projectDir, "project.json"), JSON.stringify(project, null, 2));
  fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify(tasks, null, 2));

  return res.status(201).json({
    ok: true,
    projectId,
    projectSlug,
    tasksCount: tasks.length,
  });
}

export default withErrorHandler(handler);
