/** Ideas Board — Kanban + Calendar views for content ideas. */
"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { KanbanBoard, type KanbanColumn } from "@/components/shared/kanban-board";

interface Idea {
  id: string;
  title: string;
  status: "new" | "approved" | "in-progress" | "published" | "rejected";
  channels: string[];
  source: string;
  priorityScore: number;
  createdAt: string;
  skill?: string;
  projectIds?: string[];
}

interface IdeasBoardProps {
  slug: string;
  ideas: Idea[];
  onOpenChat: (ideaId: string) => void;
  onApproveIdeas: (ids: string[]) => void;
  onRejectIdeas: (ids: string[]) => void;
}

type StatusFilter = "all" | "new" | "approved" | "in-progress" | "published";
type ViewMode = "kanban" | "calendar";

const CHANNEL_COLORS: Record<string, string> = {
  blog: "bg-blue-400/20 text-blue-700",
  li: "bg-cyan-400/20 text-cyan-700",
  linkedin: "bg-cyan-400/20 text-cyan-700",
  ig: "bg-purple-400/20 text-purple-700",
  instagram: "bg-purple-400/20 text-purple-700",
  nl: "bg-green-400/20 text-green-700",
  newsletter: "bg-green-400/20 text-green-700",
  tt: "bg-pink-400/20 text-pink-700",
  tiktok: "bg-pink-400/20 text-pink-700",
  twitter: "bg-slate-400/20 text-slate-700",
  x: "bg-slate-400/20 text-slate-700",
};

const _CHANNEL_DOT: Record<string, string> = {
  blog: "bg-blue-400",
  linkedin: "bg-cyan-400",
  li: "bg-cyan-400",
  instagram: "bg-purple-400",
  ig: "bg-purple-400",
  newsletter: "bg-green-400",
  nl: "bg-green-400",
  tiktok: "bg-pink-400",
  tt: "bg-pink-400",
  twitter: "bg-slate-400",
  x: "bg-slate-400",
};

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "new", label: "Nuevas" },
  { key: "approved", label: "Aprobadas" },
  { key: "in-progress", label: "En progreso" },
  { key: "published", label: "Publicadas" },
];

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function countByStatus(ideas: Idea[], status: StatusFilter) {
  if (status === "all") return ideas.length;
  return ideas.filter((i) => i.status === status).length;
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function IdeasBoard({ ideas, onOpenChat, onApproveIdeas: _onApproveIdeas, onRejectIdeas }: IdeasBoardProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewMode>("kanban");
  const [calMonth, setCalMonth] = useState(() => new Date());

  const filtered = useMemo(
    () => (filter === "all" ? ideas : ideas.filter((i) => i.status === filter)),
    [ideas, filter],
  );

  // ── Kanban columns ──

  const columns: KanbanColumn<Idea>[] = useMemo(() => {
    const bucket = (s: Idea["status"]) => filtered.filter((i) => i.status === s);
    return [
      { key: "new", label: "Nuevas", icon: "💡", color: "text-purple-600", items: bucket("new") },
      { key: "approved", label: "Aprobadas", icon: "✅", color: "text-blue-600", items: bucket("approved") },
      { key: "in-progress", label: "En progreso", icon: "🔧", color: "text-yellow-600", items: bucket("in-progress") },
      { key: "published", label: "Publicadas", icon: "🚀", color: "text-green-600", items: bucket("published") },
    ];
  }, [filtered]);

  // ── Calendar data ──

  const calYear = calMonth.getFullYear();
  const calMo = calMonth.getMonth();
  const calCells = useMemo(() => getMonthDays(calYear, calMo), [calYear, calMo]);

  const ideasByDay = useMemo(() => {
    const map: Record<number, Idea[]> = {};
    for (const idea of filtered) {
      const d = new Date(idea.createdAt);
      if (d.getFullYear() === calYear && d.getMonth() === calMo) {
        (map[d.getDate()] ??= []).push(idea);
      }
    }
    return map;
  }, [filtered, calYear, calMo]);

  function shiftMonth(delta: number) {
    setCalMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  // ── Render ──

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "text-xs font-semibold px-3 py-1 rounded-full border-2 transition-colors",
              filter === f.key
                ? "border-ink bg-ink text-white"
                : "border-border bg-card text-muted-foreground hover:border-ink/40",
            )}
          >
            {f.label}
            <span className="ml-1.5 text-[10px] opacity-70">{countByStatus(ideas, f.key)}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center rounded-lg border-2 border-border overflow-hidden text-xs font-semibold">
          {(["kanban", "calendar"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1 transition-colors",
                view === v ? "bg-ink text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v === "kanban" ? "Kanban" : "Calendario"}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === "kanban" ? (
        <KanbanBoard<Idea>
          columns={columns}
          emptyLabel="Sin ideas"
          renderCard={(idea) => (
            <div
              onClick={() => onOpenChat(idea.id)}
              className="rounded-lg border-[3px] border-ink bg-card p-4 shadow-comic-sm hover:-translate-y-0.5 hover:shadow-comic transition-all cursor-pointer space-y-2"
            >
              <p className="text-sm font-bold leading-tight">{idea.title}</p>
              <div className="flex flex-wrap gap-1">
                {idea.channels.map((ch) => (
                  <span
                    key={ch}
                    className={cn("text-[10px] font-medium rounded px-1.5 py-0.5", CHANNEL_COLORS[ch.toLowerCase()] ?? "bg-muted text-muted-foreground")}
                  >
                    {ch}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>⚡ {idea.priorityScore}</span>
                <span>{idea.source} · {new Date(idea.createdAt).toLocaleDateString("es")}</span>
              </div>
            </div>
          )}
        />
      ) : (
        <div>
          {/* Calendar nav */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <button onClick={() => shiftMonth(-1)} className="text-lg font-bold hover:opacity-60">&lt;</button>
            <span className="text-sm font-bold">{MONTH_NAMES[calMo]} {calYear}</span>
            <button onClick={() => shiftMonth(1)} className="text-lg font-bold hover:opacity-60">&gt;</button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border-2 border-border">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold uppercase py-1 bg-muted text-muted-foreground">
                {d}
              </div>
            ))}
            {calCells.map((day, i) => (
              <div key={i} className={cn("bg-card min-h-[72px] p-1", !day && "bg-muted/40")}>
                {day && (
                  <>
                    <span className="text-[10px] font-semibold text-muted-foreground">{day}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {(ideasByDay[day] ?? []).slice(0, 3).map((idea) => (
                        <button
                          key={idea.id}
                          onClick={() => onOpenChat(idea.id)}
                          className={cn(
                            "block w-full text-left rounded px-1 py-0.5 text-[9px] font-medium truncate hover:opacity-80",
                            CHANNEL_COLORS[idea.channels[0]?.toLowerCase()] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {idea.title}
                        </button>
                      ))}
                      {(ideasByDay[day]?.length ?? 0) > 3 && (
                        <span className="text-[9px] text-muted-foreground pl-1">
                          +{ideasByDay[day]!.length - 3}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
