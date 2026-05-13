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
  /**
   * When set, forces the gateway to dispatch this thread to a specific agent
   * (e.g. `"maese-pedro"` for Media Creation skills) instead of falling back
   * to the default agent (Sancho). The gateway's mc-chat plugin must honor
   * this field — see send.ts where it's forwarded.
   */
  agent?: string;
  inputDocuments?: unknown[];
  requiredInputs?: unknown[];
  outputDocuments?: unknown[];
  dependsOn?: string[];
  /**
   * Shape of the doc the thread is associated with. Defaults to `"file"`
   * (single .md / .html / .txt). For media templates the doc is a folder
   * containing meta.json + slide-*.html — set to `"template"` so the chat
   * sidebar renders a multi-slide preview instead of trying to fetch the
   * folder as a markdown file.
   */
  docKind?: "file" | "template";
}

/** Agent display config for message rendering */
export const MC_CHAT_AGENTS: Record<string, { emoji: string; label: string; color: string }> = {
  sancho: { emoji: "🤠", label: "Sancho", color: "#C45D35" },
  escudero: { emoji: "⚔️", label: "Escudero", color: "#22A06B" },
  rocinante: { emoji: "🐴", label: "Rocinante", color: "#3B9EBF" },
  cervantes: { emoji: "✒️", label: "Cervantes", color: "#9B59B6" },
  "maese-pedro": { emoji: "🎭", label: "Maese Pedro", color: "#D4548F" },
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
            deliverableFile: typeof task.deliverable_file === "string" ? task.deliverable_file : undefined,
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
            deliverableFile: typeof task.deliverable_file === "string" ? task.deliverable_file : undefined,
            }
          );
        }
      }
    }
  }
  return null;
}

export interface TaskIndexEntry {
  task: Record<string, unknown>;
  projectId: string;
  /** When present, the entry is for a ContentTask nested under `task` (which is the parent type=content task). */
  contentTask?: Record<string, unknown>;
}

/**
 * buildTaskIndex — Create a lookup map from threadId patterns → task+project.
 *
 * Called ONCE when projectsData loads. After that, any thread resolution
 * is O(1) — a map lookup, not a scan.
 *
 * Keys in the map:
 *   - `task:{taskId.lower}` and `task-{taskId.lower}` — for task threads
 *   - `content:{ctId.lower}` and `content-{ctId.lower}` — for ContentTask threads
 *   - `{pillar.lower}` — for pillar threads (e.g. "market-analysis")
 *   - `project:{projectId.lower}` and `project-{projectId.lower}` — for project threads
 */
export function buildTaskIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectsData: any[] | undefined,
): Map<string, TaskIndexEntry> {
  const index = new Map<string, TaskIndexEntry>();
  if (!projectsData) return index;

  for (const pw of projectsData) {
    const projectId = pw.project?.id || "";
    for (const task of pw.tasks || []) {
      const entry: TaskIndexEntry = { task, projectId };
      // Index by task ID (both formats)
      const id = (task.id || "").toLowerCase();
      index.set(`task:${id}`, entry);
      index.set(`task-${id}`, entry);
      // Index by pillar (if present)
      if (task.pillar) {
        const pl = task.pillar.toLowerCase();
        // Only set if not already taken (first task with this pillar wins)
        if (!index.has(pl)) index.set(pl, entry);
      }
      // Index nested ContentTasks (only for type=content parents)
      const cts = (task.content_tasks as Record<string, unknown>[] | undefined) || [];
      for (const ct of cts) {
        const ctEntry: TaskIndexEntry = { task, projectId, contentTask: ct };
        const ctId = ((ct.id as string) || "").toLowerCase();
        if (!ctId) continue;
        index.set(`content:${ctId}`, ctEntry);
        index.set(`content-${ctId}`, ctEntry);
      }
    }
  }
  return index;
}

/**
 * resolveFullThreadConfig — SINGLE SOURCE OF TRUTH for thread resolution.
 *
 * Given a threadId, resolves the COMPLETE ThreadConfig by:
 *   1. Looking up the task in the index (O(1) map lookup)
 *   2. Reading doc, skill, linkedTo directly from task fields
 *   3. NO scanning, NO path matching, NO heuristics
 *
 * If no task found, falls back to pillar/generic thread.
 */
export function resolveFullThreadConfig(
  slug: string,
  threadId: string,
  taskIndex: Map<string, TaskIndexEntry>,
  resolvePillarDoc?: (pillarKey: string) => string | null | undefined,
): ThreadConfig {
  const shortId = threadId.startsWith(slug + ":")
    ? threadId.slice(slug.length + 1)
    : threadId;

  // ── O(1) lookup: find the task that owns this thread ─────────
  const entry = taskIndex.get(shortId) ||
    // Also try suffix match for compound pillars (e.g. "content-system-seekers-content-strategy")
    (() => {
      for (const [key, val] of taskIndex) {
        if (shortId.endsWith(`-${key}`) || shortId.endsWith(`:${key}`)) return val;
      }
      return undefined;
    })();

  // ── ContentTask entry: build via buildContentTaskThread ──────
  if (entry?.contentTask) {
    const { task: parentTask, projectId, contentTask: ct } = entry;
    const docs = (ct.documents as { path: string }[] | undefined) || [];
    return buildContentTaskThread(
      slug,
      parentTask.id as string,
      ct.id as string,
      (ct.name as string) || (ct.id as string),
      projectId,
      {
        skill: ct.skill as string | undefined,
        status: ct.status as string | undefined,
        docPath: docs[0]?.path,
      },
    );
  }

  // ── Task found: read ALL data from task fields ───────────────
  if (entry) {
    const { task, projectId } = entry;
    const df = task.deliverable_file;
    const deliverableFile = typeof df === "string" ? df : Array.isArray(df) ? (df as string[])[0] : undefined;

    const config = buildTaskThread(
      slug,
      task.id as string,
      task.name as string || shortId,
      projectId,
      {
        taskSkill: task.skill as string | undefined,
        taskChannel: task.channel as string | undefined,
        taskStatus: task.status as string | undefined,
        taskType: task.type as string | undefined,
        pillar: task.pillar as string | undefined,
        deliverableFile,
      }
    );

    // Preserve the original threadId (legacy format compatibility)
    config.threadId = threadId;

    // docPath should already be set via buildTaskThread → deliverableFile.
    // Double-check and fallback to pillar doc if needed.
    if (!config.docPath && deliverableFile) {
      config.docPath = deliverableFile;
    }
    if (!config.docPath && task.pillar && resolvePillarDoc) {
      const dp = resolvePillarDoc(task.pillar as string);
      if (dp) config.docPath = dp;
    }
    if (config.docPath && /tasks\.json$/i.test(config.docPath)) {
      config.docPath = null;
    }

    return config;
  }

  // ── No task: handle project threads ──────────────────────────
  if (shortId.startsWith("project:") || shortId.startsWith("project-")) {
    const rawId = shortId.replace(/^project[-:]/, "").toUpperCase();
    return {
      threadId, threadName: rawId, skill: "sancho-manager",
      skills: ["sancho-manager"], linkedTo: `projects/${rawId}`,
      docPath: null, threadState: "continue",
    };
  }

  // ── No task: handle typed threads ────────────────────────────
  if (/^(competitor-scan|meta-ads-scan|linkedin-scan)$/i.test(shortId)) {
    return {
      threadId, threadName: shortId.replace(/-/g, " "), skill: "atalaya",
      skills: ["atalaya"], linkedTo: "tool/atalaya",
      docPath: null, threadState: "continue",
    };
  }
  if (/^(strategy|idea|recurring)[-:]/i.test(shortId)) {
    const m = shortId.match(/^([a-z]+)[-:](.+)$/i);
    if (m) {
      return {
        threadId, threadName: shortId.replace(/[-_:]/g, " "), skill: "sancho",
        skills: ["sancho"], linkedTo: `${m[1]}/${m[2]}`,
        docPath: null, threadState: "continue",
      };
    }
  }

  // ── No task, no type: pillar fallback ────────────────────────
  const pillarDoc = resolvePillarDoc?.(shortId) || undefined;
  return buildPillarThread(slug, shortId, pillarDoc);
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
  opts: {
    taskSkill?: string; taskChannel?: string; taskStatus?: string;
    taskType?: string; pillar?: string;
    agent?: string;
    skills?: string[];
    inputDocuments?: unknown[];
    requiredInputs?: unknown[];
    outputDocuments?: unknown[];
    dependsOn?: string[];
    /** Pass the task's deliverable_file so the doc pill shows the right doc */
    deliverableFile?: string;
  }
): ThreadConfig {
  // If the task is linked to a foundation pillar, reuse the pillar thread
  // so all entry points (brand column, foundation page, project tasks, etc.)
  // converge to the same thread.
  if (opts.pillar) {
    const config = buildPillarThread(slug, opts.pillar, opts.deliverableFile);
    // Override skill if the task has an explicit one and the pillar
    // resolution fell back to sancho-manager.
    if (opts.taskSkill && config.skill === "sancho-manager") {
      config.skill = opts.taskSkill;
      config.skills = opts.skills?.length ? opts.skills : [opts.taskSkill];
    }
    if (opts.agent) config.agent = opts.agent;
    config.inputDocuments = opts.inputDocuments;
    config.requiredInputs = opts.requiredInputs;
    config.outputDocuments = opts.outputDocuments;
    config.dependsOn = opts.dependsOn;
    // Ensure linkedTo points to the actual task for navigation
    config.linkedTo = `projects/${projectId}/tasks/${taskId}`;
    return config;
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
    skill: opts.taskSkill || resolved.skill,
    skills: opts.skills?.length ? opts.skills : resolved.skills,
    linkedTo: `projects/${projectId}/tasks/${taskId}`,
    docPath: opts.deliverableFile || `projects/${projectId}/tasks.json`,
    threadState: opts.taskStatus === "ready" || opts.taskStatus === "pending" ? "create" : "continue",
    agent: opts.agent || resolved.agent,
    inputDocuments: opts.inputDocuments,
    requiredInputs: opts.requiredInputs,
    outputDocuments: opts.outputDocuments,
    dependsOn: opts.dependsOn,
  };
}

/** Build thread config for a ContentTask (sub-task under a parent type=content task). */
export function buildContentTaskThread(
  slug: string,
  parentTaskId: string,
  contentTaskId: string,
  contentTaskName: string,
  projectId: string,
  opts: {
    skill?: string;
    status?: string;
    agent?: string;
    skills?: string[];
    inputDocuments?: unknown[];
    requiredInputs?: unknown[];
    outputDocuments?: unknown[];
    dependsOn?: string[];
    /** First/primary document path for the doc pill */
    docPath?: string;
  }
): ThreadConfig {
  const threadId = `${slug}:content:${contentTaskId.toLowerCase()}`;
  const skill = opts.skill || "escudero-content";

  return {
    threadId,
    threadName: contentTaskName,
    skill,
    skills: opts.skills?.length ? opts.skills : [skill],
    linkedTo: `projects/${projectId}/tasks/${parentTaskId}/content/${contentTaskId}`,
    docPath: opts.docPath || `projects/${projectId}/tasks.json`,
    threadState: opts.status === "Approved" || opts.status === "New" ? "create" : "continue",
    agent: opts.agent || "dulcinea",
    inputDocuments: opts.inputDocuments,
    requiredInputs: opts.requiredInputs,
    outputDocuments: opts.outputDocuments,
    dependsOn: opts.dependsOn,
  };
}

/** Build thread config for a project */
export function buildProjectThread(
  slug: string,
  projectId: string,
  projectName: string,
  opts: {
    strategy?: string;
    status?: string;
    agent?: string;
    skills?: string[];
    inputDocuments?: unknown[];
    requiredInputs?: unknown[];
    outputDocuments?: unknown[];
    dependsOn?: string[];
  }
): ThreadConfig {
  const threadId = `${slug}:project:${projectId.toLowerCase()}`;
  const strategySkills = resolveThreadSkills({ slug, strategy: opts.strategy });

  return {
    threadId,
    threadName: projectName,
    skill: "sancho-manager",
    skills: opts.skills?.length ? opts.skills : ["sancho-manager", ...strategySkills.skills],
    linkedTo: `projects/${projectId}`,
    docPath: Array.isArray(opts.outputDocuments) && (opts.outputDocuments[0] as { path?: string } | undefined)?.path
      ? (opts.outputDocuments[0] as { path: string }).path
      : `projects/${projectId}/project.json`,
    threadState: opts.status === "proposed" || opts.status === "pending" ? "create" : "continue",
    agent: opts.agent || "sancho",
    inputDocuments: opts.inputDocuments,
    requiredInputs: opts.requiredInputs,
    outputDocuments: opts.outputDocuments,
    dependsOn: opts.dependsOn,
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
    linkedTo: `brand-brain/${pillarKey}`,
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

// ============================================================
// Media Creation — chats con Maese Pedro
// ============================================================

/** Build thread config for Maese Pedro on a specific brand asset (file or directory). */
export function buildMediaAssetThread(
  slug: string,
  assetRelativePath: string,
  assetName: string,
  kind: "template" | "mockup" | "logo" | "style-reference" | "export" | "design-md" | "tokens" | "preview" | "misc",
): ThreadConfig {
  // Sanitize for thread id
  const safe = assetRelativePath.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const threadId = `${slug}:asset:${safe}`;
  const skill = kind === "design-md" || kind === "tokens" ? "design-system" : "od-refine";
  return {
    threadId,
    threadName: `🎨 ${assetName}`,
    skill,
    skills: [skill, "od-generate", "od-export"],
    linkedTo: `media-creation/asset/${assetRelativePath}`,
    docPath: `brand/${slug}/${assetRelativePath}`,
    docKind: kind === "template" ? "template" : "file",
    threadState: "continue",
    agent: "maese-pedro",
    initialMessage: `Estoy mirando el asset "${assetName}" (\`${assetRelativePath}\`, kind=${kind}). Dame un resumen y las opciones de refinamiento.`,
  };
}

/** Build thread config for chatting with Maese Pedro about Visual Identity (whole brand DESIGN.md). */
export function buildVisualIdentityChatThread(
  slug: string,
  block?: string,
): ThreadConfig {
  const blockSafe = block ? block.toLowerCase().replace(/[^a-z0-9-]+/g, "-") : "all";
  const threadId = `${slug}:visual-identity:${blockSafe}`;
  return {
    threadId,
    threadName: block ? `🎨 Visual Identity — ${block}` : "🎨 Visual Identity",
    skill: "design-system",
    skills: ["design-system", "od-generate"],
    linkedTo: `media-creation/visual-identity/${blockSafe}`,
    docPath: `brand/${slug}/brand-book/visual-identity/DESIGN.md`,
    threadState: "continue",
    agent: "maese-pedro",
    initialMessage: block
      ? `Quiero ajustar la sección "${block}" del Visual Identity. ¿Qué opciones tengo?`
      : "Hablemos del Visual Identity del brand. ¿Por dónde empezamos?",
  };
}

/** Build thread config for "use OD upstream skill on this brand" — generation request. */
export function buildOdGenerateThread(
  slug: string,
  upstreamSkillId: string,
  upstreamSkillName: string,
  designSystemId?: string,
): ThreadConfig {
  const safe = upstreamSkillId.toLowerCase().replace(/[^a-z0-9-:]+/g, "-");
  const dsTag = designSystemId ? `:ds-${designSystemId}` : "";
  const threadId = `${slug}:od-generate:${safe}${dsTag}:${Date.now()}`;
  return {
    threadId,
    threadName: `🎨 ${upstreamSkillName}${designSystemId ? ` × ${designSystemId}` : ""}`,
    skill: "od-generate",
    skills: ["od-generate", "od-refine", "od-export"],
    linkedTo: `media-creation/od/${upstreamSkillId}`,
    docPath: null,
    threadState: "create",
    agent: "maese-pedro",
    initialMessage: `Genera un asset usando la skill upstream "${upstreamSkillId}"${
      designSystemId ? ` aplicando el design system "${designSystemId}"` : " con el DESIGN.md del brand"
    }. Pídeme los inputs que necesites antes de empezar.`,
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
