import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { resolveCoveringTask } from "@/lib/data/foundation-status";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * POST /api/content-engine/templates/ensure-task
 *   body: { slug }
 *
 * **Migration-only endpoint.** New brands get the Visual Templates task
 * baked into the project template by `create-project.ts` (it's `T05` of
 * the canonical Content Engine flow). This endpoint exists to retrofit
 * brands whose Content Engine project was created before Visual Templates
 * existed — it appends the task to the existing `tasks.json` using the
 * next free `T0X` id and idempotently returns the existing one if already
 * present (match is by task name + skill suffix, not by position).
 *
 * The carousel panel's empty state calls it on demand so the user lands
 * on the task in one click.
 *
 * Response: { ok, task, alreadyExists }
 */

interface TaskShape {
  id: string;
  name: string;
  description: string;
  phase: number;
  type: string;
  channel: string;
  niche: string | null;
  status: string;
  completed?: string | null;
  deliverable: string;
  deliverable_file: string;
  output_files: string[];
  depends_on: string | string[] | null;
  owner: string;
  skill: string;
  mc_chat_thread_id: string;
}

/** Prerequisite: the brand needs the `visual-identity` pillar task completed
 *  (Foundation L5) before we let a Visual Templates task be created. The
 *  visual-generator skill needs design-tokens.json + visual-identity-current.md
 *  to produce the HTMLs — without those it has nothing to consume.
 *  SAN-183 F5: el status vive en la task 1:1 del pilar, no en foundation-state. */
function checkVisualIdentityApproved(slug: string): { ok: true } | { ok: false; reason: string } {
  const covering = resolveCoveringTask(slug, "visual-identity");
  if (!covering) {
    return {
      ok: false,
      reason: "No hay task de visual-identity (proyectos P00 sin sembrar). Lanza primero Foundation.",
    };
  }
  const status = String(covering.task.status || "todo");
  if (status === "completed") return { ok: true };
  return {
    ok: false,
    reason: `El pillar visual-identity está en estado "${status}", no "completed". Lanza primero la skill visual-identity para definir paleta, tipografía y logo.`,
  };
}

const TASK_NAME = "Visual Templates (5 plantillas HTML)";
const TASK_SKILL_SUFFIX = "visual-generator";

/** Pick the next free `T0X` id under a project's tasks.json. New brands
 *  get T07 (because the project template defines T01-T06 already); legacy
 *  brands like growth4u get T05 (their template only had T01-T04). */
function nextTaskId(tasks: Array<{ id?: string }>, projectId: string): string {
  const used = new Set(
    tasks.map((t) => t.id).filter((id): id is string => typeof id === "string"),
  );
  for (let i = 1; i < 100; i++) {
    const candidate = `${projectId}-T${String(i).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No free task id under T99");
}

function projectsRoot(slug: string): string {
  return path.join(BASE, "brand", slug, "projects");
}

function findP14Dir(slug: string): string | null {
  const root = projectsRoot(slug);
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "P14-Content-Engine" || entry.name.startsWith("P14-")) {
      const tasksFile = path.join(root, entry.name, "tasks.json");
      if (fs.existsSync(tasksFile)) return path.join(root, entry.name);
    }
  }
  return null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = req.body?.slug as string;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const p14 = findP14Dir(slug);
  if (!p14) {
    return res.status(404).json({
      error: "Content Engine project (P14) not found for this brand. Run content-engine-setup first.",
    });
  }
  const tasksPath = path.join(p14, "tasks.json");
  const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8")) as TaskShape[];

  // Idempotent: detect existing Visual Templates task by name+skill rather
  // than a hardcoded id (the id varies between modern T07 and legacy T05).
  const targetSkill = `${slug}-${TASK_SKILL_SUFFIX}`;
  const projectSlug = path.basename(p14);
  const existing = tasks.find(
    (t) => t.skill === targetSkill || t.name === TASK_NAME,
  );
  if (existing) {
    const existingProjectId = projectSlug.match(/^(P\d+)/)?.[1] || projectSlug;
    return res.status(200).json({ ok: true, task: existing, projectId: existingProjectId, projectSlug, alreadyExists: true });
  }

  // Prereq: visual-identity pillar must be approved before we let the
  // Visual Templates task land. Otherwise the visual-generator skill has
  // no design-tokens.json / visual-identity-current.md to read from.
  const prereq = checkVisualIdentityApproved(slug);
  if (!prereq.ok) {
    return res.status(409).json({
      error: "Prerequisito no cumplido: visual-identity no está aprobado.",
      reason: prereq.reason,
      remediation: "Lanza la skill visual-identity en Foundation Layer 5 antes de crear esta task.",
    });
  }

  const projectId = projectSlug.match(/^(P\d+)/)?.[1] || "P14";
  const newId = nextTaskId(tasks, projectId);
  const task: TaskShape = {
    id: newId,
    name: TASK_NAME,
    description:
      "Genera las 5 plantillas HTML brand-specific (linkedin-quote, linkedin-9-slide, " +
      "instagram-3-slide, blog-post, blog-title) ejecutando el skill " +
      `${slug}-visual-generator. La skill lee design-tokens.json + visual-identity-current.md, ` +
      "decide qué personajes incluir (Alfonso/Martín/Philippe), genera con nano-banana-pro " +
      "los assets faltantes, y produce los HTMLs en " +
      `brand/${slug}/brand-book/visual-identity/templates/{id}/. ` +
      "Ver SKILL.md de la skill para el flow completo.",
    phase: 1,
    type: "foundation",
    channel: "visual",
    niche: null,
    status: "ready",
    completed: null,
    deliverable: "5 plantillas HTML (template.html o slide-*.html) + meta.json por plantilla",
    deliverable_file: `brand/${slug}/brand-book/visual-identity/templates/`,
    output_files: [
      "templates/linkedin-quote/template.html",
      "templates/linkedin-9-slide/slide-cover.html",
      "templates/instagram-3-slide/slide-cover.html",
      "templates/blog-post/template.html",
      "templates/blog-title/template.html",
    ],
    depends_on: [`${projectId}-T01`, `${projectId}-T02`],
    owner: "Sancho",
    skill: targetSkill,
    mc_chat_thread_id: `task-${newId.toLowerCase()}`,
  };

  tasks.push(task);
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2) + "\n");

  return res.status(200).json({ ok: true, task, projectId, projectSlug, alreadyExists: false });
}

export default withErrorHandler(handler);
