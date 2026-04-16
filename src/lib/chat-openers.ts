// ============================================================
// Chat Openers — ported from mission-control.html
// Each opener configures a thread with the correct context
// (skill, linkedTo, docPath) and opens the chat sidebar.
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
