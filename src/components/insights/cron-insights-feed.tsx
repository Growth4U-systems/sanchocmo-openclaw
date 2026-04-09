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
  // Structured fields (new — crons will start producing these)
  structured?: {
    title?: string;
    summary?: string;
    sections?: Array<{ heading: string; body: string }>;
    alerts?: Array<{ level: "critical" | "warning" | "info"; text: string }>;
    actions?: Array<{ priority?: string; text: string }>;
    kpis?: Array<{ label: string; value: string; delta?: string; status?: "up" | "down" | "flat" }>;
  };
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
  return new Date(ms).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
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

/** True if text has markdown structure (multiline, headings, bold, lists) */
function hasMarkdown(text: string): boolean {
  if (!text) return false;
  if (text.includes("\n")) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/^#{1,3}\s/m.test(text)) return true;
  return false;
}

/**
 * Parse a flat plain-text cron summary into structured sections.
 * Handles Daily Pulse style: "Topic: data. Topic: data. Acciones: P0 x, P1 y"
 */
function parseFlat(text: string): CronRun["structured"] {
  if (!text) return undefined;

  // Split on sentence boundaries before uppercase words or emoji
  const raw = text
    .replace(/\.\s+(?=[A-Z0-9🔴🟡🟠⚠️📊💰])/g, ".|")
    .replace(/(?:Acciones?|Actions?):\s*/gi, "|__ACTIONS__|")
    .split("|")
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);

  const bullets: string[] = [];
  const actions: Array<{ priority?: string; text: string }> = [];
  const alerts: Array<{ level: "critical" | "warning" | "info"; text: string }> = [];
  let inActions = false;
  let title = "";

  for (const chunk of raw) {
    if (chunk === "__ACTIONS__") { inActions = true; continue; }

    if (inActions) {
      // Split on P0/P1/P2 markers
      const parts = chunk.split(/,\s*(?=P[0-2]\s)/).map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const m = part.match(/^(P[0-2])\s+(.*)/);
        if (m) actions.push({ priority: m[1], text: m[2] });
        else actions.push({ text: part });
      }
      continue;
    }

    // First chunk that looks like a title/date header
    if (!title && (chunk.match(/^[A-Z][\w\s]+\d/) || chunk.length < 40)) {
      title = chunk;
      continue;
    }

    // Detect alerts
    if (/(?:0 citas|expirad|error|fail|crash|caída|baj[oó])/i.test(chunk)) {
      alerts.push({ level: /0 citas|crash|fail|expirad/i.test(chunk) ? "critical" : "warning", text: chunk });
    } else {
      bullets.push(chunk);
    }
  }

  return {
    title: title || undefined,
    summary: bullets[0] || undefined,
    sections: bullets.length > 1 ? [{ heading: "Resumen", body: bullets.join("\n") }] : undefined,
    alerts: alerts.length > 0 ? alerts : undefined,
    actions: actions.length > 0 ? actions : undefined,
  };
}

/** Get best preview text for the collapsed row */
function getPreview(run: CronRun): string {
  if (run.structured?.summary) return run.structured.summary;
  if (!run.summary) return "";
  // For markdown: first non-decoration line
  if (hasMarkdown(run.summary)) {
    for (const line of run.summary.split("\n")) {
      const clean = line.replace(/[#*_>`━─—|]/g, "").trim();
      if (clean.length > 15 && !clean.match(/^[-=]{3,}$/)) return clean.slice(0, 160);
    }
  }
  // For plain text: first sentence
  const m = run.summary.match(/^.{20,}?[.!]/);
  return m ? m[0].slice(0, 160) : run.summary.slice(0, 160);
}

/* ------------------------------------------------------------------ */
/*  Structured Content Renderer                                        */
/* ------------------------------------------------------------------ */

const ALERT_STYLES = {
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", icon: "🔴" },
  warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", icon: "🟡" },
  info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", icon: "🔵" },
};

function StructuredContent({ data }: { data: NonNullable<CronRun["structured"]> }) {
  return (
    <div className="space-y-4">
      {/* KPIs row */}
      {data.kpis && data.kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {data.kpis.map((kpi, i) => (
            <div key={i} className="bg-[#F8F6F0] rounded-lg p-3 border border-[#E8E2D9]">
              <div className="text-[10px] text-[#95A5A6] uppercase tracking-wide">{kpi.label}</div>
              <div className="text-[16px] font-bold text-[#2C3E50] mt-0.5">{kpi.value}</div>
              {kpi.delta && (
                <div className={cn("text-[11px] font-medium mt-0.5",
                  kpi.status === "up" ? "text-green-600" : kpi.status === "down" ? "text-red-600" : "text-[#95A5A6]"
                )}>
                  {kpi.delta}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary text */}
      {data.summary && (
        <p className="text-[13px] text-[#2C3E50] leading-relaxed">{data.summary}</p>
      )}

      {/* Sections */}
      {data.sections?.map((sec, i) => (
        <div key={i}>
          <h4 className="text-[13px] font-bold text-[#2C3E50] mb-1">{sec.heading}</h4>
          <div className="text-[13px] text-[#34495E] leading-relaxed space-y-1">
            {sec.body.split("\n").map((line, j) => (
              <div key={j} className="flex items-start gap-2">
                <span className="text-[#BDC3C7] shrink-0 mt-0.5">•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Alerts */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="space-y-1.5">
          {data.alerts.map((alert, i) => {
            const s = ALERT_STYLES[alert.level] || ALERT_STYLES.info;
            return (
              <div key={i} className={cn("flex items-start gap-2 px-3 py-2 rounded-lg border text-[12px]", s.bg, s.border, s.text)}>
                <span className="shrink-0">{s.icon}</span>
                <span className="leading-relaxed">{alert.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {data.actions && data.actions.length > 0 && (
        <div>
          <h4 className="text-[12px] font-bold text-[#C45D35] mb-1.5 uppercase tracking-wide">Acciones</h4>
          <div className="space-y-1.5">
            {data.actions.map((action, i) => {
              const prioColor = action.priority === "P0" ? "#C62828"
                : action.priority === "P1" ? "#E6A817"
                : action.priority === "P2" ? "#7F8C8D" : "#34495E";
              return (
                <div key={i} className="flex items-start gap-2">
                  {action.priority ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: prioColor + "18", color: prioColor }}>
                      {action.priority}
                    </span>
                  ) : (
                    <span className="text-[#C45D35] shrink-0 mt-0.5">→</span>
                  )}
                  <span className="text-[13px] text-[#2C3E50] leading-relaxed">{action.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Markdown renderer styles                                           */
/* ------------------------------------------------------------------ */

const MD_CLASSES = [
  "[&_h1]:text-[15px] [&_h1]:font-bold [&_h1]:text-[#2C3E50] [&_h1]:mt-4 [&_h1]:mb-2",
  "[&_h2]:text-[14px] [&_h2]:font-bold [&_h2]:text-[#2C3E50] [&_h2]:mt-3 [&_h2]:mb-1.5",
  "[&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:text-[#34495E] [&_h3]:mt-2 [&_h3]:mb-1",
  "[&_p]:text-[13px] [&_p]:text-[#2C3E50] [&_p]:leading-relaxed [&_p]:my-1.5",
  "[&_strong]:text-[#2C3E50] [&_strong]:font-semibold",
  "[&_em]:text-[#7F8C8D]",
  "[&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc",
  "[&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal",
  "[&_li]:text-[13px] [&_li]:text-[#2C3E50] [&_li]:my-0.5 [&_li]:leading-relaxed",
  "[&_hr]:my-3 [&_hr]:border-[#E8E2D9]",
  "[&_code]:bg-[#F8F6F0] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_code]:text-[#C45D35]",
  "[&_blockquote]:border-l-[3px] [&_blockquote]:border-[#E8E2D9] [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-[#7F8C8D]",
  "[&_table]:w-full [&_table]:text-[12px] [&_table]:my-3",
  "[&_th]:bg-[#F8F6F0] [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#2C3E50] [&_th]:border [&_th]:border-[#E8E2D9]",
  "[&_td]:px-3 [&_td]:py-1.5 [&_td]:border [&_td]:border-[#E8E2D9] [&_td]:text-[#34495E]",
  "[&_a]:text-[#C45D35] [&_a]:underline",
].join(" ");

/* ------------------------------------------------------------------ */
/*  Adaptive content — picks best renderer                             */
/* ------------------------------------------------------------------ */

function InsightContent({ run }: { run: CronRun }) {
  // 1. Structured data from the cron (best case)
  if (run.structured) {
    return <StructuredContent data={run.structured} />;
  }

  const text = run.summary || "";

  // 2. Markdown content
  if (hasMarkdown(text)) {
    return (
      <div className={MD_CLASSES}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  // 3. Plain text → auto-parse into structured
  const parsed = parseFlat(text);
  if (parsed && (parsed.alerts?.length || parsed.actions?.length || parsed.sections)) {
    return <StructuredContent data={parsed} />;
  }

  // 4. Last resort — just show as paragraphs
  return <p className="text-[13px] text-[#2C3E50] leading-relaxed">{text}</p>;
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
  const preview = useMemo(() => getPreview(run), [run]);

  return (
    <div className={cn(
      "bg-white border rounded-[10px] overflow-hidden transition-all",
      selected ? "border-rust/40 ring-2 ring-rust/20" : "border-[#E8E2D9]",
    )} style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onToggle(); }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 mt-0.5 rounded border-[#D5D0C8] accent-rust shrink-0"
        />

        <div className="shrink-0 flex items-start gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1", isError ? "bg-red-500" : "bg-green-500")} />
          <div className="w-[5.5rem]">
            <div className="text-[14px] font-bold text-[#2C3E50] leading-tight">{fmtDate(run.runAtMs)}</div>
            <div className="text-[11px] text-[#95A5A6]">{fmtTime(run.runAtMs)}</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#2C3E50]">
            {run.structured?.title || run.jobName}
          </div>
          {!expanded && preview && (
            <p className="text-[12px] text-[#95A5A6] mt-0.5 line-clamp-1">{preview}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className="text-[10px] px-2 py-0.5 bg-[#F8F6F0] border border-[#E8E2D9] rounded-full text-[#7F8C8D] whitespace-nowrap">
            {cat.icon} {cat.label}
          </span>
          {run.durationMs && (
            <span className="text-[10px] text-[#BDC3C7] w-14 text-right">{fmtDur(run.durationMs)}</span>
          )}
          <span className="text-[11px] text-[#BDC3C7] w-4 text-center">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-[#E8E2D9] bg-[#FCFBF9] px-6 py-4 max-h-[600px] overflow-auto">
          <InsightContent run={run} />
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

  const outputRuns = useMemo(() => runs.filter((r) => r.hasOutput), [runs]);

  const categories = useMemo(() => {
    const cats = new Set(outputRuns.map((r) => r.category));
    return Array.from(cats).sort();
  }, [outputRuns]);

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return outputRuns;
    return outputRuns.filter((r) => r.category === categoryFilter);
  }, [outputRuns, categoryFilter]);

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
      {/* Header + filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-[16px] text-[#2C3E50]">📡 Cron Insights</h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => setCategoryFilter("all")}
            className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors",
              categoryFilter === "all" ? "bg-[#2C3E50] text-white border-[#2C3E50]" : "bg-white text-[#7F8C8D] border-[#E8E2D9] hover:bg-[#F8F6F0]")}>
            Todos ({counts.all})
          </button>
          {categories.map((cat) => {
            const meta = CATEGORY_LABELS[cat as CategoryKey] || CATEGORY_LABELS.other;
            return (
              <button key={cat} type="button" onClick={() => setCategoryFilter(cat)}
                className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                  categoryFilter === cat ? "bg-[#2C3E50] text-white border-[#2C3E50]" : "bg-white text-[#7F8C8D] border-[#E8E2D9] hover:bg-[#F8F6F0]")}>
                {meta.icon} {meta.label} ({counts[cat] || 0})
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection bar */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-[#7F8C8D] cursor-pointer select-none">
          <input type="checkbox"
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onChange={toggleAll}
            className="w-3.5 h-3.5 rounded border-[#E8E2D9] accent-rust" />
          Seleccionar todos
        </label>
        {selectedIds.size > 0 && onAnalyzeSelected && (
          <button type="button"
            onClick={() => { const sel = filtered.filter((r, i) => selectedIds.has(runKey(r, i))); onAnalyzeSelected(sel); }}
            className="text-[11px] font-semibold text-white bg-rust rounded px-3 py-1 hover:opacity-90 transition-opacity">
            🎯 Analizar {selectedIds.size} seleccionados
          </button>
        )}
        {selectedIds.size > 0 && !onAnalyzeSelected && (
          <span className="text-[11px] text-rust font-medium">{selectedIds.size} seleccionados</span>
        )}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {filtered.map((run, i) => {
          const key = runKey(run, i);
          return <InsightRow key={key} run={run} selected={selectedIds.has(key)} onToggle={() => toggleSelect(key)} />;
        })}
      </div>
    </div>
  );
}
