"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ============================================================
// Activity Bar — Collapsible terminal at top of client dashboard
// Faithful port of v2-act-toggle + v2-terminal from legacy MC
// ============================================================

interface CronRun {
  jobId: string;
  jobName: string;
  status: "ok" | "error" | "failed";
  runAtMs: number;
  durationMs?: number;
}

interface ActivityEvent {
  id: string;
  message: string;
  timestamp: string;
  time: string;
  level?: "ok" | "error" | "warning";
  isCron?: boolean;
  cronRun?: CronRun;
}

interface ActivityBarProps {
  slug: string;
}

function fmtDurShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "hace unos segundos";
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`;
  return `hace ${Math.floor(diff / 86_400_000)}d`;
}

export function ActivityBar({ slug }: ActivityBarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("v2-activity-collapsed") !== "0";
  });

  const { data: events = [] } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-bar", slug],
    queryFn: async () => {
      const res = await fetch(`/api/activity?slug=${slug}&limit=15`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.events || [];
    },
    enabled: !!slug,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    try {
      localStorage.setItem("v2-activity-collapsed", collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  const hasErrors = events.some(
    (e) => e.level === "error" || (e.cronRun && ["error", "failed"].includes(e.cronRun.status))
  );
  const errorCount = events.filter(
    (e) => e.level === "error" || (e.cronRun && ["error", "failed"].includes(e.cronRun.status))
  ).length;

  const dimText = events.length > 0
    ? `-- ${events.length} eventos${errorCount > 0 ? ` . ${errorCount} error${errorCount > 1 ? "es" : ""}` : ""}`
    : "-- cargando...";

  const lastRun = events.find((e) => e.cronRun);
  const notifText = errorCount > 0
    ? `! ${errorCount} error${errorCount > 1 ? "es" : ""}`
    : lastRun?.cronRun?.runAtMs
      ? `Ultimo: ${relTime(lastRun.cronRun.runAtMs)}`
      : "";

  return (
    <div className="mb-4">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-[#1A1A2E] rounded-t-lg text-[11px] text-[#D4D4D4] hover:bg-[#1A1A2E]/90 transition-colors"
      >
        <span
          className={cn(
            "text-[10px] transition-transform",
            !collapsed && "rotate-90"
          )}
        >
          {"\u25B6"}
        </span>

        {/* Green pulse dot */}
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              hasErrors ? "bg-red-500" : "bg-green-400"
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              hasErrors ? "bg-red-500" : "bg-green-400"
            )}
          />
        </span>

        <span className="font-semibold">Activity</span>
        <span className="text-[#777]">{dimText}</span>

        {notifText && (
          <span
            className={cn(
              "ml-auto text-[10px] font-semibold",
              errorCount > 0 ? "text-red-400" : "text-green-400"
            )}
          >
            {notifText}
          </span>
        )}
      </button>

      {/* Terminal body */}
      <div
        className={cn(
          "bg-[#0D0D1A] overflow-hidden transition-all duration-300 rounded-b-lg",
          collapsed ? "max-h-0" : "max-h-[200px]"
        )}
      >
        <div
          className="px-3 py-2 overflow-y-auto max-h-[200px] font-mono text-[11px] leading-relaxed"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {events.length === 0 && (
            <span className="text-[#555]">Sin actividad reciente.</span>
          )}

          {events.map((e) => {
            if (e.isCron && e.cronRun) {
              const isErr = e.cronRun.status === "error" || e.cronRun.status === "failed";
              return (
                <div key={e.id} className="py-0.5 flex items-start gap-1.5">
                  <span className="text-[#555] shrink-0">{e.time}</span>
                  <span className={isErr ? "text-yellow-400" : "text-green-400"}>
                    {isErr ? "!" : "\u2713"}
                  </span>
                  <span className="text-[#D4D4D4] flex-1">
                    {e.cronRun.jobName}
                    {isErr ? " fallo" : " completado"}
                    {e.cronRun.durationMs ? ` (${fmtDurShort(e.cronRun.durationMs)})` : ""}
                  </span>
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded font-semibold",
                    isErr ? "bg-red-900/50 text-red-300" : "bg-cyan-900/50 text-cyan-300"
                  )}>
                    {"\uD83D\uDD04"}
                  </span>
                </div>
              );
            }

            const isWarn = e.level === "error" || e.level === "warning";
            return (
              <div key={e.id} className="py-0.5 flex items-start gap-1.5">
                <span className="text-[#555] shrink-0">{e.time}</span>
                <span className={isWarn ? "text-yellow-400" : "text-green-400"}>
                  {isWarn ? "!" : "\u2713"}
                </span>
                <span className="text-[#D4D4D4] flex-1">{e.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
