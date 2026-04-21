/**
 * ThreadListPanel — Chat thread list rendered as a side panel.
 *
 * Replaces the legacy `<select>` dropdown in `chat-sidebar.tsx`. Shows one
 * row per thread with icon, name, last message preview, timestamp, and
 * unread dot. Click selects the thread and becomes the `activeThreadId`
 * of the sidebar.
 *
 * Phase 1 scope (2026-04-15):
 *   - Scrollable list, sorted by `updatedAt` desc (general pinned top)
 *   - Click → select thread
 *   - Unread badge (dot + bold name)
 *   - Relative timestamp ("hace 5 min", "ayer", "3d")
 *
 * Phase 2+ (not yet):
 *   - Search input + filter tabs (All / Unread / Archived)
 *   - Rename / archive / delete per item (via context menu "⋯")
 *   - Bulk actions (mark all read, archive all read)
 *   - "Abrir documento" button per item (opens DocSlideOver side-by-side)
 */

"use client";

import { useCallback, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useThreadList } from "@/hooks/useChat";
import { useProjects } from "@/hooks/useProjects";
import { threadIcon } from "@/lib/chat-openers";
import { formatThreadDisplayName } from "@/lib/thread-display-name";

interface Props {
  slug: string;
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  /** Force a narrow-rail rendering (icon + short name only). Default: false. */
  narrow?: boolean;
}

/** Relative time string for a message timestamp. */
function relTime(ms: number | null | undefined): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function ThreadListPanel({
  slug,
  activeThreadId,
  onSelectThread,
  narrow = false,
}: Props) {
  const t = useTranslations("chat");
  const { data: threads = [], isLoading } = useThreadList(slug);
  const { data: projects } = useProjects(slug);

  // ── Search + filter state ─────────────────────────────────────────
  const [search, setSearch] = useState("");
  type FilterTab = "all" | "unread" | "tasks" | "foundation" | "projects";
  const [filter, setFilter] = useState<FilterTab>("all");

  const handleClick = useCallback(
    (threadId: string) => {
      onSelectThread(threadId);
    },
    [onSelectThread]
  );

  // ── Derive display names once, then filter on them ────────────────
  const threadsWithNames = useMemo(
    () =>
      threads.map((thread) => ({
        ...thread,
        displayName: formatThreadDisplayName(
          { shortId: thread.shortId, name: thread.name },
          projects
        ),
      })),
    [threads, projects]
  );

  const filtered = useMemo(() => {
    let result = threadsWithNames;

    // Tab filter
    if (filter === "unread") {
      result = result.filter((t) => t.hasUnread);
    } else if (filter === "tasks") {
      result = result.filter((t) =>
        t.shortId.startsWith("task:") || t.shortId.match(/^[^:]+:task:/)
      );
    } else if (filter === "foundation") {
      result = result.filter((t) => {
        const sid = t.shortId;
        return (
          !sid.includes("task:") &&
          !sid.includes("project:") &&
          !sid.includes("strategy:") &&
          !sid.includes("recurring:") &&
          !sid.includes("idea:") &&
          !sid.includes("general")
        );
      });
    } else if (filter === "projects") {
      result = result.filter((t) => t.shortId.includes("project:"));
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.displayName.toLowerCase().includes(q) ||
          t.shortId.toLowerCase().includes(q) ||
          (t.lastMessage?.text || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [threadsWithNames, filter, search]);

  // ── Filter tab config ─────────────────────────────────────────────
  const FILTER_TABS: { key: FilterTab; label: string; icon?: string }[] = [
    { key: "all", label: "Todos" },
    { key: "unread", label: "Sin leer" },
    { key: "tasks", label: "Tareas" },
    { key: "foundation", label: "Foundation" },
    { key: "projects", label: "Proyectos" },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-[13px] text-[#6c7086]">
        {t("loading") ?? "Cargando..."}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <span className="text-3xl mb-2">💬</span>
        <p className="text-[14px] text-[#6c7086]">{t("noThreads") ?? "Sin threads todavía"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search input */}
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6c7086] text-[12px] pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar threads..."
            className="w-full bg-[#313244] border border-[#45475a] rounded-md pl-8 pr-3 py-1.5 text-[12px] text-[#cdd6f4] placeholder:text-[#6c7086] focus:outline-none focus:border-rust transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6c7086] hover:text-[#cdd6f4] text-[11px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-2 pb-2 overflow-x-auto scrollbar-none">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === "unread"
              ? threadsWithNames.filter((t) => t.hasUnread).length
              : undefined;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                "text-[11px] px-2 py-1 rounded-md whitespace-nowrap transition-colors flex-shrink-0",
                filter === tab.key
                  ? "bg-rust text-white font-semibold"
                  : "bg-[#313244] text-[#a6adc8] hover:bg-[#45475a] hover:text-[#cdd6f4]"
              )}
            >
              {tab.label}
              {count !== undefined && count > 0 && (
                <span className="ml-1 opacity-75">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Thread list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
          <p className="text-[12px] text-[#6c7086]">
            {search ? `Sin resultados para "${search}"` : "Sin threads en este filtro"}
          </p>
          {(search || filter !== "all") && (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilter("all"); }}
              className="text-[11px] text-rust hover:underline mt-1"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
      <ul className="flex flex-col py-1 overflow-y-auto flex-1 min-h-0">
        {filtered.map((thread) => {
        const isActive = thread.id === activeThreadId;
        const lastTs = thread.lastBotTs || thread.updatedAt || null;
        const lastText = thread.lastMessage?.text || "";
        const preview =
          lastText.length > 80 ? lastText.slice(0, 80) + "…" : lastText;

        return (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => handleClick(thread.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors",
                "hover:bg-[#313244]",
                isActive && "bg-[#45475a] border-l-2 border-l-rust"
              )}
            >
              {/* Icon */}
              <span className="text-lg flex-shrink-0 leading-tight mt-0.5">
                {threadIcon(thread.shortId)}
              </span>

              {/* Name + preview */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {thread.hasUnread && (
                    <span
                      className="w-2 h-2 rounded-full bg-rust flex-shrink-0"
                      aria-label="unread"
                    />
                  )}
                  <span
                    className={cn(
                      "text-[14px] truncate flex-1 leading-snug",
                      thread.hasUnread
                        ? "font-semibold text-[#cdd6f4]"
                        : "text-[#cdd6f4]"
                    )}
                  >
                    {thread.displayName}
                  </span>
                  {lastTs && !narrow && (
                    <span className="text-[11px] text-[#a6adc8] flex-shrink-0">
                      {relTime(lastTs)}
                    </span>
                  )}
                </div>
                {!narrow && preview && (
                  <div className="text-[12px] text-[#a6adc8] truncate mt-1 leading-snug">
                    {preview}
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
      )}
    </div>
  );
}
