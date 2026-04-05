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

export default function ActivityPage() {
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [cronOnly, setCronOnly] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const { data: clients } = useClients();

  const { data: runs } = useQuery<CronRun[]>({
    queryKey: ["cron-runs", clientFilter, 20],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20" });
      if (clientFilter !== "all") params.set("slug", clientFilter);
      const res = await fetch(`/api/cron-runs?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const filtered = (runs || []).filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.jobName.toLowerCase().includes(q) && !r.summary?.toLowerCase().includes(q)) return false;
    }
    if (cronOnly && r.category === "system") return false;
    return true;
  });

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
        </select>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar..." className="flex-1 min-w-[200px]" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={cronOnly} onChange={(e) => setCronOnly(e.target.checked)} />
          Solo crons
        </label>
      </FilterBar>

      <ComicCard className="max-h-[70vh] overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No hay actividad registrada.</p>
        )}
        <div className="space-y-1">
          {filtered.map((run, i) => (
            <div key={`${run.jobId}-${i}`}>
              <button
                onClick={() => setExpandedRun(expandedRun === `${run.jobId}-${i}` ? null : `${run.jobId}-${i}`)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm",
                  "hover:bg-rust/5",
                  expandedRun === `${run.jobId}-${i}` && "bg-rust/5"
                )}
              >
                <span className={cn(
                  "w-2.5 h-2.5 rounded-full flex-shrink-0",
                  run.status === "ok" ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="font-medium flex-1 truncate">{run.jobName}</span>
                {run.client_slug && (
                  <span className="text-[10px] bg-navy/10 text-navy px-1.5 py-0.5 rounded">{run.client_slug}</span>
                )}
                <span className="text-[10px] text-muted-foreground capitalize">{run.category}</span>
                {run.durationMs && (
                  <span className="text-[10px] text-muted-foreground">{(run.durationMs / 1000).toFixed(1)}s</span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {run.runAtMs ? new Date(run.runAtMs).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </span>
                {run.hasOutput && <span className="text-[10px] text-sage font-semibold">📄</span>}
              </button>
              {expandedRun === `${run.jobId}-${i}` && run.summary && (
                <div className="ml-6 mb-2 p-3 bg-card border border-border rounded-lg">
                  <article className="prose prose-xs max-w-none dark:prose-invert text-xs">
                    <ReactMarkdown>{run.summary}</ReactMarkdown>
                  </article>
                </div>
              )}
            </div>
          ))}
        </div>
      </ComicCard>
    </DashboardLayout>
  );
}
