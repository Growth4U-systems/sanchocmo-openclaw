import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * POST /api/projects/create-tool-project — Create a project with a research tool.
 * Body: { slug, strategy, name, tool? }
 *
 * Creates:
 * - Project directory with project.json
 * - T01 research task with skill = tool
 * - Empty tasks.json with T01
 *
 * The tool field defaults to the strategy's tool if not provided.
 * Strategy #02 → tool: "trust-engine"
 */

const STRATEGY_TOOLS: Record<string, { tool: string; taskName: string; taskType: string }> = {
  "02": {
    tool: "trust-engine",
    taskName: "Ejecutar Trust Engine",
    taskType: "tool",
  },
  // Atalaya and others will be added later
};

function nextProjectId(projectsDir: string): string {
  let maxId = 0;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      const m = d.name.match(/^P(\d+)/);
      if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    }
  } catch { /* empty */ }
  return `P${String(maxId + 1).padStart(2, "0")}`;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { slug, strategy, name, tool: toolOverride } = req.body;
  if (!slug || !name) {
    return res.status(400).json({ error: "Missing slug or name" });
  }

  // Resolve tool from strategy or override
  const strategyId = (strategy || "").replace("#", "");
  const strategyConfig = STRATEGY_TOOLS[strategyId];
  const tool = toolOverride || strategyConfig?.tool;

  if (!tool) {
    return res.status(400).json({ error: "No tool found for strategy " + strategy });
  }

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  fs.mkdirSync(projectsDir, { recursive: true });

  // Create project
  const projId = nextProjectId(projectsDir);
  const dirName = `${projId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").slice(0, 60)}`;
  const projDir = path.join(projectsDir, dirName);
  fs.mkdirSync(projDir, { recursive: true });

  const now = new Date().toISOString();

  const project = {
    id: projId,
    slug: dirName,
    name,
    strategy: strategy || "",
    tool,
    status: "active",
    category: "research",
    created_at: now,
  };
  fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify(project, null, 2));

  // Create T01 research task
  const taskName = strategyConfig?.taskName
    ? `${strategyConfig.taskName} — ${name.replace(/^Trust Engine\s*[—-]\s*/i, "").replace(/^Atalaya\s*[—-]\s*/i, "")}`
    : `Research — ${name}`;

  const task = {
    id: `${projId}-T01`,
    name: taskName,
    description: `Ejecutar ${tool} para el proyecto "${name}"`,
    type: strategyConfig?.taskType || "research",
    skill: tool,
    status: "todo",
    owner: "Sancho",
    channel: "intelligence",
    documents: [],
    created_at: now,
  };
  fs.writeFileSync(path.join(projDir, "tasks.json"), JSON.stringify([task], null, 2));

  return res.status(200).json({
    ok: true,
    projectId: projId,
    projectSlug: dirName,
    taskId: task.id,
    tool,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
