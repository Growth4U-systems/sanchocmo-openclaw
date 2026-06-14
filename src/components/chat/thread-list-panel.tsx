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
import { useTaskRows, useUpdateTaskStatus } from "@/hooks/useTasks";
import { threadIcon } from "@/lib/chat-openers";
import { formatThreadDisplayName } from "@/lib/thread-display-name";
import { StatusPill } from "@/components/shared/status-pill";
import { TASK_STATUS_OPTIONS, normalizeTaskStatusQuiet } from "@/lib/task-status";

/**
 * Extrae la clave de tarea (lowercase) de un shortId de hilo. Los hilos de
 * tarea llegan como `task-<id>` (el thread store reemplaza `:`→`-` al
 * persistir el fichero) o, en su forma canónica, `task:<id>` /
 * `<algo>:task:<id>`. Devuelve null para hilos sin tarea (Pilares Foundation,
 * libres, proyectos, ideas…) → esos no llevan badge ni acción de archivar.
 */
function taskKeyFromShortId(shortId: string): string | null {
  const m = shortId.match(/(?:^|:)task[:-](.+)$/i);
  return m ? m[1].toLowerCase() : null;
}

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
  const { data: taskRows = [] } = useTaskRows(slug);
  const updateTaskStatus = useUpdateTaskStatus();

  // ── Search + filter state ─────────────────────────────────────────
  const [search, setSearch] = useState("");
  type FilterTab = "all" | "unread" | "tasks" | "foundation" | "projects" | "archived";
  const [filter, setFilter] = useState<FilterTab>("all");
  // Qué hilo tiene el menú "cambiar estado" abierto (null = ninguno).
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const handleClick = useCallback(
    (threadId: string) => {
      onSelectThread(threadId);
    },
    [onSelectThread]
  );

  // ── Índice tarea→estado (lowercase id → { id real, estado canónico }) ──
  // El shortId del hilo lleva el id en minúsculas; guardamos el id real para
  // poder mutar el estado vía el endpoint (que espera el id tal cual).
  const taskByLower = useMemo(() => {
    const m = new Map<string, { id: string; status: string }>();
    for (const r of taskRows) {
      m.set(r.id.toLowerCase(), { id: r.id, status: normalizeTaskStatusQuiet(r.status) });
    }
    return m;
  }, [taskRows]);

  // ── Derive display names + estado de la tarea ligada ──────────────
  const threadsWithNames = useMemo(
    () =>
      threads.map((thread) => {
        const taskKey = taskKeyFromShortId(thread.shortId);
        const task = taskKey ? taskByLower.get(taskKey) : undefined;
        return {
          ...thread,
          displayName: formatThreadDisplayName(
            { shortId: thread.shortId, name: thread.name },
            projects
          ),
          taskId: task?.id ?? null,
          taskStatus: task?.status ?? null,
        };
      }),
    [threads, projects, taskByLower]
  );

  const archivedCount = useMemo(
    () => threadsWithNames.filter((t) => t.taskStatus === "archived").length,
    [threadsWithNames]
  );

  const filtered = useMemo(() => {
    let result = threadsWithNames;

    // Pestaña Archivados = SOLO hilos con tarea archivada. El resto de
    // pestañas excluyen siempre los archivados (no aparecen nunca fuera).
    if (filter === "archived") {
      result = result.filter((t) => t.taskStatus === "archived");
    } else {
      result = result.filter((t) => t.taskStatus !== "archived");
      if (filter === "unread") {
        result = result.filter((t) => t.hasUnread);
      } else if (filter === "tasks") {
        result = result.filter((t) => taskKeyFromShortId(t.shortId) !== null);
      } else if (filter === "foundation") {
        // Solo hilos de Pilar: ni tarea, ni proyecto/estrategia/recurrente/idea,
        // ni el general. Los separadores llegan como `:` (canónico) o `-` (al
        // persistir el fichero), así que se contemplan ambos.
        result = result.filter((t) => {
          const sid = t.shortId;
          if (taskKeyFromShortId(sid)) return false;
          if (/(?:^|:)(project|strategy|recurring|idea)[:-]/i.test(sid)) return false;
          return !sid.includes("general");
        });
      } else if (filter === "projects") {
        result = result.filter((t) => /(?:^|:)project[:-]/i.test(t.shortId));
      }
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
    { key: "archived", label: "Archivados" },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-[13px] text-[var(--chat-text-faint)]">
        {t("loading") ?? "Cargando..."}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <span className="text-3xl mb-2">💬</span>
        <p className="text-[14px] text-[var(--chat-text-faint)]">{t("noThreads") ?? "Sin threads todavía"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search input */}
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--chat-text-faint)] text-[12px] pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar threads..."
            className="w-full bg-[var(--chat-surface)] border border-[var(--chat-border)] rounded-md pl-8 pr-3 py-1.5 text-[12px] text-[var(--chat-text)] placeholder:text-[var(--chat-text-faint)] focus:outline-none focus:border-rust transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--chat-text-faint)] hover:text-[var(--chat-text)] text-[11px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs — wrap a 2ª línea en panel estrecho para que ninguna
          pestaña (p.ej. "Archivados") quede cortada fuera del viewport. */}
      <div className="flex flex-wrap gap-1 px-2 pb-2">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === "unread"
              ? threadsWithNames.filter((t) => t.hasUnread).length
              : tab.key === "archived"
                ? archivedCount
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
                  : "bg-[var(--chat-surface)] text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)]"
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
          <p className="text-[12px] text-[var(--chat-text-faint)]">
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

        const canManage = !narrow && !!thread.taskId;
        const menuOpen = menuFor === thread.id;

        return (
          <li key={thread.id} className="relative group">
            <button
              type="button"
              onClick={() => handleClick(thread.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors",
                "hover:bg-[var(--chat-surface)]",
                canManage && "pr-8",
                isActive && "bg-[var(--chat-surface-2)] border-l-2 border-l-rust"
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
                        ? "font-semibold text-[var(--chat-text)]"
                        : "text-[var(--chat-text)]"
                    )}
                  >
                    {thread.displayName}
                  </span>
                  {lastTs && !narrow && (
                    <span className="text-[11px] text-[var(--chat-text-muted)] flex-shrink-0">
                      {relTime(lastTs)}
                    </span>
                  )}
                </div>
                {!narrow && (thread.taskStatus || preview) && (
                  <div className="flex items-center gap-1.5 mt-1 min-w-0">
                    {thread.taskStatus && (
                      <StatusPill status={thread.taskStatus} size="sm" />
                    )}
                    {preview && (
                      <span className="text-[12px] text-[var(--chat-text-muted)] truncate leading-snug min-w-0">
                        {preview}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>

            {/* Kebab "cambiar estado" — solo en hilos con tarea ligada */}
            {canManage && (
              <>
                <button
                  type="button"
                  aria-label="Cambiar estado"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor(menuOpen ? null : thread.id);
                  }}
                  className={cn(
                    "absolute right-1 top-2 grid h-6 w-6 place-items-center rounded-md text-[14px]",
                    "text-[var(--chat-text-muted)] hover:text-[var(--chat-text)] hover:bg-[var(--chat-surface-2)] transition",
                    menuOpen ? "opacity-100 bg-[var(--chat-surface-2)]" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  ⋯
                </button>
                {menuOpen && (
                  <>
                    {/* Backdrop para cerrar al hacer click fuera */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuFor(null)}
                    />
                    <div className="absolute right-1 top-8 z-20 w-44 rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] py-1 shadow-lg">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--chat-text-faint)]">
                        Cambiar estado
                      </div>
                      {TASK_STATUS_OPTIONS.map((opt) => {
                        const current = thread.taskStatus === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={current || updateTaskStatus.isPending}
                            onClick={() => {
                              setMenuFor(null);
                              if (current || !thread.taskId) return;
                              updateTaskStatus.mutate({
                                slug,
                                taskId: thread.taskId,
                                status: opt.value,
                              });
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
                              current
                                ? "text-[var(--chat-text-faint)] cursor-default"
                                : "text-[var(--chat-text)] hover:bg-[var(--chat-surface-2)]"
                            )}
                          >
                            <StatusPill status={opt.value} size="sm" />
                            <span className="truncate">{opt.label}</span>
                            {current && <span className="ml-auto text-[11px]">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
      )}
    </div>
  );
}
