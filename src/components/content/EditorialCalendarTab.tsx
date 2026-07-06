"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { IdeaDetailSlideOver, type IdeaForDetail } from "@/components/content/IdeaDetailSlideOver";
import { UnassignedBin } from "@/components/content/UnassignedBin";

interface Idea {
  id: string;
  title?: string;
  signal?: { summary: string; source: string; url?: string; date: string };
  angle_draft?: string;
  pillar_id: string;
  content_type?: string;
  target_channel: string;
  status: string;
  pov_confidence?: number;
  approved_at?: string;
  dispatch_date?: string;
  dispatch_slot?: string;
  published_at?: string;
  project_task_id?: string;
  project_id?: string;
  content_task_id?: string;
  content_task_channels?: string[];
}

interface CadenceProfile { name: string; handle?: string; role?: string; postsPerWeek?: number }
interface CadenceChannel {
  key: string;
  active: boolean;
  frequency: string;
  bestDays?: string[];
  bestTimes: string[];
  profiles?: CadenceProfile[];
}
interface AllConfigs {
  cadence: { businessModel: string; channels: CadenceChannel[] };
}

interface Props { slug: string }

type ViewMode = "week" | "month" | "list";

const DAY_LABELS_SHORT = ["L", "M", "X", "J", "V", "S", "D"] as const;
const DAY_LABELS_FULL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function getMonday(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoWeek(d: Date): number {
  const t = new Date(d.valueOf());
  const dn = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - dn + 3);
  const first = new Date(t.getFullYear(), 0, 4);
  return Math.round(1 + ((t.getTime() - first.getTime()) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7);
}

const CHANNEL_VISUAL: Record<string, { label: string; emoji: string; bg: string; fg: string }> = {
  linkedin:   { label: "LinkedIn",   emoji: "💼", bg: "#DCE6F2", fg: "#0A66C2" },
  twitter:    { label: "Twitter",    emoji: "🐦", bg: "#E8F1FA", fg: "#1B2C5B" },
  blog:       { label: "Blog",       emoji: "📝", bg: "var(--sc-rust-100)", fg: "var(--sc-rust-700)" },
  newsletter: { label: "Newsletter", emoji: "📧", bg: "var(--sc-sun-100)",  fg: "var(--sc-rust-700)" },
};

function statusOf(idea: Idea, dayIso: string, todayIso: string): "published" | "today" | "scheduled" | "draft" | "pending" {
  if (idea.status === "Published" || idea.published_at?.slice(0, 10) === dayIso) return "published";
  if (dayIso === todayIso) return "today";
  if (idea.status === "Approved" && idea.dispatch_date) return "scheduled";
  if (idea.status === "New") return "draft";
  return "pending";
}

const STATUS_COLOR: Record<string, string> = {
  published: "var(--sc-sage-500)",
  scheduled: "var(--sc-navy-500)",
  today:     "var(--sc-rust-500)",
  pending:   "var(--sc-sun-500)",
  draft:     "var(--sc-fg-muted)",
};

export function EditorialCalendarTab({ slug }: Props) {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => getMonday(new Date()));
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [configs, setConfigs] = useState<AllConfigs | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdea, setSelectedIdea] = useState<IdeaForDetail | null>(null);
  const [draggingIdea, setDraggingIdea] = useState<Idea | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const fetchAll = useCallback(async () => {
    const [ideasData, cfgData] = await Promise.all([
      fetch(`/api/content-engine/ideas?slug=${slug}`).then((r) => r.json()).catch(() => ({ ideas: [] })),
      fetch(`/api/content-engine/configs?slug=${slug}`).then((r) => r.json()).catch(() => ({ configs: null })),
    ]);
    setIdeas(ideasData.ideas || []);
    setConfigs(cfgData.configs || null);
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Refresh selectedIdea reference when ideas list updates so the slideover reflects edits
  useEffect(() => {
    if (!selectedIdea) return;
    const fresh = ideas.find((i) => i.id === selectedIdea.id);
    if (fresh && fresh !== (selectedIdea as unknown as Idea)) {
      setSelectedIdea(fresh as unknown as IdeaForDetail);
    } else if (!fresh) {
      setSelectedIdea(null);
    }
  }, [ideas]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayIso = isoDate(new Date());

  // Group ideas by date — only ideas with an explicit dispatch_date or published_at land in the calendar
  const ideasByDate = useMemo(() => {
    const map: Record<string, Idea[]> = {};
    for (const idea of ideas) {
      const key = (idea.dispatch_date || idea.published_at || "").slice(0, 10);
      if (!key) continue;
      (map[key] ??= []).push(idea);
    }
    return map;
  }, [ideas]);

  // Unassigned bin: New/Approved ideas without dispatch_date (canonical pipeline)
  const unassignedIdeas = useMemo<IdeaForDetail[]>(() => {
    return ideas.filter((i) =>
      !i.dispatch_date &&
      (i.status === "New" || i.status === "Approved"),
    ) as unknown as IdeaForDetail[];
  }, [ideas]);

  // New (unprocessed) ideas grouped by channel — feeds the "ready" counter in CadenceRail
  const readyByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of ideas) {
      if (i.status === "New") map[i.target_channel] = (map[i.target_channel] || 0) + 1;
    }
    return map;
  }, [ideas]);

  const assignDate = useCallback(async (ideaId: string, dateIso: string) => {
    await fetch("/api/content-engine/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, fields: { dispatch_date: dateIso } }),
    });
    fetchAll();
  }, [slug, fetchAll]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const idea = event.active.data.current?.idea as Idea | undefined;
    if (idea) setDraggingIdea(idea);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingIdea(null);
    const overId = event.over?.id;
    const idea = event.active.data.current?.idea as Idea | undefined;
    if (!overId || !idea) return;
    const overIdStr = String(overId);
    if (!overIdStr.startsWith("day-")) return;
    const dayIso = overIdStr.slice(4);
    if (idea.dispatch_date === dayIso) return;
    assignDate(idea.id, dayIso);
  }, [assignDate]);

  if (loading) return <p className="text-center py-8" style={{ color: "var(--sc-fg-muted)" }}>Cargando calendario…</p>;

  const cadence = configs?.cadence?.channels || [];
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  const weekNum = isoWeek(anchor);
  const mondayLabel = weekDays[0].toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const sundayLabel = weekDays[6].toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const monthLabel = `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;

  function shift(delta: number) {
    setAnchor((prev) => view === "month"
      ? getMonday(new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
      : addDays(prev, delta * 7)
    );
  }

  const onSelectIdea = (idea: Idea) => setSelectedIdea(idea as unknown as IdeaForDetail);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) 280px" }}>
        {/* Main column */}
        <div className="min-w-0">
          {/* CadenceRail */}
          <CadenceRail cadence={cadence} readyByChannel={readyByChannel} />

          {/* Navigation row */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => shift(-1)}
              className="font-heading uppercase text-[12px] px-2 py-1.5 rounded-sc-md border-2 sc-pop-hover"
              style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >‹</button>
            <span className="font-heading text-lg font-extrabold" style={{ color: "var(--sc-ink)", letterSpacing: "-0.01em" }}>
              {view === "month" ? monthLabel : `Semana ${weekNum} · ${mondayLabel} → ${sundayLabel}`}
            </span>
            <button
              onClick={() => shift(1)}
              className="font-heading uppercase text-[12px] px-2 py-1.5 rounded-sc-md border-2 sc-pop-hover"
              style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >›</button>
            <button
              onClick={() => setAnchor(getMonday(new Date()))}
              className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover"
              style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >Hoy</button>
            <div className="flex-1" />
            <div className="flex">
              {(["week", "month", "list"] as ViewMode[]).map((v, i, arr) => {
                const active = view === v;
                return (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 border-[2.5px] inline-flex items-center"
                    style={{
                      background: active ? "var(--sc-rust-500)" : "var(--sc-paper-3)",
                      color: active ? "var(--sc-paper-3)" : "var(--sc-ink)",
                      borderColor: "var(--sc-ink)",
                      borderRadius: i === 0 ? "8px 0 0 8px" : i === arr.length - 1 ? "0 8px 8px 0" : "0",
                      borderRightWidth: i === arr.length - 1 ? 2.5 : 0,
                    }}
                  >{v === "week" ? "Semana" : v === "month" ? "Mes" : "Lista"}</button>
                );
              })}
            </div>
          </div>

          {/* Views */}
          {view === "week" && <WeekView weekDays={weekDays} ideasByDate={ideasByDate} todayIso={todayIso} onSelectIdea={onSelectIdea} />}
          {view === "month" && <MonthView anchor={anchor} ideasByDate={ideasByDate} todayIso={todayIso} onSelectIdea={onSelectIdea} />}
          {view === "list" && <ListView weekDays={weekDays} ideasByDate={ideasByDate} todayIso={todayIso} onSelectIdea={onSelectIdea} />}

          {/* Legend */}
          <Legend />
        </div>

        {/* Sidebar: unassigned bin */}
        <UnassignedBin
          slug={slug}
          ideas={unassignedIdeas}
          onSelectIdea={(i) => setSelectedIdea(i)}
          onAssignDate={assignDate}
        />
      </div>

      <DragOverlay>
        {draggingIdea ? <DragGhost idea={draggingIdea} /> : null}
      </DragOverlay>

      <IdeaDetailSlideOver
        slug={slug}
        idea={selectedIdea}
        onClose={() => setSelectedIdea(null)}
        onUpdate={fetchAll}
      />
    </DndContext>
  );
}

function DragGhost({ idea }: { idea: Idea }) {
  const cv = CHANNEL_VISUAL[idea.target_channel] || CHANNEL_VISUAL.blog;
  return (
    <div
      className="rounded-sc-md border-2 px-2 py-1.5 max-w-[260px]"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="grid place-items-center w-5 h-5 rounded text-[10px] border"
          style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
        >{cv.emoji}</span>
        <span className="text-[11px] truncate" style={{ color: "var(--sc-ink)" }}>
          {idea.title || idea.signal?.summary || idea.id}
        </span>
      </div>
    </div>
  );
}

// ── CadenceRail ────────────────────────────────────────────────

function CadenceRail({ cadence, readyByChannel }: { cadence: CadenceChannel[]; readyByChannel: Record<string, number> }) {
  return (
    <div
      className="rounded-sc-lg overflow-hidden border-[3px] mb-4"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
    >
      <div
        className="flex items-center gap-2 px-3.5 py-2.5 border-b-2 border-dashed"
        style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
      >
        <span style={{ color: "var(--sc-rust-500)" }}>📅</span>
        <span className="font-heading uppercase text-[12.5px] tracking-wider font-bold">Cadencia editorial</span>
        <span className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>drive de publicación · editable en Engine → Configuración</span>
        <div className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>
          Hoy: {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {cadence.length === 0 ? (
          <div className="px-4 py-3 text-xs" style={{ color: "var(--sc-fg-muted)" }}>Sin cadencia configurada.</div>
        ) : cadence.map((c, i) => {
          const cv = CHANNEL_VISUAL[c.key] || { label: c.key, emoji: "📄", bg: "var(--sc-paper-2)", fg: "var(--sc-ink)" };
          const ready = readyByChannel[c.key] || 0;
          return (
            <div
              key={c.key}
              className="flex items-center gap-3 px-3.5 py-2.5"
              style={{
                borderRight: i % 2 === 0 ? "2px dashed var(--sc-ink)" : undefined,
                borderTop: i >= 2 ? "2px dashed var(--sc-ink)" : undefined,
                opacity: c.active ? 1 : 0.55,
              }}
            >
              <span
                className="grid place-items-center w-7 h-7 rounded-md border-2 text-base flex-shrink-0"
                style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
              >{cv.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-heading uppercase text-[12px] tracking-wider font-bold" style={{ color: "var(--sc-ink)" }}>
                  {cv.label}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {DAY_LABELS_SHORT.map((d, idx) => {
                    const active = c.bestDays?.includes(DAY_KEYS[idx]) ?? false;
                    return (
                      <span
                        key={idx}
                        className="grid place-items-center w-4 h-4 rounded text-[9px] font-bold border"
                        style={{
                          background: active ? "var(--sc-rust-500)" : "var(--sc-paper-2)",
                          color: active ? "var(--sc-paper-3)" : "var(--sc-fg-subtle)",
                          borderColor: active ? "var(--sc-ink)" : "var(--sc-fg-subtle)",
                        }}
                      >{d}</span>
                    );
                  })}
                  <span className="font-mono text-[10.5px] ml-1" style={{ color: "var(--sc-fg-muted)" }}>
                    {c.bestTimes?.length ? c.bestTimes.join(" · ") : "libre"}
                  </span>
                </div>
              </div>
              <span
                className="font-heading uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded-sc-pill border inline-flex items-center gap-1 flex-shrink-0"
                style={{ background: "var(--sc-sage-100)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
                title={`${ready} ideas listas para este canal`}
              >✓ {ready} ready</span>
              {c.profiles && c.profiles.length > 0 && (
                <span
                  className="text-[10.5px] flex-shrink-0 hidden lg:inline-flex items-center gap-1"
                  style={{ color: "var(--sc-fg-muted)" }}
                  title={c.profiles.map((p) => p.name).join(", ")}
                >👤 {c.profiles.slice(0, 2).map((p) => p.name).join(", ")}{c.profiles.length > 2 ? ` +${c.profiles.length - 2}` : ""}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week view ──────────────────────────────────────────────────

function WeekView({ weekDays, ideasByDate, todayIso, onSelectIdea }: { weekDays: Date[]; ideasByDate: Record<string, Idea[]>; todayIso: string; onSelectIdea: (idea: Idea) => void }) {
  return (
    <div className="grid grid-cols-7 gap-2 mb-4">
      {weekDays.map((day, i) => (
        <WeekDayCell
          key={isoDate(day)}
          day={day}
          dayIndex={i}
          dayIdeas={ideasByDate[isoDate(day)] || []}
          todayIso={todayIso}
          onSelectIdea={onSelectIdea}
        />
      ))}
    </div>
  );
}

function WeekDayCell({ day, dayIndex, dayIdeas, todayIso, onSelectIdea }: { day: Date; dayIndex: number; dayIdeas: Idea[]; todayIso: string; onSelectIdea: (idea: Idea) => void }) {
  const dayIso = isoDate(day);
  const isToday = dayIso === todayIso;
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIso}` });

  return (
    <div
      ref={setNodeRef}
      className="rounded-sc-md border-[2px] overflow-hidden flex flex-col"
      style={{
        background: isOver ? "var(--sc-sun-100)" : isToday ? "var(--sc-sun-50)" : "var(--sc-paper-3)",
        borderColor: isOver ? "var(--sc-rust-500)" : "var(--sc-ink)",
        boxShadow: isOver ? "var(--pop-md)" : isToday ? "var(--pop-sm)" : "var(--pop-xs)",
        transition: "background 120ms, border-color 120ms",
      }}
    >
      <div
        className="flex items-center justify-between px-2.5 py-1.5 border-b-2"
        style={{
          background: isToday ? "var(--sc-sun-300)" : "var(--sc-paper-2)",
          borderColor: "var(--sc-ink)",
        }}
      >
        <span className="font-heading uppercase text-[12px] tracking-wider font-bold" style={{ color: "var(--sc-ink)" }}>
          {DAY_LABELS_SHORT[dayIndex]} {day.getDate()}
        </span>
        <span className="font-mono text-[10px]" style={{ color: isToday ? "var(--sc-rust-700)" : "var(--sc-fg-muted)" }}>
          {dayIdeas.length} {dayIdeas.length === 1 ? "post" : "posts"}
        </span>
      </div>
      <div className="flex flex-col">
        {dayIdeas.length === 0 ? (
          <div className="px-2 py-3 text-xs italic text-center" style={{ color: "var(--sc-fg-muted)" }}>
            libre
          </div>
        ) : dayIdeas.map((idea) => {
          const cv = CHANNEL_VISUAL[idea.target_channel] || CHANNEL_VISUAL.blog;
          const status = statusOf(idea, dayIso, todayIso);
          return (
            <button
              key={idea.id}
              type="button"
              onClick={() => onSelectIdea(idea)}
              className="flex gap-1.5 items-start px-1.5 py-1.5 border-t border-dashed text-left w-full hover:bg-[var(--sc-sun-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-rust-500)]"
              style={{ borderColor: "rgba(31,20,16,0.15)" }}
              title="Ver detalle"
            >
              <span style={{ width: 3, alignSelf: "stretch", background: STATUS_COLOR[status], borderRadius: 2 }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 mb-0.5">
                  <span
                    className="grid place-items-center w-4 h-4 rounded text-[9px] border flex-shrink-0"
                    style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
                  >{cv.emoji}</span>
                  {status === "published" && (
                    <span className="text-[10px]" style={{ color: "var(--sc-sage-500)" }} title="Publicada">✓</span>
                  )}
                  {idea.pov_confidence != null && (
                    <span className="font-mono text-[9px] ml-auto" style={{ color: "var(--sc-rust-500)" }}>
                      {Math.round(idea.pov_confidence * 100)}%
                    </span>
                  )}
                </div>
                <div
                  className="text-[11px] leading-tight"
                  style={{
                    color: status === "today" ? "var(--sc-rust-500)" : "var(--sc-ink)",
                    fontStyle: status === "draft" || status === "pending" ? "italic" : "normal",
                    opacity: status === "draft" || status === "pending" ? 0.75 : 1,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >{idea.title || idea.signal?.summary || idea.id}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Month view ─────────────────────────────────────────────────

function MonthView({ anchor, ideasByDate, todayIso, onSelectIdea }: { anchor: Date; ideasByDate: Record<string, Idea[]>; todayIso: string; onSelectIdea: (idea: Idea) => void }) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; isOther: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ date: addDays(first, i - startOffset), isOther: true });
  for (let d = 1; d <= totalDays; d++) cells.push({ date: new Date(year, month, d), isOther: false });
  while (cells.length % 7 !== 0) cells.push({ date: addDays(cells[cells.length - 1].date, 1), isOther: true });

  return (
    <div className="mb-4">
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {DAY_LABELS_FULL.map((d) => (
          <div key={d} className="font-heading uppercase text-[11px] tracking-wider px-1.5 py-1" style={{ color: "var(--sc-fg-muted)" }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => (
          <MonthDayCell
            key={i}
            cellDate={c.date}
            isOther={c.isOther}
            dayIdeas={ideasByDate[isoDate(c.date)] || []}
            todayIso={todayIso}
            onSelectIdea={onSelectIdea}
          />
        ))}
      </div>
    </div>
  );
}

function MonthDayCell({ cellDate, isOther, dayIdeas, todayIso, onSelectIdea }: { cellDate: Date; isOther: boolean; dayIdeas: Idea[]; todayIso: string; onSelectIdea: (idea: Idea) => void }) {
  const dayIso = isoDate(cellDate);
  const isToday = dayIso === todayIso;
  const channels = Array.from(new Set(dayIdeas.map((d) => d.target_channel)));
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIso}` });

  return (
    <div
      ref={setNodeRef}
      className="rounded p-1.5 flex flex-col gap-1"
      style={{
        minHeight: 78,
        background: isOver ? "var(--sc-sun-200)" : isToday ? "var(--sc-sun-100)" : isOther ? "var(--sc-paper-2)" : "var(--sc-paper-3)",
        border: isOver ? "2px solid var(--sc-rust-500)" : "1.5px solid var(--sc-ink)",
        opacity: isOther ? 0.45 : 1,
        boxShadow: isOver ? "var(--pop-sm)" : isToday ? "var(--pop-xs)" : "none",
        transition: "background 120ms, border-color 120ms",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="font-heading font-extrabold text-sm"
          style={{ color: isToday ? "var(--sc-rust-500)" : "var(--sc-ink)" }}
        >{cellDate.getDate()}</span>
        {dayIdeas.length > 0 && (
          <span className="font-mono text-[9.5px]" style={{ color: "var(--sc-fg-muted)" }}>{dayIdeas.length}</span>
        )}
      </div>
      <div className="flex gap-0.5 flex-wrap">
        {channels.map((ch) => {
          const cv = CHANNEL_VISUAL[ch] || CHANNEL_VISUAL.blog;
          return (
            <span
              key={ch}
              className="grid place-items-center w-3.5 h-3.5 rounded text-[8px] border"
              style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
              title={cv.label}
            >{cv.emoji}</span>
          );
        })}
      </div>
      {dayIdeas.slice(0, 2).map((idea) => {
        const status = statusOf(idea, dayIso, todayIso);
        return (
          <button
            key={idea.id}
            type="button"
            onClick={() => onSelectIdea(idea)}
            className="flex gap-1 items-start text-left hover:bg-[var(--sc-sun-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-rust-500)] rounded"
            title="Ver detalle"
          >
            <span style={{ width: 3, alignSelf: "stretch", background: STATUS_COLOR[status], borderRadius: 1.5 }} />
            <span
              className="text-[9.5px] leading-tight overflow-hidden text-ellipsis"
              style={{
                color: "var(--sc-fg-soft)",
                display: "-webkit-box",
                WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical",
              }}
            >{idea.title || idea.signal?.summary || ""}</span>
          </button>
        );
      })}
      {dayIdeas.length > 2 && (
        <span className="font-heading uppercase text-[9px] tracking-wider" style={{ color: "var(--sc-fg-muted)" }}>
          +{dayIdeas.length - 2} más
        </span>
      )}
    </div>
  );
}

// ── List view ──────────────────────────────────────────────────

function ListView({ weekDays, ideasByDate, todayIso, onSelectIdea }: { weekDays: Date[]; ideasByDate: Record<string, Idea[]>; todayIso: string; onSelectIdea: (idea: Idea) => void }) {
  const allRows: { day: Date; ideas: Idea[] }[] = weekDays.map((d) => ({
    day: d,
    ideas: ideasByDate[isoDate(d)] || [],
  })).filter((r) => r.ideas.length > 0);

  if (allRows.length === 0) {
    return (
      <div className="text-center py-8 italic text-sm mb-4" style={{ color: "var(--sc-fg-muted)" }}>
        No hay contenido programado en esta semana. (Ideas con dispatch_date o approved_at vacíos.)
      </div>
    );
  }

  return (
    <div
      className="rounded-sc-lg border-[3px] overflow-hidden mb-4"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-sm)" }}
    >
      {allRows.map(({ day, ideas }, idx) => {
        const dayIso = isoDate(day);
        const isToday = dayIso === todayIso;
        return (
          <div key={dayIso} style={{ borderTop: idx === 0 ? "none" : "2px dashed var(--sc-ink)" }}>
            <div
              className="flex items-center px-3.5 py-2 gap-2"
              style={{ background: isToday ? "var(--sc-sun-300)" : "var(--sc-paper-2)" }}
            >
              <span className="font-heading uppercase text-[12px] tracking-wider font-bold">
                {day.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--sc-fg-muted)" }}>{ideas.length} {ideas.length === 1 ? "post" : "posts"}</span>
            </div>
            {ideas.map((idea) => {
              const cv = CHANNEL_VISUAL[idea.target_channel] || CHANNEL_VISUAL.blog;
              const status = statusOf(idea, dayIso, todayIso);
              return (
                <button
                  key={idea.id}
                  type="button"
                  onClick={() => onSelectIdea(idea)}
                  className="flex gap-3 items-start px-3.5 py-2.5 text-left w-full hover:bg-[var(--sc-sun-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-rust-500)]"
                  style={{ borderTop: "1px dashed rgba(31,20,16,0.15)" }}
                  title="Ver detalle"
                >
                  <span style={{ width: 4, alignSelf: "stretch", background: STATUS_COLOR[status], borderRadius: 2, flexShrink: 0 }} />
                  <span
                    className="grid place-items-center w-6 h-6 rounded-md border-2 text-sm flex-shrink-0"
                    style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
                  >{cv.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm" style={{ color: "var(--sc-ink)" }}>
                      {idea.title || idea.signal?.summary || idea.id}
                    </div>
                    <div className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>
                      {cv.label} · {idea.pillar_id} · {idea.status}
                      {idea.pov_confidence != null && ` · ${Math.round(idea.pov_confidence * 100)}% conf`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────

function Legend() {
  const items = [
    { c: STATUS_COLOR.published, l: "Publicada" },
    { c: STATUS_COLOR.scheduled, l: "Programada" },
    { c: STATUS_COLOR.today,     l: "Hoy" },
    { c: STATUS_COLOR.pending,   l: "Pendiente" },
    { c: STATUS_COLOR.draft,     l: "Borrador" },
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-3.5 px-3.5 py-2.5 rounded-sc-md border-2 border-dashed text-xs"
      style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
    >
      <span className="font-heading uppercase text-[10px] tracking-widest" style={{ color: "var(--sc-fg-muted)" }}>Estado:</span>
      {items.map((s) => (
        <span key={s.l} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded border" style={{ background: s.c, borderColor: "var(--sc-ink)" }} />
          {s.l}
        </span>
      ))}
      <span className="flex-1" />
      <span style={{ color: "var(--sc-fg-muted)" }}>
        Cadencia editable en <b style={{ color: "var(--sc-rust-500)" }}>Engine → Configuración → ④ Publica</b>
      </span>
    </div>
  );
}
