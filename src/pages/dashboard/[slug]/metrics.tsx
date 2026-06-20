import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TitleIcon } from "@/components/layout/title-icon";
import { MetricsPartnershipsTab } from "@/components/partnerships/metrics-partnerships-tab";
import { KpiCard } from "@/components/shared/kpi-card";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { SlideOver } from "@/components/shared/slide-over";
import { JsonViewer } from "@/components/shared/doc-slideover";
import { useMetricsPlan, useDashboardDefinition, useSurfaceSummary, type SurfaceSummaryEntry } from "@/hooks/useMetrics";
import { useOpenChat } from "@/hooks/useChat";
import { buildMetricsEditThread } from "@/lib/chat-openers";
import { SURFACES, type SurfaceKey, type SurfaceDef } from "@/lib/metrics/surfaces";
import { isSafeFormula } from "@/lib/metrics/formula";
import type { DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

type DateRange = "1d" | "7d" | "30d" | "all";

interface HealthCard {
  label: string;
  value: string | number;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  status: "good" | "warn" | "bad" | "neutral";
}

interface SourcePill {
  name: string;
  label: string;
  status: "ok" | "error" | "partial" | "disconnected";
}

interface MetricEntry {
  name: string;
  value: number;
  date?: string;
  dimensions?: Record<string, string | number>;
}

interface SourceData {
  status: string;
  metrics: MetricEntry[];
}

interface MetricsData {
  slug?: string;
  daily?: { date: string; sources: Record<string, SourceData> }[];
  dataSources?: Record<string, { status: string; config?: Record<string, string> }>;
  plan?: {
    label?: string;
    archetype?: string;
    activationEvent?: string;
    primaryKPI?: string;
    funnel?: { step: string; source: string; metric: string; manual?: boolean }[];
    kpis?: { name: string; category: string; formula?: string; format?: string; _calculatedValue?: string }[];
    manualDataCadence?: string;
  };
  manualDataPending?: boolean;
  metricsSheet?: { url: string; spreadsheetId?: string };
  recommended?: { label: string; apiId?: string }[];
}

interface MonitoringData {
  health_score?: { score: number; summary: string };
  pending_recommendations?: { title: string; rationale?: string }[] | { recommendations: { title: string; rationale?: string }[] };
}

interface DynModule {
  id: string;
  icon: string;
  title: string;
  priority: number;
}

// ============================================================
// Constants
// ============================================================

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Ayer", value: "1d" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "Todo", value: "all" },
];

const RANGE_DAYS: Record<DateRange, number> = { "1d": 1, "7d": 7, "30d": 30, all: 0 };

const SOURCE_NAMES: Record<string, string> = {
  ga4: "GA4", gsc: "Search Console", metricool: "Social",
  "meta-ads": "Meta Ads", meta_ads: "Meta Ads", ghl: "CRM",
  instantly: "Outreach", sheets: "Manual",
};

// ============================================================
// Helpers
// ============================================================

function mVal(src: SourceData | undefined, name: string): number | null {
  // Guard malformed/failed source payloads (no metrics array) — raw daily
  // snapshots can carry a failed source without `metrics`.
  if (!src || !Array.isArray(src.metrics)) return null;
  const m = src.metrics.find((x) => x.name === name && !x.dimensions);
  return m ? m.value : null;
}

function mDelta(v: number | null, pv: number | null): { value: string; direction: "up" | "down" | "flat" } {
  if (v == null || pv == null || pv === 0) return { value: "", direction: "flat" };
  const pct = Math.round(((v - pv) / pv) * 100);
  if (pct > 0) return { value: `+${pct}%`, direction: "up" };
  if (pct < 0) return { value: `${pct}%`, direction: "down" };
  return { value: "0%", direction: "flat" };
}

function fmt(v: number): string {
  return v.toLocaleString();
}

function aggregateEntries(entries: { date: string; sources: Record<string, SourceData> }[]): Record<string, SourceData> {
  const merged: Record<string, SourceData> = {};
  for (const entry of entries) {
    for (const [srcName, srcData] of Object.entries(entry.sources || {})) {
      if (srcData.status !== "ok") continue;
      if (!merged[srcName]) merged[srcName] = { status: "ok", metrics: [] };
      merged[srcName].metrics.push(...(srcData.metrics || []));
    }
  }
  const feedNames = new Set(["recentLead", "postDetail", "recentConversation", "pipeline", "sourceBreakdown", "topPage"]);
  for (const srcData of Object.values(merged)) {
    const byKey: Record<string, MetricEntry & { _count: number }> = {};
    const feeds: MetricEntry[] = [];
    for (const m of srcData.metrics) {
      if (feedNames.has(m.name)) { feeds.push(m); continue; }
      const dimKey = m.dimensions ? JSON.stringify(m.dimensions) : "";
      const key = `${m.name}|${dimKey}`;
      if (!byKey[key]) {
        byKey[key] = { ...m, _count: 1 };
      } else {
        const isRate = /Rate|ctr|cpc|position|Engagement|bounce/.test(m.name);
        if (isRate) {
          byKey[key].value = (byKey[key].value * byKey[key]._count + m.value) / (byKey[key]._count + 1);
        } else {
          byKey[key].value += m.value;
        }
        byKey[key]._count++;
      }
    }
    // Deduplicate feeds (keep latest)
    const seenFeeds = new Set<string>();
    const uniqueFeeds: MetricEntry[] = [];
    for (const f of [...feeds].reverse()) {
      const fKey = `${f.name}|${(f.dimensions as Record<string, string>)?.id || (f.dimensions as Record<string, string>)?.page || (f.dimensions as Record<string, string>)?.pipelineId || (f.dimensions as Record<string, string>)?.contactId || JSON.stringify(f.dimensions || "")}`;
      if (!seenFeeds.has(fKey)) { seenFeeds.add(fKey); uniqueFeeds.push(f); }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    srcData.metrics = [...Object.values(byKey).map(({ _count, ...rest }) => rest), ...uniqueFeeds];
  }
  return merged;
}

function normSources(entries: { date: string; sources: Record<string, SourceData> }[]): Record<string, SourceData> {
  const raw = aggregateEntries(entries);
  const out: Record<string, SourceData> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v;
    out[k.replace(/_/g, "-")] = v;
    out[k.replace(/-/g, "_")] = v;
  }
  return out;
}

/** Resolve a source from a (possibly normalized) source map, tolerating - / _ variants. */
function pickSource(sources: Record<string, SourceData>, name: string): SourceData | undefined {
  return sources[name] || sources[name.replace(/-/g, "_")] || sources[name.replace(/_/g, "-")];
}

/**
 * Evaluate a `source.metric` arithmetic formula against the live (file-based)
 * sources — the same engine that powers planKpis. Returns null if any token is
 * unresolved (source not connected / metric missing) so the UI shows "—".
 * Formulas are validated server-side via isSafeFormula before they land in the
 * definition, so eval here only ever sees numbers + arithmetic.
 */
function evalFormula(formula: string, sources: Record<string, SourceData>): number | null {
  // Defense-in-depth: the full-definition update path (saveDashboardDefinition)
  // only zod-parses `formula` as a string, so a metric that didn't go through
  // addCustomMetric could carry unsafe JS. Re-validate here — a formula with no
  // source.metric tokens or trailing JS is rejected before it can reach eval.
  if (!isSafeFormula(formula)) return null;
  try {
    // Source must start with an identifier char so decimal constants (e.g. `0.02`)
    // aren't mistaken for a `source.metric` ref — that would fail to resolve and
    // null out an otherwise valid formula.
    const parts = formula.match(/([a-z_][\w-]*)\.(\w+)/gi) || [];
    let expr = formula;
    for (const part of parts) {
      const [src, metric] = part.split(".");
      const srcData = pickSource(sources, src);
      const m = srcData?.status === "ok" ? srcData.metrics.find((x) => x.name === metric && !x.dimensions) : undefined;
      if (!m) return null;
      expr = expr.replace(part, String(m.value));
    }
    // eslint-disable-next-line no-eval
    const result = eval(expr);
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/** Format a numeric value per a KPI/metric format hint (currency/percent/number). */
function fmtByFormat(value: number, format?: string): string {
  if (format === "currency") return `€${value.toFixed(2)}`;
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function isoWeekKey(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Bucket a metric's daily values by grain (day/week/month) for sparklines/trends. */
function bucketDaily(
  allDaily: { date: string; sources: Record<string, SourceData> }[],
  source: string,
  metric: string,
  grain: "day" | "week" | "month",
): number[] {
  const buckets = new Map<string, number>();
  for (const day of allDaily) {
    // Raw daily files may miss `sources` or carry a failed source payload; skip
    // them (mirrors aggregateEntries) so a malformed day never crashes the page.
    const src = day?.sources ? pickSource(day.sources, source) : undefined;
    if (!src || src.status !== "ok") continue;
    const v = mVal(src, metric);
    if (v == null) continue;
    const key = grain === "day" ? day.date : grain === "week" ? isoWeekKey(day.date) : day.date.slice(0, 7);
    buckets.set(key, (buckets.get(key) || 0) + v);
  }
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

// ============================================================
// TabButton helper
// ============================================================

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 border rounded-md text-[12px] font-semibold transition-colors",
        active ? "border-rust bg-rust text-white" : "border-border bg-background hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

// ============================================================
// Sortable Module Card — dynamic content
// ============================================================

function SortableModuleCard({ mod, children, expanded, onToggleExpand }: { mod: DynModule; children: React.ReactNode; expanded?: boolean; onToggleExpand?: () => void }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id });
  const style = expanded ? undefined : { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  // children[0] = summary, children[1] = detail (optional)
  const childArr = Array.isArray(children) ? children : [children];
  const summary = childArr[0];
  const detail = childArr.length > 1 ? childArr[1] : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-2 rounded-xl bg-card transition-all",
        expanded
          ? "col-span-1 md:col-span-2 border-rust border-[3px] shadow-comic"
          : "border-border hover:border-rust",
        isDragging && "border-dashed border-rust"
      )}
    >
      <div className={cn("flex justify-between items-center px-5 pt-4 pb-3", !expanded && "cursor-grab active:cursor-grabbing")} {...(expanded ? {} : { ...attributes, ...listeners })}>
        <h3 className={cn("font-heading font-bold flex items-center gap-2", expanded ? "text-lg" : "text-[15px]")}>
          {!expanded && <span className="text-muted-foreground select-none">{"\u2630"}</span>}
          {mod.icon} {mod.title}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); if (!expanded) setDetailOpen(true); onToggleExpand?.(); }}
            className="bg-transparent border-none cursor-pointer text-muted-foreground text-[14px] p-1 hover:text-foreground transition-colors"
            title={expanded ? "Contraer" : "Expandir"}
          >
            {expanded ? "\u2716" : "\u26F6"}
          </button>
          {detail && !expanded && (
            <button onClick={(e) => { e.stopPropagation(); setDetailOpen((v) => !v); }} className={cn("bg-transparent border-none cursor-pointer text-muted-foreground text-[16px] p-1 transition-transform", detailOpen && "rotate-180")}>
              {"\u25BC"}
            </button>
          )}
        </div>
      </div>
      <div className="px-5 pb-4">{summary}</div>
      {detail && (expanded || detailOpen) && <div className="border-t border-border px-5 py-4 text-[13px]">{detail}</div>}
    </div>
  );
}

// ============================================================
// KPI Row — used in module summaries
// ============================================================

function KpiRow({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
  return (
    <div className="flex gap-4 flex-wrap">
      {items.map((kpi, i) => (
        <div key={i} className="text-center min-w-[70px]">
          <div className={cn("text-[22px] font-bold font-heading", kpi.color)}>{kpi.value}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{kpi.label}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Progress Bar
// ============================================================

function ProgressBar({ value, max, color = "bg-rust" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ============================================================
// Module: Web Traffic (GA4)
// ============================================================

function TrafficModule({ ga4 }: { ga4: SourceData }) {
  const [tab, setTab] = useState<"channels" | "pages" | "devices">("channels");

  const ses = mVal(ga4, "sessions") || 0;
  const usr = mVal(ga4, "totalUsers") || 0;
  const nu = mVal(ga4, "newUsers") || 0;
  const pv = mVal(ga4, "screenPageViews") || 0;
  const dur = mVal(ga4, "averageSessionDuration");
  const engRate = mVal(ga4, "engagementRate");

  // Channels
  const channels: Record<string, Record<string, number>> = {};
  ga4.metrics.filter((x) => x.dimensions && (x.dimensions as Record<string, string>).channel).forEach((x) => {
    const ch = (x.dimensions as Record<string, string>).channel;
    if (!channels[ch]) channels[ch] = {};
    channels[ch][x.name] = x.value;
  });
  const sortedChannels = Object.entries(channels).sort((a, b) => (b[1].sessions || 0) - (a[1].sessions || 0));
  const maxChSes = sortedChannels[0] ? sortedChannels[0][1].sessions || 1 : 1;

  // Top pages
  const topPages = ga4.metrics.filter((x) => x.name === "topPage").sort((a, b) => b.value - a.value);

  // Devices
  const devices: Record<string, { sessions: number; bounceRate?: number }> = {};
  ga4.metrics.filter((x) => x.dimensions && (x.dimensions as Record<string, string>).device && x.name === "sessions").forEach((x) => {
    devices[(x.dimensions as Record<string, string>).device] = { sessions: x.value };
  });
  ga4.metrics.filter((x) => x.dimensions && (x.dimensions as Record<string, string>).device && x.name === "bounceRate").forEach((x) => {
    const dev = (x.dimensions as Record<string, string>).device;
    if (devices[dev]) devices[dev].bounceRate = x.value;
  });

  const chIcon = (ch: string) => ch.includes("Direct") ? "\uD83D\uDD17" : ch.includes("Social") ? "\uD83D\uDCF1" : ch.includes("Search") ? "\uD83D\uDD0D" : ch.includes("Referral") ? "\uD83D\uDD04" : ch.includes("Paid") ? "\uD83D\uDCE3" : "\uD83D\uDCE1";

  return (
    <>
      {/* Summary */}
      <KpiRow items={[
        { label: "Sessions", value: fmt(ses) },
        { label: "Users", value: fmt(usr) },
        { label: "New Users", value: fmt(nu) },
        { label: "Pageviews", value: fmt(pv) },
        { label: "Avg Duration", value: dur ? `${Math.round(dur)}s` : "\u2014" },
        { label: "Engagement", value: engRate != null ? `${Math.round(engRate * 100)}%` : "\u2014" },
      ]} />
      {/* Detail */}
      <div>
        <div className="flex gap-1.5 mb-3">
          <TabButton label="Channels" active={tab === "channels"} onClick={() => setTab("channels")} />
          <TabButton label="Top Pages" active={tab === "pages"} onClick={() => setTab("pages")} />
          <TabButton label="Devices" active={tab === "devices"} onClick={() => setTab("devices")} />
        </div>

        {tab === "channels" && (
          <div>
            <div className="font-semibold mb-2">{"\uD83D\uDCE1"} Traffic by Channel</div>
            {sortedChannels.map(([ch, m]) => (
              <div key={ch} className="mb-2">
                <div className="flex justify-between text-[13px]">
                  <span>{chIcon(ch)} {ch}</span>
                  <span className="font-semibold">{m.sessions || 0} sessions · {m.totalUsers || 0} users</span>
                </div>
                <ProgressBar value={m.sessions || 0} max={maxChSes} />
              </div>
            ))}
            {sortedChannels.length === 0 && <p className="text-muted-foreground">Sin datos</p>}
          </div>
        )}

        {tab === "pages" && (
          <div>
            <div className="font-semibold mb-2">{"\uD83D\uDCC4"} Top Pages</div>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="text-left text-[10px] uppercase tracking-wide text-muted-foreground p-1">Page</th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-muted-foreground p-1">Views</th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-muted-foreground p-1">Duration</th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-muted-foreground p-1">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {topPages.slice(0, 10).map((p, i) => {
                  const pg = (p.dimensions as Record<string, string>)?.page || "";
                  const short = pg.length > 45 ? pg.slice(0, 45) + "\u2026" : pg;
                  const engPct = (p.dimensions as Record<string, number>)?.engagementRate || 0;
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1.5 max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap" title={pg}>{short}</td>
                      <td className="p-1.5 text-right font-heading font-semibold">{p.value}</td>
                      <td className="p-1.5 text-right">{(p.dimensions as Record<string, number>)?.duration || 0}s</td>
                      <td className={cn("p-1.5 text-right", engPct >= 60 && "text-sage")}>{engPct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {topPages.length === 0 && <p className="text-muted-foreground">Sin datos</p>}
          </div>
        )}

        {tab === "devices" && (
          <div>
            <div className="font-semibold mb-2">{"\uD83D\uDCF1"} By Device</div>
            <div className="flex gap-4">
              {Object.entries(devices).map(([dev, m]) => {
                const icon = dev === "desktop" ? "\uD83D\uDCBB" : dev === "mobile" ? "\uD83D\uDCF1" : "\uD83D\uDCFA";
                const br = m.bounceRate != null ? Math.round(m.bounceRate * 100) : null;
                return (
                  <div key={dev} className="flex-1 p-3 bg-muted rounded-lg text-center">
                    <div className="text-xl">{icon}</div>
                    <div className="text-lg font-bold font-heading">{m.sessions}</div>
                    <div className="text-[11px] text-muted-foreground">{dev}</div>
                    {br != null && <div className={cn("text-[11px]", br > 60 ? "text-destructive" : "text-sage")}>bounce: {br}%</div>}
                  </div>
                );
              })}
            </div>
            {Object.keys(devices).length === 0 && <p className="text-muted-foreground">Sin datos</p>}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// Module: Search Visibility (GSC)
// ============================================================

function SearchModule({ gsc }: { gsc: SourceData }) {
  const imp = mVal(gsc, "impressions") || 0;
  const pos = mVal(gsc, "position") || 0;

  const queryMetrics = gsc.metrics.filter((x) => x.dimensions && (x.dimensions as Record<string, string>).query);
  const queries: Record<string, Record<string, number>> = {};
  queryMetrics.forEach((x) => {
    const q = (x.dimensions as Record<string, string>).query;
    if (!queries[q]) queries[q] = {};
    queries[q][x.name] = x.value;
  });
  const topQ = Object.entries(queries).sort((a, b) => (b[1].impressions || 0) - (a[1].impressions || 0)).slice(0, 8);

  const pageMetrics = gsc.metrics.filter((x) => x.dimensions && (x.dimensions as Record<string, string>).page);
  const pages: Record<string, Record<string, number>> = {};
  pageMetrics.forEach((x) => {
    const pg = (x.dimensions as Record<string, string>).page;
    if (!pages[pg]) pages[pg] = {};
    pages[pg][x.name] = x.value;
  });
  const topP = Object.entries(pages).sort((a, b) => (b[1].impressions || 0) - (a[1].impressions || 0)).slice(0, 6);

  return (
    <>
      <KpiRow items={[
        { label: "Impressions", value: fmt(imp) },
        { label: "Avg Position", value: pos.toFixed(1), color: pos < 10 ? "text-sage" : undefined },
      ]} />
      <div className="grid grid-cols-2 gap-4 overflow-hidden">
        <div className="min-w-0 overflow-hidden">
          <div className="font-semibold mb-2">Top Queries</div>
          <table className="w-full border-collapse text-[13px] table-fixed">
            <thead><tr>
              <th className="text-left text-[10px] uppercase text-muted-foreground p-1">Query</th>
              <th className="text-right text-[10px] uppercase text-muted-foreground p-1 w-[50px]">Imp</th>
              <th className="text-right text-[10px] uppercase text-muted-foreground p-1 w-[40px]">Pos</th>
            </tr></thead>
            <tbody>
              {topQ.map(([q, m]) => (
                <tr key={q} className="border-t border-border">
                  <td className="p-1 overflow-hidden text-ellipsis whitespace-nowrap" title={q}>{q}</td>
                  <td className="p-1 text-right">{m.impressions || 0}</td>
                  <td className={cn("p-1 text-right", (m.position || 99) < 10 ? "text-sage" : "")}>{(m.position || 0).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-w-0 overflow-hidden">
          <div className="font-semibold mb-2">Top Pages</div>
          <table className="w-full border-collapse text-[13px] table-fixed">
            <thead><tr>
              <th className="text-left text-[10px] uppercase text-muted-foreground p-1">Page</th>
              <th className="text-right text-[10px] uppercase text-muted-foreground p-1 w-[50px]">Imp</th>
            </tr></thead>
            <tbody>
              {topP.map(([url, m]) => {
                const short = url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";
                return (
                  <tr key={url} className="border-t border-border">
                    <td className="p-1 overflow-hidden text-ellipsis whitespace-nowrap" title={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-foreground no-underline hover:text-rust">{short}</a>
                    </td>
                    <td className="p-1 text-right">{m.impressions || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Module: Paid Campaigns (Meta Ads) — 3-level hierarchy
// ============================================================

function AdsModule({ ads }: { ads: SourceData }) {
  const [tab, setTab] = useState<"campaign" | "adset" | "ad">("campaign");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  const spend = mVal(ads, "spend") || 0;
  const clicks = mVal(ads, "clicks") || 0;
  const ctr = mVal(ads, "ctr") || 0;
  const cpc = mVal(ads, "cpc") || 0;
  const leads = mVal(ads, "leads") || 0;

  // Parse campaigns
  const campaigns: Record<string, Record<string, number>> = {};
  ads.metrics.filter((x) => x.dimensions && (x.dimensions as Record<string, string>).campaign && !(x.dimensions as Record<string, string>).adset && !(x.dimensions as Record<string, string>).ad)
    .forEach((x) => {
      const c = (x.dimensions as Record<string, string>).campaign;
      if (!campaigns[c]) campaigns[c] = {};
      campaigns[c][x.name] = x.value;
    });

  // Parse ad sets
  const adsets: Record<string, Record<string, number | string>> = {};
  ads.metrics.filter((x) => x.dimensions && (x.dimensions as Record<string, string>).adset && !(x.dimensions as Record<string, string>).ad)
    .forEach((x) => {
      const key = (x.dimensions as Record<string, string>).adset;
      if (!adsets[key]) adsets[key] = { campaign: (x.dimensions as Record<string, string>).campaign as unknown as number };
      adsets[key][x.name] = x.value;
    });

  // Parse ad creatives
  const adCreatives: Record<string, Record<string, number | string | null>> = {};
  ads.metrics.filter((x) => x.dimensions && (x.dimensions as Record<string, string>).ad)
    .forEach((x) => {
      const key = (x.dimensions as Record<string, string>).ad;
      if (!adCreatives[key]) adCreatives[key] = { adset: (x.dimensions as Record<string, string>).adset as unknown as number, campaign: (x.dimensions as Record<string, string>).campaign as unknown as number };
      adCreatives[key][x.name] = x.value;
    });

  // Calculate CPL
  for (const m of Object.values(campaigns)) { m.cpl = (m.leads as number) > 0 ? (m.spend as number) / (m.leads as number) : 0; }
  for (const m of Object.values(adsets)) { m.cpl = (m.leads as number) > 0 ? (m.spend as number) / (m.leads as number) : 0; }
  for (const m of Object.values(adCreatives)) { m.cpl = (m.leads as number) > 0 ? (m.spend as number) / (m.leads as number) : 0; }

  type AdsRow = { name: string; spend: number; impressions: number; clicks: number; ctr: number; cpc: number; leads: number; cpl: number | null; extra?: string };

  function buildRows(data: Record<string, Record<string, number | string | null>>, includeExtra = false): AdsRow[] {
    return Object.entries(data)
      .map(([name, m]) => ({
        name, spend: (m.spend as number) || 0, impressions: (m.impressions as number) || 0,
        clicks: (m.clicks as number) || 0, ctr: (m.ctr as number) || 0, cpc: (m.cpc as number) || 0,
        leads: (m.leads as number) || 0, cpl: (m.leads as number) > 0 ? ((m.spend as number) || 0) / ((m.leads as number) || 1) : null,
        extra: includeExtra ? (m.adset as string) || "" : undefined,
      }))
      .sort((a, b) => b.spend - a.spend);
  }

  const campaignRows = buildRows(campaigns as Record<string, Record<string, number | string | null>>);
  const adsetRows = buildRows(adsets);
  const adRows = buildRows(adCreatives, true);

  function sortRows(rows: AdsRow[]): AdsRow[] {
    if (sortCol == null) return rows;
    const keys: (keyof AdsRow)[] = ["name", "spend", "impressions", "clicks", "ctr", "cpc", "leads", "cpl"];
    const key = keys[sortCol] || "spend";
    return [...rows].sort((a, b) => {
      const va = (a[key] as number) ?? 999;
      const vb = (b[key] as number) ?? 999;
      return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }

  function handleSort(col: number) {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  }

  const headers = ["Name", "Spend", "Imp", "Clicks", "CTR", "CPC", "Leads", "CPL"];

  function renderTable(rows: AdsRow[]) {
    const sorted = sortRows(rows);
    return (
      <table className="w-full border-collapse text-[13px] table-fixed">
        <thead><tr>
          {headers.map((h, i) => (
            <th key={h} className={cn("text-[10px] uppercase tracking-wide text-muted-foreground p-1 cursor-pointer select-none", i > 0 && "text-right")} onClick={() => handleSort(i)}>
              {h} <span className="text-[9px]">{"\u21C5"}</span>
            </th>
          ))}
        </tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.name} className="border-t border-border">
              <td className="p-1.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[140px]" title={r.name}>{r.name}</td>
              <td className="p-1.5 text-right font-heading font-semibold">{"\u20AC"}{r.spend.toFixed(0)}</td>
              <td className="p-1.5 text-right">{fmt(r.impressions)}</td>
              <td className="p-1.5 text-right">{r.clicks}</td>
              <td className={cn("p-1.5 text-right", r.ctr > 3 ? "text-sage" : r.ctr < 1.5 ? "text-muted-foreground" : "")}>{r.ctr.toFixed(1)}%</td>
              <td className="p-1.5 text-right">{"\u20AC"}{r.cpc.toFixed(2)}</td>
              <td className={cn("p-1.5 text-right", r.leads > 0 && "text-sage font-semibold")}>{r.leads}</td>
              <td className={cn("p-1.5 text-right", r.cpl != null && r.cpl < 15 && "text-sage")}>{r.cpl != null ? `\u20AC${r.cpl.toFixed(2)}` : "\u2014"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <KpiRow items={[
        { label: "Spend", value: `\u20AC${spend.toFixed(0)}`, color: "text-rust" },
        { label: "Clicks", value: fmt(clicks) },
        { label: "CTR", value: `${ctr.toFixed(1)}%` },
        { label: "CPC", value: `\u20AC${cpc.toFixed(2)}` },
        ...(leads ? [{ label: "Leads", value: fmt(leads), color: "text-sage" }] : []),
      ]} />
      <div>
        <div className="flex gap-1.5 mb-3">
          <TabButton label="Campaigns" active={tab === "campaign"} onClick={() => { setTab("campaign"); setSortCol(null); }} />
          <TabButton label="Ad Sets" active={tab === "adset"} onClick={() => { setTab("adset"); setSortCol(null); }} />
          <TabButton label="Ad Creatives" active={tab === "ad"} onClick={() => { setTab("ad"); setSortCol(null); }} />
        </div>
        {tab === "campaign" && (campaignRows.length > 0 ? renderTable(campaignRows) : <p className="text-muted-foreground">Sin datos</p>)}
        {tab === "adset" && (adsetRows.length > 0 ? renderTable(adsetRows) : <p className="text-muted-foreground">Sin datos</p>)}
        {tab === "ad" && (adRows.length > 0 ? renderTable(adRows) : <p className="text-muted-foreground">Sin datos</p>)}
      </div>
    </>
  );
}

// ============================================================
// Module: Social Media (Metricool)
// ============================================================

function SocialModule({ mc }: { mc: SourceData }) {
  const nets: Record<string, Record<string, number>> = {};
  const posts: MetricEntry[] = [];
  mc.metrics.forEach((x) => {
    if (x.name === "postDetail") { posts.push(x); }
    else if (x.dimensions && (x.dimensions as Record<string, string>).network) {
      const n = (x.dimensions as Record<string, string>).network;
      if (!nets[n]) nets[n] = {};
      nets[n][x.name] = x.value;
    }
  });

  return (
    <>
      <div>
        {Object.entries(nets).map(([net, m]) => (
          <div key={net} className="flex gap-4 flex-wrap mb-2">
            <div className="text-center min-w-[70px]">
              <div className="text-[16px] font-bold font-heading capitalize">{net}</div>
            </div>
            <div className="text-center min-w-[50px]">
              <div className="text-[18px] font-bold font-heading">{m.posts || 0}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Posts</div>
            </div>
            <div className="text-center min-w-[50px]">
              <div className="text-[18px] font-bold font-heading">{fmt(m.impressions || 0)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Imp</div>
            </div>
            <div className="text-center min-w-[50px]">
              <div className="text-[18px] font-bold font-heading">{(m.avgEngagement || 0).toFixed(1)}%</div>
              <div className="text-[10px] text-muted-foreground uppercase">Eng</div>
            </div>
          </div>
        ))}
      </div>
      {/* Detail: top posts */}
      <div>
        {posts.length > 0 ? (
          posts.sort((a, b) => b.value - a.value).slice(0, 5).map((p, i) => {
            const d = p.dimensions as Record<string, string | number>;
            return (
              <div key={i} className="p-3 bg-muted rounded-lg mb-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-muted-foreground">{p.date}</span>
                  <span className="text-[11px]">{"\uD83D\uDC41"} {p.value} · {"\u2764\uFE0F"} {d.likes || 0} · {"\uD83D\uDCCA"} {d.engagement || 0}%</span>
                </div>
                <div className="text-[13px]">{d.text || ""}</div>
                {d.url && <a href={d.url as string} target="_blank" rel="noopener noreferrer" className="text-[11px] text-rust mt-1 inline-block">Ver {"\u2192"}</a>}
              </div>
            );
          })
        ) : <p className="text-muted-foreground">Sin posts en el periodo</p>}
      </div>
    </>
  );
}

// ============================================================
// Module: Pipeline & CRM (GHL)
// ============================================================

function CrmModule({ ghl, locationId }: { ghl: SourceData; locationId: string }) {
  const [tab, setTab] = useState<"leads" | "sources" | "pipeline" | "convos">("leads");

  const total = mVal(ghl, "totalContacts") || 0;
  const nc = mVal(ghl, "newContacts") || 0;
  const appt = mVal(ghl, "appointments") || 0;
  const opp = mVal(ghl, "opportunities") || 0;
  const pipe = mVal(ghl, "pipelineValue") || 0;

  const leads = ghl.metrics.filter((x) => x.name === "recentLead");
  const srcBreakdown = ghl.metrics.find((x) => x.name === "sourceBreakdown");
  const pipelines = ghl.metrics.filter((x) => x.name === "pipeline");
  const convos = ghl.metrics.filter((x) => x.name === "recentConversation");

  return (
    <>
      <KpiRow items={[
        { label: "Contacts", value: fmt(total) },
        { label: "New", value: `+${nc}`, color: "text-sage" },
        { label: "Appts", value: fmt(appt) },
        { label: "Opps", value: fmt(opp) },
        ...(pipe > 0 ? [{ label: "Pipeline", value: `\u20AC${fmt(pipe)}`, color: "text-sage" }] : []),
      ]} />
      <div>
        <div className="flex gap-1.5 mb-3">
          <TabButton label="Lead Feed" active={tab === "leads"} onClick={() => setTab("leads")} />
          <TabButton label="Sources" active={tab === "sources"} onClick={() => setTab("sources")} />
          <TabButton label="Pipelines" active={tab === "pipeline"} onClick={() => setTab("pipeline")} />
          <TabButton label="Conversations" active={tab === "convos"} onClick={() => setTab("convos")} />
        </div>

        {tab === "leads" && (
          leads.length > 0 ? (
            <div>
              <div className="font-semibold mb-2">{"\uD83C\uDD95"} Recent Leads</div>
              <table className="w-full border-collapse text-[13px]">
                <thead><tr>
                  <th className="text-left text-[10px] uppercase text-muted-foreground p-1">Date</th>
                  <th className="text-left text-[10px] uppercase text-muted-foreground p-1">Name</th>
                  <th className="text-left text-[10px] uppercase text-muted-foreground p-1">Source</th>
                  <th className="text-left text-[10px] uppercase text-muted-foreground p-1">Channel</th>
                  <th className="text-[10px] p-1"></th>
                </tr></thead>
                <tbody>
                  {leads.map((l, i) => {
                    const dm = l.dimensions as Record<string, string>;
                    const ch = [dm.channel, dm.utmSource].filter(Boolean).join("/") || "\u2014";
                    const srcIcon = dm.channel === "facebook" ? "\uD83D\uDCD8" : dm.channel === "instagram" ? "\uD83D\uDCF7" : dm.channel === "calendar" ? "\uD83D\uDCC5" : "\uD83D\uDCE1";
                    const link = locationId ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${dm.id}` : "";
                    return (
                      <tr key={i} className="border-t border-border">
                        <td className="p-1.5 whitespace-nowrap text-[12px] text-muted-foreground">{(dm.dateAdded || "").slice(0, 10)}</td>
                        <td className="p-1.5 font-medium">
                          {dm.name}
                          {dm.company && <span className="text-muted-foreground text-[11px]"> @ {dm.company}</span>}
                          {dm.tags && (
                            <div className="mt-0.5 flex gap-1 flex-wrap">
                              {dm.tags.split(", ").map((t) => (
                                <span key={t} className="bg-muted px-1.5 py-0.5 rounded text-[10px] border border-border">{t}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-1.5 text-[12px]">{srcIcon} {dm.source || "\u2014"}</td>
                        <td className="p-1.5 text-[12px] text-muted-foreground">{ch}</td>
                        <td className="p-1.5">{link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-rust text-[12px] no-underline">Abrir {"\u2192"}</a>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="text-muted-foreground">Sin leads recientes</p>
        )}

        {tab === "sources" && (
          srcBreakdown ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-semibold mb-2">{"\uD83D\uDCCA"} By Source ({srcBreakdown.value} total)</div>
                {(() => {
                  const srcs = ((srcBreakdown.dimensions as unknown as Record<string, Record<string, number>>)?.sources) || {};
                  const sorted = Object.entries(srcs).sort((a, b) => b[1] - a[1]);
                  const maxV = sorted[0] ? sorted[0][1] : 1;
                  return sorted.slice(0, 6).map(([s, n]) => (
                    <div key={s} className="mb-1.5">
                      <div className="flex justify-between text-[12px]"><span>{s}</span><span className="font-semibold">{n}</span></div>
                      <ProgressBar value={n} max={maxV} />
                    </div>
                  ));
                })()}
              </div>
              <div>
                <div className="font-semibold mb-2">{"\uD83D\uDCE1"} By Channel</div>
                {(() => {
                  const chs = ((srcBreakdown.dimensions as unknown as Record<string, Record<string, number>>)?.channels) || {};
                  return Object.entries(chs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => (
                    <div key={c} className="flex justify-between text-[12px] py-1 border-b border-border">
                      <span>{c}</span><span className="font-semibold">{n}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          ) : <p className="text-muted-foreground">Sin datos</p>
        )}

        {tab === "pipeline" && (
          pipelines.length > 0 ? (
            <div>
              <div className="font-semibold mb-2">{"\uD83D\uDD04"} Pipelines</div>
              {pipelines.map((p, pi) => {
                const dm = p.dimensions as Record<string, unknown>;
                const stages = (dm.stages as { name: string; count: number }[]) || [];
                return (
                  <div key={pi} className="mb-3">
                    <div className="text-[13px] font-semibold">{dm.pipelineName as string} ({p.value} opps)</div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {stages.map((s) => (
                        <div key={s.name} className={cn("px-2.5 py-1 rounded-md text-[11px] border border-border", s.count > 0 ? "bg-rust text-white" : "bg-muted text-muted-foreground")} title={s.name}>
                          {s.name.length > 15 ? s.name.slice(0, 15) + "\u2026" : s.name} {s.count > 0 && `(${s.count})`}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-muted-foreground">Sin pipelines</p>
        )}

        {tab === "convos" && (
          convos.length > 0 ? (
            <div>
              <div className="font-semibold mb-2">{"\uD83D\uDCAC"} Recent Conversations</div>
              {convos.map((c, i) => {
                const dm = c.dimensions as Record<string, string | number>;
                const unread = (dm.unread as number) > 0;
                const typeIcon = dm.type === "TYPE_PHONE" ? "\uD83D\uDCF1" : dm.type === "TYPE_EMAIL" ? "\uD83D\uDCE7" : "\uD83D\uDCAC";
                const link = locationId && dm.contactId ? `https://app.gohighlevel.com/v2/location/${locationId}/conversations/${dm.contactId}` : "";
                return (
                  <div key={i} className="p-2 bg-muted rounded-md mb-1.5 text-[12px]">
                    <div className="flex justify-between items-center">
                      <span>{typeIcon} {dm.lastMessageDate || ""} {unread && <span className="bg-destructive text-white px-1.5 py-0.5 rounded-full text-[10px] font-semibold">{dm.unread} unread</span>}</span>
                      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-rust text-[11px] no-underline">Abrir {"\u2192"}</a>}
                    </div>
                    <div className="mt-1 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap max-w-[400px]">{dm.lastMessage || ""}</div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-muted-foreground">Sin conversaciones</p>
        )}
      </div>
    </>
  );
}

// ============================================================
// Plan Funnel Card
// ============================================================

function PlanFunnelCard({ plan, sources, metricsData }: { plan: NonNullable<MetricsData["plan"]>; sources: Record<string, SourceData>; metricsData: MetricsData }) {
  const [tab, setTab] = useState<"overview" | "channels">("overview");

  if (!plan.funnel) return null;

  // Build funnel
  const funnelSteps = plan.funnel.map((step) => {
    let value: string = "\u2014";
    let automated = false;
    let hasManualData = false;
    if (step.source) {
      const src = sources[step.source] || sources[step.source.replace(/-/g, "_")] || sources[step.source.replace(/_/g, "-")];
      if (src && src.status === "ok") {
        const m = src.metrics.find((x) => x.name === step.metric && (!x.dimensions || (x.dimensions as Record<string, string>).source === "manual"));
        if (m) {
          value = typeof m.value === "number" ? m.value.toLocaleString() : String(m.value);
          if (step.manual) hasManualData = true; else automated = true;
        }
      }
    }
    const statusDot = automated ? "\uD83D\uDFE2" : hasManualData ? "\uD83D\uDFE2" : step.manual ? "\uD83D\uDFE1" : "\uD83D\uDD34";
    const statusLabel = automated ? "auto" : hasManualData ? "sheets" : "manual";
    return { step: step.step, value, statusDot, statusLabel, automated: automated || hasManualData };
  });

  // Channel breakdown
  const crmSrc = sources.ghl || sources["go-high-level"];
  const channelLeads: Record<string, number> = {};
  if (crmSrc?.metrics) {
    crmSrc.metrics.filter((m) => m.name === "newContacts" && (m.dimensions as Record<string, string>)?.channel)
      .forEach((m) => {
        const ch = (m.dimensions as Record<string, string>).channel;
        channelLeads[ch] = (channelLeads[ch] || 0) + m.value;
      });
  }
  const adsSrc = sources["meta-ads"] || sources.meta_ads;
  const adsSpend = adsSrc ? (mVal(adsSrc, "spend") || 0) : 0;
  const ga4 = sources.ga4;
  const ga4Channels: Record<string, number> = {};
  if (ga4?.metrics) {
    ga4.metrics.filter((m) => m.name === "sessions" && (m.dimensions as Record<string, string>)?.channel)
      .forEach((m) => { ga4Channels[(m.dimensions as Record<string, string>).channel] = m.value; });
  }

  // Merge channels
  const channelMap: Record<string, { name: string; icon: string }> = {
    Facebook: { name: "Facebook Ads", icon: "\uD83D\uDCD8" },
    "facebook/Paid Social": { name: "Facebook Ads", icon: "\uD83D\uDCD8" },
  };
  const merged: Record<string, { channel: string; icon: string; leads: number; sessions: number; spend: number; cpl: number | null }> = {};
  for (const [ch, lds] of Object.entries(channelLeads).sort((a, b) => b[1] - a[1])) {
    const info = channelMap[ch] || { name: ch, icon: "\uD83D\uDCE1" };
    const isPaid = ch === "Facebook" || ch.includes("facebook") || ch.includes("Paid");
    if (merged[info.name]) {
      merged[info.name].leads += lds;
      if (isPaid) merged[info.name].spend = adsSpend;
    } else {
      merged[info.name] = { channel: info.name, icon: info.icon, leads: lds, spend: isPaid ? adsSpend : 0, sessions: 0, cpl: null };
    }
  }
  for (const r of Object.values(merged)) {
    r.cpl = r.spend > 0 && r.leads > 0 ? r.spend / r.leads : null;
  }
  // GA4 organic channels
  for (const [ch, ses] of Object.entries(ga4Channels)) {
    const existing = Object.values(merged).find((r) => r.channel.toLowerCase().includes(ch.toLowerCase().split(" ")[0]));
    if (existing) { existing.sessions += ses; }
    else if (ch !== "Direct" && ch !== "(not set)") {
      const icon = ch.includes("Social") ? "\uD83D\uDCF1" : ch.includes("Search") ? "\uD83D\uDD0D" : ch.includes("Referral") ? "\uD83D\uDD17" : ch.includes("Email") ? "\uD83D\uDCE7" : "\uD83D\uDCE1";
      merged[ch] = { channel: ch, icon, leads: 0, sessions: ses, spend: 0, cpl: null };
    }
  }
  const channelRows = Object.values(merged).sort((a, b) => (b.leads || 0) - (a.leads || 0) || (b.sessions || 0) - (a.sessions || 0));

  return (
    <div className="border-2 border-rust rounded-xl bg-card p-5 mb-5 relative">
      <div className="absolute -top-2.5 left-4 bg-card px-2 text-[11px] uppercase tracking-widest text-rust font-bold">
        {"\uD83D\uDCCB"} Metrics Plan · {plan.label || plan.archetype}
      </div>

      <div className="flex justify-between items-center mt-2 mb-2">
        <div className="text-[13px] text-muted-foreground">
          Activation: <strong className="text-foreground">{plan.activationEvent}</strong> · Primary KPI: <strong className="text-foreground">{plan.primaryKPI}</strong>
        </div>
        <div className="flex gap-1">
          <TabButton label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
          <TabButton label="By Channel" active={tab === "channels"} onClick={() => setTab("channels")} />
        </div>
      </div>

      {tab === "overview" && (
        <div className="flex items-center justify-center gap-1 py-4 flex-wrap">
          {funnelSteps.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="text-center min-w-[100px]">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.step}</div>
                <div className={cn("text-[28px] font-bold font-heading my-1", !s.automated && "text-muted-foreground")}>{s.value}</div>
                <div className="text-[10px]">{s.statusDot} {s.statusLabel}</div>
              </div>
              {i < funnelSteps.length - 1 && <div className="text-xl text-muted-foreground mx-1">{"\u2192"}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === "channels" && (
        channelRows.length > 0 ? (
          <table className="w-full border-collapse text-[13px] mt-3 table-fixed">
            <colgroup>
              <col style={{ width: "35%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead><tr>
              <th className="text-left text-[10px] uppercase text-muted-foreground p-1">Canal</th>
              <th className="text-right text-[10px] uppercase text-muted-foreground p-1">Leads</th>
              <th className="text-right text-[10px] uppercase text-muted-foreground p-1">Sessions</th>
              <th className="text-right text-[10px] uppercase text-muted-foreground p-1">Spend</th>
              <th className="text-right text-[10px] uppercase text-muted-foreground p-1">CPL</th>
            </tr></thead>
            <tbody>
              {channelRows.map((r) => (
                <tr key={r.channel} className="border-t border-border">
                  <td className="p-1.5 overflow-hidden text-ellipsis whitespace-nowrap">{r.icon} {r.channel}</td>
                  <td className={cn("p-1.5 text-right font-bold", r.leads > 0 && "text-sage")}>{r.leads || "\u2014"}</td>
                  <td className="p-1.5 text-right">{r.sessions || "\u2014"}</td>
                  <td className="p-1.5 text-right">{r.spend > 0 ? `\u20AC${r.spend.toFixed(0)}` : "\u2014"}</td>
                  <td className={cn("p-1.5 text-right", r.cpl != null && r.cpl < 20 && "text-sage")}>{r.cpl != null ? `\u20AC${r.cpl.toFixed(2)}` : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-muted-foreground text-center py-4">Sin datos per-channel a\u00fan</p>
      )}

      {/* Recommended integrations */}
      {metricsData.recommended && metricsData.recommended.length > 0 && (
        <div className="border-t border-border pt-2.5 mt-3">
          <div className="text-[11px] text-muted-foreground mb-1.5">{"\u26A0\uFE0F"} Integraciones pendientes:</div>
          <div className="flex flex-wrap gap-1.5">
            {metricsData.recommended.map((r) => (
              <span key={r.label} className="px-2.5 py-1 bg-muted border border-yellow-400 rounded-full text-[11px] inline-flex items-center gap-1">
                {r.label}
                {r.apiId && <span className="text-[9px] text-rust">conectar {"\u2192"}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Métricas v2 — tab views from the dashboard definition (PR-5a)
// ============================================================

/** Build the horizontal funnel steps from a plan + live sources (shared strip). */
function buildFunnelSteps(funnel: NonNullable<MetricsData["plan"]>["funnel"], sources: Record<string, SourceData>) {
  if (!funnel) return [] as { step: string; value: string; statusDot: string; statusLabel: string; automated: boolean }[];
  return funnel.map((step) => {
    let value = "—";
    let automated = false;
    let hasManualData = false;
    if (step.source) {
      const src = pickSource(sources, step.source);
      if (src && src.status === "ok") {
        const m = src.metrics.find((x) => x.name === step.metric && (!x.dimensions || (x.dimensions as Record<string, string>).source === "manual"));
        if (m) {
          value = typeof m.value === "number" ? m.value.toLocaleString() : String(m.value);
          if (step.manual) hasManualData = true; else automated = true;
        }
      }
    }
    const statusDot = automated ? "🟢" : hasManualData ? "🟢" : step.manual ? "🟡" : "🔴";
    const statusLabel = automated ? "auto" : hasManualData ? "sheets" : "manual";
    return { step: step.step, value, statusDot, statusLabel, automated: automated || hasManualData };
  });
}

/** Compact activation funnel for the Overview tab (the rich card lives in Channels). */
function FunnelStrip({ plan, sources }: { plan: NonNullable<MetricsData["plan"]>; sources: Record<string, SourceData> }) {
  const steps = buildFunnelSteps(plan.funnel, sources);
  if (!steps.length) return null;
  return (
    <div className="border-2 border-border rounded-xl bg-card p-4 mb-6">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{"🎯"} {plan.activationEvent || "Activation funnel"}</div>
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="text-center min-w-[88px]">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.step}</div>
              <div className={cn("text-[22px] font-bold font-heading my-0.5", !s.automated && "text-muted-foreground")}>{s.value}</div>
              <div className="text-[10px]">{s.statusDot} {s.statusLabel}</div>
            </div>
            {i < steps.length - 1 && <div className="text-lg text-muted-foreground mx-1">{"→"}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tiny bar sparkline. */
function Sparkline({ values, color = "bg-rust" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.map((v, i) => (
        <div key={i} className={cn("w-1.5 rounded-sm", color)} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

/** Overview spotlight: North Star vs target (ring), Δ vs prev, sparkline. */
function NorthStarCard({ label, value, target, delta, spark, caption }: {
  label: string;
  value: number | null;
  target: number | null;
  delta: { value: string; direction: "up" | "down" | "flat" };
  spark: number[];
  caption: string;
}) {
  const pct = target != null && value != null && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
  return (
    <div className="border-[3px] border-navy rounded-xl bg-card p-5 shadow-comic mb-6 relative">
      <div className="absolute -top-2.5 left-4 bg-card px-2 text-[11px] uppercase tracking-widest text-navy font-bold">{"⭐"} North Star</div>
      <div className="flex items-center justify-between gap-4 flex-wrap mt-2">
        <div>
          <div className="text-[13px] text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-[40px] font-heading font-bold text-navy leading-none">{value != null ? value.toLocaleString() : "—"}</span>
            {target != null && <span className="text-sm text-muted-foreground">/ {target.toLocaleString()} objetivo</span>}
          </div>
          {caption && <div className="text-[11px] text-muted-foreground mt-1">{"≈"} {caption}</div>}
        </div>
        <div className="flex items-center gap-4">
          {delta.value && (
            <span className={cn("text-sm font-semibold", delta.direction === "up" ? "text-sage" : delta.direction === "down" ? "text-destructive" : "text-muted-foreground")}>
              {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "■"} {delta.value}
            </span>
          )}
          {pct != null && (
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#E5DDCF" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#4A5D23" strokeWidth="3" strokeDasharray={`${pct} 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold font-heading">{pct}%</span>
            </div>
          )}
          {spark.length > 1 && <Sparkline values={spark} color="bg-navy" />}
        </div>
      </div>
    </div>
  );
}

/** A custom (formula) metric created via Merlin chat — badge + live value + formula. */
function CustomMetricCard({ label, value, formula }: { label: string; value: string; formula: string }) {
  return (
    <div className="border-2 rounded-xl bg-card p-4" style={{ borderColor: "#3B9EBF", borderLeftWidth: 5 }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "#3B9EBF" }}>{"✨"} chat</span>
      </div>
      <div className="text-[26px] font-heading font-bold text-navy">{value}</div>
      <code className="text-[10px] text-muted-foreground font-mono break-all">{formula}</code>
    </div>
  );
}

/** One surface card: connected → value + sources; not connected → striped "Conectar →". */
function SurfaceCard({ surface, connected, connectedSources, value, valueLabel, slug, onOpen }: {
  surface: SurfaceDef;
  connected: boolean;
  connectedSources: string[];
  value: string | null;
  valueLabel: string | null;
  slug: string;
  onOpen?: () => void;
}) {
  if (!connected) {
    return (
      <a
        href={`/dashboard/${slug}/settings?tab=apis`}
        className="block border-2 border-dashed border-border rounded-xl p-4 hover:border-rust transition-colors"
        style={{ background: "repeating-linear-gradient(135deg, transparent, transparent 8px, rgba(0,0,0,0.03) 8px, rgba(0,0,0,0.03) 16px)" }}
      >
        <div className="flex items-center gap-2 mb-1 opacity-70">
          <span className="text-xl">{surface.emoji}</span>
          <span className="font-heading font-bold text-[15px]">{surface.name}</span>
        </div>
        <div className="text-[12px] text-muted-foreground mb-3">{surface.what}</div>
        <div className="text-[12px] font-semibold text-rust">{"🔌"} Conectar {"→"}</div>
      </a>
    );
  }
  const inner = (
    <>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xl">{surface.emoji}</span>
          <span className="font-heading font-bold text-[15px]">{surface.name}</span>
        </div>
        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
      </div>
      <div className="text-[12px] text-muted-foreground mb-2">{surface.what}</div>
      {value != null ? (
        <div>
          <span className="text-[24px] font-heading font-bold text-navy">{value}</span>
          {valueLabel && <span className="text-[11px] text-muted-foreground ml-1">{valueLabel}</span>}
        </div>
      ) : (
        <div className="text-[12px] text-sage font-semibold">{"✓"} Conectado</div>
      )}
      {connectedSources.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {connectedSources.map((s) => (
            <span key={s} className="text-[9px] bg-muted border border-border rounded px-1.5 py-0.5">{s}</span>
          ))}
        </div>
      )}
      {onOpen && <div className="text-[11px] text-rust font-semibold mt-2">Abrir detalle {"→"}</div>}
    </>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className="text-left border-2 border-border rounded-xl p-4 bg-card hover:border-rust transition-colors">{inner}</button>
  ) : (
    <div className="border-2 border-border rounded-xl p-4 bg-card">{inner}</div>
  );
}

/** Version trigger pill (chat / user-drag / template / seed / revert). */
function TriggerBadge({ trigger }: { trigger: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    chat: { bg: "#3B9EBF", fg: "#ffffff" },
    "user-drag": { bg: "#D8C9A3", fg: "#3a3320" },
    drag: { bg: "#D8C9A3", fg: "#3a3320" },
    template: { bg: "#E6A817", fg: "#3a2e00" },
    seed: { bg: "#4A5D23", fg: "#ffffff" },
    revert: { bg: "#C45D35", fg: "#ffffff" },
    edit: { bg: "#E5DDCF", fg: "#3a3320" },
  };
  const c = map[trigger] ?? { bg: "#E5DDCF", fg: "#3a3320" };
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: c.bg, color: c.fg }}>{trigger}</span>
  );
}

/** Sortable wrapper for a surface card — drag via the corner handle so the card's
 *  own click/link (open detail, Conectar →) keeps working. */
function SortableSurfaceCard({ id, disabled, children }: { id: string; disabled?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {!disabled && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground text-[13px] leading-none p-1 bg-card/80 rounded"
          title="Arrastra para reordenar"
          aria-label="Reordenar superficie"
        >
          {"☰"}
        </button>
      )}
      {children}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

interface MetricsTabItem { key: string; label: string }

// Client-side fallback tabs when the definition isn't configured (no DATABASE_URL
// locally) — mirrors DEFAULT_TABS in metric-dashboard.ts so the page still works.
const FALLBACK_TABS: MetricsTabItem[] = [
  { key: "overview", label: "Overview" },
  { key: "surfaces", label: "Surfaces" },
  { key: "channels", label: "Channels" },
  { key: "conversion", label: "Conversion" },
  { key: "trends", label: "Trends" },
  { key: "conexiones", label: "Conexiones" },
];

const TAB_LABELS: Record<string, string> = {
  overview: "Overview", surfaces: "Surfaces", channels: "Channels",
  conversion: "Conversion", trends: "Trends", conexiones: "Conexiones", partnerships: "Partnerships",
};

// File-based headline metric per surface (used when the time-series DB is empty).
const SURFACE_HEADLINE: Partial<Record<SurfaceKey, { source: string; metric: string; label: string; format?: string }>> = {
  web: { source: "ga4", metric: "sessions", label: "sessions" },
  paid: { source: "meta-ads", metric: "spend", label: "spend", format: "currency" },
  pipeline: { source: "ghl", metric: "newContacts", label: "new leads" },
  social: { source: "metricool", metric: "impressions", label: "impresiones" },
};

export default function MetricsPage() {
  const slug = useSlugSync();
  const t = useTranslations("metrics");
  const router = useRouter();
  const [tab, setTab] = useState<string>("overview");
  const [range, setRange] = useState<DateRange>("7d");
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectStatus, setCollectStatus] = useState("");
  const [planOpen, setPlanOpen] = useState(false);

  // Tab inicial por URL (?tab=surfaces|partnerships…) — enlazable desde chat/MCP.
  // Legacy ?tab=funnel → channels (la vista del funnel vive ahí ahora).
  useEffect(() => {
    if (!router.isReady) return;
    const queryTab = Array.isArray(router.query.tab) ? router.query.tab[0] : router.query.tab;
    if (queryTab === "funnel") setTab("channels");
    else if (queryTab) setTab(queryTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const selectTab = useCallback(
    (next: string) => {
      setTab(next);
      const query = { ...router.query, tab: next } as Record<string, string | string[]>;
      if (next === "overview") delete query.tab;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router],
  );

  const { data: plan, isLoading: planLoading } = useMetricsPlan(slug);
  const { data: dashboardRec, isLoading: dashboardLoading } = useDashboardDefinition(slug);
  const { data: surfaceSummary } = useSurfaceSummary(slug);
  const definition: DashboardDefinition | null = dashboardRec?.definition ?? null;

  const queryClient = useQueryClient();
  const openChat = useOpenChat();
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Optimistic surface order (keys) held until a server-side drag save resolves.
  const [surfaceOrder, setSurfaceOrder] = useState<string[] | null>(null);
  const surfaceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReorder = useRef<{ slug: string; keys: string[] } | null>(null);
  const slugRef = useRef(slug);
  slugRef.current = slug; // latest slug, for guarding async saves after navigation

  // Persist a surface reorder: send only the key order; the server merges it onto
  // the LATEST definition (no lost-update of intervening edits). Keep the optimistic
  // order until the fresh definition arrives to avoid a flash-back.
  async function saveSurfaceOrder(targetSlug: string, keys: string[]) {
    setSaving(true);
    try {
      await fetch(`/api/metrics/dashboard?slug=${targetSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surfacesOrder: keys, trigger: "user-drag", changeNote: "Reordenadas superficies" }),
      }).catch(() => undefined);
      // Reconcile to the server's truth: refetch (the optimistic order is held until
      // it arrives → no flash on a successful save) then drop the optimistic order.
      // A FAILED save (non-2xx or network error) thus ROLLS BACK to the persisted
      // order instead of looking saved. Guard shared state by slug — the page is
      // reused across clients, so a late save for A mustn't stomp B's order.
      await queryClient.invalidateQueries({ queryKey: ["metrics-dashboard", targetSlug] });
      if (slugRef.current === targetSlug) setSurfaceOrder(null);
    } finally {
      if (slugRef.current === targetSlug) setSaving(false);
    }
  }

  async function revertTo(version: number) {
    if (!slug) return;
    // Cancel any pending debounced drag save + drop the optimistic order so it
    // can't re-post the old surface order on top of the reverted snapshot.
    if (surfaceSaveTimer.current) { clearTimeout(surfaceSaveTimer.current); surfaceSaveTimer.current = null; }
    pendingReorder.current = null;
    setSurfaceOrder(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/metrics/dashboard/revert?slug=${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toVersion: version }),
      });
      if (res.ok) await queryClient.invalidateQueries({ queryKey: ["metrics-dashboard", slug] });
    } finally {
      setSaving(false);
    }
  }

  // Open the Merlin metrics-setup chat thread (manifest-driven; Merlin is the
  // pillar owner) with a contextual opener. The actual edits run through the MCP
  // write tools — this never handles credentials.
  function openMerlin(message: string) {
    if (!slug) return;
    openChat(slug, buildMetricsEditThread(slug, message));
  }

  // On slug change OR unmount, cancel the timer, FLUSH any pending reorder
  // (keepalive so it survives a route change / unload), and reset the optimistic
  // order so it never leaks into another client's dashboard. The metrics page stays
  // mounted across `/dashboard/<slug>/metrics` slug changes, so this must key on
  // `slug`, not just run on unmount. Refs only → no stale closure; p.slug is the
  // slug captured when the drag was scheduled.
  useEffect(() => () => {
    if (surfaceSaveTimer.current) { clearTimeout(surfaceSaveTimer.current); surfaceSaveTimer.current = null; }
    const p = pendingReorder.current;
    if (p) {
      pendingReorder.current = null;
      void fetch(`/api/metrics/dashboard?slug=${p.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surfacesOrder: p.keys, trigger: "user-drag", changeNote: "Reordenadas superficies" }),
        keepalive: true,
      });
      // Mark the (now inactive) dashboard query stale so returning to this client
      // refetches the saved order instead of serving the pre-drag cache.
      void queryClient.invalidateQueries({ queryKey: ["metrics-dashboard", p.slug] });
    }
    // Reset shared in-flight state so the next client doesn't inherit it.
    setSurfaceOrder(null);
    setSaving(false);
  }, [slug, queryClient]);

  const { data: metricsData, refetch: refetchMetrics } = useQuery<MetricsData>({
    queryKey: ["metrics-data", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics?slug=${slug}`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const { data: monitoring } = useQuery<MonitoringData>({
    queryKey: ["monitoring", slug],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring?slug=${slug}`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  // Module ordering
  const [moduleOrder, setModuleOrder] = useState<string[]>([]);
  useEffect(() => {
    if (!slug) return;
    const stored = localStorage.getItem(`mc-metrics-order-${slug}`);
    if (stored) { try { setModuleOrder(JSON.parse(stored)); } catch { /* ignore */ } }
  }, [slug]);
  const saveOrder = useCallback((order: string[]) => {
    setModuleOrder(order);
    if (slug) localStorage.setItem(`mc-metrics-order-${slug}`, JSON.stringify(order));
  }, [slug]);

  // Aggregate data for selected range
  const days = RANGE_DAYS[range];
  const allDaily = useMemo(() => {
    if (!metricsData?.daily) return [];
    return [...metricsData.daily].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [metricsData?.daily]);

  const rangeEntries = useMemo(() => {
    if (days === 0) return allDaily;
    if (days === 1) return allDaily.slice(-1);
    return allDaily.slice(-days);
  }, [allDaily, days]);

  const prevEntries = useMemo(() => {
    if (days === 0) return [];
    if (days === 1) return allDaily.length > 1 ? allDaily.slice(-2, -1) : [];
    return allDaily.slice(-days * 2, -days);
  }, [allDaily, days]);

  const sources = useMemo(() => normSources(rangeEntries), [rangeEntries]);
  const prevSources = useMemo(() => normSources(prevEntries), [prevEntries]);

  // Date range label
  const dateFrom = rangeEntries[0]?.date || "?";
  const dateTo = rangeEntries[rangeEntries.length - 1]?.date || "?";
  const rangeLabel = days === 1 ? `· ${dateTo}` : rangeEntries.length > 0 ? `· ${dateFrom} \u2192 ${dateTo} (${rangeEntries.length} d\u00edas)` : "";

  // Source declarations
  const ga4 = sources.ga4;
  const gsc = sources.gsc;
  const ads = sources["meta-ads"] || sources.meta_ads;
  const mc = sources.metricool;
  const ghl = sources.ghl;
  const pGa4 = prevSources.ga4;
  const pGsc = prevSources.gsc;

  // GHL location ID
  const ghlLocationId = metricsData?.dataSources?.ghl?.config?.locationId || metricsData?.dataSources?.ghl?.config?.LOCATION_ID || "";

  // Merge plan from both sources
  const effectivePlan = metricsData?.plan || plan;

  // Display plan — prefers the ACTIVE definition's plan (funnel/kpis/activation)
  // so Merlin's edits show in the funnel + KPI views; falls back to the file plan.
  const displayPlan = useMemo(() => {
    const defPlan = definition?.plan;
    if (!defPlan || (!defPlan.funnel?.length && !defPlan.kpis?.length)) return effectivePlan;
    return {
      ...(effectivePlan || {}),
      archetype: definition?.archetype ?? effectivePlan?.archetype,
      activationEvent: defPlan.activationEvent ?? effectivePlan?.activationEvent,
      funnel: defPlan.funnel?.length
        ? defPlan.funnel.map((s) => ({ step: s.name, source: s.source, metric: s.metric, manual: s.manual }))
        : effectivePlan?.funnel,
      kpis: defPlan.kpis?.length ? defPlan.kpis : effectivePlan?.kpis,
    };
  }, [definition, effectivePlan]);

  // Calculate plan-driven KPIs (from the active definition's plan when present)
  const planKpis = useMemo(() => {
    if (!displayPlan?.kpis) return [];
    const calculated: { name: string; value: string; category: string; isGood: boolean }[] = [];
    for (const kpi of displayPlan.kpis) {
      if (!kpi.formula) continue;
      // One formula engine: evalFormula validates (isSafeFormula) + resolves
      // source.metric refs (underscore/hyphen/decimal-safe) before eval.
      const result = evalFormula(kpi.formula, sources);
      if (result == null) continue;
      const isGood = kpi.name === "CPL" ? result < 20 : true;
      calculated.push({ name: kpi.name, value: fmtByFormat(result, kpi.format), category: kpi.category || "", isGood });
    }
    return calculated;
  }, [displayPlan, sources]);

  // Health KPI cards
  const healthCards: HealthCard[] = useMemo(() => {
    const cards: HealthCard[] = [];
    if (ga4?.status === "ok") {
      const v = mVal(ga4, "sessions") || 0;
      const pv = pGa4 ? mVal(pGa4, "sessions") : null;
      cards.push({ label: "Sessions", value: fmt(v), delta: mDelta(v, pv), status: v > 0 ? "good" : "neutral" });
      const usr = mVal(ga4, "totalUsers") || 0;
      const pUsr = pGa4 ? mVal(pGa4, "totalUsers") : null;
      cards.push({ label: "Users", value: fmt(usr), delta: mDelta(usr, pUsr), status: "neutral" });
      const bounce = mVal(ga4, "bounceRate");
      if (bounce != null) {
        const pct = Math.round(bounce * 100);
        cards.push({ label: "Bounce Rate", value: `${pct}%`, status: pct > 70 ? "bad" : pct > 50 ? "warn" : "good" });
      }
    }
    if (gsc?.status === "ok") {
      const v = mVal(gsc, "impressions") || 0;
      const pv = pGsc ? mVal(pGsc, "impressions") : null;
      cards.push({ label: "SEO Impressions", value: fmt(v), delta: mDelta(v, pv), status: v > 0 ? "good" : "neutral" });
    }
    if (ads?.status === "ok") {
      const spend = mVal(ads, "spend") || 0;
      const ctr = mVal(ads, "ctr") || 0;
      cards.push({ label: "Ad Spend", value: `\u20AC${spend.toFixed(0)}`, delta: { value: `CTR ${ctr.toFixed(1)}%`, direction: "flat" }, status: "neutral" });
    }
    if (ghl?.status === "ok") {
      const v = mVal(ghl, "newContacts") || 0;
      const total = mVal(ghl, "totalContacts") || 0;
      cards.push({ label: "New Contacts", value: `+${v}`, delta: { value: `${total} total`, direction: v > 0 ? "up" : "flat" }, status: v > 0 ? "good" : "neutral" });
    }
    // Plan-driven KPIs
    for (const kpi of planKpis) {
      cards.push({ label: kpi.name, value: kpi.value, delta: { value: kpi.category, direction: "flat" }, status: kpi.isGood ? "good" : "warn" });
    }
    return cards;
  }, [ga4, gsc, ads, ghl, pGa4, pGsc, planKpis]);

  // Source pills
  const sourcePills: SourcePill[] = useMemo(() => {
    const ds = metricsData?.dataSources || {};
    return Object.keys(ds).map((s) => {
      const src = sources[s] || sources[s.replace(/_/g, "-")] || sources[s.replace(/-/g, "_")];
      const st = src ? (src.status === "ok" ? "ok" : "error") : "disconnected";
      const n = src?.metrics?.length || 0;
      return { name: s, label: `${SOURCE_NAMES[s] || s}${st === "ok" ? ` (${n})` : ""}`, status: st as SourcePill["status"] };
    });
  }, [metricsData?.dataSources, sources]);

  // Dynamic modules — built from raw data like legacy
  const dynamicModules: DynModule[] = useMemo(() => {
    const mods: DynModule[] = [];
    if (ga4?.status === "ok") mods.push({ id: "traffic", icon: "\uD83C\uDF10", title: "Web Traffic", priority: 1 });
    if (gsc?.status === "ok") mods.push({ id: "search", icon: "\uD83D\uDD0D", title: "Search Visibility", priority: 2 });
    if (ads?.status === "ok") mods.push({ id: "ads", icon: "\uD83D\uDCE3", title: "Paid Campaigns", priority: 3 });
    if (mc?.status === "ok" && mc.metrics.length > 0) mods.push({ id: "social", icon: "\uD83D\uDCF1", title: "Social Media", priority: 4 });
    if (ghl?.status === "ok") mods.push({ id: "crm", icon: "\uD83D\uDCC7", title: "Pipeline & CRM", priority: 5 });
    return mods;
  }, [ga4, gsc, ads, mc, ghl]);

  const orderedModules = useMemo(() => {
    if (moduleOrder.length === 0) return dynamicModules;
    const byId = Object.fromEntries(dynamicModules.map((m) => [m.id, m]));
    const ordered = moduleOrder.map((id) => byId[id]).filter(Boolean);
    const remaining = dynamicModules.filter((m) => !moduleOrder.includes(m.id));
    return [...ordered, ...remaining];
  }, [dynamicModules, moduleOrder]);

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedModules.findIndex((m) => m.id === active.id);
    const newIndex = orderedModules.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newArr = arrayMove(orderedModules, oldIndex, newIndex);
    saveOrder(newArr.map((m) => m.id));
  }

  // Collect handler
  async function handleCollect() {
    if (!slug || collecting) return;
    setCollecting(true);
    setCollectStatus("Recolectando...");
    try {
      const res = await fetch("/api/metrics-collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      if (res.ok) {
        setCollectStatus("\u2705 Datos recolectados");
        setTimeout(() => { refetchMetrics(); setCollectStatus(""); }, 2000);
      } else {
        setCollectStatus("\u274C Error al recolectar");
      }
    } catch {
      setCollectStatus("\u274C Error de red");
    }
    setCollecting(false);
  }

  const hasData = allDaily.length > 0;
  const hasConnectedApis = Object.values(metricsData?.dataSources || {}).some((v) => v.status === "connected");

  // Render module content by ID
  function renderModuleContent(mod: DynModule) {
    switch (mod.id) {
      case "traffic": return ga4 ? <TrafficModule ga4={ga4} /> : null;
      case "search": return gsc ? <SearchModule gsc={gsc} /> : null;
      case "ads": return ads ? <AdsModule ads={ads} /> : null;
      case "social": return mc ? <SocialModule mc={mc} /> : null;
      case "crm": return ghl ? <CrmModule ghl={ghl} locationId={ghlLocationId} /> : null;
      default: return null;
    }
  }

  // ── Métricas v2: tabs + computed views from the definition (PR-5a) ──────────
  const tabs: MetricsTabItem[] = useMemo(() => {
    const defTabs = definition?.tabs;
    const base: MetricsTabItem[] = defTabs?.length
      ? [...defTabs].filter((tb) => tb.visible).sort((a, b) => a.order - b.order).map((tb) => ({ key: tb.key, label: tb.label || TAB_LABELS[tb.key] || tb.key }))
      : [...FALLBACK_TABS];
    if (!base.some((tb) => tb.key === "partnerships")) base.push({ key: "partnerships", label: "Partnerships" });
    return base;
  }, [definition]);

  // Snap to the first visible tab if the active one isn't among the definition's
  // tabs (e.g. a definition hides/omits `overview`, or a stale ?tab in the URL),
  // so the rendered content always matches a visible tab button. Gated on the
  // definition having loaded — otherwise a cold load with ?tab=<definition-only
  // tab> would reset to overview before that tab exists in `tabs`.
  useEffect(() => {
    if (dashboardLoading) return;
    if (tabs.length > 0 && !tabs.some((tb) => tb.key === tab)) setTab(tabs[0].key);
  }, [tabs, tab, dashboardLoading]);

  const isDataTab = ["overview", "surfaces", "channels", "conversion", "trends"].includes(tab);

  // North Star spotlight — prefers the ACTIVE dashboard definition (northStar.kpiRef
  // → definition.plan.kpis, then definition.plan.funnel), so Merlin's edits are
  // reflected; falls back to the file-based plan's deepest resolvable funnel step.
  const northStar = useMemo(() => {
    const ns = definition?.northStar;
    const label = ns?.label || effectivePlan?.activationEvent || effectivePlan?.primaryKPI || "North Star";
    const target = ns?.target ?? null;
    const defFunnel = definition?.plan?.funnel;
    const fileFunnel = (effectivePlan?.funnel || []) as { step?: string; name?: string; source?: string; metric?: string }[];
    const funnel: { label: string; source?: string; metric?: string }[] = defFunnel?.length
      ? defFunnel.map((s) => ({ label: s.name, source: s.source, metric: s.metric }))
      : fileFunnel.map((s) => ({ label: s.step || s.name || "", source: s.source, metric: s.metric }));

    let value: number | null = null;
    let prev: number | null = null;
    let spark: number[] = [];
    let caption = "";

    // 1) Honor northStar.kpiRef against the active definition's KPIs.
    const kpi = ns?.kpiRef ? definition?.plan?.kpis?.find((k) => k.name === ns.kpiRef) : undefined;
    if (kpi) {
      if (kpi.formula) {
        value = evalFormula(kpi.formula, sources);
      } else if (kpi.source && kpi.metric) {
        value = mVal(pickSource(sources, kpi.source), kpi.metric);
        if (value != null) {
          prev = mVal(pickSource(prevSources, kpi.source), kpi.metric);
          spark = bucketDaily(rangeEntries, kpi.source, kpi.metric, "day");
        }
      }
      if (value != null) caption = kpi.name;
    }

    // 2) Fall back to the deepest funnel step that resolves.
    if (value == null) {
      for (let i = funnel.length - 1; i >= 0; i--) {
        const step = funnel[i];
        if (!step.source || !step.metric) continue;
        const cur = mVal(pickSource(sources, step.source), step.metric);
        if (cur != null) {
          value = cur;
          prev = mVal(pickSource(prevSources, step.source), step.metric);
          spark = bucketDaily(rangeEntries, step.source, step.metric, "day");
          caption = step.label;
          break;
        }
      }
    }

    return { label, value, target, delta: mDelta(value, prev), spark, caption };
  }, [definition, effectivePlan, sources, prevSources, rangeEntries]);

  // Custom (formula) metrics created via Merlin — evaluated against live sources.
  const customMetricCards = useMemo(() => {
    return (definition?.customMetrics || []).map((cm) => {
      const num = evalFormula(cm.formula, sources);
      return { label: cm.label, value: num != null ? fmtByFormat(num, cm.format) : "—", formula: cm.formula };
    });
  }, [definition, sources]);

  const orderedSurfaces: SurfaceDef[] = useMemo(() => {
    const refs = definition?.surfaces;
    if (refs?.length) {
      return [...refs].filter((r) => r.visible).sort((a, b) => a.order - b.order)
        .map((r) => SURFACES.find((s) => s.key === r.surface))
        .filter((s): s is SurfaceDef => Boolean(s));
    }
    return SURFACES;
  }, [definition]);

  // Connected sources from the file-based pipeline (works without the time-series DB).
  const connectedFromFiles = useMemo(() => {
    const set = new Set<string>();
    const add = (k: string) => { set.add(k); set.add(k.replace(/_/g, "-")); set.add(k.replace(/-/g, "_")); };
    const ds = metricsData?.dataSources || {};
    for (const [k, v] of Object.entries(ds)) { if (v.status === "ok" || v.status === "connected") add(k); }
    for (const [k, v] of Object.entries(sources)) { if (v.status === "ok") add(k); }
    return set;
  }, [metricsData?.dataSources, sources]);

  function surfaceInfoFor(surface: SurfaceDef): { connected: boolean; connectedSources: string[]; value: string | null; valueLabel: string | null } {
    const summaryEntry: SurfaceSummaryEntry | undefined = surfaceSummary?.configured ? surfaceSummary.surfaces.find((s) => s.surface === surface.key) : undefined;
    const set = new Set<string>(surface.sources.filter((s) => connectedFromFiles.has(s)));
    if (summaryEntry) for (const s of summaryEntry.sources) set.add(s);
    const connectedSources = [...set];
    let value: string | null = null;
    let valueLabel: string | null = null;
    const head = SURFACE_HEADLINE[surface.key];
    if (head) {
      const v = mVal(pickSource(sources, head.source), head.metric);
      if (v != null) { value = fmtByFormat(v, head.format); valueLabel = head.label; }
    }
    if (value == null && summaryEntry?.metrics?.length) {
      // summaryEntry.metrics is ordered by date only, so for surfaces with several
      // metrics prefer the intended headline (SURFACE_HEADLINE source.metric) before
      // falling back to the first — otherwise Paid could show clicks/CPC, not spend.
      const candidates = summaryEntry.metrics.filter((x) => x.value != null);
      const m = (head && (candidates.find((x) => x.source === head.source && x.metric === head.metric)
        || candidates.find((x) => x.metric === head.metric))) || candidates[0];
      if (m && m.value != null) {
        const isHeadline = !!head && m.metric === head.metric;
        value = isHeadline ? fmtByFormat(m.value, head!.format) : m.value.toLocaleString();
        valueLabel = isHeadline ? head!.label : m.metric;
      }
    }
    return { connected: connectedSources.length > 0, connectedSources, value, valueLabel };
  }

  // Server-side DnD: reorder definition.surfaces and persist (debounced) as a new
  // "user-drag" version. The definition is the source of truth; surfaceOrder is
  // only the optimistic paint until the save resolves (no localStorage).
  function persistSurfaceOrder(keys: string[]) {
    if (!slug || !dashboardRec?.configured) return; // no DB → optimistic only, nothing to persist
    if (surfaceSaveTimer.current) clearTimeout(surfaceSaveTimer.current);
    pendingReorder.current = { slug, keys };
    surfaceSaveTimer.current = setTimeout(() => {
      pendingReorder.current = null;
      void saveSurfaceOrder(slug, keys);
    }, 800);
  }

  function handleSurfaceDragEnd(event: DragEndEvent) {
    // Ignore drags until the dashboard record has loaded (we can't know yet whether
    // the order would persist) and while a save is in flight (so overlapping saves
    // can't commit the older order last). The handle is disabled in both cases too.
    if (!dashboardRec || saving) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys = (surfaceOrder ?? orderedSurfaces.map((s) => s.key)).slice();
    const oldIndex = keys.indexOf(String(active.id));
    const newIndex = keys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(keys, oldIndex, newIndex);
    setSurfaceOrder(next);
    persistSurfaceOrder(next);
  }

  // Surfaces in optimistic (drag) order when set, else the definition order.
  const displayedSurfaces: SurfaceDef[] = (() => {
    if (!surfaceOrder) return orderedSurfaces;
    const byKey = new Map(orderedSurfaces.map((s) => [s.key, s]));
    const ordered = surfaceOrder.map((k) => byKey.get(k as SurfaceKey)).filter((s): s is SurfaceDef => Boolean(s));
    const missing = orderedSurfaces.filter((s) => !surfaceOrder.includes(s.key));
    return [...ordered, ...missing];
  })();

  const topPages = useMemo(() => {
    if (!ga4?.metrics) return [] as MetricEntry[];
    return ga4.metrics.filter((x) => x.name === "topPage").sort((a, b) => b.value - a.value).slice(0, 10);
  }, [ga4]);

  const dataBanners = (
    <>
      {metricsData?.manualDataPending && metricsData.metricsSheet?.url && (
        <div className="flex items-center gap-3 p-3 mb-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
          <span className="text-lg">{"📝"}</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-yellow-800">{t("manualBanner")}</div>
            <div className="text-[11px] text-muted-foreground">Signups, KYC, depósitos... Rellena la Sheet y pulsa Sincronizar.</div>
          </div>
          <a href={metricsData.metricsSheet.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-yellow-500 text-white font-semibold rounded text-[12px] whitespace-nowrap">
            Rellenar en Sheets {"→"}
          </a>
          <button onClick={handleCollect} disabled={collecting} className="px-3 py-1.5 bg-sage text-white font-semibold rounded text-[12px] whitespace-nowrap disabled:opacity-50">
            Sincronizar
          </button>
          {collectStatus && <span className="text-[10px] text-muted-foreground">{collectStatus}</span>}
        </div>
      )}
      {!hasData && hasConnectedApis && (
        <div className="border-2 border-sage rounded-lg bg-green-50 p-5 text-center mb-6">
          <div className="text-xl mb-2">{"✅"} APIs conectadas: {Object.entries(metricsData?.dataSources || {}).filter(([, v]) => v.status === "connected").map(([k]) => k.toUpperCase()).join(", ")}</div>
          <div className="text-[13px] text-muted-foreground mb-3">Las APIs están conectadas pero aún no se han recolectado datos. Pulsa el botón para lanzar la primera recolección.</div>
          <button onClick={handleCollect} disabled={collecting} className="px-6 py-2.5 bg-sage text-white font-bold rounded-md text-sm disabled:opacity-50">
            Recolectar datos ahora
          </button>
          {collectStatus && <div className="mt-2 text-[12px] text-muted-foreground">{collectStatus}</div>}
        </div>
      )}
    </>
  );

  const modulesGrid = planLoading ? (
    <p className="text-muted-foreground">Cargando módulos de métricas...</p>
  ) : orderedModules.length > 0 ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedModules.map((m) => m.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {orderedModules.map((mod) => (
            <SortableModuleCard key={mod.id} mod={mod} expanded={expandedModule === mod.id} onToggleExpand={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}>
              {renderModuleContent(mod)}
            </SortableModuleCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  ) : null;

  function renderOverview() {
    return (
      <>
        {dataBanners}
        <NorthStarCard label={northStar.label} value={northStar.value} target={northStar.target} delta={northStar.delta} spark={northStar.spark} caption={northStar.caption} />
        {customMetricCards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            {customMetricCards.map((c) => <CustomMetricCard key={c.label} label={c.label} value={c.value} formula={c.formula} />)}
          </div>
        )}
        {displayPlan?.funnel && hasData && <FunnelStrip plan={displayPlan} sources={sources} />}
        {healthCards.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
            {healthCards.map((card) => <KpiCard key={card.label} value={card.value} label={card.label} delta={card.delta} status={card.status} />)}
          </div>
        ) : !hasData && !hasConnectedApis ? (
          <div className="border-[3px] border-ink rounded-lg bg-card p-10 shadow-comic text-center">
            <p className="text-muted-foreground">{t("noModules")}</p>
            <p className="text-xs text-muted-foreground mt-2">{t("emptyData")}</p>
          </div>
        ) : null}
        {monitoring?.health_score && (
          <div className="mt-6 border-[3px] border-ink rounded-lg bg-card p-5 shadow-comic">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center font-heading text-xl text-white border-2 border-ink"
                style={{ background: (monitoring.health_score.score || 0) >= 70 ? "var(--sage)" : (monitoring.health_score.score || 0) >= 40 ? "var(--yellow)" : "var(--red, #ef4444)" }}
              >
                {monitoring.health_score.score || "—"}
              </div>
              <div>
                <h2 className="font-semibold text-sm">{t("monitoring")}</h2>
                <p className="text-xs text-muted-foreground">{monitoring.health_score.summary || "Health score"}</p>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderSurfaces() {
    return (
      <>
        {dataBanners}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSurfaceDragEnd}>
          <SortableContext items={displayedSurfaces.map((s) => s.key)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {displayedSurfaces.map((s) => {
                const info = surfaceInfoFor(s);
                return (
                  <SortableSurfaceCard key={s.key} id={s.key} disabled={!dashboardRec || saving}>
                    <SurfaceCard
                      surface={s}
                      connected={info.connected}
                      connectedSources={info.connectedSources}
                      value={info.value}
                      valueLabel={info.valueLabel}
                      slug={slug}
                      onOpen={s.key === "partnerships" ? () => selectTab("partnerships") : undefined}
                    />
                  </SortableSurfaceCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        {/* Custom surfaces (bespoke) + create-with-Merlin — outside the standard reorder. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {definition?.customSurfaces?.map((cs) => (
            <div key={cs.key} className="border-2 rounded-xl p-4 bg-card" style={{ borderColor: "#3B9EBF" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{cs.emoji || "🧩"}</span>
                <span className="font-heading font-bold text-[15px]">{cs.name}</span>
                <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#3B9EBF" }}>custom</span>
              </div>
              <div className="text-[12px] text-muted-foreground">{cs.cards?.length ? `${cs.cards.length} cards` : "—"}</div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => openMerlin("Quiero crear una superficie custom (p.ej. A/B tests, satisfacción). ¿Qué fuentes necesito y qué cards proponemos?")}
            className="text-left border-2 border-dashed rounded-xl p-4 bg-card hover:border-rust transition-colors"
            style={{ borderColor: "#3B9EBF" }}
          >
            <div className="flex items-center gap-2 mb-1"><span className="text-xl">{"➕"}</span><span className="font-heading font-bold text-[15px]">Nueva superficie custom</span></div>
            <div className="text-[12px] font-semibold" style={{ color: "#3B9EBF" }}>{"🔮"} Crear con Merlin {"→"}</div>
          </button>
        </div>
        {sourcePills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {sourcePills.map((pill) => {
              const dotColor = pill.status === "ok" ? "bg-green-500" : pill.status === "error" ? "bg-red-500" : "bg-yellow-400";
              return (
                <span key={pill.name} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-card border border-border rounded-full text-[12px] font-medium">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
                  {pill.label}
                </span>
              );
            })}
          </div>
        )}
        {orderedModules.length > 0 && <div className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">Detalle por sistema conectado</div>}
        {modulesGrid}
      </>
    );
  }

  function renderChannels() {
    return (
      <>
        {dataBanners}
        {displayPlan?.funnel && hasData ? (
          <PlanFunnelCard plan={displayPlan} sources={sources} metricsData={metricsData || {}} />
        ) : (
          <div className="border-2 border-border rounded-xl bg-card p-8 text-center text-muted-foreground">Sin datos de canales aún. Conecta fuentes para ver el funnel por canal.</div>
        )}
      </>
    );
  }

  function renderConversion() {
    return (
      <div className="space-y-4">
        <div className="border-2 border-dashed rounded-xl p-6 bg-card text-center" style={{ borderColor: "#3B9EBF" }}>
          <div className="text-3xl mb-2">{"🎯"}</div>
          <div className="font-heading font-bold text-lg mb-1">Conversion & Producto</div>
          <div className="text-[13px] text-muted-foreground mb-3 max-w-md mx-auto">Conecta PostHog para heatmaps, grabaciones de sesión y dropoff por paso del funnel de producto.</div>
          <a href={`/dashboard/${slug}/settings?tab=apis`} className="inline-block px-4 py-2 text-white rounded-md text-[13px] font-semibold" style={{ background: "#3B9EBF" }}>{"🔌"} Conectar PostHog {"→"}</a>
        </div>
        {topPages.length > 0 && (
          <div className="border-2 border-border rounded-xl p-4 bg-card">
            <div className="font-heading font-bold mb-3">Top páginas <span className="text-[11px] text-muted-foreground font-normal">(GA4 · proxy de dropoff)</span></div>
            <table className="w-full border-collapse text-[13px]">
              <thead><tr>
                <th className="text-left text-[10px] uppercase tracking-wide text-muted-foreground p-1">Página</th>
                <th className="text-right text-[10px] uppercase tracking-wide text-muted-foreground p-1">Views</th>
                <th className="text-right text-[10px] uppercase tracking-wide text-muted-foreground p-1">Engagement</th>
              </tr></thead>
              <tbody>
                {topPages.map((p, i) => {
                  const pg = (p.dimensions as Record<string, string>)?.page || "";
                  const short = pg.length > 50 ? pg.slice(0, 50) + "…" : pg;
                  const engPct = (p.dimensions as Record<string, number>)?.engagementRate || 0;
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1.5 max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap" title={pg}>{short}</td>
                      <td className="p-1.5 text-right font-heading font-semibold">{p.value}</td>
                      <td className={cn("p-1.5 text-right", engPct >= 60 && "text-sage")}>{engPct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderTrends() {
    const trendMetrics = ([
      { source: "ga4", metric: "sessions", label: "Sessions", color: "bg-navy" },
      { source: "ghl", metric: "newContacts", label: "New leads", color: "bg-sage" },
      { source: "meta-ads", metric: "spend", label: "Spend", color: "bg-rust", format: "currency" },
      { source: "gsc", metric: "impressions", label: "SEO impressions", color: "bg-navy" },
    ] as { source: string; metric: string; label: string; color: string; format?: string }[])
      .filter((m) => mVal(pickSource(sources, m.source), m.metric) != null);
    return (
      <>
        <div className="flex gap-1.5 mb-4">
          {(["day", "week", "month"] as const).map((g) => (
            <TabButton key={g} label={g === "day" ? "Día" : g === "week" ? "Semana" : "Mes"} active={grain === g} onClick={() => setGrain(g)} />
          ))}
        </div>
        {trendMetrics.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trendMetrics.map((m) => {
              const cur = mVal(pickSource(sources, m.source), m.metric) || 0;
              const prev = mVal(pickSource(prevSources, m.source), m.metric);
              const d = mDelta(cur, prev);
              const series = bucketDaily(rangeEntries, m.source, m.metric, grain);
              return (
                <div key={m.label} className="border-2 border-border rounded-xl p-4 bg-card">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-[24px] font-heading font-bold text-navy">{fmtByFormat(cur, m.format)}</span>
                    {d.value && <span className={cn("text-[12px] font-semibold", d.direction === "up" ? "text-sage" : d.direction === "down" ? "text-destructive" : "text-muted-foreground")}>{d.value}</span>}
                  </div>
                  <div className="mt-2"><Sparkline values={series} color={m.color} /></div>
                  <div className="text-[10px] text-muted-foreground mt-1">{series.length} {grain === "day" ? "días" : grain === "week" ? "semanas" : "meses"} · vs periodo anterior</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border-2 border-border rounded-xl bg-card p-8 text-center text-muted-foreground">Sin datos de tendencia aún.</div>
        )}
      </>
    );
  }

  function renderConexiones() {
    const connectedCount = SURFACES.filter((s) => surfaceInfoFor(s).connected).length;
    return (
      <>
        <div className="border-[3px] border-navy rounded-xl bg-card p-5 shadow-comic mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="font-heading font-bold text-lg">{"🔌"} Conexiones</div>
            <div className="text-sm text-muted-foreground">{connectedCount}/{SURFACES.length} superficies conectadas</div>
          </div>
          <ProgressBar value={connectedCount} max={SURFACES.length} color="bg-sage" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SURFACES.map((s) => {
            const info = surfaceInfoFor(s);
            return (
              <div key={s.key} className="border-2 border-border rounded-xl p-4 bg-card">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2"><span className="text-xl">{s.emoji}</span><span className="font-heading font-bold text-[15px]">{s.name}</span></div>
                  {info.connected
                    ? <span className="text-[11px] text-sage font-semibold">{"✓"} conectado</span>
                    : <a href={`/dashboard/${slug}/settings?tab=apis`} className="text-[11px] text-rust font-semibold">Conectar {"→"}</a>}
                </div>
                <div className="text-[12px] text-muted-foreground mb-2">{s.what}</div>
                <div className="flex flex-wrap gap-1">
                  {s.requires.mandatory.map((r) => <span key={r} className="text-[9px] rounded px-1.5 py-0.5" style={{ background: "#FBE9E7", border: "1px solid #FFCDD2", color: "#B71C1C" }}>{r}</span>)}
                  {s.requires.oneOf.map((r) => <span key={r} className="text-[9px] rounded px-1.5 py-0.5" style={{ background: "#E0F4F9", border: "1px solid #B3E0EC", color: "#1A6E84" }}>{r}</span>)}
                  {s.requires.optional.map((r) => <span key={r} className="text-[9px] bg-muted border border-border text-muted-foreground rounded px-1.5 py-0.5">{r}</span>)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">{s.how}</div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function renderVersions() {
    const versions = dashboardRec?.versions ?? [];
    const current = dashboardRec?.version ?? 0;
    return (
      <div>
        <button type="button" onClick={() => setVersionsOpen(false)} className="mb-4 px-3 py-1.5 border border-border rounded-md text-[12px] font-semibold bg-background hover:border-rust transition-colors">
          {"←"} Volver
        </button>
        <div className="border-[3px] border-navy rounded-xl bg-card p-5 shadow-comic mb-6">
          <div className="font-heading font-bold text-lg">{"🕓"} Versiones del dashboard</div>
          <div className="text-[13px] text-muted-foreground mt-1">Cada cambio (chat, arrastre, plantilla) crea una versión inmutable. Revertir copia ese estado a una versión nueva — append-only y auditado.</div>
        </div>
        {!dashboardRec?.configured ? (
          <div className="border-2 border-border rounded-xl bg-card p-8 text-center text-muted-foreground">El versionado requiere base de datos (no disponible en este entorno).</div>
        ) : versions.length === 0 ? (
          <div className="border-2 border-border rounded-xl bg-card p-8 text-center text-muted-foreground">Aún no hay versiones guardadas.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {versions.map((v) => {
              const isCurrent = v.version === current;
              return (
                <div key={v.version} className={cn("border-2 rounded-xl p-4 bg-card", isCurrent ? "border-navy" : "border-border")} style={isCurrent ? { borderLeftWidth: 5, borderLeftColor: "#E6A817" } : undefined}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold">v{v.version}{isCurrent ? " · actual" : ""}</span>
                      <TriggerBadge trigger={v.trigger} />
                    </div>
                    {!isCurrent && (
                      <button type="button" onClick={() => revertTo(v.version)} disabled={saving} className="text-[11px] text-rust font-semibold disabled:opacity-50 hover:underline">
                        {"↩︎"} Revertir a v{v.version}
                      </button>
                    )}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{v.date}{v.changes ? ` · ${v.changes}` : ""}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderActiveTab() {
    switch (tab) {
      case "overview": return renderOverview();
      case "surfaces": return renderSurfaces();
      case "channels": return renderChannels();
      case "conversion": return renderConversion();
      case "trends": return renderTrends();
      case "conexiones": return renderConexiones();
      case "partnerships": return <MetricsPartnershipsTab slug={slug} />;
      // Tabs are data-driven: a definition could declare a key this build doesn't
      // render yet. Show an honest placeholder instead of silently falling to Overview.
      default:
        return (
          <div className="border-2 border-border rounded-xl bg-card p-8 text-center text-muted-foreground">
            La pestaña «{tabs.find((tb) => tb.key === tab)?.label || tab}» aún no está disponible en esta vista.
          </div>
        );
    }
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{t("title")} — {slug} — Mission Control</title>
      </Head>

      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl text-navy mb-1"><TitleIcon name="metrics" />{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {slug} {isDataTab && <span className="text-[11px] ml-2">{rangeLabel}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!versionsOpen && (
            <>
              <button type="button" onClick={() => setVersionsOpen(true)} className="px-3 py-1 border border-navy rounded-md text-[11px] font-semibold text-navy bg-background hover:bg-muted transition-colors">
                {"🕓"} Versiones{(dashboardRec?.versions?.length ?? 0) > 0 ? ` ${dashboardRec?.versions.length}` : ""}
              </button>
              <button type="button" onClick={() => openMerlin("Quiero editar el dashboard de métricas (North Star, KPIs, superficies o una métrica custom). ¿Qué cambiamos?")} className="px-3 py-1 rounded-md text-[11px] font-semibold text-white transition-colors" style={{ background: "#3B9EBF" }}>
                {"✨"} Editar con Merlin
              </button>
            </>
          )}
          {isDataTab && !versionsOpen && (
            <>
              <DateRangeFilter options={DATE_RANGE_OPTIONS} value={range} onChange={(v) => setRange(v as DateRange)} />

          <div className="flex gap-1.5">
            <a href={`/dashboard/${slug}/settings?tab=apis`} className="px-3 py-1 border border-border rounded-md text-[11px] font-semibold text-muted-foreground bg-background hover:border-rust transition-colors">
              {"\uD83D\uDD0C"} {t("apis")}
            </a>
            {effectivePlan && (
              <button type="button" onClick={() => setPlanOpen(true)} className="px-3 py-1 border border-border rounded-md text-[11px] font-semibold text-muted-foreground bg-background hover:border-rust transition-colors">
                {"\uD83D\uDCCB"} {t("plan")}
              </button>
            )}
            {metricsData?.metricsSheet?.url && (
              <a href={metricsData.metricsSheet.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1 border border-border rounded-md text-[11px] font-semibold text-muted-foreground bg-background hover:border-rust transition-colors">
                {"\uD83D\uDCCA"} {t("sheets")}
              </a>
            )}
          </div>
            </>
          )}
        </div>
      </div>

      {versionsOpen ? renderVersions() : (
      <>
      {/* Tabs renderizadas desde la definici\u00F3n versionada (M\u00E9tricas v2) */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => selectTab(item.key)}
            className={cn(
              "px-3.5 py-1.5 border rounded-md text-[13px] font-semibold transition-colors",
              tab === item.key ? "border-rust bg-rust text-white" : "border-border bg-background hover:bg-muted"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {renderActiveTab()}
      </>
      )}

      <SlideOver open={planOpen} onClose={() => setPlanOpen(false)} title={`${t("plan")} — ${slug}`}>
        {effectivePlan ? <JsonViewer data={effectivePlan} /> : null}
      </SlideOver>
    </DashboardLayout>
  );
}
