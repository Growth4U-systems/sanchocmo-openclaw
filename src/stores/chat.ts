import { create } from "zustand";
import type { ThreadConfig } from "@/lib/chat-openers";
import { canonicalThreadId } from "@/lib/thread-id";

// ============================================================
// Chat Store — Global state for the MC Chat execution system
// ============================================================

export interface ThreadMeta {
  skill: string;
  skills: string[];
  linkedTo: string;
  docPath: string | null;
  threadName: string;
  threadState: "create" | "continue" | undefined;
  initialMessage?: string;
  quickActions?: Array<{ label: string; prompt: string }>;
  agent?: string;
  /** `agent` = the owner stays fixed while skills are selected per turn. */
  scope?: "agent" | "skill";
  /** Shape of the associated doc — see ThreadConfig.docKind. */
  docKind?: "file" | "template";
}

interface ChatState {
  // Current context
  currentSlug: string | null;
  currentThread: string | null;

  // Thread metadata (per thread)
  threadMeta: Record<string, ThreadMeta>;

  // Local thread registry (for threads not yet persisted)
  localThreads: string[];
  localThreadNames: Record<string, string>;

  // Sidebar state
  sidebarOpen: boolean;
  sidebarLocked: boolean;
  lockedThreadId: string | null;
  isFullscreen: boolean;

  // Polling state
  isPolling: boolean;
  lastMsgCount: number;

  // Actions
  setCurrentSlug: (slug: string | null) => void;
  setCurrentThread: (threadId: string | null) => void;
  setThreadMeta: (threadId: string, meta: ThreadMeta) => void;
  getThreadMeta: (threadId: string) => ThreadMeta | undefined;
  registerThread: (threadId: string, name: string) => void;
  /**
   * Select a thread from a ThreadConfig without locking the sidebar.
   * Used by the ThreadListPanel (fullscreen browser) — unlike
   * `openSidebar(config)`, this keeps the sidebar in free mode so the
   * panel stays visible and the user can keep browsing. Populates
   * threadMeta so the doc panel and skill badges render correctly.
   */
  selectThread: (config: ThreadConfig) => void;

  // Sidebar actions
  openSidebar: (config?: ThreadConfig) => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  toggleFullscreen: () => void;
  unlockSidebar: () => void;

  // Polling actions
  setPolling: (polling: boolean) => void;
  setLastMsgCount: (count: number) => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  currentSlug: null,
  currentThread: null,
  threadMeta: {},
  localThreads: [],
  localThreadNames: {},
  sidebarOpen: false,
  sidebarLocked: false,
  lockedThreadId: null,
  isFullscreen: false,
  isPolling: false,
  lastMsgCount: 0,

  setCurrentSlug: (slug) => set({ currentSlug: slug }),

  // SAN-193: every thread id entering the store is normalized to the canonical
  // (on-disk) shape so currentThread / localThreads / threadMeta all speak the
  // SAME id the server lists back. Without this, a builder's colon-shaped id
  // (`<slug>:task:<id>`) never matches the sanitized id the storage layer
  // persists (`<slug>:task-<id>`) → phantom duplicate row + lost highlight.
  setCurrentThread: (threadId) =>
    set({ currentThread: threadId == null ? threadId : canonicalThreadId(threadId) }),

  setThreadMeta: (threadId, meta) =>
    set((state) => ({
      threadMeta: { ...state.threadMeta, [canonicalThreadId(threadId)]: meta },
    })),

  getThreadMeta: (threadId) => get().threadMeta[canonicalThreadId(threadId)],

  registerThread: (threadId, name) =>
    set((state) => {
      const tid = canonicalThreadId(threadId);
      return {
        localThreads: state.localThreads.includes(tid)
          ? state.localThreads
          : [...state.localThreads, tid],
        localThreadNames: { ...state.localThreadNames, [tid]: name },
      };
    }),

  selectThread: (config) => {
    // Free-mode thread selection — keeps the sidebar unlocked so the
    // ThreadListPanel stays visible. Updates currentThread and
    // threadMeta so the chat view + doc panel render correctly.
    set({
      currentThread: canonicalThreadId(config.threadId),
      sidebarLocked: false,
      lockedThreadId: null,
    });
    get().setThreadMeta(config.threadId, {
      skill: config.skill,
      skills: config.skills,
      linkedTo: config.linkedTo,
      docPath: config.docPath,
      threadName: config.threadName,
      threadState: config.threadState,
      initialMessage: config.initialMessage,
      quickActions: config.quickActions,
      agent: config.agent,
      scope: config.scope,
      docKind: config.docKind,
    });
    get().registerThread(config.threadId, config.threadName);
  },

  openSidebar: (config) => {
    if (config) {
      // Locked mode: sidebar tied to a specific thread
      set({
        sidebarOpen: true,
        sidebarLocked: true,
        lockedThreadId: canonicalThreadId(config.threadId),
        currentThread: canonicalThreadId(config.threadId),
      });
      // Set thread meta
      get().setThreadMeta(config.threadId, {
        skill: config.skill,
        skills: config.skills,
        linkedTo: config.linkedTo,
        docPath: config.docPath,
        threadName: config.threadName,
        threadState: config.threadState,
        initialMessage: config.initialMessage,
        quickActions: config.quickActions,
        agent: config.agent,
        scope: config.scope,
        docKind: config.docKind,
      });
      // Register thread locally
      get().registerThread(config.threadId, config.threadName);
    } else {
      // Free mode
      set({ sidebarOpen: true, sidebarLocked: false, lockedThreadId: null });
    }
  },

  closeSidebar: () =>
    set({
      sidebarOpen: false,
      isFullscreen: false,
      sidebarLocked: false,
      lockedThreadId: null,
    }),

  toggleSidebar: () => {
    const { sidebarOpen } = get();
    if (sidebarOpen) {
      get().closeSidebar();
    } else {
      set({ sidebarOpen: true });
    }
  },

  toggleFullscreen: () =>
    set((state) => ({ isFullscreen: !state.isFullscreen })),

  unlockSidebar: () =>
    set({ sidebarLocked: false, lockedThreadId: null }),

  setPolling: (polling) => set({ isPolling: polling }),

  setLastMsgCount: (count) => set({ lastMsgCount: count }),
}));
