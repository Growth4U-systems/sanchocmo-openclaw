"use client";

import { useState, useMemo } from "react";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { ComicCard } from "@/components/shared/comic-card";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CronRun {
  jobId: string;
  jobName: string;
  status: string;
  summary: string;
  durationMs: number | null;
  model: string | null;
  runAtMs: number | null;
  client_slug: string | null;
  category: string;
  hasOutput: boolean;
}

type CategoryKey = "metrics" | "intelligence" | "outreach" | "content" | "system" | "other";

const CATEGORY_META: Record<CategoryKey, { icon: string; label: string }> = {
  metrics: { icon: "📊", label: "Metrics" },
  intelligence: { icon: "🧠", label: "Intelligence" },
  outreach: { icon: "📨", label: "Outreach" },
  content: { icon: "✍️", label: "Content" },
  system: { icon: "⚙️", label: "System" },
  other: { icon: "📋", label: "Otros" },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relTime(ms: number | null): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const abs = Math.abs(diff);
  if (abs < 60_000) return "Hace <1 min";
  if (abs < 3600_000) return `Hace ${Math.round(abs / 60_000)} min`;
  if (abs < 86400_000) return `Hace ${Math.round(abs / 3600_000)}h`;
  return `Hace ${Math.round(abs / 86400_000)}d`;
}

function fmtDur(ms: number | null): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok" ? "bg-green-500" :
    status === "error" || status === "failed" ? "bg-red-500" :
    "bg-gray-400";
  return <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", color)} />;
}

function RunCard({ run }: { run: CronRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-ink/10 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-muted/30 transition-colors"
      >
        <StatusDot status={run.status} />
        <span className="flex-1 text-[12px] font-medium truncate">{run.jobName}</span>
        {run.durationMs && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {fmtDur(run.durationMs)}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0">{relTime(run.runAtMs)}</span>
        <span className="text-[10px] text-muted-foreground">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && run.summary && (
        <div className="px-3 pb-3">
          <pre className="bg-background border border-ink/10 rounded p-3 text-[11px] whitespace-pre-wrap max-h-[400px] overflow-auto leading-relaxed">
            {run.summary}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function CronInsightsFeed({ runs }: { runs: CronRun[] }) {
  // Only show runs with actual output
  const outputRuns = useMemo(() => runs.filter((r) => r.hasOutput), [runs]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CronRun[]> = {};
    for (const r of outputRuns) {
      const cat = r.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(r);
    }
    return groups;
  }, [outputRuns]);

  if (outputRuns.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[15px] text-[#2C3E50]">📡 Cron Insights</h3>
      <p className="text-[12px] text-[#7F8C8D] -mt-2">
        Resultados recientes de tareas recurrentes
      </p>

      {Object.entries(grouped).map(([cat, catRuns]) => {
        const meta = CATEGORY_META[cat as CategoryKey] || CATEGORY_META.other;
        return (
          <ComicCard key={cat} className="p-2">
            <CollapsibleSection
              title={meta.label}
              icon={meta.icon}
              count={catRuns.length}
              defaultOpen={cat !== "system"}
            >
              <div>
                {catRuns.map((run, i) => (
                  <RunCard key={`${run.jobId}-${run.runAtMs}-${i}`} run={run} />
                ))}
              </div>
            </CollapsibleSection>
          </ComicCard>
        );
      })}
    </div>
  );
}
