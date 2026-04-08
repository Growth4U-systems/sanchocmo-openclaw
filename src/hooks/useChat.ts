import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { useChatStore } from "@/stores/chat";
import { getAutoPrompt, type ThreadConfig } from "@/lib/chat-openers";

// ============================================================
// Chat Hooks — TanStack Query integration for MC Chat system
// ============================================================

interface ChatMessage {
  role: "user" | "bot" | "status";
  text: string;
  agent?: string;
  ts?: number;
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

  return useQuery<{ messages: ChatMessage[]; status: { text: string } | null }>({
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

      // Sort: general first, then unread (by lastBotTs desc), then read (by updatedAt desc)
      threads.sort((a, b) => {
        if (a.shortId === "general") return -1;
        if (b.shortId === "general") return 1;
        if (a.hasUnread && !b.hasUnread) return -1;
        if (!a.hasUnread && b.hasUnread) return 1;
        if (a.hasUnread && b.hasUnread) return (b.lastBotTs || 0) - (a.lastBotTs || 0);
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
    mutationFn: async ({ text, threadId }: { text: string; threadId?: string }) => {
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
  const { currentThread, setPolling } = useChatStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId }: { threadId?: string }) => {
      const tid = threadId || currentThread;
      if (!tid) throw new Error("No thread");
      const slug = tid.split(":")[0];

      const res = await fetch("/api/chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, threadId: tid }),
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

/**
 * Hook to auto-send initial prompt when opening a new empty thread.
 */
export function useAutoPrompt(config: ThreadConfig | null, hasMessages: boolean) {
  const sendMessage = useSendMessage();
  const sentRef = useRef(false);

  useEffect(() => {
    if (!config || hasMessages || sentRef.current) return;
    if (!config.threadState) return;

    const prompt = getAutoPrompt(config);
    sentRef.current = true;
    sendMessage.mutate({ text: prompt, threadId: config.threadId });
  }, [config, hasMessages, sendMessage]);
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
