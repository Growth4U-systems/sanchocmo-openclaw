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
// Non-foundation entities (calendar items, ideas, crons) may use
// their own namespace because they don't map to a pillar — those
// are documented case-by-case.
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
import {
  getNamespaceOwner,
  getThreadOpener,
  NAMESPACE_OWNERS_BY_SPECIFICITY,
  type NamespaceOwner,
} from "./data/task-blueprints";

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
  /** Optional suggested prompts shown in an empty thread. */
  quickActions?: Array<{ label: string; prompt: string }>;
  /**
   * When set, forces the gateway to dispatch this thread to a specific agent
   * (e.g. `"maese-pedro"` for Media Creation skills) instead of falling back
   * to the default agent (Sancho). The gateway's mc-chat plugin must honor
   * this field — see send.ts where it's forwarded.
   */
  agent?: string;
  /**
   * Thread scope (SAN-327). `"agent"` marks a broad thread where the owning
   * agent may use ANY of its own skills (the seed `skill` is just a starting
   * point). Absent/`"skill"` keeps the narrow single-skill behavior. Declared
   * in the manifest namespace entry and forwarded to the gateway via send.ts.
   */
  scope?: "agent" | "skill";
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
  dulcinea: { emoji: "✍️", label: "Dulcinea", color: "#E11D74" },
  hamete: { emoji: "📜", label: "Hamete", color: "#A16207" },
  rocinante: { emoji: "🐴", label: "Rocinante", color: "#3B9EBF" },
  cervantes: { emoji: "✒️", label: "Cervantes", color: "#9B59B6" },
  "maese-pedro": { emoji: "🎭", label: "Maese Pedro", color: "#D4548F" },
  alarife: { emoji: "🧱", label: "Alarife", color: "#7C6D3E" },
  mambrino: { emoji: "🪖", label: "Mambrino", color: "#C2410C" },
  merlin: { emoji: "🔮", label: "Merlín", color: "#4F46E5" },
  sanson: { emoji: "🛡️", label: "Sansón", color: "#047857" },
  // legacy shim: old yalc threads display as Rocinante (merged SAN-116)
  yalc: { emoji: "🐴", label: "Rocinante", color: "#3B9EBF" },
  // legacy shim: old threads with agent="escudero" display as Dulcinea
  escudero: { emoji: "✍️", label: "Dulcinea", color: "#E11D74" },
};

/** Substitute `{slug}` + per-button `{param}` tokens in a chat-entry template.
 *  Unknown tokens (e.g. `{{handle}}` placeholders in prose) are left intact. */
function substEntryTemplate(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/**
 * Build a ThreadConfig from a declared OPENER namespace
 * (config/pillar-manifest.json → namespaceOwners, entries with a `threadId`).
 * Substitutes {slug} + params into the entry's templates. The single generic
 * opener that the `buildXThread` wrappers delegate to — skill/skills/agent/
 * initialMessage are DECLARED, not hardcoded. (SAN-205; replaces the old
 * instantiateEntry over the chatEntries block.)
 */
export function instantiateNamespace(key: string, ctx: { slug: string; params?: Record<string, string> }): ThreadConfig {
  const entry = getNamespaceOwner(key);
  if (!entry) throw new Error(`chat-openers: unknown namespace "${key}"`);
  if (!entry.threadId || !entry.threadName || !entry.linkedTo) {
    throw new Error(`chat-openers: namespace "${key}" is reopen-only (no opener template)`);
  }
  const vars: Record<string, string> = { slug: ctx.slug, ...(ctx.params ?? {}) };
  const sub = (s: string) => substEntryTemplate(s, vars);
  const cfg: ThreadConfig = {
    threadId: sub(entry.threadId),
    threadName: sub(entry.threadName),
    skill: entry.skill,
    skills: entry.skills,
    agent: entry.agent,
    linkedTo: sub(entry.linkedTo),
    docPath: entry.docPath != null ? sub(entry.docPath) : null,
    threadState: entry.threadState,
  };
  if (entry.initialMessage) cfg.initialMessage = sub(entry.initialMessage);
  if (entry.quickActions) {
    cfg.quickActions = entry.quickActions.map((action) => ({
      label: sub(action.label),
      prompt: sub(action.prompt),
    }));
  }
  if (entry.docKind) cfg.docKind = entry.docKind;
  if (entry.scope) cfg.scope = entry.scope;
  return cfg;
}

/**
 * Resolve a declared opener (threadOpeners in the manifest) for a thread whose
 * identity is built by the caller. Substitutes {slug}+{params}; returns
 * undefined if the key isn't declared. SAN-179.
 */
export function resolveOpener(key: string, vars: Record<string, string>): string | undefined {
  const tpl = getThreadOpener(key);
  return tpl ? substEntryTemplate(tpl, vars) : undefined;
}

export function buildYalcThread(slug: string, prompt?: string): ThreadConfig {
  const cfg = instantiateNamespace("yalc", { slug });
  cfg.initialMessage = prompt;
  return cfg;
}

export function buildB2BCampaignThread(slug: string): ThreadConfig {
  const cfg = instantiateNamespace("yalc", { slug });
  cfg.threadId = `${slug}:b2b-campaign-new-${Date.now()}`;
  cfg.threadName = "Nueva campaña B2B";
  cfg.threadState = "create";
  cfg.initialMessage = undefined;
  cfg.quickActions = [
    {
      label: "Crear campaña",
      prompt:
        "Quiero crear una campaña outbound B2B. Usa el contexto de mi empresa para recomendar el mejor ICP, crear la campaña, buscar y enriquecer personas, y preparar mensajes con la mejor personalización verificable disponible. No envíes nada real hasta que yo apruebe el lote.",
    },
    {
      label: "Encontrar personas",
      prompt:
        "Recomiéndame a quién contactar según mi ICP y crea una base de personas. Busca y enriquece los contactos, prioriza los que tengan mejor encaje y deja una muestra de mensajes preparada para revisar.",
    },
  ];
  return cfg;
}

/**
 * Build a fresh "Nueva tarea" thread — a blank chat with Sancho (manager),
 * ready for the user to describe a new task. No initialMessage → nothing is
 * auto-sent; the input opens empty. A new id per call so each "Nueva tarea"
 * is its own conversation. Declared in namespaceOwners.new-task.
 */
export function buildNewTaskThread(slug: string): ThreadConfig {
  return instantiateNamespace("new-task", { slug, params: { nonce: String(Date.now()) } });
}

/**
 * Partnerships (SAN-78) — "Crear nueva búsqueda" de creators abre el chat
 * global con el plan de discovery. La skill `discovery-plan-builder` la
 * construye SAN-79; mientras llega, Rocinante (agente owner de Outreach,
 * SAN-116) atiende el hilo con sus skills de outreach.
 *
 * - Sin búsqueda: hilo nuevo por click (cada click = un chat nuevo con Rocinante).
 * - Con búsqueda: si trae `threadId` persistido (SAN-328), retoma ESE hilo
 *   (la sesión donde se construyó el plan); si no, hilo estable por campaña.
 */
export function buildDiscoverySearchThread(
  slug: string,
  search?: { campaignId: string; title?: string; threadId?: string | null },
): ThreadConfig {
  // Existing search: registry holds skill/agent/doc + opener; threadName is the
  // only field that's title-conditional, so it's overlaid here.
  if (search) {
    const searchName = search.title || search.campaignId;
    const cfg = instantiateNamespace("discovery-search", {
      slug,
      params: {
        campaignIdLower: search.campaignId.toLowerCase(),
        campaignId: search.campaignId,
        searchName,
      },
    });
    cfg.threadName = search.title ? `Búsqueda: ${search.title}` : "Búsqueda de creators";
    // SAN-328: si la búsqueda guardó el hilo donde se construyó el plan, reabre
    // ESE hilo (resume con su historial) en vez del hilo derivado del campaignId
    // — que estaría vacío y dispararía el initialMessage "Repasemos y lancemos…",
    // haciendo al agente re-derivar el plan (el "se repite" que reportó el user).
    if (search.threadId) {
      cfg.threadId = search.threadId;
      cfg.initialMessage = undefined;
    }
    return cfg;
  }

  // New search: a fresh thread id each time (Date.now is runtime-only).
  // Dash-shaped (`discovery-new-<ts>`, no inner colon) so the client id matches
  // what mc-chat.threadFile() persists after sanitizing `:` → `-` — otherwise
  // useThreadList's exact-id dedup misses and paints a phantom row (SAN-193).
  const cfg = instantiateNamespace("discovery-search-new", { slug });
  cfg.threadId = `${slug}:discovery-new-${Date.now()}`;
  cfg.threadName = "Nueva campaña Partnerships";
  cfg.quickActions = [
    {
      label: "Crear campaña creator",
      prompt:
        "Quiero crear una nueva campaña de Partnerships/creators. Ayúdame a definir target de creators, redes, tiers, criterios positivos/negativos, brief y secuencia de contacto.",
    },
    {
      label: "Definir audiencia",
      prompt:
        "Quiero definir la audiencia de una campaña creator: nichos, plataformas, países, tamaños de audiencia, señales de calidad y exclusiones.",
    },
    {
      label: "Crear brief",
      prompt:
        "Quiero crear el brief y la secuencia de contacto para una campaña de Partnerships/creators.",
    },
  ];
  return cfg;
}

/**
 * Plantillas de Outreach·Partnerships (SAN-80) — 💬 "Chat con Sancho" de cada
 * plantilla (secuencia o brief). Hilo estable por plantilla, atendido por
 * Rocinante (agente owner de Outreach) con la skill de secuencias; el doc
 * anclado es el .md de la plantilla (mismo fichero que ⬇️/📄).
 */
export function buildOutreachTemplateThread(
  slug: string,
  template: { id: string; name: string; kind?: "sequence" | "brief" },
): ThreadConfig {
  const kindLabel = template.kind === "brief" ? "brief" : "secuencia";
  return instantiateNamespace("outreach-template", {
    slug,
    params: { id: template.id, idLower: template.id.toLowerCase(), name: template.name, kindLabel },
  });
}

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
  // different surfaces use different conventions. A `.md` and its
  // HTML-canonical sibling `.html` (SAN-149) count as the SAME doc, so
  // opening either file converges on the task thread that owns the pair.
  const variants = new Set<string>();
  const addVariants = (p: string) => {
    const norm = p.replace(/^\/+/, "");
    variants.add(norm);
    variants.add(
      norm.startsWith(`brand/${slug}/`) ? norm.slice(`brand/${slug}/`.length) : norm
    );
    variants.add(norm.startsWith("brand/") ? norm : `brand/${slug}/${norm}`);
  };
  addVariants(docPath);
  if (/\.md$/i.test(docPath)) addVariants(docPath.replace(/\.md$/i, ".html"));
  if (/\.html$/i.test(docPath)) addVariants(docPath.replace(/\.html$/i, ".md"));

  const matches = (candidate: unknown): boolean => {
    if (!candidate) return false;
    if (typeof candidate === "string") {
      return variants.has(candidate.replace(/^\/+/, ""));
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
/**
 * Match a thread's shortId against the declared namespace registry
 * (config/pillar-manifest.json → namespaceOwners). Longest nsKey wins, so
 * `skill-creator` beats `skill`. Returns the owning entry + the captured `rest`
 * (the part after `nsKey:`/`nsKey-`), or undefined when no namespace claims it.
 */
function matchNamespaceOwner(shortId: string): { owner: NamespaceOwner; rest: string } | undefined {
  for (const owner of NAMESPACE_OWNERS_BY_SPECIFICITY) {
    if (owner.match === "exact") {
      if (shortId === owner.nsKey) return { owner, rest: "" };
      continue;
    }
    if (shortId.startsWith(`${owner.nsKey}:`) || shortId.startsWith(`${owner.nsKey}-`)) {
      return { owner, rest: shortId.slice(owner.nsKey.length + 1) };
    }
  }
  return undefined;
}

/**
 * Rebuild a ThreadConfig when REOPENING a namespace thread from the thread list
 * (only the threadId is known — no params). Owner agent/skill come from the
 * matched namespace entry; threadName is the entry's static template when it has
 * no leftover tokens (e.g. "YALC / GTM-OS"), else derived from the shortId;
 * linkedTo from `reopenLinkedTo` ({rest}/{restUpper}); state forced to continue.
 */
function reopenFromNamespace(
  threadId: string,
  shortId: string,
  owner: NamespaceOwner,
  rest: string,
): ThreadConfig {
  const restUpper = rest.toUpperCase();
  const subRest = (s: string) => s.replace(/\{rest\}/g, rest).replace(/\{restUpper\}/g, restUpper);

  let threadName: string;
  if (owner.reopenName === "restUpper") {
    threadName = restUpper;
  } else if (owner.threadName && !owner.threadName.replace(/\{slug\}/g, "").includes("{")) {
    // Static name (no per-call tokens left once {slug} is stripped) → keep it.
    threadName = owner.threadName;
  } else {
    threadName = shortId.replace(/[-_:]/g, " ");
  }

  return {
    threadId,
    threadName,
    skill: owner.skill,
    skills: owner.skills,
    agent: owner.agent,
    linkedTo: subRest(owner.reopenLinkedTo),
    docPath: null,
    threadState: "continue",
  };
}

/**
 * resolveFullThreadConfig — SINGLE SOURCE OF TRUTH for thread resolution.
 *
 * Given a threadId, resolves the COMPLETE ThreadConfig by:
 *   1. Looking up the task in the index (O(1) map lookup)
 *   2. Reading doc, skill, linkedTo directly from task fields
 *   3. NO scanning, NO path matching, NO heuristics
 *
 * If no task found, falls back to the declared namespace owner, then pillar.
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

  // ── No task: data-driven namespace owner (SAN-205) ───────────
  // Every non-task namespace (project, content/idea/calendar/cron, discovery,
  // scans, strategy/recurring, plus the button namespaces yalc/new-task/skill/
  // asset/…) is declared once in config/pillar-manifest.json → namespaceOwners.
  // Matching the shortId against that registry rebuilds the owning agent+skill
  // so reopening a thread NEVER falls back to Sancho (the SAN-166/SAN-193 class
  // of bug) and the open/reopen paths share one source of truth.
  const ns = matchNamespaceOwner(shortId);
  if (ns) return reopenFromNamespace(threadId, shortId, ns.owner, ns.rest);

  // ── No task, no namespace: pillar fallback ───────────────────
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
    initialMessage: opts.taskSkill === "meeting-intelligence" && taskName.toLowerCase().includes("configurar")
      ? resolveOpener("meeting-intelligence-setup", { slug })
      : undefined,
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
  const skill = opts.skill || "social-writer";

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

/**
 * Hardcoded pillar canonical fallback (overridden by chat-config.json if available).
 *
 * Maps a pillarKey → the canonical PILLAR name used for the threadId and for
 * `resolveThreadSkills({ pillar })`. The value must be a *pillar* key, never a
 * skill name — buildPillarThread feeds it straight back to resolveThreadSkills
 * as the pillar.
 *
 * Empty since SAN-3 W4: the only entry existed because the Fast Foundation doc
 * lived in `fastcontext/` while the pillar was `company-brief`. W4 unified the
 * folder to `company-brief`, so the pillar key == its folder == its canonical
 * name; the `|| pillarKey` fallback in buildPillarThread now covers every pillar.
 * Do NOT re-add `company-brief → kickoff`: `kickoff` is the *skill*, and
 * resolving `{ pillar: "kickoff" }` falls through to sancho-manager — which
 * improvises a brief and never writes company-brief.current.md.
 */
const PILLAR_CANONICAL_FALLBACK: Record<string, string> = {};

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

  // Fallback: no pillar. This is the strategy-doc shape that lives outside
  // Foundation — e.g. per-channel strategy docs (`content-strategy` scoped to
  // a channel) produced by SetupTab.createChannelStrategy. Resolve the skill
  // and owner agent from `doc.skill`/`doc.channel` instead of hardcoding
  // Sancho: dropping `doc.skill` here sent every channel-strategy chat to
  // Sancho instead of Dulcinea (content-strategy's owner). When the doc has
  // no skill at all, resolveThreadSkills falls back to sancho-manager — the
  // previous behavior for genuinely generic docs.
  const rawDocPath = doc.docPath || doc.deliverable;
  const resolved = resolveThreadSkills({
    slug,
    taskSkill: doc.skill ?? undefined,
    channel: doc.channel ?? undefined,
  });
  const isPending =
    doc.status === "pending" || doc.status === "not-started" || doc.status === "todo";
  return {
    threadId: `${slug}:content:${docKey}`,
    threadName: (doc.name || docKey).replace(/-/g, " "),
    skill: resolved.skill,
    skills: resolved.skills,
    agent: resolved.agent,
    linkedTo: `content-creation/${docKey}`,
    docPath: rawDocPath
      ? rawDocPath.startsWith("brand/")
        ? rawDocPath
        : `brand/${slug}/${rawDocPath}`
      : null,
    threadState: isPending ? "create" : "continue",
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
    // Propagate the owner agent (competitor/market/self-intelligence → hamete,
    // etc.) so the gateway dispatches this thread to the specialist that runs
    // the skill instead of falling back to the default agent (Sancho), which
    // would improvise. resolveThreadSkills() already enriches `agent` via
    // SKILL_OWNER_MAP; dropping it here was the regression that sent every
    // doc/pillar chat to Sancho. undefined → default agent (correct for
    // Sancho-owned pillars).
    agent: resolved.agent,
    linkedTo: `brand-brain/${pillarKey}`,
    docPath: docPath || pillarCfg?.docPath || null,
    threadState: "continue",
  };
}

/**
 * Fresh Merlín thread for an on-demand "edit metrics with Merlin" action
 * (Métricas v2 PR-5b). A new dash-shaped id per click — like discovery-new — so
 * the contextual prompt ALWAYS auto-sends; the stable `metrics-setup` pillar
 * thread swallows `initialMessage` once it has history. Skill/owner-agent resolve
 * from the metrics-setup pillar (Merlín), so the edit lands with the right agent.
 */
export function buildMetricsEditThread(slug: string, message: string): ThreadConfig {
  // Declared namespace owner (config/pillar-manifest.json → namespaceOwners.metrics-edit,
  // agent merlin) so REOPENING a metrics-edit-<ts> thread resolves back to Merlín
  // instead of falling through to Sancho; a fresh dash-shaped id per click keeps the
  // contextual prompt auto-sending.
  const cfg = instantiateNamespace("metrics-edit", { slug });
  cfg.threadId = `${slug}:metrics-edit-${Date.now()}`;
  cfg.initialMessage = message;
  return cfg;
}

/** Build thread config for creating a new skill via chat */
export function buildSkillCreatorThread(slug: string): ThreadConfig {
  return instantiateNamespace("skill-creator", { slug, params: { nonce: String(Date.now()) } });
}

/** Build thread config for editing an existing skill via chat */
export function buildSkillEditorThread(
  slug: string,
  skillId: string,
  skillName: string,
  docPath?: string
): ThreadConfig {
  const cfg = instantiateNamespace("skill-editor", { slug, params: { skillId, skillName } });
  cfg.docPath = docPath || null;
  return cfg;
}

/**
 * Build the thread that asks the agent to convert a markdown doc into its
 * HTML-canonical sibling via the `html-output` skill (SAN-149).
 *
 * Reuses the convergence rule: if a task owns the doc, the conversion runs
 * in the task's thread; otherwise a doc thread is created. The skill is
 * forced to html-output for this message, but the conversion is done by
 * the doc's AUTHOR agent (the one the task/pillar thread resolved) — same
 * principle as the review-comments loop (SAN-148): whoever wrote the doc
 * owns its revisions. maese-pedro (skill owner) is only the fallback when
 * no task/pillar claims the doc.
 */
export function buildHtmlConversionThread(
  slug: string,
  docPath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectsData: any[] | undefined
): ThreadConfig {
  const normalizedDocPath = docPath.startsWith("brand/")
    ? docPath
    : `brand/${slug}/${docPath.replace(/^\/+/, "")}`;
  const docKey = normalizedDocPath
    .split("/")
    .slice(2)
    .join("/")
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  const base =
    findTaskThreadForDoc(slug, normalizedDocPath, projectsData) ??
    buildDocThread(slug, { key: `html-${docKey}`, docPath: normalizedDocPath });

  return {
    ...base,
    skill: "html-output",
    skills: ["html-output", ...base.skills.filter((s) => s !== "html-output")],
    agent: base.agent || "maese-pedro",
    docPath: normalizedDocPath,
    initialMessage: resolveOpener("html-conversion", { slug, docPath: normalizedDocPath }),
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
  // Declaration (skill/agent/templates) from the registry; the kind→skill and
  // sanitization are computed here and overlaid.
  const safe = assetRelativePath.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const skill = kind === "design-md" || kind === "tokens" ? "design-system" : "od-refine";
  const cfg = instantiateNamespace("media-asset", { slug, params: { safe, assetRelativePath, assetName, kind } });
  cfg.skill = skill;
  cfg.skills = [skill, "od-generate", "od-export"];
  cfg.docKind = kind === "template" ? "template" : "file";
  return cfg;
}

/** Build thread config for chatting with Maese Pedro about Visual Identity (whole brand DESIGN.md). */
export function buildVisualIdentityChatThread(
  slug: string,
  block?: string,
): ThreadConfig {
  const blockSafe = block ? block.toLowerCase().replace(/[^a-z0-9-]+/g, "-") : "all";
  const cfg = instantiateNamespace("visual-identity", { slug, params: { blockSafe } });
  // The entry holds the no-block defaults (threadName + opener). Only override
  // for a specific block; the block opener lives in threadOpeners.
  if (block) {
    cfg.threadName = `🎨 Visual Identity — ${block}`;
    cfg.initialMessage = resolveOpener("visual-identity-block", { block });
  }
  return cfg;
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
  const cfg = instantiateNamespace("od-generate", {
    slug,
    params: { safe, dsTag, upstreamSkillId, upstreamSkillName },
  });
  // Runtime-only overlays: unique id per request, ds-conditional name + opener.
  cfg.threadId = `${cfg.threadId}:${Date.now()}`;
  cfg.threadName = `🎨 ${upstreamSkillName}${designSystemId ? ` × ${designSystemId}` : ""}`;
  if (designSystemId) {
    cfg.initialMessage = resolveOpener("od-generate-ds", { upstreamSkillName, designSystemId });
  }
  return cfg;
}

/**
 * Generate the initial auto-prompt message for a new thread.
 * Sent automatically when opening a thread that has no messages yet.
 */
export function getAutoPrompt(config: ThreadConfig): string {
  // If the caller provided an explicit initial message, use it
  if (config.initialMessage) return config.initialMessage;

  if (config.threadState === "create") {
    const framing =
      config.scope === "agent"
        ? `Para empezar, usa el skill ${config.skill} — es el punto de partida; si necesitas otra de tu dominio en este mismo hilo, úsala.`
        : `Usa el skill ${config.skill} para generar el documento.`;
    return `Quiero crear "${config.threadName}". ${framing}`;
  }
  if (config.threadState === "continue") {
    return `Estoy abriendo el chat sobre "${config.threadName}". Dame un resumen rápido del estado actual y qué podemos hacer. Si necesitas algo de mí, dímelo.`;
  }
  return `Chat sobre "${config.threadName}". ¿Qué necesitas?`;
}
