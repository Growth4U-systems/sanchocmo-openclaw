"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  usePostingCalendar,
  useInvalidatePostingCalendar,
  type CalendarEvent,
  type ReadyDraft,
} from "@/hooks/usePostingCalendar";
import {
  useCancelPublishing,
  usePublishDraft,
  usePublishProviders,
} from "@/hooks/usePublishing";
import type { ProviderInfo } from "@/lib/publishing/types";
import { ConnectPublishingButton } from "@/components/content/ConnectPublishingButton";
import { ChannelPreview } from "@/components/content/channel-preview";
import { PublishingAccountInfo } from "@/components/content/PublishingAccountInfo";
import { PostMetricsBadge } from "@/components/content/PostMetricsBadge";

type PreviewItem =
  | { kind: "scheduled"; event: CalendarEvent }
  | { kind: "ready"; draft: ReadyDraft };

/**
 * Posting Calendar — operational hub for scheduling Ready drafts to platforms.
 *
 * Drafts whose ContentTask is in status `Ready` (and not yet scheduled) appear
 * in the left sidebar (ReadyQueue). Drag onto a day to open the schedule
 * modal; on confirm, calls `POST /api/publishing/publish` with `schedule.publishAt`
 * and the post lands on the calendar with status `scheduled`.
 *
 * Click on an existing event to preview body, see status, or cancel scheduled
 * posts. Reschedule = drag a scheduled event onto a new day (cancel + publish).
 */

const CHANNEL_VISUAL: Record<string, { label: string; emoji: string; bg: string; fg: string }> = {
  linkedin:   { label: "LinkedIn",  emoji: "💼", bg: "var(--sc-navy-500)", fg: "var(--sc-paper-3)" },
  twitter:    { label: "X",         emoji: "🐦", bg: "var(--sc-ink)",      fg: "var(--sc-paper-3)" },
  instagram:  { label: "Instagram", emoji: "📷", bg: "var(--sc-rust-500)", fg: "var(--sc-paper-3)" },
  blog:       { label: "Blog",      emoji: "📝", bg: "var(--sc-sage-500)", fg: "var(--sc-paper-3)" },
  newsletter: { label: "Newsletter",emoji: "📧", bg: "var(--sc-sun-300)",  fg: "var(--sc-ink)" },
};

const STATUS_VISUAL: Record<CalendarEvent["status"], { label: string; bg: string; fg: string }> = {
  scheduled:  { label: "⏰ Programado", bg: "var(--sc-sun-100)", fg: "var(--sc-ink)" },
  publishing: { label: "🚀 Publicando", bg: "var(--sc-rust-100)", fg: "var(--sc-rust-700)" },
  published:  { label: "✓ Publicado",   bg: "var(--sc-sage-100)", fg: "var(--sc-ink)" },
  failed:     { label: "✗ Falló",       bg: "var(--sc-brick-bg)", fg: "var(--sc-brick-500)" },
  canceled:   { label: "Cancelado",     bg: "var(--sc-paper-2)",  fg: "var(--sc-fg-muted)" },
};

/** Watchdog visual used when a "scheduled" event has drifted past its
 *  publish time without reconciliation confirming it. Same shape as the
 *  STATUS_VISUAL entries so EventCard can use it interchangeably. */
const UNCONFIRMED_VISUAL = {
  label: "⚠️ Sin confirmar",
  bg: "var(--sc-brick-bg)",
  fg: "var(--sc-brick-500)",
} as const;

/** A Ready Queue draft is "media-blocked" when its channel requires media
 *  (media_policy=required) and the attached media doesn't satisfy the
 *  per-network contract. The Programar action is disabled until the right
 *  artifact is uploaded — the publish endpoint enforces the same rule
 *  server-side, this just gives immediate feedback.
 *
 *  Per-network rules (mirror of publish.ts):
 *   - linkedin: needs at least one PDF (carousel = native document).
 *   - twitter/x/instagram: needs at least one image.
 *   - other: needs at least one media asset of any type. */
function mediaBlockReason(draft: ReadyDraft): string | null {
  if (draft.media_policy !== "required") return null;
  const items = draft.media || [];
  if (items.length === 0) return "Necesita media — sube imágenes / PDF antes de programar";
  if (draft.channel === "linkedin") {
    const hasPdf = items.some((m) => m.type === "application/pdf");
    if (!hasPdf) return "Carrusel LinkedIn necesita un PDF multi-página — bundle los slides en un PDF y adjúntalo";
  } else if (draft.channel === "twitter" || draft.channel === "x" || draft.channel === "instagram") {
    const hasImage = items.some((m) => typeof m.type === "string" && m.type.startsWith("image/"));
    if (!hasImage) return "Necesita al menos una imagen antes de programar";
  }
  return null;
}

function isMediaBlocked(draft: ReadyDraft): boolean {
  return mediaBlockReason(draft) !== null;
}

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Local-timezone YYYY-MM-DD for a Date. We deliberately avoid
 *  `toISOString().slice(0,10)` because that returns the UTC date, which
 *  is off-by-one in timezones ahead of UTC (e.g. Europe/Madrid in May).
 *  Both day-column keys and event grouping must use the same local-date
 *  convention or events land in the wrong column. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Monday of the week containing `d`, normalized to local 00:00. */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7; // 0=Mon
  out.setDate(out.getDate() - day);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function formatRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const fmt = (date: Date, withMonth: boolean) =>
    `${date.getDate()}${withMonth ? ` ${date.toLocaleDateString("es-ES", { month: "short" })}` : ""}`;
  return `${fmt(weekStart, !sameMonth)} – ${fmt(end, true)} ${end.getFullYear()}`;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Reasonable default time for the schedule modal. If `dayIso` is today,
 *  jump to (now + 30 min) rounded up to the next 5-min mark — picking
 *  09:00 when it's already 15:00 just gives you Metricool's "datetime in
 *  the past" error. For future days, 09:00 is a sensible default. */
function defaultTimeFor(dayIso: string): string {
  const todayIso = isoDate(new Date());
  if (dayIso !== todayIso) return "09:00";
  const future = new Date(Date.now() + 30 * 60_000);
  // Round up to the nearest 5 min
  const m = future.getMinutes();
  const rounded = m % 5 === 0 ? m : m + (5 - (m % 5));
  if (rounded >= 60) {
    future.setHours(future.getHours() + 1);
    future.setMinutes(0);
  } else {
    future.setMinutes(rounded);
  }
  return `${String(future.getHours()).padStart(2, "0")}:${String(future.getMinutes()).padStart(2, "0")}`;
}

export function PostingCalendarTab({ slug, focusKey }: { slug: string; focusKey?: string | null }) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const fromIso = isoDate(weekStart);
  const toIso = isoDate(addDays(weekStart, 6));
  const todayIso = isoDate(new Date());

  const calendar = usePostingCalendar(slug, fromIso, toIso);
  const invalidate = useInvalidatePostingCalendar();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [draggedItem, setDraggedItem] = useState<{ kind: "ready"; draft: ReadyDraft } | { kind: "event"; event: CalendarEvent } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ dayIso: string; draft: ReadyDraft; rescheduleFrom?: CalendarEvent } | null>(null);
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);

  const { scheduled, ready_queue } = calendar.data ?? { scheduled: [] as CalendarEvent[], ready_queue: [] as ReadyDraft[] };

  // Group scheduled events by day for fast lookup
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of scheduled) {
      // Convert the stored UTC scheduled_at to the local date so events
      // land in the same column the day-column keys use. Slicing the ISO
      // string is wrong: it gives UTC date, which is off-by-one in TZs
      // ahead of UTC near midnight.
      const day = isoDate(new Date(ev.scheduled_at));
      (map[day] ||= []).push(ev);
    }
    for (const day of Object.keys(map)) {
      map[day].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    }
    return map;
  }, [scheduled]);

  // Auto-open the schedule modal when arriving from the editor with
  // ?focus={ideaId}:{channel}. Defaults the day to today; the user picks
  // hour + provider in the modal. Only fires once per focusKey value.
  const consumedFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey || consumedFocusRef.current === focusKey) return;
    if (!calendar.data) return;
    const draft = ready_queue.find((d) => `${d.ideaId}:${d.channel}` === focusKey);
    if (!draft) return;
    consumedFocusRef.current = focusKey;
    setScheduleTarget({ dayIso: isoDate(new Date()), draft });
  }, [focusKey, calendar.data, ready_queue]);

  function openScheduleFor(draft: ReadyDraft, dayIso?: string) {
    setScheduleTarget({ dayIso: dayIso || isoDate(new Date()), draft });
  }

  /** Open the schedule modal in reschedule mode for an existing calendar
   *  event. Defaults the day to the current scheduled day so the user only
   *  has to tweak the hour. Passes rescheduleFrom so the modal knows whether
   *  to call cancel before publish (only when status === "scheduled"). */
  function openRescheduleFor(event: CalendarEvent) {
    const synthetic: ReadyDraft = {
      ideaId: event.ideaId,
      contentTaskId: event.contentTaskId,
      parentTaskId: event.parentTaskId,
      channel: event.channel,
      title: event.title,
      ready_at: event.scheduled_at,
      hero_media_url: event.hero_media_url,
      has_media: !!event.hero_media_url || event.media.length > 0,
      body: event.body,
      media: event.media,
    };
    setScheduleTarget({
      // Local date — same convention as the day-column keys.
      dayIso: isoDate(new Date(event.scheduled_at)),
      draft: synthetic,
      rescheduleFrom: event,
    });
  }

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as { kind?: "ready" | "event"; draft?: ReadyDraft; event?: CalendarEvent } | undefined;
    if (data?.kind === "ready" && data.draft) setDraggedItem({ kind: "ready", draft: data.draft });
    else if (data?.kind === "event" && data.event) setDraggedItem({ kind: "event", event: data.event });
  }

  function handleDragEnd(e: DragEndEvent) {
    const dropId = typeof e.over?.id === "string" ? e.over.id : null;
    setDraggedItem(null);
    if (!dropId || !dropId.startsWith("day-")) return;
    const dayIso = dropId.slice(4);

    const data = e.active.data.current as { kind?: "ready" | "event"; draft?: ReadyDraft; event?: CalendarEvent } | undefined;
    if (data?.kind === "ready" && data.draft) {
      // Client-side Media Gate: refuse to open the schedule modal when the
      // draft requires media and has none. The publish endpoint also enforces
      // this — this is just to give immediate feedback in the UI.
      if (isMediaBlocked(data.draft)) return;
      setScheduleTarget({ dayIso, draft: data.draft });
    } else if (data?.kind === "event" && data.event) {
      const ev = data.event;
      setScheduleTarget({
        dayIso,
        draft: {
          ideaId: ev.ideaId,
          contentTaskId: ev.contentTaskId,
          parentTaskId: ev.parentTaskId,
          channel: ev.channel,
          title: ev.title,
          ready_at: ev.scheduled_at,
          hero_media_url: ev.hero_media_url,
          has_media: !!ev.hero_media_url,
          body: ev.body,
          media: ev.media,
        },
        rescheduleFrom: ev,
      });
    }
  }

  if (calendar.isLoading) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Cargando calendario…</p>;
  }

  if (calendar.isError) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: "var(--sc-brick-500)" }}>
        Error cargando calendario: {(calendar.error as Error).message}
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Week navigation */}
      <div className="flex items-center gap-2 mb-3.5">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="font-heading uppercase text-[12px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          aria-label="Semana anterior"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 rounded-sc-md border-2 sc-pop-hover"
          style={{ background: "var(--sc-sun-300)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
        >
          📬 Hoy
        </button>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="font-heading uppercase text-[12px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          aria-label="Semana siguiente"
        >
          ›
        </button>
        <span className="font-heading uppercase text-sm tracking-wider font-bold ml-2" style={{ color: "var(--sc-ink)" }}>
          {formatRange(weekStart)}
        </span>
        <span className="flex-1" />
        <PublishingAccountInfo slug={slug} variant="compact" />
        <ConnectPublishingButton slug={slug} variant="ghost">
          🔌 Conectar herramienta de publishing
        </ConnectPublishingButton>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "300px 1fr" }}>
        <ReadyQueueSidebar
          drafts={ready_queue}
          onSelect={(draft) => setPreviewItem({ kind: "ready", draft })}
        />
        <WeekGrid
          weekStart={weekStart}
          eventsByDay={eventsByDay}
          todayIso={todayIso}
          onSelectEvent={(event) => setPreviewItem({ kind: "scheduled", event })}
        />
      </div>

      <DragOverlay>
        {draggedItem?.kind === "ready" ? <ReadyDraftCard draft={draggedItem.draft} dragging /> : null}
        {draggedItem?.kind === "event" ? <EventCard event={draggedItem.event} dragging onClick={() => undefined} /> : null}
      </DragOverlay>

      {scheduleTarget && (
        <ScheduleConfirmModal
          slug={slug}
          dayIso={scheduleTarget.dayIso}
          draft={scheduleTarget.draft}
          rescheduleFrom={scheduleTarget.rescheduleFrom}
          onClose={() => setScheduleTarget(null)}
          onDone={() => { setScheduleTarget(null); invalidate(); }}
        />
      )}

      {previewItem && (
        <PostPreviewSlideOver
          slug={slug}
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onCanceled={() => { setPreviewItem(null); invalidate(); }}
          onSchedule={(draft) => { setPreviewItem(null); openScheduleFor(draft); }}
          onReschedule={(event) => { setPreviewItem(null); openRescheduleFor(event); }}
        />
      )}
    </DndContext>
  );
}

/* ---------- Ready Queue (sidebar) ---------- */

function ReadyQueueSidebar({
  drafts,
  onSelect,
}: {
  drafts: ReadyDraft[];
  onSelect: (draft: ReadyDraft) => void;
}) {
  return (
    <div
      className="rounded-sc-lg border-[3px] flex flex-col overflow-hidden"
      style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-md)" }}
    >
      <div
        className="px-3 py-2.5 border-b-2 flex items-center justify-between"
        style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-2)" }}
      >
        <span className="font-heading uppercase text-sm tracking-wider font-bold" style={{ color: "var(--sc-ink)" }}>
          📥 Listos para programar
        </span>
        <span
          className="font-mono text-[11px] px-1.5 py-0.5 rounded-sc-pill border"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)" }}
        >
          {drafts.length}
        </span>
      </div>
      <div className="flex flex-col" style={{ maxHeight: "70vh", overflowY: "auto" }}>
        {drafts.length === 0 ? (
          <div className="p-4 text-xs text-center" style={{ color: "var(--sc-fg-muted)" }}>
            <p>No hay drafts en estado <b>Ready</b>.</p>
            <p className="mt-2">
              Marca un ContentTask como Ready (kanban o editor) y aparecerá aquí
              para arrastrar al día que quieras publicar.
            </p>
          </div>
        ) : (
          drafts.map((d) => (
            <ReadyDraftCard
              key={`${d.ideaId}:${d.channel}`}
              draft={d}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ReadyDraftCard({
  draft,
  dragging,
  onSelect,
}: {
  draft: ReadyDraft;
  dragging?: boolean;
  onSelect?: (draft: ReadyDraft) => void;
}) {
  const blockReason = mediaBlockReason(draft);
  const blocked = blockReason !== null;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `ready-${draft.ideaId}-${draft.channel}`,
    data: { kind: "ready" as const, draft },
    disabled: blocked,
  });
  const cv = CHANNEL_VISUAL[draft.channel] || CHANNEL_VISUAL.blog;

  // When media is required but missing: red badge, no-drag cursor, tooltip.
  // The badge label depends on what specifically is missing — for LinkedIn
  // we say "falta PDF" to make the carousel contract explicit.
  const blockedLabel = draft.channel === "linkedin" ? "falta PDF" : "falta media";
  const mediaBadge = blocked
    ? { label: blockedLabel, bg: "var(--sc-brick-bg)", fg: "var(--sc-brick-500)", title: blockReason! }
    : !draft.has_media
      ? { label: "sin media", bg: "var(--sc-sun-100)", fg: "var(--sc-ink)", title: "Sin media adjunta" }
      : null;

  return (
    <div
      ref={setNodeRef}
      data-focus={`${draft.ideaId}:${draft.channel}`}
      className="px-2.5 py-2 border-b border-dashed transition-opacity"
      style={{ borderColor: "rgba(31,20,16,0.15)", opacity: isDragging || dragging ? 0.4 : 1, background: "var(--sc-paper-3)" }}
    >
      <button
        type="button"
        {...(blocked ? {} : attributes)}
        {...(blocked ? {} : listeners)}
        onClick={() => { if (!dragging) onSelect?.(draft); }}
        className={`w-full text-left flex items-start gap-2 ${blocked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`}
        title={blockReason ?? "Click para previsualizar · arrastra a un día para programar"}
      >
        <span
          className="grid place-items-center w-6 h-6 rounded text-xs border flex-shrink-0 mt-0.5"
          style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
        >{cv.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 mb-0.5 flex-wrap">
            <span
              className="font-heading uppercase text-[9px] tracking-wider px-1 py-0.5 rounded-sc-pill border"
              style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
            >{cv.label}</span>
            {mediaBadge && (
              <span
                className="font-heading uppercase text-[9px] tracking-wider px-1 py-0.5 rounded-sc-pill border"
                style={{ background: mediaBadge.bg, borderColor: "var(--sc-ink)", color: mediaBadge.fg }}
                title={mediaBadge.title}
              >{mediaBadge.label}</span>
            )}
          </div>
          <div className="text-[12px] leading-snug font-medium" style={{ color: "var(--sc-ink)" }}>
            {draft.title}
          </div>
        </div>
      </button>
    </div>
  );
}

/* ---------- Week Grid (7 day columns) ---------- */

function WeekGrid({
  weekStart,
  eventsByDay,
  todayIso,
  onSelectEvent,
}: {
  weekStart: Date;
  eventsByDay: Record<string, CalendarEvent[]>;
  todayIso: string;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
      {days.map((day, idx) => (
        <DayColumn
          key={isoDate(day)}
          day={day}
          dayIndex={idx}
          events={eventsByDay[isoDate(day)] || []}
          isToday={isoDate(day) === todayIso}
          onSelectEvent={onSelectEvent}
        />
      ))}
    </div>
  );
}

function DayColumn({
  day,
  dayIndex,
  events,
  isToday,
  onSelectEvent,
}: {
  day: Date;
  dayIndex: number;
  events: CalendarEvent[];
  isToday: boolean;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const dayIso = isoDate(day);
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIso}` });

  return (
    <div
      ref={setNodeRef}
      className="rounded-sc-md border-[2px] flex flex-col overflow-hidden"
      style={{
        background: isOver ? "var(--sc-sun-100)" : isToday ? "var(--sc-sun-50)" : "var(--sc-paper-3)",
        borderColor: isOver ? "var(--sc-rust-500)" : "var(--sc-ink)",
        boxShadow: isOver ? "var(--pop-md)" : isToday ? "var(--pop-sm)" : "var(--pop-xs)",
        minHeight: 320,
        transition: "background 120ms, border-color 120ms",
      }}
    >
      <div
        className="px-2 py-1.5 border-b-2 flex items-center justify-between"
        style={{ background: isToday ? "var(--sc-sun-300)" : "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
      >
        <span className="font-heading uppercase text-[12px] tracking-wider font-bold" style={{ color: "var(--sc-ink)" }}>
          {DAY_LABELS[dayIndex]} {day.getDate()}
        </span>
        <span className="font-mono text-[10px]" style={{ color: isToday ? "var(--sc-rust-700)" : "var(--sc-fg-muted)" }}>
          {events.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-1.5">
        {events.length === 0 ? (
          <div className="px-1 py-3 text-[11px] italic text-center" style={{ color: "var(--sc-fg-muted)" }}>
            arrastra aquí
          </div>
        ) : (
          events.map((ev) => (
            <EventCard key={`${ev.ideaId}:${ev.channel}`} event={ev} onClick={() => onSelectEvent(ev)} />
          ))
        )}
      </div>
    </div>
  );
}

function EventCard({ event, onClick, dragging }: { event: CalendarEvent; onClick: () => void; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `event-${event.contentTaskId}-${event.channel}`,
    data: { kind: "event" as const, event },
  });
  const cv = CHANNEL_VISUAL[event.channel] || CHANNEL_VISUAL.blog;
  // Drift watchdog: if the API flagged this scheduled event as past-due
  // without reconciliation, render the alarm visual instead of the regular
  // "Programado" badge. Same shape so the rest of the card doesn't change.
  const sv = event.unconfirmed_drift
    ? UNCONFIRMED_VISUAL
    : STATUS_VISUAL[event.status] || STATUS_VISUAL.scheduled;

  // Only allow drag for cancellable / failed / scheduled — not while in-flight
  const isDraggable = event.status === "scheduled" || event.status === "failed";

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      data-focus={`${event.ideaId}:${event.channel}`}
      className="text-left rounded border-[1.5px] px-1.5 py-1.5 transition-opacity"
      style={{
        background: "var(--sc-paper-2)",
        borderColor: "var(--sc-ink)",
        opacity: isDragging || dragging ? 0.4 : 1,
        cursor: isDraggable ? "grab" : "pointer",
      }}
      {...(isDraggable ? attributes : {})}
      {...(isDraggable ? listeners : {})}
    >
      <div className="flex items-center gap-1 mb-0.5 flex-wrap">
        <span
          className="grid place-items-center w-4 h-4 rounded text-[9px] border"
          style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
        >{cv.emoji}</span>
        <span className="font-mono text-[10px] font-bold" style={{ color: "var(--sc-ink)" }}>
          {timeOf(event.scheduled_at)}
        </span>
      </div>
      <div className="text-[11px] leading-tight font-medium" style={{ color: "var(--sc-ink)" }}>
        {event.title.slice(0, 64)}{event.title.length > 64 ? "…" : ""}
      </div>
      <div
        className="font-heading uppercase text-[8.5px] tracking-wider px-1 py-0.5 rounded-sc-pill border inline-flex items-center mt-1"
        style={{ background: sv.bg, color: sv.fg, borderColor: "var(--sc-ink)" }}
      >{sv.label}</div>
    </button>
  );
}

/* ---------- Schedule Confirm Modal ---------- */

function ScheduleConfirmModal({
  slug,
  dayIso,
  draft,
  rescheduleFrom,
  onClose,
  onDone,
}: {
  slug: string;
  dayIso: string;
  draft: ReadyDraft;
  rescheduleFrom?: CalendarEvent;
  onClose: () => void;
  onDone: () => void;
}) {
  const providersQ = usePublishProviders(slug, draft.channel);
  const publish = usePublishDraft();
  const cancel = useCancelPublishing();

  const configured = useMemo<ProviderInfo[]>(() => (providersQ.data || []).filter((p) => p.configured), [providersQ.data]);
  const [providerId, setProviderId] = useState<string>(rescheduleFrom?.provider || "");
  // Both day and time are editable INSIDE the modal — initial values come
  // from the prop (drag-drop target / current schedule) but the user can
  // pick anything from here without re-opening.
  const [localDay, setLocalDay] = useState<string>(dayIso);
  const [time, setTime] = useState<string>(() => defaultTimeFor(dayIso));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId && configured.length > 0) setProviderId(configured[0].id);
  }, [configured, providerId]);

  // Re-sync local day when the prop changes (e.g. user closed and re-opened
  // the modal via a different drag). Also bumps the default time so
  // "today" picks the next free slot instead of a past 09:00.
  useEffect(() => {
    setLocalDay(dayIso);
    setTime(defaultTimeFor(dayIso));
  }, [dayIso]);

  async function confirm() {
    setError(null);
    if (!providerId) {
      setError("Conecta una herramienta de publishing antes de programar.");
      return;
    }
    const publishAt = `${localDay}T${time}:00`;
    const isoLocal = new Date(publishAt).toISOString();

    // Metricool rejects past datetimes with "Given datetime cannot be in
    // the past". Catch it client-side with a clear message + don't burn
    // the API call. 60s buffer covers minor clock skew between
    // browser/server/Metricool.
    if (Date.parse(isoLocal) < Date.now() + 60_000) {
      setError("La fecha/hora elegida ya pasó. Elige al menos 1 minuto en el futuro.");
      return;
    }

    try {
      // Only cancel when the previous schedule is actually live in Metricool
      // (status === "scheduled"). For "failed" / "canceled" / "published"
      // there's nothing to cancel; just publish fresh and overwrite the
      // publishing block. Calling cancel on a failed draft returns 400
      // "Draft is not currently scheduled".
      if (rescheduleFrom && rescheduleFrom.status === "scheduled") {
        await cancel.mutateAsync({ slug, ideaId: draft.ideaId, channel: draft.channel });
      }
      await publish.mutateAsync({
        slug,
        ideaId: draft.ideaId,
        channel: draft.channel,
        providerId,
        schedule: { publishAt: isoLocal },
      });
      onDone();
    } catch (e) {
      setError((e as Error).message || "Error al programar");
    }
  }

  const noProviders = configured.length === 0;
  const busy = publish.isPending || cancel.isPending;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md rounded-sc-lg border-[3px] p-5"
        style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading uppercase text-base tracking-wider font-bold mb-1" style={{ color: "var(--sc-ink)" }}>
          {rescheduleFrom ? "Reprogramar post" : "Programar post"}
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--sc-fg-muted)" }}>
          {draft.channel.toUpperCase()} · {draft.title.slice(0, 80)}
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="font-heading uppercase text-[10px] tracking-wider block mb-1" style={{ color: "var(--sc-ink)" }}>
              Día
            </label>
            <input
              type="date"
              value={localDay}
              min={isoDate(new Date())}
              onChange={(e) => setLocalDay(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-sc-md border-2 bg-card"
              style={{ borderColor: "var(--sc-ink)" }}
            />
          </div>
          <div>
            <label className="font-heading uppercase text-[10px] tracking-wider block mb-1" style={{ color: "var(--sc-ink)" }}>
              Hora
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-sc-md border-2 bg-card"
              style={{ borderColor: "var(--sc-ink)" }}
            />
          </div>
          <div>
            <label className="font-heading uppercase text-[10px] tracking-wider block mb-1" style={{ color: "var(--sc-ink)" }}>
              Provider
            </label>
            {noProviders ? (
              <ConnectPublishingButton slug={slug} variant="warning" className="w-full">
                ⚠️ Conectar herramienta de publishing
              </ConnectPublishingButton>
            ) : (
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-sc-md border-2 bg-card"
                style={{ borderColor: "var(--sc-ink)" }}
              >
                {configured.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            {!noProviders && providerId === "metricool" && (
              <div className="mt-2">
                <PublishingAccountInfo slug={slug} variant="full" />
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs mt-3 px-2 py-1.5 rounded-sc-md border" style={{ borderColor: "var(--sc-brick-500)", background: "var(--sc-brick-bg)", color: "var(--sc-brick-500)" }}>
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-4 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 rounded-sc-md border-2 sc-pop-hover"
            style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          >Cancelar</button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || noProviders}
            className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50"
            style={{ background: "var(--sc-rust-500)", color: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          >
            {busy ? "Programando…" : rescheduleFrom ? "Reprogramar" : "Programar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Post Preview SlideOver ---------- */

function PostPreviewSlideOver({
  slug,
  item,
  onClose,
  onCanceled,
  onSchedule,
  onReschedule,
}: {
  slug: string;
  item: PreviewItem;
  onClose: () => void;
  onCanceled: () => void;
  onSchedule: (draft: ReadyDraft) => void;
  onReschedule: (event: CalendarEvent) => void;
}) {
  const cancel = useCancelPublishing();
  const [error, setError] = useState<string | null>(null);

  // Normalize to a common shape — both kinds carry channel/title/body/media + ids
  const channel = item.kind === "scheduled" ? item.event.channel : item.draft.channel;
  const title = item.kind === "scheduled" ? item.event.title : item.draft.title;
  const body = item.kind === "scheduled" ? item.event.body : item.draft.body;
  const media = item.kind === "scheduled" ? item.event.media : item.draft.media;
  const ideaId = item.kind === "scheduled" ? item.event.ideaId : item.draft.ideaId;
  const contentTaskId = item.kind === "scheduled" ? item.event.contentTaskId : item.draft.contentTaskId;
  const parentTaskId = item.kind === "scheduled" ? item.event.parentTaskId : item.draft.parentTaskId;

  async function doCancel() {
    if (item.kind !== "scheduled") return;
    setError(null);
    try {
      await cancel.mutateAsync({ slug, ideaId, channel });
      onCanceled();
    } catch (e) {
      setError((e as Error).message || "Error cancelando");
    }
  }

  const cv = CHANNEL_VISUAL[channel] || CHANNEL_VISUAL.blog;
  const projectId = parentTaskId.replace(/-T\d+$/, "");
  const editorHref = `/dashboard/${slug}/tasks/${projectId}/sub/${parentTaskId}/content/${contentTaskId}/draft/${channel}`;

  const sv = item.kind === "scheduled" ? STATUS_VISUAL[item.event.status] || STATUS_VISUAL.scheduled : null;

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-[560px] h-full bg-card flex flex-col border-l-[3px]"
        style={{ borderColor: "var(--sc-ink)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b-2"
          style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-2)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="grid place-items-center w-7 h-7 rounded text-sm border"
              style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
            >{cv.emoji}</span>
            <h3 className="font-heading text-sm text-navy truncate">{title}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg px-1" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <ChannelPreview channel={channel} body={body} brandSlug={slug} media={media} />

          <div className="flex flex-wrap gap-1.5">
            {sv && (
              <span
                className="font-heading uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-sc-pill border"
                style={{ background: sv.bg, color: sv.fg, borderColor: "var(--sc-ink)" }}
              >{sv.label}</span>
            )}
            <span
              className="font-mono text-[11px] px-2 py-0.5 rounded-sc-pill border"
              style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
            >{cv.label}</span>
            {item.kind === "scheduled" && (
              <>
                <span
                  className="font-mono text-[11px] px-2 py-0.5 rounded-sc-pill border"
                  style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
                  title={item.event.scheduled_at}
                >📅 {new Date(item.event.scheduled_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</span>
                <span
                  className="font-mono text-[11px] px-2 py-0.5 rounded-sc-pill border"
                  style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", color: "var(--sc-ink)" }}
                >via {item.event.provider || "—"}</span>
              </>
            )}
            {item.kind === "ready" && (
              <span
                className="font-heading uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-sc-pill border"
                style={{ background: "var(--sc-sage-100)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)" }}
              >Ready · sin programar</span>
            )}
          </div>

          {item.kind === "scheduled" && item.event.external_url && (
            <>
              <a
                href={item.event.external_url}
                target="_blank"
                rel="noreferrer"
                className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 rounded-sc-md border-2 sc-pop-hover inline-flex items-center justify-center gap-1.5 no-underline"
                style={{ background: "var(--sc-sage-100)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              >
                ✓ Ver post publicado ↗
              </a>
              {item.event.status === "published" && (
                <PostMetricsBadge
                  slug={slug}
                  externalUrl={item.event.external_url}
                  metrics={item.event.metrics}
                  verbose
                />
              )}
            </>
          )}

          <a
            href={editorHref}
            className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 rounded-sc-md border-2 sc-pop-hover inline-flex items-center justify-center gap-1.5 no-underline"
            style={{ background: "var(--sc-paper-3)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
          >
            ✍ Abrir editor
          </a>

          {error && (
            <p className="text-xs px-2 py-1.5 rounded-sc-md border" style={{ borderColor: "var(--sc-brick-500)", background: "var(--sc-brick-bg)", color: "var(--sc-brick-500)" }}>
              {error}
            </p>
          )}
        </div>

        {item.kind === "ready" && (
          <div
            className="border-t-2 px-4 py-3 flex justify-end"
            style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-2)" }}
          >
            <button
              type="button"
              onClick={() => onSchedule(item.draft)}
              className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 rounded-sc-md border-2 sc-pop-hover"
              style={{ background: "var(--sc-sun-300)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >
              📅 Programar
            </button>
          </div>
        )}

        {item.kind === "scheduled" && (
          <div
            className="border-t-2 px-4 py-3 flex justify-end gap-2"
            style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-2)" }}
          >
            {/* Reprogramar: siempre disponible. Para "scheduled" cancela en
                Metricool antes de re-publicar; para "failed"/"canceled"/
                "published" simplemente publica con la nueva fecha. */}
            <button
              type="button"
              onClick={() => onReschedule(item.event)}
              className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 rounded-sc-md border-2 sc-pop-hover"
              style={{ background: "var(--sc-sun-300)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >
              📅 Editar fecha/hora
            </button>
            {item.event.status === "scheduled" && (
              <button
                type="button"
                onClick={doCancel}
                disabled={cancel.isPending}
                className="font-heading uppercase text-[12px] tracking-wider px-3 py-1.5 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50"
                style={{ background: "var(--sc-brick-bg)", color: "var(--sc-brick-500)", borderColor: "var(--sc-brick-500)", boxShadow: "var(--pop-xs)" }}
              >
                {cancel.isPending ? "Cancelando…" : "✗ Cancelar programación"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
