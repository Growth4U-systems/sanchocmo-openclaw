import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";
import { brandDir } from "@/lib/data/paths";
import {
  applyTaskAnchors,
  applyProjectAnchors,
  TaskAnchorError,
  type TaskCreateInput,
  type ProjectCreateInput,
} from "@/lib/data/task-create-helpers";

/**
 * POST /api/content-creation/create-project
 * Creates a Content Engine project with tasks for a specific niche.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, nicheSlug, nicheName } = req.body;
  if (!slug || !nicheSlug) {
    return res.status(400).json({ error: "Missing slug or nicheSlug" });
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

  // project.json — Foundation-style
  const project: ProjectCreateInput = {
    id: projectId,
    name: "Content Engine",
    description: "Sistema completo de contenido: estrategia, playbook, canales, keywords, calendario y crons.",
    approach: "Estrategia #26 del catalogo: Content Engine con 14 decisiones estrategicas, Content Playbook, channel setup, keyword research BOFU-first, calendario editorial y tareas recurrentes.",
    objective: {
      description: "Content Engine operativo con calendario y crons activos",
      metric: "documents_approved",
      baseline: 0,
      target: 6,
      unit: "documentos",
    },
    origin: "strategic-plan-v2",
    phase: 0,
    strategy: "#26",
    category: "content",
    review_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "active",
  };

  // tasks.json — every task born with the 3 anchors: skill + deliverable_file
  // + mc_chat_thread_id. `deliverable_file` paths are brand-relative.
  const tasks: TaskCreateInput[] = [
    {
      id: `${projectId}-T01`,
      name: "Definir Content Strategy (14 decisiones)",
      description: `Ejecutar /content-strategy para el nicho ${nicheName || nicheSlug}. Toma 14 decisiones estrategicas: Content Tilt, Villano, Trigger Events, BOFU-first, Playground Model, Growth Loops, Zero-Click, Canal Primario, Founder-Led.`,
      type: "foundation",
      pillar: "content-strategy",
      skill: "content-strategy",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable_file: `brand/${slug}/content-strategy/current.md`,
      output_files: ["current.md"],
      depends_on: null,
      owner: "Sancho",
    },
    {
      id: `${projectId}-T02`,
      name: "Generar Content Playbook completo",
      description: "Ejecutar /content-playbook. Genera pillars.md, hooks.md (28 formulas), writing-guide.md, repurpose-chain.md, platform-tone.md, audience-segments.md y playbooks por plataforma.",
      type: "foundation",
      pillar: "content-playbook",
      skill: "content-playbook",
      channel: "strategy",
      niche: nicheSlug,
      status: "todo",
      deliverable_file: `brand/${slug}/content-playbook/current.md`,
      output_files: [
        "current.md",
        "pillars.md",
        "hooks.md",
        "writing-guide.md",
        "repurpose-chain.md",
        "platform-tone.md",
        "audience-segments.md",
      ],
      depends_on: `${projectId}-T01`,
      owner: "Sancho",
    },
    {
      id: `${projectId}-T03`,
      name: "Configurar perfil LinkedIn",
      description: "Ejecutar /channel-setup linkedin. Profile CRO: headline, About, Featured, Banner, Newsletter. Consultar content-playbook/platforms/linkedin.md.",
      type: "foundation",
      pillar: "channel-setup-linkedin",
      skill: "channel-setup",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable_file: `brand/${slug}/operational/channel-setup/linkedin-checklist.md`,
      output_files: ["linkedin-checklist.md"],
      depends_on: `${projectId}-T02`,
      owner: "Equipo",
    },
    {
      id: `${projectId}-T04`,
      name: "Investigar keywords por pilar",
      description: "Ejecutar /keyword-research guiado por content-playbook/pillars.md. BOFU-first ordering.",
      type: "foundation",
      pillar: "keyword-research",
      skill: "keyword-research",
      channel: "strategy",
      niche: nicheSlug,
      status: "todo",
      deliverable_file: `brand/${slug}/campaigns/keyword-plan.md`,
      output_files: ["keyword-plan.md"],
      depends_on: `${projectId}-T02`,
      owner: "Sancho",
    },
    {
      id: `${projectId}-T05`,
      name: "Crear calendario editorial primer mes",
      description: "Ejecutar /content-calendar. Lee pillars, keywords, repurpose-chain. BOFU-first ordering.",
      type: "foundation",
      pillar: "content-calendar",
      skill: "content-calendar",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable_file: `brand/${slug}/go-to-market/content-calendar.md`,
      output_files: ["content-calendar.md"],
      depends_on: `${projectId}-T04`,
      owner: "Sancho",
    },
    {
      id: `${projectId}-T06`,
      name: "Activar tareas recurrentes de contenido",
      description: "Crear crons: idea-generation 2x/semana, atalaya semanal, performance-analysis semanal, calendar refresh semanal.",
      type: "foundation",
      pillar: "activate-crons",
      skill: "sancho-manager",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable_file: `brand/${slug}/operational/recurring/content-crons.md`,
      output_files: ["content-crons.md"],
      depends_on: `${projectId}-T05`,
      owner: "Sancho",
    },
    {
      // Visual Templates — produces the 5 carousel HTMLs Mission Control's
      // carousel panel consumes. Independent of the calendar/crons branch:
      // only depends on T02 (Playbook) which gives pillars + tone, plus the
      // brand's `visual-identity` pillar in Foundation L5 (checked at runtime
      // by the visual-generator skill — not modeled as a P14 dependency
      // because Foundation lives outside this project).
      id: `${projectId}-T07`,
      name: "Visual Templates (5 plantillas HTML)",
      description: `Genera las 5 plantillas HTML brand-specific (linkedin-quote, linkedin-9-slide, instagram-3-slide, blog-post, blog-title) ejecutando el skill ${slug}-visual-generator. La skill lee design-tokens.json + visual-identity.current.md, decide qué personajes incluir (Alfonso/Martín/Philippe), genera con nano-banana-pro los assets faltantes, y produce los HTMLs en brand/${slug}/brand-book/visual-identity/templates/{id}/. Prerequisito de runtime: visual-identity pillar 'approved' en Foundation L5.`,
      type: "foundation",
      pillar: "visual-identity",
      skill: `${slug}-visual-generator`,
      channel: "visual",
      niche: null,
      status: "todo",
      deliverable_file: `brand/${slug}/brand-book/visual-identity/templates/`,
      output_files: [
        "templates/linkedin-quote/template.html",
        "templates/linkedin-9-slide/slide-cover.html",
        "templates/instagram-3-slide/slide-cover.html",
        "templates/blog-post/template.html",
        "templates/blog-title/template.html",
      ],
      depends_on: `${projectId}-T02`,
      owner: "Sancho",
    },
  ];

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
