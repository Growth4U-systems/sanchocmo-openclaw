import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { BASE, brandDir, ideasFile } from "@/lib/data/paths";
import { readJSON, readText } from "@/lib/data/json-io";

interface ProjectJson {
  id?: string;
  name?: string;
  category?: string;
  status?: string;
}

interface TaskJson {
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  pillar?: string;
  channel?: string;
  niche?: string | null;
  status?: string;
  deliverable?: string | null;
  output_files?: string[];
  depends_on?: string | null;
  owner?: string;
  // Legacy fields (backwards compat)
  key?: string;
  section?: string;
  skill?: string;
  docPath?: string;
  dependsOn?: string;
  children?: Array<{ name: string; status: string; docPath: string }>;
}

interface IdeaJson {
  id?: string;
  status?: string;
  pipeline_status?: string;
}

interface CronEntry {
  id?: string;
  name?: string;
  schedule?: string;
  lastRun?: string;
  status?: string;
  task_type?: string;
  category?: string;
}

/**
 * GET /api/content-creation/state?slug=X&niche=Y
 * Returns the content creation state for a client.
 * Optional niche param filters tasks to global (niche:null) + matching niche.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = (req.query.slug as string) || req.ctx?.clientSlug;
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }

  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const selectedNiche = (req.query.niche as string) || null;

  const projectsDir = path.join(BASE, "brand", slug, "projects");
  let contentProject: { dirName: string; project: ProjectJson } | null = null;

  // 1. Find content-engine project
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory() || !d.name.match(/^P\d+/)) continue;
      const pFile = path.join(projectsDir, d.name, "project.json");
      const proj = readJSON<ProjectJson>(pFile, {});
      if (
        proj.category === "content" ||
        (proj.name && proj.name.toLowerCase().includes("content engine"))
      ) {
        contentProject = { dirName: d.name, project: proj };
        break;
      }
    }
  } catch {
    // projects dir doesn't exist
  }

  // 2. Map tasks to documents (Foundation format)
  let documents: Array<{
    id: string;
    name: string;
    description: string;
    type: string | null;
    pillar: string | null;
    channel: string | null;
    niche: string | null;
    status: string;
    deliverable: string | null;
    output_files: string[];
    depends_on: string | null;
    owner: string | null;
    // Legacy compat
    key: string;
    section: string;
    skill: string | null;
    docPath: string | null;
    children?: Array<{ name: string; status: string; docPath: string }>;
  }> = [];
  let projectId: string | null = null;
  if (contentProject) {
    projectId = contentProject.dirName.split("-")[0];
    const tFile = path.join(projectsDir, contentProject.dirName, "tasks.json");
    const raw = readJSON<TaskJson[] | { tasks?: unknown }>(tFile, []);
    const allTasks: TaskJson[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.tasks)
        ? raw.tasks
        : [];

    // Filter by niche if provided
    const tasks = selectedNiche
      ? allTasks.filter(
          (t) => t.niche === null || t.niche === undefined || t.niche === selectedNiche
        )
      : allTasks;

    documents = tasks.map((t) => ({
      id: t.id || "",
      name: t.name || "",
      description: t.description || "",
      type: t.type ?? null,
      pillar: t.pillar ?? null,
      channel: t.channel ?? null,
      niche: t.niche ?? null,
      status: t.status || "pending",
      deliverable: t.deliverable ?? null,
      output_files: t.output_files ?? [],
      depends_on: t.depends_on ?? t.dependsOn ?? null,
      owner: t.owner ?? null,
      // Legacy compat
      key: t.key || t.pillar || t.id || t.name || "",
      section: t.section || t.channel || "",
      skill: t.skill ?? t.pillar ?? null,
      docPath: t.docPath ?? t.deliverable ?? null,
      children: t.children,
    }));
  }

  // 3. Read ECPs for niches (extract Pain Clusters or ECP sections)
  const niches: Array<{ slug: string; name: string }> = [];
  const ecpDir = path.join(brandDir(slug), "go-to-market", "ecps");
  // Try multiple filename conventions
  const ecpCandidates = ["ecps-current.md", "ecps.current.md", "current.md", "ecps.md"];
  let ecpContent: string | null = null;
  for (const candidate of ecpCandidates) {
    ecpContent = readText(path.join(ecpDir, candidate));
    if (ecpContent) break;
  }
  if (ecpContent) {
    // Try Pain Clusters format first: ### 🔴 Cluster A: System Seekers
    const clusterRegex = /^###\s+(?:[^\s]+\s+)?Cluster\s+\w+[:\s]+(.+)/gm;
    let match;
    while ((match = clusterRegex.exec(ecpContent)) !== null) {
      const name = match[1].trim();
      if (name) {
        const ecpSlug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        niches.push({ slug: ecpSlug, name });
      }
    }
    // Fallback: generic heading extraction (## ECP Name)
    if (niches.length === 0) {
      const headingRegex = /^#{2,3}\s+(?:ECP\s*\d*[:\s-]*)?(.+)/gm;
      while ((match = headingRegex.exec(ecpContent)) !== null) {
        const name = match[1].trim();
        const lower = name.toLowerCase();
        if (name && !lower.includes("overview") && !lower.includes("table of contents")
            && !lower.includes("executive summary") && !lower.includes("pain cluster")) {
          const ecpSlug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          niches.push({ slug: ecpSlug, name });
        }
      }
    }
  }

  // 4. Read crons (content-related)
  const cronsFile = path.join(
    brandDir(slug),
    "idea-generation",
    "recurring-tasks.json"
  );
  const allCrons = readJSON<CronEntry[]>(cronsFile, []);
  const contentCrons = allCrons
    .filter(
      (c) =>
        c.category === "content" ||
        c.task_type === "content" ||
        (c.name && c.name.toLowerCase().includes("content"))
    )
    .map((c) => ({
      name: c.name || "",
      schedule: c.schedule || "",
      lastRun: c.lastRun || null,
      status: c.status || "inactive",
      ideasCount: 0,
    }));

  // 5. Read ideas and count by status
  const allIdeas = readJSON<IdeaJson[]>(ideasFile(slug), []);
  const ideas = Array.isArray(allIdeas) ? allIdeas : [];
  const ideaCounts = {
    total: ideas.length,
    new: ideas.filter((i) => i.status === "new" || !i.status).length,
    approved: ideas.filter((i) => i.status === "approved").length,
    inProgress: ideas.filter(
      (i) => i.status === "in-progress" || i.pipeline_status === "in-progress"
    ).length,
    published: ideas.filter(
      (i) => i.status === "published" || i.pipeline_status === "published"
    ).length,
  };

  return res.status(200).json({
    hasProject: !!contentProject,
    projectId,
    documents,
    niches,
    selectedNiche,
    crons: contentCrons,
    ideaCounts,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
