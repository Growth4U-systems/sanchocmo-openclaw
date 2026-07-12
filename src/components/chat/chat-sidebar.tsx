"use client";

import { useRef, useEffect, useState, useCallback, useMemo, type KeyboardEvent, type DragEvent, type ClipboardEvent } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleEllipsis, ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat";
import { useAppStore } from "@/stores/app";
import {
  useThreadMessages,
  useThreadList,
  useSendMessage,
  useCancelMessage,
  useMarkThreadRead,
} from "@/hooks/useChat";
import {
  threadIcon,
  buildPillarThread,
  buildTaskThread,
  buildProjectThread,
  buildNewTaskThread,
  resolveFullThreadConfig,
  buildTaskIndex,
} from "@/lib/chat-openers";
import { useQuickActions } from "@/hooks/useChat";
import { useRetriggerWriter } from "@/hooks/useContentTasks";
import { ThreadListPanel } from "./thread-list-panel";
import { AskQuestionGroup, parseMessageSegments } from "./ask-question";
import { ProgressTimeline } from "./progress-timeline";
import { ChatMarkdown } from "./chat-markdown";
import { groupChatMessages, stripAskProtocol } from "@/lib/chat-tool-echo";
import { collapseExecutionOutcomes } from "@/lib/chat-execution-outcomes";
import { formatElapsed } from "@/lib/format-elapsed";
import type { ProgressEvent } from "@/hooks/useChat";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { MediaAssetSlideover } from "@/components/media-creation/MediaAssetSlideover";
import { ErrorDetailModal } from "./error-detail-modal";
import type { ErrorDetail } from "@/hooks/useChat";
import { useBrandAssets, type BrandAsset } from "@/hooks/useBrandAssets";
import { useBrandBrain } from "@/hooks/useBrandBrain";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateTaskStatus } from "@/hooks/useTasks";
import { resolvePillarDocPath } from "@/lib/pillar-doc-paths";
import { formatThreadDisplayName } from "@/lib/thread-display-name";
import { StatusPill } from "@/components/shared/status-pill";
import { TASK_STATUS_OPTIONS, normalizeTaskStatusQuiet, statusDot, statusLabel } from "@/lib/task-status";

// ---------------------------------------------------------------------------
// Agent badge config
// ---------------------------------------------------------------------------

const AGENT_BADGES: Record<string, { emoji: string; label: string; color: string }> = {
  sancho:        { emoji: "🤠", label: "Sancho",      color: "bg-rust" },
  cervantes:     { emoji: "✒️",  label: "Cervantes",   color: "bg-purple-600" },
  hamete:        { emoji: "📜", label: "Hamete",      color: "bg-amber-700" },
  dulcinea:      { emoji: "✍️",  label: "Dulcinea",    color: "bg-rose-500" },
  rocinante:     { emoji: "🐴", label: "Rocinante",   color: "bg-cyan-600" },
  "maese-pedro": { emoji: "🎭", label: "Maese Pedro", color: "bg-pink-600" },
  alarife:       { emoji: "🧱", label: "Alarife",     color: "bg-amber-800" },
  mambrino:      { emoji: "🪖", label: "Mambrino",    color: "bg-orange-700" },
  merlin:        { emoji: "🔮", label: "Merlín",      color: "bg-indigo-600" },
  sanson:        { emoji: "🛡️", label: "Sansón",      color: "bg-emerald-700" },
  yalc:          { emoji: "🐴", label: "Rocinante",   color: "bg-cyan-600" }, // legacy shim: old yalc threads display as Rocinante (merged SAN-116)
  escudero:      { emoji: "✍️",  label: "Dulcinea",    color: "bg-rose-500" }, // legacy shim: old threads with agent="escudero" display as Dulcinea
};

function agentBadge(agent?: string) {
  return AGENT_BADGES[agent ?? "sancho"] ?? AGENT_BADGES.sancho;
}

function executionErrorCopy(category: ErrorDetail["category"]): { title: string; body: string } {
  if (category === "cost_guard" || category === "context_overflow") {
    return {
      title: "La ejecución se detuvo antes de terminar",
      body: "Puedes continuar desde aquí. No hace falta abrir otro chat ni reducir tu petición.",
    };
  }
  if (category === "network" || category === "model_unavailable" || category === "rate_limit") {
    return {
      title: "No pudimos completar esta ejecución",
      body: "El servicio tuvo un problema temporal. Puedes continuar desde este mismo chat.",
    };
  }
  return {
    title: "No pudimos completar esta ejecución",
    body: "Puedes continuar desde este mismo chat.",
  };
}

// ---------------------------------------------------------------------------
// Doc name prettifier — turns a workspace path into a human label
// ---------------------------------------------------------------------------

/** Acronyms we preserve in uppercase when they appear as whole words. */
const DOC_NAME_ACRONYMS = new Set([
  "ecp", "ecps", "icp", "icps", "seo", "sem", "crm", "kpi", "kpis",
  "roi", "roas", "ctr", "cpa", "cpc", "cpm", "tam", "sam", "som",
  "ai", "ml", "llm", "api", "apis", "ui", "ux", "b2b", "b2c",
  "ope", "swot", "tows", "usp", "cro", "bofu", "mofu", "tofu",
]);

function titleCaseWord(word: string): string {
  if (!word) return word;
  if (DOC_NAME_ACRONYMS.has(word.toLowerCase())) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Transform a workspace doc path into a readable label.
 *
 *   market-and-us/competitors/competitive-analysis.current.md
 *     → "Competitive Analysis"
 *
 *   go-to-market/ecps/ecps.current.md
 *     → "ECPs"
 *
 *   brand-book/brand-voice/brand-voice.current.md
 *     → "Brand Voice"
 *
 *   some/path/current.md  (generic filename)
 *     → "Path"  (uses parent folder)
 */
function readableDocName(docPath: string): string {
  const parts = docPath.split("/").filter(Boolean);
  let file = parts.pop() || docPath;
  // Strip known extensions
  file = file.replace(/\.(md|html|json|txt|yaml|yml)$/i, "");
  // Strip `.current` suffix
  file = file.replace(/\.current$/i, "");
  // If the result is a generic filename, use the parent folder instead
  if (
    !file ||
    /^(current|index|readme)$/i.test(file) ||
    ["SKILL", "SOUL", "IDENTITY"].includes(file)
  ) {
    file = parts.pop() || file;
  }
  // Normalize separators and title-case each word
  return file
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ");
}

// ---------------------------------------------------------------------------
// OpenerNote — the auto-sent kickoff prompt, rendered discreetly
// ---------------------------------------------------------------------------

/**
 * The thread opener (`meta.initialMessage`) is auto-sent on the user's behalf
 * to seed the agent with context. Shown verbatim it looked like a giant prompt
 * the user supposedly typed — often long and technical. Here it collapses to a
 * single faint line; the full text stays one click away for transparency.
 */
function OpenerNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-center">
      <div className="max-w-[90%] w-full flex flex-col items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-[var(--chat-text-faint)] hover:text-[var(--chat-text-muted)] italic flex items-center gap-1 px-2 py-0.5"
        >
          <span>{open ? "▾" : "▸"}</span>
          <span>Sancho arrancó con el contexto inicial</span>
        </button>
        {open && (
          <div className="mt-1 w-full px-3 py-2 rounded-[10px] bg-[var(--chat-surface-2)] border border-[var(--chat-border)] text-[var(--chat-text-muted)] text-[13px]">
            <ChatMarkdown text={text} className="text-[13px]" />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatSidebar
// ---------------------------------------------------------------------------

export function ChatSidebar() {
  const t = useTranslations("chat");
  const {
    sidebarOpen,
    sidebarLocked,
    lockedThreadId,
    isFullscreen,
    currentThread,
    threadMeta,
    closeSidebar,
    toggleFullscreen,
    unlockSidebar,
    setCurrentThread,
    selectThread,
    isPolling,
  } = useChatStore();

  const { selectedClient, sidebarOpen: navExpanded } = useAppStore();
  const slug = selectedClient ?? "";

  // Reset chat state when client changes — avoid cross-client thread leaks
  useEffect(() => {
    if (!slug) return;
    // If locked to a thread from a different slug, close the sidebar
    if (sidebarLocked && lockedThreadId && !lockedThreadId.startsWith(slug + ":")) {
      closeSidebar();
      return;
    }
    // If free mode thread belongs to another slug, clear it
    if (currentThread && !currentThread.startsWith(slug + ":")) {
      setCurrentThread(null);
    }
  }, [slug, sidebarLocked, lockedThreadId, currentThread, closeSidebar, setCurrentThread]);

  // Thread list (free mode)
  const threadListQuery = useThreadList(slug);
  const threads = threadListQuery.data ?? [];

  // Determine active thread id
  const activeThreadId = sidebarLocked && lockedThreadId ? lockedThreadId : currentThread;

  // Active thread metadata (for the thread bar pill in free mode)
  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  // Foundation state + projects (for deriving ThreadConfig when the user
  // picks a thread from the panel). Both cached by React Query.
  const { data: foundationState } = useBrandBrain(slug || null);
  const { data: projectsData } = useProjects(slug || null);
  const queryClient = useQueryClient();

  /**
   * Lazy auto-sync of task attachments. Calls `POST /api/projects/task-attach-scan`
   * with the given taskId so the server scans the task's dirs and registers any
   * new files found on disk (e.g. a skill just finished writing an HTML output).
   * After the scan, invalidates the `projects` query so the sidebar re-renders
   * with the fresh attachments array. Safe to call any time — the endpoint
   * dedupes by path and only writes when something new was added.
   */
  const runAttachScan = useCallback(
    async (slugArg: string, taskId: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/projects/task-attach-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: slugArg, taskId }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data?.added?.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["projects", slugArg] });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [queryClient]
  );

  /**
   * Handle a thread click from the left ThreadListPanel.
   *
   * Derives a full ThreadConfig (including pillar/skill/docPath) from the
   * threadId so the doc+skill component in the thread bar renders the same
   * way regardless of how the user arrived at the thread.
   *
   * Thread id shapes handled:
   *   - `${slug}:${pillar}`                     — Foundation or Content pillar
   *   - `${slug}:task:${taskId}`                — project task
   *   - `${slug}:project:${projectId}`          — whole-project thread
   *   - `${slug}:strategy:${strategyId}`        — strategic plan item
   *   - `${slug}:idea:${ideaId}`                — idea bank entry
   *   - `${slug}:recurring:${recurringId}`      — recurring task
   *   - `${slug}:general`                       — general chat
   *
   * For pillar/task/project we build a full ThreadConfig via the canonical
   * builders (so skill, skills, linkedTo, threadName, docPath all flow
   * through). For idea/recurring/general we fall back to a minimal config
   * that at least has the right threadName + a placeholder skill.
   */
  // Task index: built ONCE from projectsData, enables O(1) thread lookups.
  const taskIndex = useMemo(() => buildTaskIndex(projectsData), [projectsData]);

  const handleSelectFromPanel = useCallback(
    (threadId: string) => {
      if (!slug) return;
      const config = resolveFullThreadConfig(
        slug, threadId, taskIndex,
        (pk) => resolvePillarDocPath(pk, foundationState as Parameters<typeof resolvePillarDocPath>[1]),
      );
      const persistedRouting = threads.find((thread) => thread.id === threadId)?.routing;
      if (persistedRouting) {
        config.agent = persistedRouting.agent ?? config.agent;
        config.scope = persistedRouting.scope
          ?? (persistedRouting.skillMode === "auto" ? "agent" : "skill");
        config.skill = persistedRouting.skillHint ?? config.skill;
        if (persistedRouting.availableSkills?.length) {
          config.skills = persistedRouting.availableSkills;
        }
      }
      selectThread(config);
    },
    [slug, foundationState, taskIndex, selectThread, threads]
  );

  // ── DEPRECATED: old handleSelectFromPanel body ──────────────
  // Kept temporarily for reference. Will be deleted after validation.
  const _oldHandleSelectFromPanel = useCallback(
    (threadId: string) => {
      if (!slug) return;

      const shortId = threadId.startsWith(slug + ":")
        ? threadId.slice(slug.length + 1)
        : threadId;
      const foundationLike = foundationState as Parameters<typeof resolvePillarDocPath>[1];

      // Try to get a displayable thread name from the cached thread list
      // (so we can populate meta even if projectsData hasn't loaded yet).
      const fromList = threads.find((t) => t.id === threadId);
      const fallbackName = fromList?.name || shortId.replace(/[-_:/]/g, " ");

      // Task threads come in two historical formats:
      //   - `task:${taskId}` (new convention, `buildTaskThread` output)
      //   - `task-${taskId}` (legacy, from chat/*.json filename convention)
      // We match BOTH by iterating projectsData and computing the expected
      // shortId in each format — first hit wins. Same logic for projects.

      // --- Project task thread ------------------------------------------
      if (shortId.startsWith("task:") || shortId.startsWith("task-")) {
        let foundTask: import("@/types").Task | undefined;
        let foundProjectId = "";
        for (const pw of projectsData || []) {
          const match = pw.tasks.find((t) => {
            const colonShape = `task:${t.id.toLowerCase()}`;
            const dashShape = `task-${t.id.toLowerCase()}`;
            return shortId === colonShape || shortId === dashShape;
          });
          if (match) {
            foundTask = match;
            foundProjectId = pw.project.id;
            break;
          }
        }
        if (foundTask && foundProjectId) {
          const config = buildTaskThread(
            slug,
            foundTask.id,
            foundTask.name,
            foundProjectId,
            {
              taskSkill: foundTask.skill,
              taskChannel: foundTask.channel,
              taskStatus: foundTask.status,
              taskType: foundTask.type,
              pillar: foundTask.pillar,
              agent: foundTask.agent,
              skills: foundTask.skills,
              deliverableFile: typeof foundTask.deliverable_file === "string" ? foundTask.deliverable_file : undefined,
            }
          );
          // Force the threadId to match the one the user clicked (the
          // builder would normalize to colon shape; we respect the legacy
          // dash shape so the chat history stays continuous).
          config.threadId = threadId;
          // Resolve the doc to show in the pill. Priority:
          //   1. task.deliverable_file (ground truth from task anchors)
          //   2. pillar output_file from foundation-state.json
          //   3. null → "Sin documento asociado"
          if (!config.docPath) {
            const df = foundTask.deliverable_file;
            const dfStr = typeof df === "string" ? df : Array.isArray(df) ? df[0] : null;
            if (dfStr && dfStr.trim()) {
              config.docPath = dfStr;
            } else if (foundTask.pillar) {
              const docPath = resolvePillarDocPath(foundTask.pillar, foundationLike);
              if (docPath) config.docPath = docPath;
            }
          }
          if (config.docPath && /tasks\.json$/i.test(config.docPath)) {
            config.docPath = null;
          }
          selectThread(config);
          return;
        }
        // Task data not loaded yet — set a minimal meta so the pill still
        // shows with a task-page link. Strip the `task-`/`task:` prefix,
        // upper-case for display, and take the projectId from the first
        // P-prefixed segment (task IDs are `P{N}-T{NN}` post-rename).
        const rawId = shortId.replace(/^task[-:]/i, "");
        const taskIdUpper = rawId.toUpperCase();
        const firstSegment = taskIdUpper.split("-")[0] || "";
        selectThread({
          threadId,
          threadName: fallbackName,
          skill: "sancho",
          skills: ["sancho"],
          linkedTo: `projects/${firstSegment}/tasks/${taskIdUpper}`,
          docPath: null,
          threadState: "continue",
        });
        return;
      }

      // --- Whole-project thread -----------------------------------------
      if (shortId.startsWith("project:") || shortId.startsWith("project-")) {
        let foundProject: import("@/types").Project | undefined;
        for (const pw of projectsData || []) {
          const colonShape = `project:${pw.project.id.toLowerCase()}`;
          const dashShape = `project-${pw.project.id.toLowerCase()}`;
          if (shortId === colonShape || shortId === dashShape) {
            foundProject = pw.project;
            break;
          }
        }
        if (foundProject) {
          const config = buildProjectThread(
            slug,
            foundProject.id,
            foundProject.name,
            {
              strategy: (foundProject as unknown as { strategy?: string }).strategy,
              status: foundProject.status,
            }
          );
          config.threadId = threadId;
          selectThread(config);
          return;
        }
        const rawId = shortId.replace(/^project[-:]/i, "");
        const projectIdUpper = rawId.toUpperCase();
        selectThread({
          threadId,
          threadName: fallbackName,
          skill: "sancho-manager",
          skills: ["sancho-manager"],
          linkedTo: `projects/${projectIdUpper}`,
          docPath: null,
          threadState: "continue",
        });
        return;
      }

      // --- Skill threads: `skill-{id}` or `skill:{id}` ------------------
      // Link target: the skill editor page `/dashboard/{slug}/skills/{id}`
      if (shortId.startsWith("skill-") || shortId.startsWith("skill:")) {
        const skillId = shortId.replace(/^skill[-:]/i, "");
        selectThread({
          threadId,
          threadName: fallbackName,
          skill: "skill-creator",
          skills: ["skill-creator"],
          linkedTo: `skills/${skillId}`,
          docPath: null,
          threadState: "continue",
        });
        return;
      }

      // --- Tool threads: atalaya (or its sub-threads) ---
      // These are MC-side tool pages (not docs). Link to the tool page.
      // Sub-threads like `atalaya-...` collapse to the base tool page
      // because MC doesn't have per-report routes yet.
      for (const tool of ["atalaya"]) {
        if (shortId === tool || shortId.startsWith(`${tool}-`)) {
          selectThread({
            threadId,
            threadName: fallbackName,
            skill: tool,
            skills: [tool],
            linkedTo: `tool/${tool}`,
            docPath: null,
            threadState: "continue",
          });
          return;
        }
      }

      // --- Competitor scan / cron-style threads -------------------------
      if (/^(competitor-scan|meta-ads-scan|linkedin-scan)$/i.test(shortId)) {
        selectThread({
          threadId,
          threadName: fallbackName,
          skill: "atalaya",
          skills: ["atalaya"],
          linkedTo: "tool/atalaya",
          docPath: null,
          threadState: "continue",
        });
        return;
      }

      // --- Compound pillar shortId (niche-prefixed content threads) ----
      // Threads like `content-system-seekers-content-strategy` don't match
      // a single pillar key literally, but they embed a known pillar suffix
      // (`content-strategy`). Match by finding a task whose `pillar` field
      // is a suffix of the shortId — that's our best signal that this
      // thread is "the chat where we work on task X for niche Y".
      //
      // Example: `content-system-seekers-content-strategy` → picks the task
      // with pillar=`content-strategy` (P14-T01 for growth4u).
      if (projectsData) {
        let bestMatch: { task: import("@/types").Task; projectId: string; pillarLen: number } | null = null;
        for (const pw of projectsData) {
          for (const t of pw.tasks) {
            if (!t.pillar) continue;
            const pillarLower = t.pillar.toLowerCase();
            if (
              shortId === pillarLower ||
              shortId.endsWith(`-${pillarLower}`) ||
              shortId.endsWith(`:${pillarLower}`)
            ) {
              // Prefer the longest-matching pillar (more specific)
              if (!bestMatch || pillarLower.length > bestMatch.pillarLen) {
                bestMatch = {
                  task: t,
                  projectId: pw.project.id,
                  pillarLen: pillarLower.length,
                };
              }
            }
          }
        }
        if (bestMatch) {
          const config = buildTaskThread(
            slug,
            bestMatch.task.id,
            bestMatch.task.name,
            bestMatch.projectId,
            {
              taskSkill: bestMatch.task.skill,
              taskChannel: bestMatch.task.channel,
              taskStatus: bestMatch.task.status,
              taskType: bestMatch.task.type,
              pillar: bestMatch.task.pillar,
              agent: bestMatch.task.agent,
              skills: bestMatch.task.skills,
              deliverableFile: typeof bestMatch.task.deliverable_file === "string" ? bestMatch.task.deliverable_file : undefined,
            }
          );
          // Preserve the user-clicked threadId (legacy compound form)
          // instead of normalizing to the pillar canonical id — the
          // history lives under the compound name.
          config.threadId = threadId;
          // Same priority as above: deliverable_file → pillar → null
          if (!config.docPath) {
            const df = bestMatch.task.deliverable_file;
            const dfStr = typeof df === "string" ? df : Array.isArray(df) ? df[0] : null;
            if (dfStr && dfStr.trim()) {
              config.docPath = dfStr;
            } else if (bestMatch.task.pillar) {
              const docPath = resolvePillarDocPath(bestMatch.task.pillar, foundationLike);
              if (docPath) config.docPath = docPath;
            }
          }
          if (config.docPath && /tasks\.json$/i.test(config.docPath)) {
            config.docPath = null;
          }
          selectThread(config);
          return;
        }
      }

      // --- Partnerships discovery threads → Rocinante (Outreach owner) --
      // Dynamic ids (`discovery-new-<ts>`, `discovery-<campaignId>`) have no
      // task/registry row; without this they fall to the pillar fallback →
      // sancho-manager, orphaning the search from its owner agent (SAN-193).
      if (/^discovery[-:]/i.test(shortId)) {
        selectThread({
          threadId,
          threadName: fallbackName,
          skill: "discovery-plan-builder",
          skills: ["discovery-plan-builder", "outreach-playbook", "niche-discovery-100x"],
          agent: "rocinante",
          linkedTo: "rocinante",
          docPath: null,
          threadState: "continue",
        });
        return;
      }

      // --- Other typed threads (strategy, idea, recurring) --------------
      if (shortId.includes(":") || /^(strategy|idea|recurring)[-:]/i.test(shortId)) {
        const m = shortId.match(/^([a-z]+)[-:](.+)$/i);
        if (m) {
          const [, type, id] = m;
          selectThread({
            threadId,
            threadName: fallbackName,
            skill: "sancho",
            skills: ["sancho"],
            linkedTo: `${type}/${id}`,
            docPath: null,
            threadState: "continue",
          });
          return;
        }
      }

      // --- Pillar thread (shortId is a pillar name or "general") -------
      // Before falling back to a simple pillar thread, try to find the
      // owning task so we get the full context (doc + task link + skill).
      // This handles the case where shortId = "market-analysis" and the
      // compound match above didn't fire (projectsData not loaded, or
      // exact-match instead of suffix-match).
      if (projectsData) {
        for (const pw of projectsData) {
          const matchingTask = pw.tasks.find(t =>
            t.pillar && t.pillar.toLowerCase() === shortId.toLowerCase()
          );
          if (matchingTask) {
            const config = buildTaskThread(
              slug,
              matchingTask.id,
              matchingTask.name,
              pw.project.id,
              {
                taskSkill: matchingTask.skill,
                taskChannel: matchingTask.channel,
                taskStatus: matchingTask.status,
                taskType: matchingTask.type,
                pillar: matchingTask.pillar,
                agent: matchingTask.agent,
                skills: matchingTask.skills,
              deliverableFile: typeof matchingTask.deliverable_file === "string" ? matchingTask.deliverable_file : undefined,
              }
            );
            config.threadId = threadId;
            if (!config.docPath) {
              const df = matchingTask.deliverable_file;
              const dfStr = typeof df === "string" ? df : Array.isArray(df) ? df[0] : null;
              if (dfStr && dfStr.trim()) {
                config.docPath = dfStr;
              } else {
                const dp = resolvePillarDocPath(shortId, foundationLike);
                if (dp) config.docPath = dp;
              }
            }
            if (config.docPath && /tasks\.json$/i.test(config.docPath)) {
              config.docPath = null;
            }
            selectThread(config);
            return;
          }
        }
      }

      // Truly generic pillar fallback (no task found)
      const docPath = resolvePillarDocPath(shortId, foundationLike) || undefined;
      const config = buildPillarThread(slug, shortId, docPath);
      selectThread(config);
    },
    [slug, foundationState, projectsData, threads, selectThread]
  );

  // Messages for active thread
  const messagesQuery = useThreadMessages(activeThreadId ?? null);
  const messages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data?.messages]
  );
  const statusData = messagesQuery.data?.status;
  const activeRun = messagesQuery.data?.activeRun ?? null;
  // Fold runtime tool-call narration ("Write: to…", "run python3 inline
  // script") into the collapsible "N pasos" timeline instead of letting each
  // land as its own Sancho bubble. Real replies pass through untouched.
  const renderItems = useMemo(
    () => groupChatMessages(collapseExecutionOutcomes(messages)),
    [messages],
  );
  const pendingProgress: ProgressEvent[] = messagesQuery.data?.pendingProgress ?? [];

  // Send / cancel / mark-read
  const sendMutation = useSendMessage();
  const cancelMutation = useCancelMessage();
  const markReadMutation = useMarkThreadRead();

  // Thread metadata
  const meta = activeThreadId ? threadMeta[activeThreadId] : undefined;
  const skills = meta?.skills ?? [];
  const primarySkill = meta?.skill || skills[0];
  const extraSkillCount = skills.length > 1 ? skills.length - 1 : 0;
  const isAutoSkillMode = meta?.scope === "agent";
  const isSanchoGeneralist = isAutoSkillMode && meta?.agent === "sancho";
  const hasExecutionBadge = isAutoSkillMode || Boolean(primarySkill);

  // Estado de la tarea ligada al thread ABIERTO → la cabecera muestra el
  // StatusPill y ofrece "cambiar estado / archivar" inline. Se resuelve por
  // `meta.linkedTo` (fiable en modo locked y free). Archivar una tarea de
  // Foundation no afecta a la UI de Pilares (Brand Brain no filtra por
  // archivado), así que el control es uniforme para todo hilo de tarea.
  const updateTaskStatus = useUpdateTaskStatus();
  const [headerStatusMenu, setHeaderStatusMenu] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const activeTaskId: string | null =
    meta?.linkedTo?.match(/^projects\/[^/]+\/tasks\/([^/]+)$/i)?.[1] ?? null;
  const activeTaskEntry = activeTaskId
    ? (taskIndex.get(`task:${activeTaskId.toLowerCase()}`) ?? null)
    : null;
  const activeTaskStatus = activeTaskEntry
    ? normalizeTaskStatusQuiet(activeTaskEntry.task?.status as string | undefined)
    : null;
  // Tarea de CONTENIDO (linkedTo = projects/X/tasks/Y/content/Z): tiene su
  // propio vocabulario de estado (New/Draft/Published/…), no el de Task. Se
  // muestra el pill (solo lectura — el cambio de estado va por su pipeline).
  const contentTaskId: string | null =
    meta?.linkedTo?.match(/^projects\/[^/]+\/tasks\/[^/]+\/content\/([^/]+)$/i)?.[1] ?? null;
  const contentTaskEntry = contentTaskId
    ? (taskIndex.get(`content:${contentTaskId.toLowerCase()}`) ?? null)
    : null;
  const contentTaskStatus = ((contentTaskEntry?.contentTask as { status?: string } | undefined)?.status) || null;

  // Lazy auto-scan on task thread open: when the active thread is a task,
  // hit the task-attach-scan endpoint so any files the skill wrote since
  // last open get registered and shown in the Attachments section without
  // requiring a full page refresh. Runs once per (slug, taskId) pair to
  // avoid redundant scans on every render.
  const lastScannedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!slug || !meta?.linkedTo) return;
    const m = meta.linkedTo.match(/^projects\/[^/]+\/tasks\/([^/]+)/i);
    if (!m) return;
    const taskId = m[1];
    const key = `${slug}:${taskId}`;
    if (lastScannedRef.current === key) return;
    lastScannedRef.current = key;
    runAttachScan(slug, taskId);
  }, [slug, meta?.linkedTo, runAttachScan]);

  // Doc slide-over state — when the user clicks an attachment or the doc
  // pill, we open the doc IN PLACE in a slide-over instead of navigating
  // to the foundation page. Keeps the user in their current context (chat
  // thread, task page, etc.) while they read or edit the doc.
  const [openDocSlidePath, setOpenDocSlidePath] = useState<string | null>(null);

  // Error-detail modal — opened by the chip rendered under any bot message
  // whose text was rewritten by the mc-chat error-rewriter (rate limit, auth,
  // watchdog abort, etc.).
  const [openErrorDetail, setOpenErrorDetail] = useState<ErrorDetail | null>(null);

  // Media-asset slide-over — opened when the doc pill points at a template
  // folder (kind="template"). The MediaAssetSlideover handles multi-slide
  // preview and the file list. Looked up from useBrandAssets by relative
  // path so the same data the Assets tab loads is reused.
  const [openTemplateAsset, setOpenTemplateAsset] = useState<BrandAsset | null>(null);
  const { data: brandAssetsData } = useBrandAssets(
    meta?.docKind === "template" && slug ? slug : null,
  );
  const findAssetByRelativePath = useCallback(
    (relPath: string): BrandAsset | null =>
      brandAssetsData?.assets.find((a) => a.relativePath === relPath) ?? null,
    [brandAssetsData],
  );

  // Input state
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // File upload state
  interface PendingFile { file: File; preview?: string }
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // Drives the 1Hz "thinking for Ns" counter on the typing indicator.
  const [thinkingNow, setThinkingNow] = useState(() => Date.now());

  const addFiles = useCallback((files: FileList | File[]) => {
    setUploadError(null);
    const arr = Array.from(files).slice(0, 5); // Max 5 files
    const newPending: PendingFile[] = arr.map((f) => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    setPendingFiles((prev) => [...prev, ...newPending].slice(0, 5));
  }, []);

  const removeFile = useCallback((idx: number) => {
    setPendingFiles((prev) => {
      const removed = prev[idx];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const uploadFiles = useCallback(async (files: PendingFile[]): Promise<{ url: string; filename: string; mimeType: string; size: number }[]> => {
    const results = [];
    for (const pf of files) {
      const form = new FormData();
      form.append("file", pf.file);
      const res = await fetch("/api/upload-file", { method: "POST", body: form });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        if (res.status === 413) {
          // nginx returns a non-JSON 413 page when the body exceeds its limit.
          throw new Error(detail?.error || `"${pf.file.name}" supera el límite de subida.`);
        }
        throw new Error(detail?.error || `No se pudo subir "${pf.file.name}".`);
      }
      results.push(await res.json());
    }
    return results;
  }, []);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // Paste handler (for images from clipboard)
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) addFiles(files);
  }, [addFiles]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark thread as read when opened
  useEffect(() => {
    if (!activeThreadId || !slug) return;
    markReadMutation.mutate({ slug, threadId: activeThreadId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, slug]);

  // Mark as read when new bot messages arrive while viewing the thread
  useEffect(() => {
    if (!activeThreadId || !slug || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "user") {
      markReadMutation.mutate({ slug, threadId: activeThreadId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, activeThreadId, slug]);

  // Typing indicator — show when polling OR when last substantive message is from user (waiting for response)
  // System messages (failover/billing notices) are ignored here so the typing indicator
  // stays visible while a bot reply is still pending after a system event.
  const lastMsg = messages[messages.length - 1];
  const lastSubstantiveMsg = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "system") return messages[i];
    }
    return undefined;
  })();
  const waitingForReply = messages.length > 0 && lastSubstantiveMsg?.role === "user";

  // Activity gate: a reply is "in progress" when a send is in flight, when the
  // gateway has emitted a status update in the last minute, or when the user's
  // message is recent enough that an agent could still be working on it. Using
  // `isPolling` alone caused the typing indicator to disappear after the 30s
  // polling window while the red stop button stayed on — they're now in sync.
  const lastUserMsgTs = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].ts ?? 0;
    }
    return 0;
  })();
  const STATUS_FRESH_MS = 60_000;
  const REPLY_WINDOW_MS = 5 * 60_000;
  const now = Date.now();
  const hasFreshStatus = !!statusData?.text && now - (statusData?.ts ?? 0) < STATUS_FRESH_MS;
  const hasActiveRun = activeRun?.status === "queued" || activeRun?.status === "running";
  const isAwaitingReply = sendMutation.isPending || hasFreshStatus || hasActiveRun;
  const showTyping = isAwaitingReply;

  // Live "thinking for Ns" counter on the typing indicator. Anchored to the
  // last user message (when the turn started) so it works for ANY backend —
  // including codex/ACP agents that emit no granular progress events, where
  // the ProgressTimeline ticker has nothing to render. Ticks 1Hz only while
  // the indicator is visible.
  useEffect(() => {
    if (!showTyping) return;
    const id = setInterval(() => setThinkingNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showTyping]);
  const thinkingSince = lastUserMsgTs || statusData?.ts || 0;
  const thinkingElapsedMs =
    showTyping && thinkingSince ? Math.max(0, thinkingNow - thinkingSince) : null;

  // Live agent for the typing indicator: prefer the gateway's status (whoever
  // is actually working right now) → last bot message agent → thread default.
  const lastBotAgent = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "user" && m.role !== "system" && m.agent) return m.agent;
    }
    return undefined;
  })();
  const typingAgent = statusData?.agent || lastBotAgent || primarySkill;
  const typingBadge = typingAgent ? agentBadge(typingAgent) : null;

  // Gateway-down detection: when a ContentTask thread's last system marker
  // ("Pidiendo a Dulcinea…") has been sitting for >60s without an agent
  // reply, the OpenClaw gateway is most likely down. Surface a banner with
  // a "Reintentar" button that re-fires `triggerWriter`. The regex also
  // matches the legacy "Escudero" marker so old in-flight threads still
  // trigger the banner.
  const GATEWAY_STALE_MS = 60 * 1000;
  const ctIdFromLinked = meta?.linkedTo?.match(/\/content\/([^/]+)/i)?.[1];
  const lastIsTriggerMarker =
    !!lastMsg &&
    lastMsg.role !== "user" &&
    typeof lastMsg.text === "string" &&
    /Pidiendo a (Dulcinea|Escudero|Sancho que itere)/.test(lastMsg.text);
  const triggerStale = !lastMsg?.ts || Date.now() - lastMsg.ts > GATEWAY_STALE_MS;
  const gatewayLikelyDown =
    !!ctIdFromLinked && lastIsTriggerMarker && triggerStale && !sendMutation.isPending;
  const retriggerWriter = useRetriggerWriter();

  // Stalled-reply detection (SAN-323) — generalizes the ContentTask-only
  // `gatewayLikelyDown` banner below to ANY thread. When the user's message is
  // the last substantive one but the typing indicator has lapsed (no send in
  // flight, no fresh gateway status, past REPLY_WINDOW_MS) the turn went quiet
  // with no reply and no error: previously the input silently re-enabled and the
  // user was stranded (the same failure mode as the discovery-search timeout in
  // this issue). Surface an explicit "delayed / retry" affordance instead;
  // polling keeps running underneath, so a late reply still lands and clears it.
  // `!gatewayLikelyDown` avoids a double banner on ContentTask threads, which
  // keep their tailored copy.
  const replyStalled = waitingForReply
    && !isAwaitingReply
    && lastUserMsgTs > 0
    && now - lastUserMsgTs >= REPLY_WINDOW_MS
    && !gatewayLikelyDown;

  // Quick-actions from chat-config.json.
  //
  // Show when:
  //   (a) Empty thread — first-time interaction, user needs suggestions
  //   (b) Last bot message is OLD — more than QUICK_ACTIONS_STALE_MS since
  //       the last activity (user came back after a break, wants prompts)
  //
  // Hide when:
  //   - Mid-conversation (last bot reply is recent — user is actively chatting)
  //   - User just sent a message (sendMutation pending)
  //   - No thread selected
  //
  // Motivación: 2026-04-15 feedback del usuario — los quick-actions
  // aparecían durante la conversación activa y distraían. Ahora solo
  // aparecen cuando el chat está "frío" (empty o sin actividad reciente).
  const QUICK_ACTIONS_STALE_MS = 30 * 60 * 1000; // 30 minutes
  const { quickActions } = useQuickActions(slug, meta);
  const lastMsgIsBot = messages.length > 0 && lastMsg?.role !== "user";
  const lastMsgTs = lastMsg?.ts;
  const lastMsgIsStale =
    !lastMsgTs || Date.now() - lastMsgTs > QUICK_ACTIONS_STALE_MS;
  const showQuickActions =
    quickActions.length > 0 &&
    !!activeThreadId &&
    !sendMutation.isPending &&
    (messages.length === 0 || (lastMsgIsBot && lastMsgIsStale));

  // Handlers
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    const hasFiles = pendingFiles.length > 0;
    if ((!trimmed && !hasFiles) || !activeThreadId) return;
    setUploadError(null);

    let attachments: { url: string; filename: string; mimeType: string; size: number }[] | undefined;

    // Upload pending files first
    if (hasFiles) {
      setUploading(true);
      try {
        attachments = await uploadFiles(pendingFiles);
      } catch (err) {
        console.error("[chat] Upload failed:", err);
        setUploadError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
        setUploading(false);
        return;
      }
      // Clean up previews
      pendingFiles.forEach((pf) => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
      setPendingFiles([]);
      setUploading(false);
    }

    const text = trimmed || (attachments ? attachments.map((a) => a.filename).join(", ") : "");
    sendMutation.mutate({ text, threadId: activeThreadId, attachments });
    setInput("");
    const ta = document.querySelector<HTMLTextAreaElement>(".chat-textarea");
    if (ta) ta.style.height = "auto";
  }, [input, activeThreadId, sendMutation, pendingFiles, uploadFiles]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleNewTask = useCallback(() => {
    if (!slug) return;
    selectThread(buildNewTaskThread(slug));
  }, [selectThread, slug]);

  // Focus the textarea once the thread has loaded and is empty, so users see
  // the cursor blink in the input instead of staring at the "empty thread"
  // bubble wondering what to do.
  useEffect(() => {
    if (
      activeThreadId &&
      !messagesQuery.isLoading &&
      messages.length === 0 &&
      textareaRef.current
    ) {
      textareaRef.current.focus();
    }
  }, [activeThreadId, messagesQuery.isLoading, messages.length]);

  // Auto-send initialMessage when thread opens with one.
  // SAN-177: wait for the history fetch to settle before deciding the thread
  // is empty — while loading, `messages` is [] for a moment and the kickoff
  // re-fired on EVERY reopen of stable threads (discovery searches, outreach
  // templates…). The kickoff must go out only the first time, when the thread
  // is truly empty.
  const initialSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      meta?.initialMessage &&
      activeThreadId &&
      !messagesQuery.isLoading &&
      messagesQuery.isFetched &&
      messages.length === 0 &&
      !sendMutation.isPending &&
      initialSentRef.current !== activeThreadId
    ) {
      initialSentRef.current = activeThreadId;
      sendMutation.mutate({ text: meta.initialMessage, threadId: activeThreadId });
    }
  }, [
    meta?.initialMessage,
    activeThreadId,
    messagesQuery.isLoading,
    messagesQuery.isFetched,
    messages.length,
    sendMutation,
  ]);

  // Don't render if closed
  if (!sidebarOpen) return null;

  // Fullscreen chat fills everything except the nav sidebar. Its left edge
  // must line up with the sidebar's right edge — 220px expanded / 60px
  // collapsed — otherwise the dashboard peeks through the leftover gap.
  const sidebarW = navExpanded ? 220 : 60;
  const panelWidth = isFullscreen ? `calc(100vw - ${sidebarW}px)` : "380px";

  // Show the left-side ThreadListPanel only in fullscreen AND when the
  // sidebar is in free mode (not locked to a specific thread via a task
  // page or similar). Rationale: in a task page the thread is fixed, so
  // a list would be noise; in free mode the user browses.
  const showThreadPanel = isFullscreen && !sidebarLocked;

  return (
    <div
      className="fixed top-0 right-0 h-screen flex"
      style={{ width: panelWidth, zIndex: 400, backgroundColor: "var(--chat-bg)" }}
    >
      {/* LEFT PANEL — thread list (only in fullscreen + free mode) */}
      {showThreadPanel && (
        <aside
          className="w-[320px] flex-shrink-0 border-r border-[var(--chat-border)] bg-[var(--chat-bg-deep)] flex flex-col"
          aria-label="Thread list"
        >
          <div className="px-4 py-3 border-b border-[var(--chat-border)] shrink-0 flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--chat-text)] uppercase tracking-wide">
              Threads
            </span>
            <span className="ml-auto text-[12px] text-[var(--chat-text-muted)]">
              {threads.length}
            </span>
          </div>
          <ThreadListPanel
            slug={slug}
            activeThreadId={activeThreadId}
            onSelectThread={handleSelectFromPanel}
          />
        </aside>
      )}

      {/* RIGHT COLUMN — existing sidebar content */}
      <div className="flex-1 flex flex-col min-w-0">

      {/* HEADER BAR — título del hilo aquí mismo (una fila menos). Sin falso
          desplegable: para explorar threads se usa el botón ⤢ (fullscreen). */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--chat-border)] shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
          {activeThreadId ? (
            <>
              <span
                className="text-sm shrink-0"
                title={activeTaskStatus ? activeTaskStatus.replace(/-/g, " ") : undefined}
              >
                {activeTaskStatus ? statusDot(activeTaskStatus) : threadIcon(activeThreadId.split(":").slice(1).join(":"))}
              </span>
              <span className="text-[13px] font-semibold text-[var(--chat-text)] truncate font-heading">
                {meta?.threadName
                  ?? (activeThread
                    ? formatThreadDisplayName({ shortId: activeThread.shortId, name: activeThread.name }, projectsData)
                    : activeThreadId.split(":").slice(1).join(":").replace(/-/g, " "))}
              </span>
            </>
          ) : (
            <span className="text-[12px] font-semibold text-[var(--chat-text)]">{t("title")}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden md:inline text-[10px] text-[var(--chat-text-muted)]">
            {statusData?.text || (isPolling ? t("connected") : t("waiting"))}
          </span>
          {sidebarLocked && lockedThreadId && (
            <button
              onClick={unlockSidebar}
              title={t("unlockFreeMode")}
              className="text-[var(--chat-text-muted)] hover:text-[var(--chat-text)] text-sm leading-none border border-[var(--chat-border)] rounded-md px-1.5 py-0.5"
            >
              🔓
            </button>
          )}
          <button
            type="button"
            onClick={handleNewTask}
            title={t("newTask")}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-rust px-2 text-[11px] font-semibold text-white hover:opacity-90"
          >
            <Plus size={13} aria-hidden="true" />
            <span>{t("newTask")}</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="text-[var(--chat-text-muted)] hover:text-[var(--chat-text)] text-sm leading-none border border-[var(--chat-border)] rounded-md px-1.5 py-0.5"
            title={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
          >
            {isFullscreen ? "⤡" : "⤢"}
          </button>
          <button
            onClick={closeSidebar}
            className="text-[var(--chat-text-muted)] hover:text-[var(--chat-danger)] text-sm leading-none border border-[var(--chat-border)] rounded-md px-1.5 py-0.5"
            title={t("closeSidebar")}
          >
            ✕
          </button>
        </div>
      </div>

      {/* THREAD BAR — solo chips de meta (doc · estado · tarea · adjuntos ·
          skill). El título del hilo vive ahora en la HEADER BAR. */}
      {activeThreadId && (meta?.docPath || meta?.linkedTo || hasExecutionBadge || activeTaskStatus || contentTaskStatus) && (
      <div className="px-3 py-1.5 border-b border-[var(--chat-border)] shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">

          {/* Doc + skill pill — always rendered when there's an active
              thread. Shows the most useful "link target" for the thread:
                - Foundation task → doc of the pillar (e.g. Market Analysis)
                - Non-foundation task → task page
                - Project thread → project page
                - Other → "Sin documento asociado" (pill still shows skill)
              Plus the skill badge, always.
              Applies to BOTH locked and free mode so the user never loses
              the associated-link context as they navigate threads. */}
          {activeThreadId && (meta?.docPath || meta?.linkedTo || hasExecutionBadge) && (() => {
            // Priority order for what to show in the pill:
            //   1. Real doc (.md / .html / etc) → doc viewer
            //   2. Task page (linkedTo has `projects/.../tasks/...`)
            //   3. Project page (linkedTo has `projects/...`)
            //   4. Empty state — only the skill badge
            //
            // tasks.json and project.json are NOT considered "real docs"
            // because they're config files the user wouldn't want to open
            // in the markdown viewer.
            const docPath = meta?.docPath || null;
            const isTemplateDoc = !!docPath && meta?.docKind === "template";
            // DocSlideOver renders .md/.html/.txt natively and .json via
            // JsonViewer. Config jsons that aren't worth opening (tasks.json,
            // project.json) stay excluded. Allowing pov-bank.json + other
            // content/* jsons keeps the chat pill useful for Build POV Bank,
            // idea-queue, etc. without dragging the user back to the task.
            const isRealDoc = !!docPath && (
              isTemplateDoc ||
              (
                /\.(md|html|txt|json)$/i.test(docPath) &&
                !/tasks\.json$/i.test(docPath) &&
                !/project\.json$/i.test(docPath) &&
                !/foundation-state\.json$/i.test(docPath) &&
                !/client-config\.json$/i.test(docPath) &&
                !/chat-config\.json$/i.test(docPath) &&
                !/dispatch-map\.json$/i.test(docPath)
              )
            );
            const linkedTo = meta?.linkedTo || "";
            const isTaskLinked = /^projects\/[^/]+\/tasks\/[^/]+/i.test(linkedTo);
            const isProjectLinked = !isTaskLinked && /^projects\/[^/]+/i.test(linkedTo);
            const toolMatch = linkedTo.match(/^tool\/([a-z-]+)$/i);
            const skillMatch = linkedTo.match(/^skills\/(.+)$/i);

            let icon = "📄";
            let label: string = "";
            let href: string | null = null;
            let labelIsEmpty = false;

            // Prettify a thread name to a display label
            const prettify = (s: string) =>
              (s || "")
                .replace(/-/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());

            if (isTemplateDoc) {
              icon = "🧩";
              label = (docPath!.split("/").filter(Boolean).pop() || "Plantilla").replace(/-/g, " ");
              href = null; // click handled inline below to open MediaAssetSlideover
            } else if (isRealDoc) {
              icon = "📄";
              label = readableDocName(docPath!);
              href = `/dashboard/${slug}/brand-brain?doc=${encodeURIComponent(docPath!)}`;
            } else if (isTaskLinked) {
              icon = "📝";
              label = prettify(meta?.threadName || "") || "Tarea";
              // linkedTo is a thread anchor in legacy format (projects/X/tasks/Y);
              // route via the unified /tasks/:taskId path so client-side
              // navigation lands on the working unified page.
              const taskMatch = linkedTo.match(/^projects\/[^/]+\/tasks\/([^/]+)/i);
              const navTaskId = taskMatch?.[1] || "";
              href = navTaskId ? `/dashboard/${slug}/tasks/${navTaskId}` : null;
            } else if (isProjectLinked) {
              icon = "📁";
              label = prettify(meta?.threadName || "") || "Proyecto";
              const projMatch = linkedTo.match(/^projects\/([^/]+)/i);
              const navProjectId = projMatch?.[1] || "";
              href = navProjectId ? `/dashboard/${slug}/tasks/${navProjectId}` : null;
            } else if (toolMatch) {
              // Tool page: atalaya (atalaya has no MC page — its threads are
              // still backed by the backend skill).
              const toolName = toolMatch[1];
              icon = toolName === "atalaya" ? "🏰" : "🔍";
              label = prettify(toolName);
              href = toolName === "atalaya" ? null : `/dashboard/${slug}/${toolName}`;
            } else if (skillMatch) {
              icon = "🛠️";
              label = `Skill · ${prettify(skillMatch[1])}`;
              href = `/dashboard/${slug}/skills/${skillMatch[1]}`;
            } else {
              icon = "📄";
              label = "Sin documento asociado";
              labelIsEmpty = true;
            }

            // Sin doc/tarea/proyecto/tool/skill asociado → no pintamos chip
            // (no malgastamos la fila con "Sin documento asociado").
            if (labelIsEmpty) return null;
            const pillContent = (
              <>
                <span className="text-[12px] flex-shrink-0">{icon}</span>
                <span className="truncate max-w-[130px] font-medium">{label}</span>
                {href && (
                  <span className="text-[var(--chat-text-faint)] text-[10px] flex-shrink-0">↗</span>
                )}
              </>
            );
            const pillClass = cn(
              "inline-flex items-center gap-1 bg-[var(--chat-surface)] rounded-md px-2 py-1 text-[11px] text-[var(--chat-text-muted)] border border-transparent transition-colors text-left",
              (href || isRealDoc) && "cursor-pointer hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)] no-underline"
            );
            // Template doc: open MediaAssetSlideover (multi-slide preview)
            // instead of DocSlideOver — DocSlideOver fetches /api/docs which
            // would 404 on a folder path.
            if (isTemplateDoc && docPath) {
              return (
                <button
                  type="button"
                  className={pillClass}
                  onClick={() => {
                    const rel = docPath.replace(/^brand\/[^/]+\//, "");
                    const found = findAssetByRelativePath(rel);
                    if (found) setOpenTemplateAsset(found);
                  }}
                  title="Abrir plantilla"
                >
                  {pillContent}
                </button>
              );
            }
            // For real docs (.md/.html/.txt), open in slide-over IN-PLACE
            // instead of navigating to /foundation?doc=... The slide-over
            // lets the user read/edit without losing their current context
            // (chat thread, task page, etc.). For task/project/tool/skill
            // links we use Next Link for client-side routing.
            if (isRealDoc && docPath) {
              return (
                <button
                  type="button"
                  className={pillClass}
                  onClick={() => setOpenDocSlidePath(docPath)}
                  title="Abrir documento"
                >
                  {pillContent}
                </button>
              );
            }
            return href ? (
              <Link href={href} className={pillClass} title="Abrir" onClick={closeSidebar}>
                {pillContent}
              </Link>
            ) : (
              <div className={pillClass}>{pillContent}</div>
            );
          })()}

          {/* Estado de la tarea ligada — visible en modo locked Y free. En
              tareas normales el pill abre el menú "Cambiar estado / archivar";
              en tareas de Pilar es solo informativo (no se cambian aquí). */}
          {activeTaskId && activeTaskStatus && (() => {
            return (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHeaderStatusMenu((v) => !v)}
                  title="Cambiar estado / archivar"
                  className="inline-flex items-center gap-1 bg-[var(--chat-surface)] rounded-md px-2 py-1 text-[11px] text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)] transition-colors"
                >
                  <span>{statusDot(activeTaskStatus)}</span>
                  <span className="font-medium">{statusLabel(activeTaskStatus)}</span>
                  <span className="text-[10px] text-[var(--chat-text-faint)]">▾</span>
                </button>
                {headerStatusMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setHeaderStatusMenu(false)} />
                    <div className="absolute left-0 top-8 z-20 w-44 rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] py-1 shadow-lg">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--chat-text-faint)]">
                        Cambiar estado
                      </div>
                      {TASK_STATUS_OPTIONS.map((opt) => {
                        const current = activeTaskStatus === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={current || updateTaskStatus.isPending}
                            onClick={() => {
                              setHeaderStatusMenu(false);
                              if (current || !activeTaskId) return;
                              updateTaskStatus.mutate({ slug, taskId: activeTaskId, status: opt.value });
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
                              current
                                ? "text-[var(--chat-text-faint)] cursor-default"
                                : "text-[var(--chat-text)] hover:bg-[var(--chat-surface-2)]"
                            )}
                          >
                            <span>{statusDot(opt.value)}</span>
                            <span className="truncate">{opt.label}</span>
                            {current && <span className="ml-auto text-[11px]">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Estado de tarea de CONTENIDO (solo lectura — vocabulario propio:
              New/Draft/Published/… — el cambio va por el pipeline de contenido) */}
          {!activeTaskStatus && contentTaskStatus && (
            <span
              className="inline-flex items-center"
              title={`Estado de contenido: ${contentTaskStatus}`}
            >
              <StatusPill status={contentTaskStatus} size="sm" />
            </span>
          )}

          {/* Task/Project link pill — shows the associated task/project */}
          {activeThreadId && meta?.linkedTo && (() => {
            const taskMatch = meta.linkedTo.match(/^projects\/([^/]+)\/tasks\/([^/]+)(?:\/content\/([^/]+))?/i);
            const projMatch = !taskMatch && meta.linkedTo.match(/^projects\/([^/]+)/i);
            if (!taskMatch && !projMatch) return null;

            if (taskMatch) {
              const projId = taskMatch[1];
              const taskId = taskMatch[2];
              const ctId = taskMatch[3];
              const href = ctId
                ? `/dashboard/${slug}/tasks/${projId}/sub/${taskId}/content/${ctId}`
                : `/dashboard/${slug}/tasks/${taskId}`;
              return (
                <Link
                  href={href}
                  onClick={closeSidebar}
                  className="inline-flex items-center gap-1 bg-[var(--chat-surface)] rounded-md px-2 py-1 text-[11px] text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)] transition-colors no-underline"
                  title={ctId ? `${taskId} → ${ctId}` : `Tarea ${taskId}`}
                >
                  <span>{ctId ? "✍️" : "📋"}</span>
                  <span className="truncate max-w-[130px]">{ctId ? `${taskId} → ${ctId}` : taskId}</span>
                  <span className="text-[10px] text-[var(--chat-text-faint)]">↗</span>
                </Link>
              );
            }
            if (projMatch) {
              const projId = projMatch[1];
              return (
                <Link
                  href={`/dashboard/${slug}/tasks/${projId}`}
                  onClick={closeSidebar}
                  className="inline-flex items-center gap-1 bg-[var(--chat-surface)] rounded-md px-2 py-1 text-[11px] text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)] transition-colors no-underline"
                  title={`Proyecto ${projId}`}
                >
                  <span>📁</span>
                  <span className="truncate max-w-[130px]">{projId}</span>
                  <span className="text-[10px] text-[var(--chat-text-faint)]">↗</span>
                </Link>
              );
            }
            return null;
          })()}

          {/* Task attachments — every file accumulated by the thread
              (primary deliverable + Discord uploads + skill intermediate
              outputs). Only rendered when the active thread is a task.
              Always rendered (even with 0 attachments) so the user always
              has the 🔄 refresh button available to force a manual scan. */}
          {activeThreadId && meta?.linkedTo && (() => {
            const taskMatch = meta.linkedTo.match(/^projects\/([^/]+)\/tasks\/([^/]+)/i);
            if (!taskMatch) return null;
            const taskId = taskMatch[2];
            // Find the task across all projects.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let foundTask: any = null;
            for (const pw of projectsData || []) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const tasks = (pw as any).tasks as any[] | undefined;
              if (!Array.isArray(tasks)) continue;
              const t = tasks.find((x) => x.id === taskId);
              if (t) { foundTask = t; break; }
            }
            if (!foundTask) return null;
            const attachments = Array.isArray(foundTask.attachments) ? foundTask.attachments : [];
            return (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAttachOpen((v) => !v)}
                  title="Adjuntos del hilo"
                  className="inline-flex items-center gap-1 bg-[var(--chat-surface)] rounded-md px-2 py-1 text-[11px] text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)] transition-colors"
                >
                  <span>📎</span>
                  <span>{attachments.length}</span>
                  <span className="text-[10px] text-[var(--chat-text-faint)]">▾</span>
                </button>
                {attachOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAttachOpen(false)} />
                    <div className="absolute left-0 top-8 z-20 w-64 rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] py-1 shadow-lg">
                      <div className="px-3 py-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--chat-text-faint)]">
                        <span className="flex-1">Adjuntos ({attachments.length})</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            lastScannedRef.current = null;
                            runAttachScan(slug, taskId);
                          }}
                          title="Re-escanear el directorio de la tarea"
                          className="text-[12px] hover:text-rust transition-colors"
                        >
                          🔄
                        </button>
                      </div>
                      {attachments.length === 0 && (
                        <div className="text-[11px] text-[var(--chat-text-faint)] italic px-3 py-1.5">
                          No hay archivos aún. Pulsa 🔄 para escanear.
                        </div>
                      )}
                      {attachments.map((att: { path: string; type?: string; source?: string; label?: string; added_at: string }, ai: number) => {
                        const filename = att.path.split("/").pop() || att.path;
                        const isImage = (att.type || "").startsWith("image/");
                        const icon = isImage ? "🖼️"
                          : (att.type || "").includes("pdf") ? "📕"
                          : (att.type || "").includes("markdown") ? "📝"
                          : (att.type || "").includes("json") ? "🧩"
                          : (att.type || "").includes("csv") || (att.type || "").includes("sheet") ? "📊"
                          : "📄";
                        return (
                          <button
                            type="button"
                            key={ai}
                            onClick={() => { setAttachOpen(false); setOpenDocSlidePath(att.path); }}
                            className="flex items-center gap-2 text-[12px] text-[var(--chat-text)] hover:bg-[var(--chat-surface-2)] rounded px-3 py-1 transition-colors text-left w-full"
                            title={att.label || filename}
                          >
                            <span className="flex-shrink-0">{icon}</span>
                            <span className="truncate flex-1">{att.label || filename}</span>
                            {att.source && (
                              <span className="text-[10px] text-[var(--chat-text-faint)] flex-shrink-0">
                                {att.source.startsWith("skill:") ? att.source.slice(6) : att.source}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Execution chip — broad threads keep their owner and select skills per turn. */}
          {isAutoSkillMode ? (
            <span
              className="inline-flex items-center gap-1 bg-cyan-500/15 text-[10px] text-cyan-700 dark:text-cyan-300 px-2 py-1 rounded-md shrink-0 font-semibold"
              title={isSanchoGeneralist
                ? "Sancho resuelve de forma general y delega cuando corresponde."
                : primarySkill
                  ? `Skill inicial: ${primarySkill}. El agente elige la adecuada en cada turno.`
                  : "El agente elige skills por turno"}
            >
              {isSanchoGeneralist ? "🧭 Sancho generalista" : "🧭 Skills automáticas"}
              {!isSanchoGeneralist && primarySkill ? <span className="opacity-70">· {primarySkill}</span> : null}
            </span>
          ) : primarySkill ? (
            <span
              className="inline-flex items-center gap-0.5 bg-rust/15 text-[10px] text-rust px-2 py-1 rounded-md shrink-0 font-semibold"
              title={(meta?.skills && meta.skills.length ? meta.skills : [primarySkill]).join(", ")}
            >
              🛠️ {primarySkill}
              {extraSkillCount > 0 ? <span className="opacity-70"> +{extraSkillCount}</span> : null}
            </span>
          ) : null}
          </div>
      </div>
      )}

      {/* MESSAGES AREA — with drag & drop */}
      <div
        className={cn("flex-1 overflow-y-auto px-3 py-3 space-y-3 relative", dragOver && "ring-2 ring-rust/50 ring-inset")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="absolute inset-0 bg-rust/10 flex items-center justify-center z-10 pointer-events-none rounded">
            <span className="text-rust text-sm font-medium bg-[var(--chat-surface)] px-4 py-2 rounded-lg">Suelta archivos aquí</span>
          </div>
        )}
        {messages.length === 0 && (
          <div className="max-w-[85%] px-[14px] py-[10px] rounded-[16px] rounded-bl-[6px] text-base leading-relaxed bg-[var(--chat-surface)] text-[var(--chat-text)] border border-[var(--chat-border)] shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              {(() => {
                // Attribute the greeting to the thread's OWN agent (SAN-376) —
                // was hardcoded to Sancho, so a Rocinante discovery thread
                // greeted as Sancho. agentBadge() falls back to Sancho when the
                // thread has no agent, so manager threads are unchanged.
                const greet = agentBadge(meta?.agent);
                return (
                  <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded", greet.color)}>
                    {greet.emoji} {greet.label}
                  </span>
                );
              })()}
            </div>
            {/* Distinguish real loading (initial fetch with no data yet) from
                an empty thread. The previous "Cargando..." text was shown for
                both cases, making users wait for something that would never
                arrive — they only realized they could just type once they
                clicked the unlock button and the text changed. */}
            {messagesQuery.isLoading
              ? `🔄 ${t("loading")}`
              : activeThreadId
              ? t("emptyThread")
              : t("selectThread")}
          </div>
        )}

        {gatewayLikelyDown && ctIdFromLinked && (
          <div className="border border-amber-500/40 bg-amber-500/10 text-amber-800 rounded-lg px-3 py-2 text-[13px] leading-snug">
            <div className="font-semibold mb-1">⚠ Dulcinea parece no haber respondido</div>
            <p className="text-[12px] text-amber-700 mb-2">
              Puede que el gateway de OpenClaw esté caído. Comprueba <code className="bg-amber-500/20 text-amber-900 px-1 rounded">openclaw gateway status</code> y pulsa Reintentar.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!slug || !ctIdFromLinked) return;
                  retriggerWriter.mutate({ slug, contentTaskId: ctIdFromLinked });
                }}
                disabled={retriggerWriter.isPending}
                className="text-[12px] px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 rounded border border-amber-500/40 text-amber-800 font-medium transition-colors"
              >
                {retriggerWriter.isPending ? "Reintentando..." : "Reintentar"}
              </button>
              {retriggerWriter.isError && (
                <span className="text-[11px] text-[var(--chat-danger)]">
                  {(retriggerWriter.error as Error).message}
                </span>
              )}
              {retriggerWriter.isSuccess && retriggerWriter.data?.writerTriggered === false && (
                <span className="text-[11px] text-amber-700">
                  Sigue caído: {retriggerWriter.data.writerError || "sin respuesta"}
                </span>
              )}
            </div>
          </div>
        )}

        {renderItems.map((item) => {
          // Folded run of tool-call echoes → one collapsible "N pasos" block.
          if (item.kind === "tools") {
            return (
              <div key={item.key} className="flex justify-start">
                <div className="max-w-[85%] w-full px-3 py-1 rounded-[12px] bg-[var(--chat-surface-2)] border border-[var(--chat-border)]">
                  <ProgressTimeline events={item.events} mode="sealed" />
                </div>
              </div>
            );
          }
          const msg = item.msg;
          const i = item.key;
          if (msg.role === "workflow" && msg.workflowJob) {
            const failed = msg.workflowJob.status === "failed";
            const samples: Array<{ leadId?: string; messageBody: string }> = msg.workflowJob.batch?.sample ?? [];
            const campaignHref = msg.workflowJob.campaignId
              ? `/dashboard/${encodeURIComponent(slug)}/yalc?tipo=b2b&campaign=${encodeURIComponent(msg.workflowJob.campaignId)}`
              : null;
            return (
              <div key={i} className="flex items-start gap-2 px-1 py-2 text-[13px] leading-snug text-[var(--chat-text)]">
                {failed ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p>{msg.text}</p>
                  {!failed && samples.length > 0 && (
                    <details className="mt-2 text-[12px] text-[var(--chat-text-muted)]">
                      <summary className="cursor-pointer select-none font-medium text-[var(--chat-text)]">
                        Ver {samples.length} {samples.length === 1 ? "mensaje" : "mensajes"} de muestra
                      </summary>
                      <div className="mt-2 space-y-2 border-l-2 border-[var(--chat-border)] pl-3">
                        {samples.map((sample, sampleIndex) => (
                          <p key={sample.leadId ?? `${msg.workflowJob?.jobId}-${sampleIndex}`}>
                            {sample.messageBody}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                  {campaignHref && (
                    <Link
                      href={campaignHref}
                      className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--chat-link)] hover:underline"
                    >
                      Abrir campaña
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
            );
          }
          if (msg.role === "system") {
            return (
              <div key={i} className="flex justify-center">
                <div className="max-w-[90%] px-3 py-1.5 rounded-md text-[12px] leading-snug bg-amber-500/10 text-amber-700 border border-amber-500/30 italic">
                  <ChatMarkdown text={msg.text || ""} className="text-[12px]" />
                </div>
              </div>
            );
          }

          if (msg.role === "handoff") {
            const fromBadge = agentBadge(msg.from_agent);
            const toBadge = agentBadge(msg.to_agent);
            return (
              <div key={i} className="flex justify-center">
                <div className="max-w-[90%] w-full px-3 py-2 rounded-md text-[12px] leading-snug bg-[var(--chat-surface)] border border-[var(--chat-border)] italic">
                  <div className="flex items-center justify-center gap-2 mb-1 not-italic">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded",
                      fromBadge.color
                    )}>
                      {fromBadge.emoji} {fromBadge.label}
                    </span>
                    <span className="text-[var(--chat-text-muted)] text-[14px]">→</span>
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded",
                      toBadge.color
                    )}>
                      {toBadge.emoji} {toBadge.label}
                    </span>
                  </div>
                  {msg.text && (
                    <div className="text-center text-[var(--chat-text-muted)]">
                      <ChatMarkdown text={msg.text} className="text-[12px]" />
                    </div>
                  )}
                </div>
              </div>
            );
          }

          const isUser = msg.role === "user";
          const badge = !isUser ? agentBadge(msg.agent) : null;

          if (!isUser && msg.errorDetail) {
            const copy = executionErrorCopy(msg.errorDetail.category);
            return (
              <div key={i} className="flex items-start gap-2 px-1 py-2 text-[13px] leading-snug" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--chat-text)]">{copy.title}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">{copy.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenErrorDetail(msg.errorDetail ?? null)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--chat-text-faint)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)]"
                  aria-label="Ver diagnóstico técnico"
                  title="Ver diagnóstico técnico"
                >
                  <CircleEllipsis className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          }

          // The auto-sent kickoff prompt: render as a discreet, foldable note
          // instead of a giant orange bubble the user never actually typed.
          if (
            isUser &&
            meta?.initialMessage &&
            (msg.text || "").trim() === meta.initialMessage.trim()
          ) {
            return <OpenerNote key={i} text={msg.text || ""} />;
          }

          return (
            <div key={i} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] px-[14px] py-[10px] rounded-[16px] text-base leading-relaxed",
                  isUser
                    ? "bg-rust text-white rounded-br-[6px] shadow-sm [--chat-link:#ffffff]"
                    : "bg-[var(--chat-surface)] text-[var(--chat-text)] border border-[var(--chat-border)] rounded-bl-[6px] shadow-sm"
                )}
              >
                {badge && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded",
                      badge.color
                    )}>
                      {badge.emoji} {badge.label}
                    </span>
                  </div>
                )}
                <AskQuestionGroup
                  segments={parseMessageSegments(
                    isUser ? stripAskProtocol(msg.text) : (msg.text || "")
                  )}
                  threadId={activeThreadId ?? ""}
                  renderText={(text, key) => (
                    <ChatMarkdown key={key} text={text} />
                  )}
                  onSubmit={(text) =>
                    activeThreadId &&
                    sendMutation.mutate({ text, threadId: activeThreadId })
                  }
                />
                {/* Attachments */}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(msg as any).attachments?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(msg as any).attachments.map((att: { url: string; filename: string; mimeType: string; size: number }, ai: number) => {
                      const isImage = att.mimeType?.startsWith("image/");
                      if (isImage) {
                        return (
                          <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={att.url} alt={att.filename} className="max-w-[200px] max-h-[150px] rounded-lg border border-[var(--chat-border)]" />
                          </a>
                        );
                      }
                      const icon = att.mimeType?.includes("pdf") ? "📄"
                        : att.mimeType?.includes("sheet") || att.mimeType?.includes("csv") ? "📊"
                        : att.mimeType?.includes("word") ? "📝" : "📎";
                      return (
                        <a
                          key={ai}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-[var(--chat-surface-2)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--chat-text)] hover:bg-[var(--chat-surface-2)] transition-colors no-underline"
                        >
                          <span>{icon}</span>
                          <span className="max-w-[140px] truncate">{att.filename}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
                {!isUser && msg.progress && msg.progress.length > 0 && (
                  <ProgressTimeline events={msg.progress} mode="sealed" />
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator + live progress timeline */}
        {showTyping && (
          <div className="flex justify-start">
            <div className="bg-[var(--chat-surface)] text-[var(--chat-text-muted)] px-[14px] py-[10px] rounded-[16px] rounded-bl-[6px] text-[15px] italic max-w-[85%] border border-[var(--chat-border)] shadow-sm">
              <div className="flex items-center gap-2">
                {typingBadge && (
                  <span className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded",
                    typingBadge.color
                  )}>
                    {typingBadge.emoji} {typingBadge.label}
                  </span>
                )}
                <span>
                  · 🔄 {statusData?.text || t("thinking")}
                  {thinkingElapsedMs !== null && (
                    <span className="not-italic tabular-nums opacity-80"> · {formatElapsed(thinkingElapsedMs)}</span>
                  )}
                </span>
              </div>
              {pendingProgress.length > 0 && (
                <ProgressTimeline events={pendingProgress} mode="live" />
              )}
            </div>
          </div>
        )}

        {/* Stalled-reply banner (SAN-323) — shown when the typing indicator has
            lapsed but the user is still waiting (no reply, no error). Replaces the
            previous silent input re-enable. Polling continues underneath, so a
            late reply still renders and clears this; "Reintentar" re-sends the
            last user message to nudge the agent. */}
        {replyStalled && (
          <div className="flex justify-start">
            <div className="border border-amber-500/40 bg-amber-500/10 text-amber-800 rounded-[16px] rounded-bl-[6px] px-[14px] py-[10px] text-[13px] leading-snug max-w-[85%] shadow-sm">
              <div className="font-semibold mb-1">⌛ La respuesta se está demorando</div>
              <p className="text-[12px] text-amber-700 mb-2">
                El agente está tardando más de lo normal o se cortó la conexión. Sigo
                escuchando — si quieres, reenvía tu último mensaje.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!activeThreadId || !lastSubstantiveMsg?.text) return;
                  sendMutation.mutate({ text: lastSubstantiveMsg.text, threadId: activeThreadId });
                }}
                disabled={sendMutation.isPending}
                className="text-[12px] px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 rounded border border-amber-500/40 text-amber-800 font-medium transition-colors"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* QUICK-ACTIONS — suggested prompts above input (ChatGPT-style) */}
      {showQuickActions && (
        <div className="px-3 py-2 border-t border-[var(--chat-border)] shrink-0 flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
          {quickActions.map((qa) => {
            const promptText = qa.prompt
              .replace(/\{name\}/g, meta?.threadName ?? "")
              .replace(/\{deliverable\}/g, "")
              .replace(/\{channel\}/g, "")
              .trim();
            return (
              <button
                key={qa.label}
                onClick={() => sendMutation.mutate({ text: promptText, threadId: activeThreadId! })}
                className="w-full text-left px-3 py-2 text-[15px] leading-snug rounded-lg border border-[var(--chat-border)] text-[var(--chat-text)] bg-[var(--chat-surface-2)] hover:bg-[var(--chat-surface-2)] hover:border-rust/40 transition-colors cursor-pointer"
              >
                {qa.label}
              </button>
            );
          })}
        </div>
      )}

      {/* INPUT BAR */}
      <div className="px-3 py-2 border-t border-[var(--chat-border)] shrink-0">
        {/* Pending file previews */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((pf, idx) => (
              <div key={idx} className="flex items-center gap-1 bg-[var(--chat-surface)] border border-[var(--chat-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--chat-text)]">
                {pf.preview ? (
                  <img src={pf.preview} alt="" className="w-6 h-6 rounded object-cover" />
                ) : (
                  <span>{pf.file.type.includes("pdf") ? "📄" : pf.file.type.includes("sheet") || pf.file.type.includes("csv") ? "📊" : "📎"}</span>
                )}
                <span className="max-w-[120px] truncate">{pf.file.name}</span>
                <button onClick={() => removeFile(idx)} className="text-[var(--chat-text-faint)] hover:text-[var(--chat-danger)] ml-0.5 bg-transparent border-none cursor-pointer text-xs">✕</button>
              </div>
            ))}
            {uploading && <span className="text-[10px] text-[var(--chat-text-faint)] animate-pulse self-center">Subiendo...</span>}
          </div>
        )}
        {uploadError && (
          <div className="mb-2 text-[11px] text-[var(--chat-danger)]" role="alert">{uploadError}</div>
        )}
        <div className="flex items-end gap-2">
          {/* Clip button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeThreadId || uploading}
            className="text-[var(--chat-text-faint)] hover:text-rust w-8 h-8 flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer disabled:opacity-40 text-base"
            title="Adjuntar archivo"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,.xlsx,.docx,.csv,.txt,.md"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={t("placeholder")}
            disabled={!activeThreadId}
            rows={1}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
            className="chat-textarea flex-1 bg-[var(--chat-surface)] text-[var(--chat-text)] placeholder-[var(--chat-text-faint)] text-base px-3 py-2 rounded-lg border border-[var(--chat-border)] focus:outline-none focus:border-rust disabled:opacity-50 resize-none overflow-y-auto leading-snug"
            style={{ maxHeight: 120 }}
          />
          {isAwaitingReply || cancelMutation.isPending ? (
            <button
              onClick={() => cancelMutation.mutate({ threadId: activeThreadId ?? undefined })}
              className="bg-red-600 hover:bg-red-700 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
              title={t("stop")}
            >
              ⏹
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!activeThreadId || uploading || (!input.trim() && pendingFiles.length === 0)}
              className="bg-rust hover:opacity-90 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              title={t("send")}
            >
              →
            </button>
          )}
        </div>
      </div>
      </div>
      {/* /RIGHT COLUMN */}

      {/* Doc Slide-Over — opens IN PLACE when the user clicks the doc pill
          or any attachment, so they don't lose their current page context.
          Accepts both legacy (relative to brand) and full brand-relative
          paths — detect the prefix to avoid double-prefixing. */}
      <DocSlideOver
        slug={slug || ""}
        docPath={
          openDocSlidePath
            ? openDocSlidePath.startsWith("brand/")
              ? openDocSlidePath
              : `brand/${slug}/${openDocSlidePath}`
            : null
        }
        onClose={() => setOpenDocSlidePath(null)}
      />
      <MediaAssetSlideover
        slug={slug || ""}
        asset={openTemplateAsset}
        onClose={() => setOpenTemplateAsset(null)}
        onRequestEdit={() => setOpenTemplateAsset(null)}
      />
      <ErrorDetailModal
        open={openErrorDetail !== null}
        onClose={() => setOpenErrorDetail(null)}
        detail={openErrorDetail}
      />
    </div>
  );
}
