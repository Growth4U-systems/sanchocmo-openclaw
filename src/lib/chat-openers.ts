// ============================================================
// Chat Openers — ported from mission-control.html
// Each opener configures a thread with the correct context
// (skill, linkedTo, docPath) and opens the chat sidebar.
//
// ============================================================
// CONVERGENCE INVARIANT (added 2026-04-14 after user report)
// ============================================================
// Every task with a `pillar` field MUST open the SAME chat
// thread regardless of which UI surface opened it. "Pillar" here
// is the canonical identifier of the task's deliverable — it
// covers BOTH:
//
//   - Foundation pillars (market-analysis, competitor-analysis,
//     self-analysis, brand-voice, visual-identity, ...) which
//     live in foundation-state.json
//
//   - Content Engine pillars (content-strategy, content-playbook,
//     channel-setup-linkedin, content-calendar, activate-crons,
//     keyword-research, ...) which live as tasks in the P-Content-
//     Engine project's tasks.json
//
//   - Any future "project type" that attaches a canonical pillar
//     name to its tasks (e.g. outreach pipeline, paid ads)
//
// The same conversation with Sancho persists whether you reach it
// from any of these surfaces:
//
//   - Foundation page             (/foundation) — Foundation pillars only
//   - Content Creation banner     (strategy-banner.tsx) — Content pillars only
//   - Content Creation tabs       (StrategyDocsTab.tsx) — Content pillars only
//   - Task detail page            (/projects/[pid]/tasks/[tid]) — any pillar
//   - Projects list               (/projects) — any pillar
//   - Project detail              (/projects/[pid]) — any pillar
//   - Dashboard brand column      (brand-column.tsx) — Foundation pillars
//   - Next-steps column           (nextsteps-column.tsx) — any pillar
//
// All of these share a single thread id per pillar:
//   `${slug}:${canonical-pillar-key}`
//
// Foundation pillars and Content pillars DON'T collide because
// their names are distinct (e.g. `market-analysis` only exists as
// a Foundation pillar; `content-strategy` only exists as a Content
// pillar). The key space is flat across project types.
//
// ENFORCEMENT RULE — DO NOT BREAK THIS:
// ---------------------------------------
// Never hand-roll a `threadId` template literal for a task with
// a pillar. Always route through one of:
//
//   - `buildPillarThread(slug, pillar, docPath?, pillarCfg?)`
//       when you only have the pillar key
//   - `buildTaskThread(slug, taskId, taskName, projectId, opts)`
//       when you have a full task object (delegates to
//       buildPillarThread when `opts.pillar` is set)
//   - `buildDocThread(slug, doc, projectId?)`
//       when you have a content document shape (StrategyDocItem)
//
// If you find yourself writing `threadId: \`${slug}:...\`` in a
// .tsx / .ts file OUTSIDE this module, STOP and add a builder
// here instead. Hand-rolled thread ids fragment conversation
// history by entry point and confuse the user — they think the
// chat "reset itself" when it only forked due to a bug.
//
// Non-foundation entities (calendar items, ideas, crons, the
// trust-engine tool view) may use their own namespace because
// they don't map to a pillar — those are documented case-by-case.
// ============================================================
//
// CLIENT-SAFE: This file is imported by client-side components.
// It MUST NOT import Node.js modules (fs, path) or any file
// that does (json-io.ts, paths.ts) — not even via dynamic
// require(). Next.js statically traces require() calls and
// bundles the dependency regardless of runtime guards.
// Config from chat-config.json is loaded server-side via
// /api/chat/quick-actions — NOT here.
// ============================================================

import { resolveThreadSkills, type SkillContext } from "./skill-resolver";

export interface ThreadConfig {
  threadId: string;
  threadName: string;
  skill: string;
  skills: string[];
  linkedTo: string;
  docPath: string | null;
  threadState: "create" | "continue" | undefined;
  /** Optional message to send immediately when the thread opens. */
  initialMessage?: string;
}

/** Agent display config for message rendering */
export const MC_CHAT_AGENTS: Record<string, { emoji: string; label: string; color: string }> = {
  sancho: { emoji: "🤠", label: "Sancho", color: "#C45D35" },
  escudero: { emoji: "⚔️", label: "Escudero", color: "#22A06B" },
  rocinante: { emoji: "🐴", label: "Rocinante", color: "#3B9EBF" },
  cervantes: { emoji: "✒️", label: "Cervantes", color: "#9B59B6" },
};

/**
 * Find the task thread that "owns" a given doc path, if any. A task owns a
 * doc if the path matches either its `deliverable_file` OR any entry in its
 * `attachments[]`. Returns a ThreadConfig pointing at that task's thread
 * (via buildTaskThread), or `null` if no task claims the doc.
 *
 * This is the convergence guarantee (2026-04-15): every document attached
 * to a task shares ONE thread — the task's thread — no matter where the
 * user opens it from (doc viewer, sidebar, links). New threads should
 * never be created for docs that are already attached to a task.
 *
 * Caller passes `projectsData` from the `useProjects` hook (shape
 * `{ project: Project, tasks: Task[] }[]`). If called from a surface that
 * doesn't have projectsData yet (loading), returns null and the caller
 * should fall back to its previous behavior.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findTaskThreadForDoc(
  slug: string,
  docPath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectsData: any[] | undefined
): ThreadConfig | null {
  if (!docPath || !projectsData || projectsData.length === 0) return null;

  // Normalize the input path. We compare both the brand-relative form
  // (`brand/{slug}/...`) and the slug-relative form (`...`) because
  // different surfaces use different conventions.
  const normalized = docPath.replace(/^\/+/, "");
  const stripBrand = normalized.startsWith(`brand/${slug}/`)
    ? normalized.slice(`brand/${slug}/`.length)
    : normalized;
  const withBrand = normalized.startsWith("brand/")
    ? normalized
    : `brand/${slug}/${normalized}`;

  const matches = (candidate: unknown): boolean => {
    if (!candidate) return false;
    if (typeof candidate === "string") {
      const c = candidate.replace(/^\/+/, "");
      return c === normalized || c === stripBrand || c === withBrand;
    }
    if (Array.isArray(candidate)) {
      return candidate.some((x) => matches(x));
    }
    return false;
  };

  for (const pw of projectsData) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = (pw as any).project || pw;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = (pw as any).tasks as any[] | undefined;
    if (!Array.isArray(tasks)) continue;

    for (const task of tasks) {
      // Check deliverable_file
      if (matches(task.deliverable_file)) {
        return buildTaskThread(
          slug,
          task.id,
          task.name || task.id,
          project.id || "",
          {
            taskSkill: task.skill,
            taskChannel: task.channel,
            taskStatus: task.status,
            taskType: task.type,
            pillar: task.pillar,
          }
        );
      }
      // Check attachments[]
      if (Array.isArray(task.attachments)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hit = task.attachments.some((a: any) => matches(a?.path));
        if (hit) {
          return buildTaskThread(
            slug,
            task.id,
            task.name || task.id,
            project.id || "",
            {
              taskSkill: task.skill,
              taskChannel: task.channel,
              taskStatus: task.status,
              taskType: task.type,
              pillar: task.pillar,
            }
          );
        }
      }
    }
  }
  return null;
}

/** Thread icon by type prefix */
export function threadIcon(shortId: string): string {
  if (shortId.startsWith("project:")) return "📋";
  if (shortId.startsWith("task:")) return "📝";
  if (shortId.startsWith("idea:")) return "💡";
  if (shortId.startsWith("recurring:")) return "🔄";
  if (shortId.startsWith("strategy:")) return "🎯";
  return "💬";
}

/** Build thread config for a task */
export function buildTaskThread(
  slug: string,
  taskId: string,
  taskName: string,
  projectId: string,
  opts: { taskSkill?: string; taskChannel?: string; taskStatus?: string; taskType?: string; pillar?: string }
): ThreadConfig {
  // If the task is linked to a foundation pillar, reuse the pillar thread
  // so all entry points (brand column, foundation page, project tasks, etc.)
  // converge to the same thread.
  if (opts.pillar) {
    return buildPillarThread(slug, opts.pillar);
  }

  const threadId = `${slug}:task:${taskId.toLowerCase()}`;
  const ctx: SkillContext = {
    slug,
    taskSkill: opts.taskSkill,
    taskType: opts.taskType,
    channel: opts.taskChannel,
    pillar: opts.pillar,
  };
  const resolved = resolveThreadSkills(ctx);

  return {
    threadId,
    threadName: taskName,
    skill: resolved.skill,
    skills: resolved.skills,
    linkedTo: `projects/${projectId}/tasks/${taskId}`,
    docPath: `projects/${projectId}/tasks.json`,
    threadState: opts.taskStatus === "ready" || opts.taskStatus === "pending" ? "create" : "continue",
  };
}

/** Build thread config for a project */
export function buildProjectThread(
  slug: string,
  projectId: string,
  projectName: string,
  opts: { strategy?: string; status?: string }
): ThreadConfig {
  const threadId = `${slug}:project:${projectId.toLowerCase()}`;
  const strategySkills = resolveThreadSkills({ slug, strategy: opts.strategy });

  return {
    threadId,
    threadName: projectName,
    skill: "sancho-manager",
    skills: ["sancho-manager", ...strategySkills.skills],
    linkedTo: `projects/${projectId}`,
    docPath: `projects/${projectId}/project.json`,
    threadState: opts.status === "proposed" || opts.status === "pending" ? "create" : "continue",
  };
}

/** Build thread config for a strategy */
export function buildStrategyThread(
  slug: string,
  strategyId: string,
  strategyName: string
): ThreadConfig {
  const threadId = `${slug}:strategy:${strategyId.toLowerCase()}`;
  const resolved = resolveThreadSkills({ slug, strategyId });

  return {
    threadId,
    threadName: `#${strategyId} ${strategyName}`,
    skill: "sancho-manager",
    skills: ["sancho-manager", ...resolved.skills],
    linkedTo: `strategic-plan/strategy/${strategyId}`,
    docPath: "strategic-plan/current.md",
    threadState: "continue",
  };
}

/** Build thread config for a recurring task */
export function buildRecurringThread(
  slug: string,
  taskId: string,
  taskName: string,
  taskSkill?: string
): ThreadConfig {
  const safeId = taskId.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const threadId = `${slug}:recurring:${safeId}`;

  return {
    threadId,
    threadName: taskName,
    skill: "sancho-manager",
    skills: ["sancho-manager", ...(taskSkill ? [taskSkill] : [])],
    linkedTo: `recurring/${taskId}`,
    docPath: null,
    threadState: "continue",
  };
}

/** Hardcoded pillar canonical fallback (overridden by chat-config.json if available) */
const PILLAR_CANONICAL_FALLBACK: Record<string, string> = {
  "company-brief": "fast-foundation",
};

/**
 * Build thread config for a "content document" — the shape rendered by
 * `components/content/strategy-docs.tsx` and similar surfaces. This is a
 * thin wrapper that picks the right underlying builder based on whether
 * the doc is linked to a foundation pillar.
 *
 * Convergence guarantee: docs that share a pillar open the SAME thread,
 * regardless of which doc row the user clicked. This avoids the bug
 * reported on 2026-04-14 where clicking a doc in Content Creation opened
 * a different thread than clicking the same pillar from /projects.
 *
 * Callers should prefer this over hand-rolling a thread config. If the
 * doc has no pillar (rare — legacy strategy docs), the function falls
 * back to a `${slug}:content:${docKey}` thread so the caller still gets
 * something usable.
 */
export function buildDocThread(
  slug: string,
  doc: {
    id?: string;
    name?: string;
    key?: string;
    pillar?: string | null;
    skill?: string | null;
    channel?: string | null;
    type?: string | null;
    status?: string;
    docPath?: string | null;
    deliverable?: string | null;
  },
  projectId?: string
): ThreadConfig {
  const docKey = doc.key || doc.pillar || doc.id || doc.name || "doc";

  // Preferred path: the doc is linked to a foundation pillar → use the
  // canonical pillar thread so every surface that references this pillar
  // shares history with this one.
  if (doc.pillar) {
    const config = buildTaskThread(
      slug,
      doc.id || docKey,
      doc.name || docKey,
      projectId || "",
      {
        taskSkill: doc.skill ?? undefined,
        taskChannel: doc.channel ?? undefined,
        taskStatus: doc.status,
        taskType: doc.type ?? undefined,
        pillar: doc.pillar,
      }
    );
    // Attach the doc path if we have one AND the doc isn't pending (pending
    // tasks don't have a file on disk yet → would 404).
    const isPending =
      doc.status === "pending" ||
      doc.status === "not-started" ||
      doc.status === "todo";
    if (!isPending) {
      const rawDocPath = doc.docPath || doc.deliverable;
      if (rawDocPath) {
        const normalized = rawDocPath.startsWith("brand/")
          ? rawDocPath
          : `brand/${slug}/${rawDocPath}`;
        config.docPath = normalized;
      }
    }
    return config;
  }

  // Fallback: no pillar. This is the legacy strategy-doc shape that lives
  // outside Foundation. Use a content-namespaced thread id so at least
  // it's distinct from pillar threads.
  const rawDocPath = doc.docPath || doc.deliverable;
  return {
    threadId: `${slug}:content:${docKey}`,
    threadName: (doc.name || docKey).replace(/-/g, " "),
    skill: "sancho",
    skills: ["sancho"],
    linkedTo: `content-creation/${docKey}`,
    docPath: rawDocPath
      ? rawDocPath.startsWith("brand/")
        ? rawDocPath
        : `brand/${slug}/${rawDocPath}`
      : null,
    threadState: "continue",
  };
}

/** Build thread config for a foundation pillar */
export function buildPillarThread(
  slug: string,
  pillarKey: string,
  docPath?: string,
  pillarCfg?: { canonical?: string; docPath?: string }
): ThreadConfig {
  const canonical = pillarCfg?.canonical || PILLAR_CANONICAL_FALLBACK[pillarKey] || pillarKey;
  const threadId = `${slug}:${canonical}`;
  const resolved = resolveThreadSkills({ slug, pillar: canonical });

  return {
    threadId,
    threadName: pillarKey.replace(/-/g, " "),
    skill: resolved.skill,
    skills: resolved.skills,
    linkedTo: `foundation/${pillarKey}`,
    docPath: docPath || pillarCfg?.docPath || null,
    threadState: "continue",
  };
}

/** Build thread config for creating a new skill via chat */
export function buildSkillCreatorThread(slug: string): ThreadConfig {
  const threadId = `${slug}:skill-creator:${Date.now()}`;
  return {
    threadId,
    threadName: "Crear nueva skill",
    skill: "skill-creator",
    skills: ["skill-creator"],
    linkedTo: "skills/new",
    docPath: null,
    threadState: "create",
    initialMessage: "Quiero crear una nueva skill para el workspace. Guíame paso a paso.",
  };
}

/** Build thread config for editing an existing skill via chat */
export function buildSkillEditorThread(
  slug: string,
  skillId: string,
  skillName: string,
  docPath?: string
): ThreadConfig {
  const threadId = `${slug}:skill:${skillId}`;
  return {
    threadId,
    threadName: skillName,
    skill: "skill-creator",
    skills: ["skill-creator"],
    linkedTo: `skills/${skillId}`,
    docPath: docPath || null,
    threadState: "continue",
  };
}

/** Build thread for a Trust Engine module — same thread for all modules */
export function buildTrustEngineModuleThread(
  slug: string,
  moduleId: string,
  moduleName: string,
  moduleFile: string,
): ThreadConfig {
  // Single thread for all Trust Engine modules — conversation persists across steps
  const threadId = `${slug}:trust-engine`;

  const moduleContexts: Record<string, string> = {
    "foundation-import": `Estoy revisando la configuración del Trust Engine para ${slug}. Quiero verificar que los nichos, subnichos y competidores están bien definidos antes de continuar con las auditorías.`,
    "seo-audit": `Estoy revisando el SEO Audit de ${slug}. Analiza los resultados: Lighthouse scores, Core Web Vitals, health checks e issues. Dime qué es crítico y qué acciones tomar primero.`,
    "own-media-audit": `Estoy revisando el Own Media Audit de ${slug}. Analiza el blog, redes sociales, y presencia técnica. ¿Dónde hay quick wins y qué necesita mejora urgente?`,
    "geo-analysis": `Estoy revisando el GEO Analysis de ${slug}. Analiza la visibilidad en IA (ChatGPT, Gemini, Perplexity). ¿Dónde nos mencionan, dónde no, y dónde hay oportunidades frente a competidores?`,
    "serp-analysis": `Estoy revisando el SERP Analysis de ${slug}. Analiza las posiciones en Google: ¿en qué keywords estamos top 3, top 10, e invisible? ¿Qué competidores dominan?`,
    "gap-analysis": `Estoy revisando el Gap Analysis de ${slug}. Muéstrame los gaps de presencia, densidad y tipo. ¿Dónde están nuestros competidores y nosotros no? Prioriza por oportunidad.`,
    "recommendations": `Estoy revisando las recomendaciones del Trust Engine para ${slug}. Prioriza las más impactantes y dime el plan de acción concreto. ¿Qué hacemos primero?`,
    "keywords": `Estoy revisando los keywords del Trust Engine para ${slug}. Analiza los top keywords por oportunidad, los layers de expansión, y la cobertura por subnicho. ¿Cuáles atacamos primero?`,
    "influencers": `Estoy revisando los influencers y medios identificados para ${slug}. Analiza los accionables: ¿a quién contactar primero, con qué tipo de colaboración, y por qué?`,
  };

  return {
    threadId,
    threadName: `Trust Engine — ${moduleName}`,
    skill: "trust-engine",
    skills: ["trust-engine", "keyword-research", "seo-content", "outreach-sequence-builder"],
    linkedTo: `trust-engine/${moduleId}`,
    docPath: `brand/${slug}/trust-engine/${moduleFile}`,
    threadState: "continue",
    initialMessage: moduleContexts[moduleId] || `Estoy revisando ${moduleName} del Trust Engine para ${slug}. Analiza los datos y dime las conclusiones clave.`,
  };
}

/**
 * Generate the initial auto-prompt message for a new thread.
 * Sent automatically when opening a thread that has no messages yet.
 */
export function getAutoPrompt(config: ThreadConfig): string {
  // If the caller provided an explicit initial message, use it
  if (config.initialMessage) return config.initialMessage;

  if (config.threadState === "create") {
    return `Quiero crear "${config.threadName}". Usa el skill ${config.skill} para generar el documento.`;
  }
  if (config.threadState === "continue") {
    return `Estoy abriendo el chat sobre "${config.threadName}". Dame un resumen rápido del estado actual y qué podemos hacer. Si necesitas algo de mí, dímelo.`;
  }
  return `Chat sobre "${config.threadName}". ¿Qué necesitas?`;
}
