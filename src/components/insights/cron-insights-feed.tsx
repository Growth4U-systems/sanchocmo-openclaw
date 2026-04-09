"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

const CATEGORY_LABELS: Record<CategoryKey, { icon: string; label: string }> = {
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

function fmtDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function fmtDur(ms: number | null): string {
  if (!ms) return "";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** Extract the first meaningful line from markdown content for preview */
function extractPreview(md: string): string {
  if (!md) return "";
  const lines = md.split("\n").filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (t === "---" || t === "***" || t === "━".repeat(t.length)) return false;
    return true;
  });
  // Take first 2 meaningful lines
  return lines.slice(0, 2).join(" ").replace(/[*_#>`]/g, "").trim().slice(0, 200);
}

/* ------------------------------------------------------------------ */
/*  Insight Row                                                        */
/* ------------------------------------------------------------------ */

function InsightRow({
  run,
  selected,
  onToggle,
}: {
  run: CronRun;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_LABELS[(run.category as CategoryKey)] || CATEGORY_LABELS.other;
  const isError = run.status === "error" || run.status === "failed";
  const preview = useMemo(() => extractPreview(run.summary), [run.summary]);

  return (
    <div className={cn(
      "bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden transition-all",
      selected && "ring-2 ring-rust/40 border-rust/30",
    )} style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onToggle(); }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 mt-1 rounded border-[#E8E2D9] accent-rust shrink-0"
        />

        {/* Status + Date column */}
        <div className="shrink-0 flex items-start gap-2">
          <span className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0 mt-1.5",
            isError ? "bg-red-500" : "bg-green-500",
          )} />
          <div className="w-20">
            <div className="text-[14px] font-bold text-[#2C3E50] leading-tight">{fmtDate(run.runAtMs)}</div>
            <div className="text-[11px] text-[#95A5A6]">{fmtTime(run.runAtMs)}</div>
          </div>
        </div>

        {/* Name + preview */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#2C3E50]">{run.jobName}</div>
          {!expanded && preview && (
            <p className="text-[12px] text-[#95A5A6] mt-0.5 line-clamp-1">{preview}</p>
          )}
        </div>

        {/* Right side: category + duration */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] px-2 py-0.5 bg-[#F8F6F0] border border-[#E8E2D9] rounded-full text-[#7F8C8D]">
            {cat.icon} {cat.label}
          </span>
          {run.durationMs && (
            <span className="text-[10px] text-[#95A5A6] w-14 text-right">
              {fmtDur(run.durationMs)}
            </span>
          )}
          <span className="text-[10px] text-[#BDC3C7]">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && run.summary && (
        <div className="border-t border-[#E8E2D9] bg-[#FDFDFC]">
          <div className="px-5 py-4 max-h-[500px] overflow-auto
            [&_h1]:text-[16px] [&_h1]:font-bold [&_h1]:text-[#2C3E50] [&_h1]:mt-4 [&_h1]:mb-2
            [&_h2]:text-[14px] [&_h2]:font-bold [&_h2]:text-[#2C3E50] [&_h2]:mt-3 [&_h2]:mb-1.5
            [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:text-[#34495E] [&_h3]:mt-2 [&_h3]:mb-1
            [&_p]:text-[13px] [&_p]:text-[#2C3E50] [&_p]:leading-relaxed [&_p]:my-1.5
            [&_strong]:text-[#2C3E50] [&_strong]:font-semibold
            [&_em]:text-[#7F8C8D]
            [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc
            [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal
            [&_li]:text-[13px] [&_li]:text-[#2C3E50] [&_li]:my-0.5 [&_li]:leading-relaxed
            [&_hr]:my-3 [&_hr]:border-[#E8E2D9]
            [&_code]:bg-[#F8F6F0] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_code]:text-[#C45D35]
            [&_blockquote]:border-l-3 [&_blockquote]:border-[#E8E2D9] [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-[#7F8C8D]
            [&_table]:w-full [&_table]:text-[12px] [&_table]:my-3
            [&_th]:bg-[#F8F6F0] [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#2C3E50] [&_th]:border [&_th]:border-[#E8E2D9]
            [&_td]:px-3 [&_td]:py-1.5 [&_td]:border [&_td]:border-[#E8E2D9] [&_td]:text-[#34495E]
            [&_a]:text-[#C45D35] [&_a]:underline
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {run.summary}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function CronInsightsFeed({
  runs,
  onAnalyzeSelected,
}: {
  runs: CronRun[];
  onAnalyzeSelected?: (selected: CronRun[]) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Only runs with output
  const outputRuns = useMemo(() => runs.filter((r) => r.hasOutput), [runs]);

  // Categories present
  const categories = useMemo(() => {
    const cats = new Set(outputRuns.map((r) => r.category));
    return Array.from(cats).sort();
  }, [outputRuns]);

  // Filtered
  const filtered = useMemo(() => {
    if (categoryFilter === "all") return outputRuns;
    return outputRuns.filter((r) => r.category === categoryFilter);
  }, [outputRuns, categoryFilter]);

  // Counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: outputRuns.length };
    for (const r of outputRuns) c[r.category] = (c[r.category] || 0) + 1;
    return c;
  }, [outputRuns]);

  const runKey = (r: CronRun, i: number) => `${r.jobId}-${r.runAtMs}-${i}`;

  const toggleSelect = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r, i) => runKey(r, i))));
  };

  if (outputRuns.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header + category filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-[16px] text-[#2C3E50]">📡 Cron Insights</h3>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
              categoryFilter === "all"
                ? "bg-[#2C3E50] text-white border-[#2C3E50]"
                : "bg-white text-[#7F8C8D] border-[#E8E2D9] hover:bg-[#F8F6F0]",
            )}
          >
            Todos ({counts.all})
          </button>
          {categories.map((cat) => {
            const meta = CATEGORY_LABELS[cat as CategoryKey] || CATEGORY_LABELS.other;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                  categoryFilter === cat
                    ? "bg-[#2C3E50] text-white border-[#2C3E50]"
                    : "bg-white text-[#7F8C8D] border-[#E8E2D9] hover:bg-[#F8F6F0]",
                )}
              >
                {meta.icon} {meta.label} ({counts[cat] || 0})
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection bar */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-[#7F8C8D] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onChange={toggleAll}
            className="w-3.5 h-3.5 rounded border-[#E8E2D9] accent-rust"
          />
          Seleccionar todos
        </label>

        {selectedIds.size > 0 && onAnalyzeSelected && (
          <button
            type="button"
            onClick={() => {
              const sel = filtered.filter((r, i) => selectedIds.has(runKey(r, i)));
              onAnalyzeSelected(sel);
            }}
            className="text-[11px] font-semibold text-white bg-rust rounded px-3 py-1 hover:opacity-90 transition-opacity"
          >
            🎯 Analizar {selectedIds.size} seleccionados
          </button>
        )}

        {selectedIds.size > 0 && !onAnalyzeSelected && (
          <span className="text-[11px] text-rust font-medium">
            {selectedIds.size} seleccionados
          </span>
        )}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {filtered.map((run, i) => {
          const key = runKey(run, i);
          return (
            <InsightRow
              key={key}
              run={run}
              selected={selectedIds.has(key)}
              onToggle={() => toggleSelect(key)}
            />
          );
        })}
      </div>
    </div>
  );
}
