import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  // Client
  selectedClient: string | null;
  setSelectedClient: (slug: string | null) => void;

  // Theme
  theme: "light" | "dark";
  toggleTheme: () => void;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Locale
  locale: "es" | "en";
  setLocale: (locale: "es" | "en") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedClient: null,
      setSelectedClient: (slug) => set({ selectedClient: slug }),

      theme: "light",
      toggleTheme: () =>
        set((state) => {
          const next = state.theme === "light" ? "dark" : "light";
          if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", next === "dark");
          }
          return { theme: next };
        }),

      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      locale: "es",
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "mc-app-store",
      partialize: (state) => ({
        selectedClient: state.selectedClient,
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        locale: state.locale,
      }),
    }
  )
);
