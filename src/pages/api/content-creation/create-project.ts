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
    discord_thread_id: null,
  };

  // tasks.json — mirrors growth4u/P14-Content-Engine canon. Each task born
  // with the 3 anchors: skill + deliverable_file + mc_chat_thread_id.
  const taskThreadId = (n: string) => `task-${projectId.toLowerCase()}-${n}`;
  const tasks: TaskCreateInput[] = [
    {
      id: `${projectId}-T01`,
      name: "Content Strategy (14 decisiones globales)",
      description: "Proceso 1 — Ejecutar content-strategy a nivel empresa. Define: nichos confirmados, Content Tilt, Villano, Trigger Events, canales activos, mix searchable/shareable, pillars a alto nivel, KPIs norte.",
      phase: 1,
      type: "foundation",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable: "Documento con las 14 decisiones estrategicas globales del Content Engine",
      deliverable_file: `brand/${slug}/content/strategy-decisions.md`,
      output_files: ["strategy-decisions.md"],
      depends_on: null,
      owner: "Sancho",
      skill: "content-strategy",
      mc_chat_thread_id: taskThreadId("t01"),
      discord_thread_id: null,
    },
    {
      id: `${projectId}-T02`,
      name: "Content Pillars (3-5 temas)",
      description: "Proceso 1 — Ejecutar content-pillars. Define 3-5 pillars (TEMAS, no POV). Lee Foundation completa + strategy-decisions.md. Asigna funnel_role per pillar. El humano confirma la lista final.",
      phase: 1,
      type: "foundation",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable: "Content pillars con funnel_role, pain_origin, expertise, related_topics",
      deliverable_file: `brand/${slug}/content/content-pillars.md`,
      output_files: ["content-pillars.md"],
      depends_on: `${projectId}-T01`,
      owner: "Sancho",
      skill: "content-pillars",
      mc_chat_thread_id: taskThreadId("t02"),
      discord_thread_id: null,
    },
    {
      id: `${projectId}-T03`,
      name: "Setup configs por pillar",
      description: `Rellena los configs existentes (news-prompts, paa-queries, keywords-seed, sources.json profiles, cadence-config.yml) con datos derivados de content-pillars.md + pov-bank.json + Foundation. Genera ademas un setup.md narrativo que explica el por que de cada decision y enlaza con los crones que consumen cada config. La infraestructura (carpetas + YAMLs + crons) ya existe — esta tarea solo MODIFICA los campos editables y DOCUMENTA. ORDEN DE EJECUCION: SE EJECUTA EL ULTIMO. Requiere ${projectId}-T01 (Strategy) + ${projectId}-T02 (Pillars) + ${projectId}-T04 (POV Bank) en status:completed.`,
      phase: 1,
      type: "execution",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable: "Configs por pillar + cadence + sources.json profiles + setup.md narrativo",
      deliverable_file: `brand/${slug}/content/configs/setup.md`,
      output_files: [
        "setup.md",
        "cadence-config.yml",
        "news-prompts/*.yml",
        "paa-queries/*.yml",
        "keywords-seed/*.yml",
        "../../market-and-us/competitors/sources.json",
      ],
      depends_on: `${projectId}-T04`,
      owner: "Sancho",
      skill: "content-engine-setup",
      mc_chat_thread_id: taskThreadId("t03"),
      discord_thread_id: null,
    },
    {
      id: `${projectId}-T04`,
      name: "Build POV Bank",
      description: `Construye la BD de puntos de vista (pov-bank.json) per pillar: core_belief, we_say_yes_to/no_to, preferred_angles, evidence_we_cite. Lee brand-voice + content-pillars + clarify-history. El skill idea-builder consultara este doc para generar angle_drafts diferenciados (no genericos). Se refresca mensualmente con el cron POV Bank Refresh basado en patrones de clarify-history. ORDEN DE EJECUCION: VA ANTES que ${projectId}-T03 (Setup configs) — el POV se decide primero, despues se configuran los inputs alineados con esa postura. Requiere ${projectId}-T01 (Strategy) + ${projectId}-T02 (Pillars) en status:completed.`,
      phase: 1,
      type: "execution",
      channel: "strategy",
      niche: null,
      status: "todo",
      deliverable: "POV Bank con opiniones por pillar (core_belief, we_say_yes/no, preferred_angles, evidence)",
      deliverable_file: `brand/${slug}/content/pov-bank.json`,
      output_files: ["pov-bank.json", "pov-bank-history.json"],
      depends_on: `${projectId}-T02`,
      owner: "Sancho",
      skill: "pov-bank-builder",
      mc_chat_thread_id: taskThreadId("t04"),
      discord_thread_id: null,
    },
    {
      id: `${projectId}-T05`,
      name: "Visual Templates (5 plantillas HTML)",
      description: `Genera las 5 plantillas HTML brand-specific (linkedin-quote, linkedin-9-slide, instagram-3-slide, blog-post, blog-title) ejecutando el skill ${slug}-visual-generator. La skill lee design-tokens.json + visual-identity-current.md, decide qué personajes incluir, genera con nano-banana-pro los assets faltantes, y produce los HTMLs en brand/${slug}/brand-book/visual-identity/templates/{id}/. Ver SKILL.md de la skill para el flow completo. Prerequisito de runtime: visual-identity pillar 'approved' en Foundation L5.`,
      phase: 1,
      type: "foundation",
      channel: "visual",
      niche: null,
      status: "todo",
      deliverable: "5 plantillas HTML (template.html o slide-*.html) + meta.json por plantilla",
      deliverable_file: [
        `brand/${slug}/brand-book/visual-identity/templates/linkedin-quote/template.html`,
        `brand/${slug}/brand-book/visual-identity/templates/linkedin-9-slide/slide-cover.html`,
        `brand/${slug}/brand-book/visual-identity/templates/instagram-3-slide/slide-cover.html`,
        `brand/${slug}/brand-book/visual-identity/templates/blog-post/template.html`,
        `brand/${slug}/brand-book/visual-identity/templates/blog-title/template.html`,
      ],
      output_files: [
        "brand-book/visual-identity/templates/linkedin-quote/template.html",
        "brand-book/visual-identity/templates/linkedin-9-slide/slide-cover.html",
        "brand-book/visual-identity/templates/instagram-3-slide/slide-cover.html",
        "brand-book/visual-identity/templates/blog-post/template.html",
        "brand-book/visual-identity/templates/blog-title/template.html",
      ],
      depends_on: [`${projectId}-T01`, `${projectId}-T02`],
      owner: "Sancho",
      skill: `${slug}-visual-generator`,
      mc_chat_thread_id: taskThreadId("t05"),
      discord_thread_id: null,
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
