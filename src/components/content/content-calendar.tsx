/** Content Calendar — Weekly + Monthly views for scheduled content. */
"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface CalendarItem {
  id: string;
  title: string;
  date: string;
  channel: string;
  status: string;
  skill?: string;
  type?: string;
  founderLed?: boolean;
}

interface ContentCalendarProps {
  slug: string;
  items: CalendarItem[];
  onOpenChat: (itemId: string) => void;
}

type ViewMode = "week" | "month";

const CHANNEL_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  blog:       { bg: "bg-[#89B4FA]/15", border: "border-l-[#89B4FA]", dot: "bg-[#89B4FA]" },
  linkedin:   { bg: "bg-[#74C7EC]/15", border: "border-l-[#74C7EC]", dot: "bg-[#74C7EC]" },
  instagram:  { bg: "bg-[#CBA6F7]/15", border: "border-l-[#CBA6F7]", dot: "bg-[#CBA6F7]" },
  newsletter: { bg: "bg-[#A6E3A1]/15", border: "border-l-[#A6E3A1]", dot: "bg-[#A6E3A1]" },
  tiktok:     { bg: "bg-[#F38BA8]/15", border: "border-l-[#F38BA8]", dot: "bg-[#F38BA8]" },
  twitter:    { bg: "bg-[#94E2D5]/15", border: "border-l-[#94E2D5]", dot: "bg-[#94E2D5]" },
  youtube:    { bg: "bg-[#F38BA8]/15", border: "border-l-[#F38BA8]", dot: "bg-[#F38BA8]" },
};

const CHANNEL_LABELS = ["blog", "linkedin", "instagram", "newsletter", "tiktok", "twitter", "youtube"];
const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Get Monday of the week containing `date`. */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getWeekNumber(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime() + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000;
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function channelStyle(ch: string) {
  return CHANNEL_COLORS[ch.toLowerCase()] ?? { bg: "bg-muted", border: "border-l-muted-foreground", dot: "bg-muted-foreground" };
}

export function ContentCalendar({ items, onOpenChat }: ContentCalendarProps) {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => getMonday(new Date()));

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of items) {
      const key = item.date.slice(0, 10);
      (map[key] ??= []).push(item);
    }
    return map;
  }, [items]);

  function shiftWeek(delta: number) {
    setAnchor((prev) => addDays(prev, delta * 7));
  }
  function shiftMonth(delta: number) {
    setAnchor((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + delta, 1);
      return getMonday(d);
    });
  }

  const weekNum = getWeekNumber(anchor);
  const mondayStr = weekDays[0].toLocaleDateString("es", { day: "numeric" });
  const sundayStr = weekDays[6].toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });

  const calYear = anchor.getFullYear();
  const calMo = anchor.getMonth();
  const monthCells = useMemo(() => getMonthDays(calYear, calMo), [calYear, calMo]);

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => (view === "week" ? shiftWeek(-1) : shiftMonth(-1))}
          className="text-lg font-bold hover:opacity-60"
        >
          &lt;
        </button>
        <span className="text-sm font-bold">
          {view === "week"
            ? `Semana ${weekNum} — ${mondayStr}-${sundayStr}`
            : `${MONTH_NAMES[calMo]} ${calYear}`}
        </span>
        <button
          onClick={() => (view === "week" ? shiftWeek(1) : shiftMonth(1))}
          className="text-lg font-bold hover:opacity-60"
        >
          &gt;
        </button>

        <div className="ml-auto flex items-center rounded-lg border-2 border-border overflow-hidden text-xs font-semibold">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1 transition-colors",
                view === v ? "bg-ink text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly view */}
      {view === "week" && (
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border-2 border-border">
          {weekDays.map((day, i) => (
            <div key={i} className="bg-card min-h-[160px] flex flex-col">
              <div className="text-center text-[10px] font-bold uppercase py-1.5 bg-muted text-muted-foreground">
                {DAY_LABELS[i]} <span className="font-normal ml-1">{day.getDate()}</span>
              </div>
              <div className="p-1.5 space-y-1.5 flex-1">
                {(itemsByDate[isoDate(day)] ?? []).map((item) => {
                  const style = channelStyle(item.channel);
                  return (
                    <button
                      key={item.id}
                      onClick={() => onOpenChat(item.id)}
                      className={cn(
                        "w-full text-left rounded border-l-[3px] px-2 py-1.5 transition-opacity hover:opacity-80",
                        style.bg,
                        style.border,
                      )}
                    >
                      <p className="text-[11px] font-semibold leading-tight truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground">
                        {item.skill && <span>{item.skill}</span>}
                        {item.type && <span className="uppercase font-bold opacity-60">{item.type}</span>}
                        {item.founderLed && <span>👤</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly view */}
      {view === "month" && (
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border-2 border-border">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase py-1 bg-muted text-muted-foreground">
              {d}
            </div>
          ))}
          {monthCells.map((day, i) => {
            const key = day ? `${calYear}-${String(calMo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
            const dayItems = key ? itemsByDate[key] ?? [] : [];
            return (
              <div key={i} className={cn("bg-card min-h-[64px] p-1", !day && "bg-muted/40")}>
                {day && (
                  <>
                    <span className="text-[10px] font-semibold text-muted-foreground">{day}</span>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {dayItems.slice(0, 4).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => onOpenChat(item.id)}
                          title={item.title}
                          className={cn(
                            "w-2.5 h-2.5 rounded-full hover:scale-125 transition-transform",
                            channelStyle(item.channel).dot,
                          )}
                        />
                      ))}
                      {dayItems.length > 4 && (
                        <span className="text-[8px] text-muted-foreground">+{dayItems.length - 4}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        {CHANNEL_LABELS.map((ch) => (
          <div key={ch} className="flex items-center gap-1.5">
            <span className={cn("w-2.5 h-2.5 rounded-full", channelStyle(ch).dot)} />
            <span className="text-[10px] font-medium text-muted-foreground capitalize">{ch}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
