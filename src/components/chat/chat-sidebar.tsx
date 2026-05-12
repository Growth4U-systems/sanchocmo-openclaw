"use client";

import { useRef, useEffect, useState, useCallback, useMemo, type KeyboardEvent, type DragEvent, type ClipboardEvent } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
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
  resolveFullThreadConfig,
  buildTaskIndex,
} from "@/lib/chat-openers";
import { useQuickActions } from "@/hooks/useChat";
import { ThreadListPanel } from "./thread-list-panel";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { useFoundation } from "@/hooks/useFoundation";
import { useProjects } from "@/hooks/useProjects";
import { resolvePillarDocPath } from "@/lib/pillar-doc-paths";
import { formatThreadDisplayName } from "@/lib/thread-display-name";

// ---------------------------------------------------------------------------
// Agent badge config
// ---------------------------------------------------------------------------

const AGENT_BADGES: Record<string, { emoji: string; label: string; color: string }> = {
  sancho:    { emoji: "🤠", label: "Sancho",    color: "bg-rust" },
  escudero:  { emoji: "⚔️",  label: "Escudero",  color: "bg-green-600" },
  rocinante: { emoji: "🐴", label: "Rocinante", color: "bg-cyan-600" },
  cervantes: { emoji: "✒️",  label: "Cervantes", color: "bg-purple-600" },
};

function agentBadge(agent?: string) {
  return AGENT_BADGES[agent ?? "sancho"] ?? AGENT_BADGES.sancho;
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
// Simple markdown-ish formatter
// ---------------------------------------------------------------------------

function formatMessage(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-[#45475a] px-1 py-0.5 rounded text-[15px]">$1</code>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="underline text-blue-400 hover:text-blue-300">$1</a>'
    )
    .replace(
      /(^|[^"'])(https?:\/\/[^\s<]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener" class="underline text-blue-400 hover:text-blue-300">$2</a>'
    )
    .replace(/\n/g, "<br>");
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

  const { selectedClient } = useAppStore();
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
  const { data: foundationState } = useFoundation(slug || null);
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
      selectThread(config);
    },
    [slug, foundationState, taskIndex, selectThread]
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

      // --- Tool threads: trust-engine, atalaya (or their sub-threads) ---
      // These are MC-side tool pages (not docs). Link to the tool page.
      // Sub-threads like `trust-engine-gap-analysis` collapse to the base
      // tool page because MC doesn't have per-report routes yet.
      for (const tool of ["trust-engine", "atalaya"]) {
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
  const messages = messagesQuery.data?.messages ?? [];
  const statusData = messagesQuery.data?.status;

  // Send / cancel / mark-read
  const sendMutation = useSendMessage();
  const cancelMutation = useCancelMessage();
  const markReadMutation = useMarkThreadRead();

  // Thread metadata
  const meta = activeThreadId ? threadMeta[activeThreadId] : undefined;
  const skills = meta?.skills ?? [];
  const primarySkill = meta?.skill || skills[0];
  const extraSkillCount = skills.length > 1 ? skills.length - 1 : 0;

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

  // Input state
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // File upload state
  interface PendingFile { file: File; preview?: string }
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((files: FileList | File[]) => {
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
      if (res.ok) {
        results.push(await res.json());
      }
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

  // Typing indicator — show when polling OR when last message is from user (waiting for response)
  const lastMsg = messages[messages.length - 1];
  const waitingForReply = messages.length > 0 && lastMsg?.role === "user";
  const isBotThinking = isPolling && waitingForReply;
  const showTyping = isBotThinking || !!statusData?.text || (waitingForReply && sendMutation.isPending);

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

    let attachments: { url: string; filename: string; mimeType: string; size: number }[] | undefined;

    // Upload pending files first
    if (hasFiles) {
      setUploading(true);
      try {
        attachments = await uploadFiles(pendingFiles);
      } catch (err) {
        console.error("[chat] Upload failed:", err);
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

  // Auto-send initialMessage when thread opens with one
  const initialSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      meta?.initialMessage &&
      activeThreadId &&
      messages.length === 0 &&
      !sendMutation.isPending &&
      initialSentRef.current !== activeThreadId
    ) {
      initialSentRef.current = activeThreadId;
      sendMutation.mutate({ text: meta.initialMessage, threadId: activeThreadId });
    }
  }, [meta?.initialMessage, activeThreadId, messages.length, sendMutation]);

  // Don't render if closed
  if (!sidebarOpen) return null;

  const panelWidth = isFullscreen ? "calc(100vw - 220px)" : "380px";

  // Show the left-side ThreadListPanel only in fullscreen AND when the
  // sidebar is in free mode (not locked to a specific thread via a task
  // page or similar). Rationale: in a task page the thread is fixed, so
  // a list would be noise; in free mode the user browses.
  const showThreadPanel = isFullscreen && !sidebarLocked;

  return (
    <div
      className="fixed top-0 right-0 h-screen flex"
      style={{ width: panelWidth, zIndex: 400, backgroundColor: "#1E1E2E" }}
    >
      {/* LEFT PANEL — thread list (only in fullscreen + free mode) */}
      {showThreadPanel && (
        <aside
          className="w-[320px] flex-shrink-0 border-r border-[#313244] bg-[#181825] flex flex-col"
          aria-label="Thread list"
        >
          <div className="px-4 py-3 border-b border-[#313244] shrink-0 flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#cdd6f4] uppercase tracking-wide">
              Threads
            </span>
            <span className="ml-auto text-[12px] text-[#a6adc8]">
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

      {/* HEADER BAR */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#313244] shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="text-[12px] font-semibold text-[#cdd6f4]">{t("title")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#a6adc8]">
            {statusData?.text || (isPolling ? t("connected") : t("waiting"))}
          </span>
          <button
            onClick={toggleFullscreen}
            className="text-[#a6adc8] hover:text-[#cdd6f4] text-sm leading-none border border-[#45475a] rounded-md px-1.5 py-0.5"
            title={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
          >
            {isFullscreen ? "⤡" : "⤢"}
          </button>
          <button
            onClick={closeSidebar}
            className="text-[#a6adc8] hover:text-[#f38ba8] text-sm leading-none border border-[#45475a] rounded-md px-1.5 py-0.5"
            title={t("closeSidebar")}
          >
            ✕
          </button>
        </div>
      </div>

      {/* THREAD BAR */}
      <div className="px-3 py-2 border-b border-[#313244] shrink-0">
        <div className="space-y-2">
          {sidebarLocked && lockedThreadId ? (
            /* Locked mode */
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-rust text-sm">
                  {threadIcon(lockedThreadId.split(":").slice(1).join(":"))}
                </span>
                <span
                  className="text-[14px] font-semibold text-rust truncate font-heading"
                >
                  {meta?.threadName ?? lockedThreadId.split(":").slice(1).join(":").replace(/-/g, " ")}
                </span>
                {primarySkill && (
                  <span className="inline-flex items-center gap-0.5 bg-rust/15 text-[11px] text-rust px-2 py-0.5 rounded-full shrink-0 font-semibold">
                    {primarySkill}
                    {extraSkillCount > 0 && (
                      <span className="opacity-70"> +{extraSkillCount}</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="text-[#a6adc8] hover:text-[#cdd6f4] text-sm border border-[#45475a] rounded-md px-1 py-0.5"
                  title={t("syncDiscord")}
                >
                  📱
                </button>
                <button
                  onClick={unlockSidebar}
                  className="text-[#a6adc8] hover:text-[#cdd6f4] text-sm border border-[#45475a] rounded-md px-1 py-0.5"
                  title={t("unlockFreeMode")}
                >
                  🔓
                </button>
              </div>
            </div>
          ) : (
            /* Free mode — click the thread name to open the full thread list
               panel in fullscreen mode (design 2026-04-15). */
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  // If already in fullscreen, toggling here would collapse
                  // back — but in free mode the click handler is for "browse
                  // threads", so only toggle when NOT fullscreen.
                  if (!isFullscreen) toggleFullscreen();
                }}
                className="flex-1 bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] text-[14px] px-3 py-2 rounded-lg border border-[#45475a] hover:border-rust truncate flex items-center gap-2 text-left transition-colors"
                title={isFullscreen ? t("selectThreadOption") : "Explorar threads (expande a pantalla completa)"}
              >
                {activeThread ? (
                  <>
                    <span className="flex-shrink-0">{threadIcon(activeThread.shortId)}</span>
                    <span className="truncate font-semibold">
                      {formatThreadDisplayName(
                        { shortId: activeThread.shortId, name: activeThread.name },
                        projectsData
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex-shrink-0">📋</span>
                    <span className="text-[#a6adc8]">
                      {t("selectThreadOption")}
                    </span>
                  </>
                )}
                <span className="ml-auto text-[#6c7086] flex-shrink-0">
                  {isFullscreen ? "▾" : "▸"}
                </span>
              </button>
              <button
                className="bg-[#313244] hover:bg-[#45475a] text-green-500 w-7 h-7 rounded-lg flex items-center justify-center text-sm border border-[#45475a]"
                title={t("newThread")}
              >
                +
              </button>
            </div>
          )}

          {/* Doc + skill pill — always rendered when there's an active
              thread. Shows the most useful "link target" for the thread:
                - Foundation task → doc of the pillar (e.g. Market Analysis)
                - Non-foundation task → task page
                - Project thread → project page
                - Other → "Sin documento asociado" (pill still shows skill)
              Plus the skill badge, always.
              Applies to BOTH locked and free mode so the user never loses
              the associated-link context as they navigate threads. */}
          {activeThreadId && (meta?.docPath || meta?.linkedTo || primarySkill) && (() => {
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
            const isRealDoc = !!docPath &&
              /\.(md|html|txt)$/i.test(docPath) &&
              !/tasks\.json$/i.test(docPath) &&
              !/project\.json$/i.test(docPath);
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

            if (isRealDoc) {
              icon = "📄";
              label = readableDocName(docPath!);
              href = `/dashboard/${slug}/foundation?doc=${encodeURIComponent(docPath!)}`;
            } else if (isTaskLinked) {
              icon = "📝";
              label = prettify(meta?.threadName || "") || "Tarea";
              href = `/dashboard/${slug}/${linkedTo}`;
            } else if (isProjectLinked) {
              icon = "📁";
              label = prettify(meta?.threadName || "") || "Proyecto";
              href = `/dashboard/${slug}/${linkedTo}`;
            } else if (toolMatch) {
              // Tool page: trust-engine, atalaya
              const toolName = toolMatch[1];
              icon = toolName === "atalaya" ? "🏰" : "🔍";
              label = prettify(toolName);
              href = `/dashboard/${slug}/${toolName}`;
            } else if (skillMatch) {
              icon = "🛠️";
              label = `Skill · ${prettify(skillMatch[1])}`;
              href = `/dashboard/${slug}/skills/${skillMatch[1]}`;
            } else {
              icon = "📄";
              label = "Sin documento asociado";
              labelIsEmpty = true;
            }

            const pillContent = (
              <>
                <span className="text-base flex-shrink-0">{icon}</span>
                <span
                  className={cn(
                    "truncate flex-1 font-medium",
                    labelIsEmpty && "text-[#6c7086] italic"
                  )}
                >
                  {label}
                </span>
                {primarySkill && (
                  <span className="inline-flex items-center bg-rust/15 text-[11px] text-rust px-2 py-0.5 rounded-full shrink-0 font-semibold">
                    {primarySkill}
                    {extraSkillCount > 0 && (
                      <span className="opacity-70"> +{extraSkillCount}</span>
                    )}
                  </span>
                )}
                {href && (
                  <span className="text-[#6c7086] text-[11px] flex-shrink-0">
                    ↗
                  </span>
                )}
              </>
            );
            const pillClass = cn(
              "w-full bg-[#313244] rounded-lg px-3 py-2 text-[13px] text-[#cdd6f4] flex items-center gap-2 border border-transparent transition-colors text-left",
              (href || isRealDoc) && "cursor-pointer hover:bg-[#45475a] hover:border-rust no-underline"
            );
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
              <Link href={href} className={pillClass} title="Abrir">
                {pillContent}
              </Link>
            ) : (
              <div className={pillClass}>{pillContent}</div>
            );
          })()}

          {/* Task/Project link pill — shows the associated task/project */}
          {activeThreadId && meta?.linkedTo && (() => {
            const taskMatch = meta.linkedTo.match(/^projects\/([^/]+)\/tasks\/([^/]+)/i);
            const projMatch = !taskMatch && meta.linkedTo.match(/^projects\/([^/]+)/i);
            if (!taskMatch && !projMatch) return null;

            if (taskMatch) {
              const projId = taskMatch[1];
              const taskId = taskMatch[2];
              return (
                <Link
                  href={`/dashboard/${slug}/projects/${projId}/tasks/${taskId}`}
                  className="w-full bg-[#313244] rounded-lg px-3 py-1.5 text-[12px] text-[#a6adc8] flex items-center gap-2 hover:bg-[#45475a] hover:text-[#cdd6f4] transition-colors no-underline"
                >
                  <span>📋</span>
                  <span className="truncate flex-1">Tarea: {taskId}</span>
                  <span className="text-[11px] text-[#6c7086]">↗</span>
                </Link>
              );
            }
            if (projMatch) {
              const projId = projMatch[1];
              return (
                <Link
                  href={`/dashboard/${slug}/projects/${projId}`}
                  className="w-full bg-[#313244] rounded-lg px-3 py-1.5 text-[12px] text-[#a6adc8] flex items-center gap-2 hover:bg-[#45475a] hover:text-[#cdd6f4] transition-colors no-underline"
                >
                  <span>📁</span>
                  <span className="truncate flex-1">Proyecto: {projId}</span>
                  <span className="text-[11px] text-[#6c7086]">↗</span>
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
              <details className="w-full bg-[#313244] rounded-lg border border-transparent text-[#cdd6f4]" open={attachments.length > 0}>
                <summary className="px-3 py-2 text-[12px] cursor-pointer select-none flex items-center gap-1.5 font-medium text-[#a6adc8] hover:text-[#cdd6f4]">
                  <span>📎</span>
                  <span className="flex-1">Attachments ({attachments.length})</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Reset the scanned ref so the effect can re-run if the
                      // user navigates away and comes back, AND fire an immediate
                      // manual scan now.
                      lastScannedRef.current = null;
                      runAttachScan(slug, taskId);
                    }}
                    title="Refresh attachments — re-scan task dir for new files"
                    className="text-[12px] text-[#a6adc8] hover:text-rust transition-colors"
                  >
                    🔄
                  </button>
                </summary>
                <div className="px-3 pb-2 pt-1 flex flex-col gap-1">
                  {attachments.length === 0 && (
                    <div className="text-[11px] text-[#6c7086] italic px-2 py-1">
                      No hay archivos asociados aún. Pulsa 🔄 para escanear.
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
                        onClick={() => setOpenDocSlidePath(att.path)}
                        className="flex items-center gap-2 text-[12px] text-[#cdd6f4] hover:text-white hover:bg-[#45475a] rounded px-2 py-1 transition-colors text-left w-full"
                        title={att.label || filename}
                      >
                        <span className="flex-shrink-0">{icon}</span>
                        <span className="truncate flex-1">{att.label || filename}</span>
                        {att.source && (
                          <span className="text-[10px] text-[#6c7086] flex-shrink-0">
                            {att.source.startsWith("skill:") ? att.source.slice(6) : att.source}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </details>
            );
          })()}
        </div>
      </div>

      {/* MESSAGES AREA — with drag & drop */}
      <div
        className={cn("flex-1 overflow-y-auto px-3 py-3 space-y-3 relative", dragOver && "ring-2 ring-rust/50 ring-inset")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="absolute inset-0 bg-rust/10 flex items-center justify-center z-10 pointer-events-none rounded">
            <span className="text-rust text-sm font-medium bg-[#1E1E2E]/90 px-4 py-2 rounded-lg">Suelta archivos aquí</span>
          </div>
        )}
        {messages.length === 0 && (
          <div className="max-w-[85%] px-[14px] py-[10px] rounded-[14px] text-base leading-relaxed bg-[#313244] text-[#cdd6f4]">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded bg-rust">
                🤠 Sancho
              </span>
            </div>
            {sidebarLocked ? `🔄 ${t("loading")}` : t("selectThread")}
          </div>
        )}

        {messages.map((msg: { role: string; text: string; agent?: string; ts?: number }, i: number) => {
          const isUser = msg.role === "user";
          const badge = !isUser ? agentBadge(msg.agent) : null;

          return (
            <div key={i} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] px-[14px] py-[10px] rounded-[14px] text-base leading-relaxed",
                  isUser ? "bg-rust text-white" : "bg-[#313244] text-[#cdd6f4]"
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
                <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.text || "") }} />
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
                            <img src={att.url} alt={att.filename} className="max-w-[200px] max-h-[150px] rounded-lg border border-[#45475a]" />
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
                          className="flex items-center gap-1.5 bg-[#45475a]/50 rounded-lg px-2.5 py-1.5 text-[11px] text-[#cdd6f4] hover:bg-[#45475a] transition-colors no-underline"
                        >
                          <span>{icon}</span>
                          <span className="max-w-[140px] truncate">{att.filename}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {showTyping && (
          <div className="flex justify-start">
            <div className="bg-[#313244] text-[#a6adc8] px-[14px] py-[10px] rounded-[14px] text-[15px] italic flex items-center gap-2">
              {primarySkill && (
                <span className="bg-rust/15 text-rust text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                  {primarySkill}
                </span>
              )}
              <span>· 🔄 {t("thinking")}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* QUICK-ACTIONS — suggested prompts above input (ChatGPT-style) */}
      {showQuickActions && (
        <div className="px-3 py-2 border-t border-[#313244]/50 shrink-0 flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
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
                className="w-full text-left px-3 py-2 text-[15px] leading-snug rounded-lg border border-[#45475a] text-[#cdd6f4] bg-[#313244]/50 hover:bg-[#45475a] hover:border-rust/40 transition-colors cursor-pointer"
              >
                {promptText}
              </button>
            );
          })}
        </div>
      )}

      {/* INPUT BAR */}
      <div className="px-3 py-2 border-t border-[#313244] shrink-0">
        {/* Pending file previews */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((pf, idx) => (
              <div key={idx} className="flex items-center gap-1 bg-[#313244] border border-[#45475a] rounded-lg px-2 py-1 text-[11px] text-[#cdd6f4]">
                {pf.preview ? (
                  <img src={pf.preview} alt="" className="w-6 h-6 rounded object-cover" />
                ) : (
                  <span>{pf.file.type.includes("pdf") ? "📄" : pf.file.type.includes("sheet") || pf.file.type.includes("csv") ? "📊" : "📎"}</span>
                )}
                <span className="max-w-[120px] truncate">{pf.file.name}</span>
                <button onClick={() => removeFile(idx)} className="text-[#6c7086] hover:text-red-400 ml-0.5 bg-transparent border-none cursor-pointer text-xs">✕</button>
              </div>
            ))}
            {uploading && <span className="text-[10px] text-[#6c7086] animate-pulse self-center">Subiendo...</span>}
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* Clip button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeThreadId || uploading}
            className="text-[#6c7086] hover:text-rust w-8 h-8 flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer disabled:opacity-40 text-base"
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
            className="chat-textarea flex-1 bg-[#313244] text-[#cdd6f4] placeholder-[#6c7086] text-base px-3 py-2 rounded-lg border border-[#45475a] focus:outline-none focus:border-rust disabled:opacity-50 resize-none overflow-y-auto leading-snug"
            style={{ maxHeight: 120 }}
          />
          {showTyping || sendMutation.isPending || uploading ? (
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
              disabled={!activeThreadId || (!input.trim() && pendingFiles.length === 0)}
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
    </div>
  );
}
