import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useChatStore } from "@/stores/chat";
import type { ThreadConfig } from "@/lib/chat-openers";

// ============================================================
// Chat Hooks — TanStack Query integration for MC Chat system
// ============================================================

interface ChatAttachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export type ProgressKind =
  | "thinking"
  | "tool_call"
  | "file_write"
  | "agent_handoff"
  | "search"
  | "read";

export interface ProgressEvent {
  kind: ProgressKind;
  label: string;
  detail?: string;
  target?: string;
  agent?: string;
  ts: number;
}

export type ErrorCategory =
  | "rate_limit"
  | "auth"
  | "context_overflow"
  | "watchdog_abort"
  | "model_unavailable"
  | "network";

export interface ErrorDetail {
  category: ErrorCategory;
  raw: string;
  provider?: string;
  account?: string;
  model?: string;
  classifiedAt: number;
  correlatedWith?: ErrorCategory;
}

export interface ChatMessage {
  role: "user" | "bot" | "status" | "system" | "handoff";
  text: string;
  agent?: string;
  ts?: number;
  attachments?: ChatAttachment[];
  progress?: ProgressEvent[];
  // Only set when role === "handoff": agente que delega y agente que recibe
  from_agent?: string;
  to_agent?: string;
  // Set on bot messages whose text was rewritten by the mc-chat error-rewriter
  // (rate limit, watchdog abort, auth failure, etc.). Drives the "Ver detalle
  // técnico" chip + modal.
  errorDetail?: ErrorDetail;
}

interface ThreadListItem {
  id: string;
  shortId: string;
  name: string;
  messageCount: number;
  updatedAt: number;
  lastMessage: { role: string; text: string; ts: number } | null;
  hasUnread: boolean;
  lastBotTs: number | null;
}

/**
 * Poll thread messages. Automatically polls every 3s (1.5s after send).
 */
export function useThreadMessages(threadId: string | null) {
  const { isPolling, lastMsgCount, setLastMsgCount } = useChatStore();

  return useQuery<{ messages: ChatMessage[]; status: { text: string; agent?: string; ts: number } | null; pendingProgress?: ProgressEvent[] }>({
    queryKey: ["chat", "thread", threadId],
    queryFn: async () => {
      if (!threadId) return { messages: [], status: null };
      const res = await fetch(`/api/chat/thread/${encodeURIComponent(threadId)}`);
      if (!res.ok) throw new Error("Failed to fetch thread");
      const data = await res.json();
      // Track message count for new message detection
      if (data.messages?.length !== lastMsgCount) {
        setLastMsgCount(data.messages?.length || 0);
      }
      return data;
    },
    enabled: !!threadId,
    refetchInterval: isPolling ? 1500 : 3000,
    refetchIntervalInBackground: true,
    staleTime: 1000,
  });
}

/**
 * List all threads for a client slug.
 */
export function useThreadList(slug: string | null) {
  const { localThreads, localThreadNames } = useChatStore();

  return useQuery<ThreadListItem[]>({
    queryKey: ["chat", "threads", slug],
    queryFn: async () => {
      if (!slug) return [];
      const res = await fetch(`/api/chat/threads/${slug}`);
      if (!res.ok) return [];
      const data = await res.json();
      const threads: ThreadListItem[] = data.threads || [];

      // Merge local threads that aren't in the server list
      for (const tid of localThreads) {
        if (!tid.startsWith(slug + ":")) continue;
        if (!threads.some((t) => t.id === tid)) {
          const shortId = tid.replace(`${slug}:`, "");
          threads.push({
            id: tid,
            shortId,
            name: localThreadNames[tid] || shortId.replace(/-/g, " "),
            messageCount: 0,
            updatedAt: Date.now(),
            lastMessage: null,
            hasUnread: false,
            lastBotTs: null,
          });
        }
      }

      // Sort: general PINNED at top (day-to-day chat + new task creation),
      // everything else strictly by `updatedAt` desc (most recent first).
      //
      // NOTE: 2026-04-15 — removed the unread-first tier because it made the
      // list look "random" to the user. Now the order is deterministic:
      // general → most recently active → ... → oldest. Unread state is
      // communicated via a dot badge, not via position.
      threads.sort((a, b) => {
        if (a.shortId === "general" && b.shortId !== "general") return -1;
        if (b.shortId === "general" && a.shortId !== "general") return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      return threads;
    },
    enabled: !!slug,
    staleTime: 5000,
  });
}

/**
 * Send a message to a thread.
 */
export function useSendMessage() {
  const qc = useQueryClient();
  const { currentThread, threadMeta, setPolling } = useChatStore();

  return useMutation({
    mutationFn: async ({ text, threadId, attachments }: { text: string; threadId?: string; attachments?: { url: string; filename: string; mimeType: string; size: number }[] }) => {
      const tid = threadId || currentThread;
      if (!tid) throw new Error("No thread selected");
      const meta = threadMeta[tid] || {};
      const slug = tid.split(":")[0];

      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          threadId: tid,
          text,
          userName: "Admin",
          ...meta,
          ...(attachments?.length ? { attachments } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      const tid = vars.threadId || currentThread;
      // Start fast polling for 30s
      setPolling(true);
      setTimeout(() => setPolling(false), 30000);
      // Invalidate thread messages
      qc.invalidateQueries({ queryKey: ["chat", "thread", tid] });
      // Refresh thread list after 2s (new thread may have been created)
      setTimeout(() => {
        const slug = tid?.split(":")[0];
        qc.invalidateQueries({ queryKey: ["chat", "threads", slug] });
      }, 2000);
    },
  });
}

/**
 * Cancel a running agent in a thread.
 */
export function useCancelMessage() {
  const { currentThread, threadMeta, setPolling } = useChatStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId }: { threadId?: string }) => {
      const tid = threadId || currentThread;
      if (!tid) throw new Error("No thread");
      const slug = tid.split(":")[0];
      const agent = threadMeta[tid]?.agent;

      const res = await fetch("/api/chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, threadId: tid, ...(agent ? { agent } : {}) }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json();
    },
    onSuccess: () => {
      setPolling(false);
      qc.invalidateQueries({ queryKey: ["chat", "thread"] });
    },
  });
}

/**
 * Link a thread to a Discord thread.
 */
export function useLinkDiscord() {
  return useMutation({
    mutationFn: async ({
      threadId,
      guild,
      channel,
      name,
    }: {
      threadId: string;
      guild: string;
      channel: string;
      name: string;
    }) => {
      // Create Discord thread
      const createRes = await fetch("/api/discord/thread-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guild, channel, name: name.substring(0, 80) }),
      });
      if (!createRes.ok) throw new Error("Failed to create Discord thread");
      const { threadId: discordThreadId } = await createRes.json();

      // Link to MC thread
      const linkRes = await fetch("/api/chat/link-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, discordThreadId, discordChannelId: channel }),
      });
      if (!linkRes.ok) throw new Error("Failed to link threads");
      return linkRes.json();
    },
  });
}

// ---------------------------------------------------------------------------
// Quick-actions from chat-config.json
// ---------------------------------------------------------------------------

interface QuickAction {
  label: string;
  prompt: string;
}

interface ThreadMeta {
  threadName: string;
  skill: string;
  skills: string[];
  linkedTo: string;
  docPath: string | null;
  threadState?: "create" | "continue";
  // Task-specific fields for resolving quick-actions
  taskType?: string;
  channel?: string;
  tool?: string;
  pillar?: string;
  // Thread type prefix (project, task, pillar, strategy, idea, recurring, skill)
  threadType?: string;
}

/**
 * Resolves the thread type from the active thread ID or metadata.
 */
function resolveThreadType(threadId: string | null, meta?: ThreadMeta): string {
  if (meta?.threadType) return meta.threadType;
  if (!threadId) return "general";
  const short = threadId.includes(":") ? threadId.split(":").slice(1).join(":") : threadId;
  if (short.startsWith("project:")) return "project";
  if (short.startsWith("task:")) return "task";
  if (short.startsWith("strategy:")) return "strategy";
  if (short.startsWith("idea:")) return "idea";
  if (short.startsWith("recurring:")) return "recurring";
  if (short.startsWith("skill:") || short.startsWith("skill-creator:")) return "skill";
  if (short === "trust-engine") return "task"; // Trust Engine is a tool task
  // Foundation pillar threads don't have a prefix — they're just slug:pillar-name
  return "pillar";
}

/**
 * Hook to fetch quick-actions from chat-config.json via the API.
 */
export function useQuickActions(slug: string | undefined, meta?: ThreadMeta) {
  const store = useChatStore();
  const threadId = store.lockedThreadId;
  const threadType = resolveThreadType(threadId, meta);

  const { data } = useQuery({
    queryKey: ["quick-actions", slug, threadType, meta?.taskType, meta?.channel, meta?.tool, meta?.pillar, meta?.linkedTo],
    queryFn: async (): Promise<{ quickActions: QuickAction[] }> => {
      if (!slug) return { quickActions: [] };

      const params = new URLSearchParams({ slug });

      if (threadType === "pillar") {
        params.set("type", "pillar");
        // Extract pillar key from linkedTo or threadId
        const pillarKey = meta?.pillar || meta?.linkedTo?.replace(/^(foundation|brand-brain)\//, "") || threadId?.split(":").pop() || "";
        params.set("key", pillarKey);
      } else if (threadType === "task") {
        params.set("type", "task");
        if (meta?.taskType) params.set("taskType", meta.taskType);
        if (meta?.channel) params.set("channel", meta.channel);
        if (meta?.tool) params.set("tool", meta.tool);
      } else if (threadType === "project") {
        params.set("type", "project");
      } else if (threadType === "strategy") {
        params.set("type", "strategy");
      } else if (threadType === "idea") {
        params.set("type", "idea");
      } else if (threadType === "recurring") {
        params.set("type", "recurring");
      } else if (threadType === "skill") {
        params.set("type", "skill");
      } else {
        params.set("type", "general");
      }

      const res = await fetch(`/api/chat/quick-actions?${params}`);
      if (!res.ok) return { quickActions: [] };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  return { quickActions: data?.quickActions ?? [] };
}

/**
 * Mark a thread as read. Invalidates the thread list so badges update.
 */
export function useMarkThreadRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ slug, threadId }: { slug: string; threadId: string }) => {
      await fetch("/api/chat/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, threadId }),
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["chat", "threads", vars.slug] });
    },
  });
}

/**
 * Derive the total unread thread count from the thread list query.
 */
export function useUnreadCount(slug: string | null): number {
  const { data } = useThreadList(slug);
  return useMemo(() => {
    if (!data) return 0;
    return data.filter((t) => t.hasUnread).length;
  }, [data]);
}

/**
 * Helper to open a chat thread from any view.
 * Combines store operations into a single call.
 */
export function useOpenChat() {
  const { openSidebar, setCurrentSlug } = useChatStore();

  return useCallback(
    (slug: string, config: ThreadConfig) => {
      setCurrentSlug(slug);
      openSidebar(config);
    },
    [openSidebar, setCurrentSlug]
  );
}
