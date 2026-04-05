// ============================================================
// Chat Openers — ported from mission-control.html
// Each opener configures a thread with the correct context
// (skill, linkedTo, docPath) and opens the chat sidebar.
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
  const threadId = `${slug}:task:${taskId.toLowerCase()}`;
  const ctx: SkillContext = {
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
  const strategySkills = resolveThreadSkills({ strategy: opts.strategy });

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
  const resolved = resolveThreadSkills({ strategyId });

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

/** Build thread config for a foundation pillar */
export function buildPillarThread(
  slug: string,
  pillarKey: string,
  docPath?: string
): ThreadConfig {
  const threadId = `${slug}:${pillarKey}`;
  const resolved = resolveThreadSkills({ pillar: pillarKey });

  return {
    threadId,
    threadName: pillarKey.replace(/-/g, " "),
    skill: resolved.skill,
    skills: resolved.skills,
    linkedTo: `foundation/${pillarKey}`,
    docPath: docPath || null,
    threadState: "continue",
  };
}

/**
 * Generate the initial auto-prompt message for a new thread.
 * Sent automatically when opening a thread that has no messages yet.
 */
export function getAutoPrompt(config: ThreadConfig): string {
  if (config.threadState === "create") {
    return `Quiero crear "${config.threadName}". Usa el skill ${config.skill} para generar el documento.`;
  }
  if (config.threadState === "continue") {
    return `Estoy abriendo el chat sobre "${config.threadName}". Dame un resumen rápido del estado actual y qué podemos hacer. Si necesitas algo de mí, dímelo.`;
  }
  return `Chat sobre "${config.threadName}". ¿Qué necesitas?`;
}
