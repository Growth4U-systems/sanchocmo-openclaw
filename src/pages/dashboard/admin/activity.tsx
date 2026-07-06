"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { useClients } from "@/hooks/useClients";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

// ============================================================
// Activity Log — merges mc-data activity + cron run outputs
// Faithful replica of legacy renderActivityPage()
// ============================================================

interface CronRun {
  jobId: string;
  jobName: string;
  status: string;
  summary: string;
  durationMs: number | null;
  model: string | null;
  runAtMs: number | null;
  category: string;
  client_slug: string | null;
  hasOutput: boolean;
}

interface ActivityEvent {
  date: string;
  time?: string;
  text: string;
  raw?: string;
  client?: string;
}

interface MergedEvent {
  date: string;
  time: string;
  text: string;
  client: string;
  timestamp: number;
  isCron: boolean;
  cronRun?: CronRun;
}

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

export default function ActivityPage() {
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [cronOnly, setCronOnly] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const { data: clients } = useClients();

  const slugParam = clientFilter !== "all" && clientFilter !== "system" ? clientFilter : undefined;

  const { data: cronRuns } = useQuery<CronRun[]>({
    queryKey: ["cron-runs", slugParam, 20],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20" });
      if (slugParam) params.set("slug", slugParam);
      const res = await fetch(`/api/cron-runs?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: activityEvents } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-events", slugParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (slugParam) params.set("slug", slugParam);
      const res = await fetch(`/api/system/activity?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  // Merge cron runs + activity events into unified list
  const merged: MergedEvent[] = [];

  // Cron runs → events
  for (const r of cronRuns || []) {
    const d = r.runAtMs ? new Date(r.runAtMs) : null;
    const isError = r.status === "error" || r.status === "failed";
    const dur = r.durationMs ? ` (${fmtDur(r.durationMs)})` : "";
    merged.push({
      date: d ? d.toISOString().slice(0, 10) : "",
      time: d ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "",
      text: `${isError ? "⚠ " : "✓ "}${r.jobName}${isError ? " falló" : " completado"}${dur}`,
      client: r.client_slug || "system",
      timestamp: r.runAtMs || 0,
      isCron: true,
      cronRun: r,
    });
  }

  // Activity events (non-cron)
  if (!cronOnly) {
    for (const e of activityEvents || []) {
      const ts = e.date ? new Date(`${e.date}T${e.time || "00:00"}`).getTime() : 0;
      merged.push({
        date: e.date,
        time: e.time || "",
        text: e.raw || e.text,
        client: e.client || "unknown",
        timestamp: ts,
        isCron: false,
      });
    }
  }

  // Filter by client
  let filtered = merged;
  if (clientFilter === "system") {
    filtered = filtered.filter((e) => e.client === "system");
  } else if (clientFilter !== "all") {
    filtered = filtered.filter((e) => e.client === clientFilter);
  }

  // Filter by search
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((e) => e.text.toLowerCase().includes(q));
  }

  // Sort descending
  filtered.sort((a, b) => b.timestamp - a.timestamp);

  // Group by date
  const grouped: Record<string, MergedEvent[]> = {};
  for (const e of filtered) {
    const day = e.date || "Sin fecha";
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(e);
  }
  const days = Object.keys(grouped).sort().reverse();

  return (
    <DashboardLayout>
      <Head><title>Activity Log — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">📡 Activity Log</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Actividad operativa por cliente — historial completo
      </p>

      <FilterBar>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-3 py-2 border-2 border-ink rounded-lg bg-background text-sm"
        >
          <option value="all">Todos los clientes</option>
          {clients?.filter((c) => c.active).map((c) => (
            <option key={c.slug} value={c.slug}>{c.emoji} {c.name}</option>
          ))}
          <option value="system">⚙️ Sistema</option>
        </select>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar..." className="flex-1 min-w-[200px]" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={cronOnly} onChange={(e) => setCronOnly(e.target.checked)} />
          Solo crons
        </label>
      </FilterBar>

      <ComicCard className="max-h-[70vh] overflow-y-auto">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay actividad registrada.</p>
        ) : (
          <div className="space-y-4">
            {days.map((day) => (
              <div key={day}>
                <div className="font-bold text-sm text-rust mb-1.5 pb-1 border-b border-border">
                  {day} <span className="text-muted-foreground font-normal text-xs">({grouped[day].length} eventos)</span>
                </div>
                <div className="space-y-0.5">
                  {grouped[day].map((event, i) => {
                    const key = `${day}-${i}`;
                    const isExpanded = expandedRun === key;
                    const isError = event.cronRun?.status === "error" || event.cronRun?.status === "failed";

                    return (
                      <div key={key}>
                        <button
                          type="button"
                          onClick={() => event.isCron ? setExpandedRun(isExpanded ? null : key) : undefined}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm",
                            event.isCron && "hover:bg-rust/5 cursor-pointer",
                            !event.isCron && "cursor-default",
                            isExpanded && "bg-rust/5"
                          )}
                        >
                          {event.isCron && (
                            <span className={cn(
                              "w-2.5 h-2.5 rounded-full flex-shrink-0",
                              isError ? "bg-red-500" : "bg-green-500"
                            )} />
                          )}
                          <span className="flex-1 truncate text-xs">
                            {event.text}
                          </span>
                          {clientFilter === "all" && event.client && event.client !== "unknown" && (
                            <span className="text-[10px] bg-navy/10 text-navy px-1.5 py-0.5 rounded">{event.client}</span>
                          )}
                          {event.cronRun?.category && (
                            <span className="text-[10px] text-muted-foreground capitalize">{event.cronRun.category}</span>
                          )}
                          {event.time && (
                            <span className="text-[10px] text-muted-foreground font-mono">{event.time}</span>
                          )}
                          {event.cronRun?.hasOutput && <span className="text-[10px]">📄</span>}
                        </button>
                        {isExpanded && event.cronRun?.summary && (
                          <div className="ml-6 mb-2 p-3 bg-card border border-border rounded-lg">
                            <article className="prose prose-xs max-w-none dark:prose-invert text-xs">
                              <ReactMarkdown>{event.cronRun.summary}</ReactMarkdown>
                            </article>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ComicCard>
    </DashboardLayout>
  );
}
