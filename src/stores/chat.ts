import { create } from "zustand";
import type { ThreadConfig } from "@/lib/chat-openers";

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

  setCurrentThread: (threadId) => set({ currentThread: threadId }),

  setThreadMeta: (threadId, meta) =>
    set((state) => ({
      threadMeta: { ...state.threadMeta, [threadId]: meta },
    })),

  getThreadMeta: (threadId) => get().threadMeta[threadId],

  registerThread: (threadId, name) =>
    set((state) => ({
      localThreads: state.localThreads.includes(threadId)
        ? state.localThreads
        : [...state.localThreads, threadId],
      localThreadNames: { ...state.localThreadNames, [threadId]: name },
    })),

  openSidebar: (config) => {
    if (config) {
      // Locked mode: sidebar tied to a specific thread
      set({
        sidebarOpen: true,
        sidebarLocked: true,
        lockedThreadId: config.threadId,
        currentThread: config.threadId,
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
