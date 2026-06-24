import { useState, useMemo, useCallback, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { SlideOver } from "@/components/shared/slide-over";
import { DocSlideOver, JsonViewer } from "@/components/shared/doc-slideover";
import {
  BackButton,
  Button as MetricButton,
  Chip as MetricChip,
  DataChip,
  DataTable,
  MetricTile,
  Panel as MetricPanel,
  ProgressBar as MetricProgressBar,
  ProvenanceFooter,
  Sparkline as MetricSparkline,
  TabBar as MetricTabBar,
} from "@/components/dashboard/metrics-v2";
import { CadencePanel } from "@/components/dashboard/metrics-cadence-panel";
import { useMetricsPlan, useDashboardDefinition, useSurfaceSummary, type SurfaceSummaryEntry, type DashboardRecord } from "@/hooks/useMetrics";
import { useProjects } from "@/hooks/useProjects";
import { useOpenChat } from "@/hooks/useChat";
import { buildMetricsEditThread, buildTaskThread } from "@/lib/chat-openers";
import { getTaskSet } from "@/lib/data/task-blueprints";
import { SURFACES, SURFACE_MANDATORY_SOURCES, SURFACE_API_PROVIDERS, type SurfaceKey, type SurfaceDef } from "@/lib/metrics/surfaces";
import { isSafeFormula } from "@/lib/metrics/formula";
import type { DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import { normalizeTaskStatusQuiet, statusLabel, statusOption } from "@/lib/task-status";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

type DateRange = "1d" | "7d" | "30d" | "all" | "custom";

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

interface DynModule {
  id: string;
  icon: string;
  title: string;
  priority: number;
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

interface ChannelRow {
  key: string;
  channel: string;
  icon: string;
  leads: number;
  sessions: number;
  spend: number;
  cpl: number | null;
  delta?: { value: string; direction: "up" | "down" | "flat" };
}

type MetricsSubView =
  | { kind: "surface"; key: SurfaceKey }
  | { kind: "customSurface"; key: string }
  | { kind: "channel"; key: string }
  | null;

interface SetupTaskView {
  id: string;
  name: string;
  status?: string;
  description?: string;
  deliverable?: string;
  done_criteria?: string;
  owner?: string;
  agent?: string;
  skill?: string;
  skills?: string[];
  channel?: string;
  type?: string;
  pillar?: string;
  depends_on?: unknown;
  deliverable_file?: string | string[];
  isBlueprint?: boolean;
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

const RANGE_DAYS: Record<DateRange, number> = { "1d": 1, "7d": 7, "30d": 30, all: 0, custom: 0 };

const SOURCE_NAMES: Record<string, string> = {
  ga4: "GA4", "google-analytics": "GA4", gsc: "Search Console", "google-search-console": "Search Console", metricool: "Social",
  "meta-ads": "Meta Ads", meta_ads: "Meta Ads", google_ads: "Google Ads", "google-ads": "Google Ads",
  linkedin_ads: "LinkedIn Ads", "linkedin-ads": "LinkedIn Ads", tiktok_ads: "TikTok Ads", "tiktok-ads": "TikTok Ads",
  ghl: "CRM", "go-high-level": "CRM",
  instantly: "Outreach", sheets: "Manual", posthog: "Product",
};

const METRICS_PROJECT_ID = "P00-Metrics";
const METRICS_PREREQ_TASK_ID = "P00-FUL-T09";
const METRICS_SETUP_BLUEPRINT = getTaskSet("foundation-metrics");

/** Operational integration task skills (T08–T10) — distinguishes them from
 *  auto-generated surface-connection tasks to avoid duplication in the Setup view. */
const OPERATIONAL_INTEGRATION_SKILLS = new Set(["meeting-intelligence", "sales-call-prep", "daily-pulse"]);

function isTaskCompleted(status?: string): boolean {
  return normalizeTaskStatusQuiet(status) === "completed";
}

function dependencyIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function firstDeliverableFile(value?: string | string[]): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

/** 3-state Conexiones badge: "off" (no source), "partial" (mandatory sources
 *  missing), "on" (single-source/oneOf surfaces, or all mandatory met). */
function surfaceConnState(surface: SurfaceDef, info: { connected: boolean; connectedSources: string[] }): "on" | "partial" | "off" {
  if (!info.connected) return "off";
  const req = SURFACE_MANDATORY_SOURCES[surface.key];
  if (!req) return "on";
  const has = new Set(info.connectedSources);
  const allOk = !req.allOf || req.allOf.every((s) => has.has(s));
  const anyOk = !req.anyOf || req.anyOf.some((s) => has.has(s));
  return allOk && anyOk ? "on" : "partial";
}

/** Short "what feeds this surface" line — connected source names, or a hint. */
function connWhat(s: SurfaceDef, sources: string[]): string {
  if (sources.length) return sources.map((src) => SOURCE_NAMES[src] || src).join(" · ");
  const oneOf = s.requires.oneOf.length ? s.requires.oneOf.slice(0, 2).join(" / ") : "";
  return oneOf || s.what;
}

function TaskStatusBadge({ status }: { status?: string }) {
  const opt = statusOption(status);
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ background: opt.bg, borderColor: opt.border, color: opt.color }}
    >
      {statusLabel(status)}
    </span>
  );
}

function blueprintMetricTasks(slug: string): SetupTaskView[] {
  const set = METRICS_SETUP_BLUEPRINT;
  if (!set?.idPrefix) return [];
  return set.tasks
    .filter((task) => task.taskKey)
    .map((task) => ({
      id: `${set.idPrefix}-${task.taskKey}`,
      name: task.name,
      status: "todo",
      description: task.description,
      deliverable: task.deliverable,
      done_criteria: typeof task.extra?.done_criteria === "string" ? task.extra.done_criteria : undefined,
      owner: task.owner ?? "Sancho",
      agent: task.agent,
      skill: task.skill,
      channel: task.channel,
      type: task.type,
      pillar: task.pillar,
      depends_on: [...(task.dependsOn ?? []), ...(task.dependsOnExternal ?? [])],
      deliverable_file: task.deliverableFiles?.[0] ? `brand/${slug}/${task.deliverableFiles[0]}` : undefined,
      isBlueprint: true,
    }));
}

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

function parseLocalIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
// Setup document card (Foundation 4-button style) — pillar Setup view
// ============================================================

/**
 * Mirrors the Marca-madre card in `content/SetupTab.tsx`: numbered box, ✓ when
 * done, code path, description, and 4 controls (💬 chat · 📋 task · informational
 * · primary). Props are plain so the same card serves both the blueprint
 * Foundation task and the synthetic dashboard-definition card; the primary action
 * is a callback (`onOpen`) because both open-targets are state-driven.
 */
function SetupDocCard({ index, title, done, path, desc, onChat, taskHref, onOpen, openLabel, fourthIcon, fourthTitle, onFourth }: {
  index: number; title: string; done: boolean; path?: string; desc: string;
  onChat: () => void; taskHref?: string; onOpen: () => void; openLabel: string;
  fourthIcon: string; fourthTitle: string; onFourth?: () => void;
}) {
  const iconBtn = "grid h-8 w-8 place-items-center rounded-sc-md border-2 border-ink bg-card shadow-pop-xs transition-all hover:-translate-y-px";
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-dashed border-ink/15 py-2.5 last:border-0">
      <span className={cn("grid h-9 w-9 flex-shrink-0 place-items-center rounded-sc-md border-2 border-ink font-heading text-sm font-bold", done ? "bg-[var(--yellow)]/80" : "bg-aged")}>{index}</span>
      <div className="min-w-[230px] flex-1">
        <p className="flex items-center gap-1.5 font-heading text-[13.5px] font-bold text-navy">
          {title}
          {done && <span className="grid h-4 w-4 place-items-center rounded-full border border-ink bg-sage text-[9px] text-white">✓</span>}
        </p>
        {path && <code className="my-1 inline-block rounded border border-dashed border-ink bg-aged/50 px-1.5 text-[11px]">{path}</code>}
        <p className="text-[11.5px] text-[var(--sc-fg-muted)]">{desc}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onChat} title="Chat con Merlin" className={iconBtn}>💬</button>
        {taskHref && <a href={taskHref} title="Ver tarea" className={cn(iconBtn, "no-underline")}>📋</a>}
        {onFourth ? (
          <button type="button" onClick={onFourth} title={fourthTitle} className={iconBtn}>{fourthIcon}</button>
        ) : (
          <span title={fourthTitle} className={cn(iconBtn, "cursor-help")}>{fourthIcon}</span>
        )}
        {done
          ? <button type="button" onClick={onOpen} className="rounded-sc-md border-2 border-ink bg-rust px-3 py-1.5 font-heading text-[11.5px] font-bold uppercase text-white shadow-pop-xs transition-all hover:-translate-y-px">{openLabel}</button>
          : <button type="button" onClick={onChat} className="rounded-sc-md border-2 border-ink bg-sage px-3 py-1.5 font-heading text-[11.5px] font-bold text-white shadow-pop-xs transition-all hover:-translate-y-px">{openLabel}</button>}
      </div>
    </div>
  );
}

// ============================================================
// Setup API link pill — surface connection status + deep-link to APIs settings
// ============================================================

/** Status pill that doubles as the deep-link to the surface-filtered APIs page
 *  (the `?surface=` param is consumed by PR C; until then it lands on the
 *  unfiltered APIs tab). Requires `slug` as an explicit prop so it can live at
 *  module scope (no closure over MetricsPageInner). */
function SetupApiLink({ slug, surfaceKey, state }: { slug: string; surfaceKey: SurfaceKey; state: "on" | "partial" | "off" }) {
  const href = `/dashboard/${slug}/settings?tab=apis&surface=${surfaceKey}`;
  const cls = state === "on" ? "bg-sage text-white" : state === "partial" ? "bg-[var(--sc-sun-300)] text-ink" : "bg-navy text-white";
  const label = state === "on" ? "✓ Conectado" : state === "partial" ? "◐ Parcial" : "🔌 Conectar API";
  return (
    <a href={href} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sc-pill border-[1.5px] border-ink px-2.5 py-1 font-heading text-[11px] font-bold no-underline shadow-pop-xs transition-all hover:-translate-y-px", cls)}>
      {label}{state === "off" ? " →" : <span className="opacity-70">· API ↗</span>}
    </a>
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

/** Dual-axis Paid trend (SAN-319 · 3a): inversión = barras (rust), ROAS de plataforma = línea (navy). Inline SVG, sin librería. */
function PaidTrend({ series }: { series: { date: string; spend: number; roas: number }[] }) {
  if (series.length < 2) return null;
  const W = 720;
  const H = 150;
  const pad = 14;
  const n = series.length;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const bottom = H - pad;
  const smax = Math.max(...series.map((d) => d.spend), 1) * 1.1;
  const roases = series.map((d) => d.roas).filter((r) => r > 0);
  const rmin = roases.length ? Math.min(...roases) * 0.9 : 0;
  const rmax = roases.length ? Math.max(...roases) * 1.1 : 1;
  const cx = (i: number) => pad + innerW * ((i + 0.5) / n);
  const yRoas = (v: number) => bottom - (rmax > rmin ? (v - rmin) / (rmax - rmin) : 0.5) * innerH;
  const bw = (innerW / n) * 0.55;
  const pts = series.map((d, i) => ({ x: cx(i), y: yRoas(d.roas), ok: d.roas > 0 })).filter((p) => p.ok);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-3 text-[10.5px] font-bold text-[var(--sc-fg-muted)]">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2 rounded-sm border border-ink bg-rust" />Inversión</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-[3px] w-4 rounded-full bg-navy" />ROAS (plataforma)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        {series.map((d, i) => {
          const h = (d.spend / smax) * innerH;
          return <rect key={i} x={cx(i) - bw / 2} y={bottom - h} width={bw} height={h} fill="var(--rust)" stroke="var(--ink)" strokeWidth={1} />;
        })}
        {line && <path d={line} fill="none" stroke="var(--navy)" strokeWidth={2.2} strokeLinejoin="round" />}
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="#FDF8EF" stroke="var(--navy)" strokeWidth={1.6} />)}
      </svg>
    </div>
  );
}

function AdsModule({ ads, slug, period, series }: { ads: SourceData; slug: string; period: string; series: { date: string; spend: number; roas: number }[] }) {
  const [tab, setTab] = useState<"campaign" | "adset" | "ad" | "placement" | "audience" | "keyword">("campaign");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  const spend = mVal(ads, "spend") || 0;
  const clicks = mVal(ads, "clicks") || 0;
  const ctr = mVal(ads, "ctr") || 0;
  const cpc = mVal(ads, "cpc") || 0;
  const leads = mVal(ads, "leads") || 0;
  // Platform-reported outcomes (PR-D) — flagged `dedup`, not CRM truth.
  const frequency = mVal(ads, "frequency") || 0;
  const conversions = mVal(ads, "conversions") || 0;
  const revenue = mVal(ads, "revenue") || 0;
  const roas = mVal(ads, "roas") || 0;

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

  // Parse single-dimension breakdowns (placement / audience / keyword) from PR-D.
  const byDim = (dim: string): Record<string, Record<string, number>> => {
    const out: Record<string, Record<string, number>> = {};
    ads.metrics
      .filter((x) => x.dimensions && (x.dimensions as Record<string, string>)[dim])
      .forEach((x) => {
        const k = (x.dimensions as Record<string, string>)[dim];
        if (!out[k]) out[k] = {};
        out[k][x.name] = x.value;
      });
    return out;
  };
  const placements = byDim("placement");
  const audiences = byDim("audience");
  const keywords = byDim("keyword");

  // Calculate CPL
  for (const m of Object.values(campaigns)) { m.cpl = (m.leads as number) > 0 ? (m.spend as number) / (m.leads as number) : 0; }
  for (const m of Object.values(adsets)) { m.cpl = (m.leads as number) > 0 ? (m.spend as number) / (m.leads as number) : 0; }
  for (const m of Object.values(adCreatives)) { m.cpl = (m.leads as number) > 0 ? (m.spend as number) / (m.leads as number) : 0; }

  type AdsRow = { name: string; spend: number; clicks: number; ctr: number; cpc: number; conversions: number; cpa: number | null; roas: number; extra?: string };

  function buildRows(data: Record<string, Record<string, number | string | null>>, includeExtra = false): AdsRow[] {
    return Object.entries(data)
      .map(([name, m]) => {
        const spend = (m.spend as number) || 0;
        const conversions = (m.conversions as number) || (m.leads as number) || 0;
        return {
          name,
          spend,
          clicks: (m.clicks as number) || 0,
          ctr: (m.ctr as number) || 0,
          cpc: (m.cpc as number) || 0,
          conversions,
          cpa: conversions > 0 ? spend / conversions : null,
          roas: (m.roas as number) || 0,
          extra: includeExtra ? (m.adset as string) || "" : undefined,
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }

  const campaignRows = buildRows(campaigns as Record<string, Record<string, number | string | null>>);
  const adsetRows = buildRows(adsets);
  const adRows = buildRows(adCreatives, true);
  const placementRows = buildRows(placements as Record<string, Record<string, number | string | null>>);
  const audienceRows = buildRows(audiences as Record<string, Record<string, number | string | null>>);
  const keywordRows = buildRows(keywords as Record<string, Record<string, number | string | null>>);

  function sortRows(rows: AdsRow[]): AdsRow[] {
    if (sortCol == null) return rows;
    const keys: (keyof AdsRow)[] = ["name", "spend", "clicks", "ctr", "cpc", "conversions", "cpa", "roas"];
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

  // CPA/ROAS heat-coloring (rojo→verde, idea Northbeam) — platform economics read like a heatmap.
  const heatCpa = (v: number | null) => (v == null ? "" : v <= 40 ? "bg-[var(--sc-sage-100)] text-sage" : v <= 70 ? "bg-[var(--yellow)] text-ink" : "bg-[var(--sc-brick-bg)] text-destructive");
  const heatRoas = (v: number) => (!v ? "" : v >= 4 ? "bg-[var(--sc-sage-100)] text-sage" : v >= 2.5 ? "bg-[var(--yellow)] text-ink" : "bg-[var(--sc-brick-bg)] text-destructive");

  const headers = ["Name", "Spend", "Clicks", "CTR", "CPC", "Conv", "CPA", "ROAS"];

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
              <td className="p-1.5 text-right">{r.clicks}</td>
              <td className={cn("p-1.5 text-right", r.ctr > 3 ? "text-sage" : r.ctr < 1.5 ? "text-muted-foreground" : "")}>{r.ctr.toFixed(1)}%</td>
              <td className="p-1.5 text-right">{"\u20AC"}{r.cpc.toFixed(2)}</td>
              <td className="p-1.5 text-right">{r.conversions}</td>
              <td className="p-1.5 text-right"><span className={cn("inline-block rounded px-1.5 py-0.5 font-semibold", heatCpa(r.cpa))}>{r.cpa != null ? `\u20AC${r.cpa.toFixed(0)}` : "\u2014"}</span></td>
              <td className="p-1.5 text-right"><span className={cn("inline-block rounded px-1.5 py-0.5 font-semibold", heatRoas(r.roas))}>{r.roas ? `${r.roas.toFixed(1)}x` : "\u2014"}</span></td>
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
        ...(frequency ? [{ label: "Frecuencia", value: frequency.toFixed(1) }] : []),
        ...(conversions ? [{ label: "Conv. (plat.)", value: fmt(conversions), color: "text-navy" }] : []),
        ...(roas ? [{ label: "ROAS (plat.)", value: `${roas.toFixed(1)}x`, color: "text-navy" }] : []),
        ...(revenue ? [{ label: "Revenue (plat.)", value: `€${fmt(Math.round(revenue))}`, color: "text-navy" }] : []),
        ...(leads ? [{ label: "Leads", value: fmt(leads), color: "text-sage" }] : []),
      ]} />
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-[var(--sc-fg-muted)]">
        <DataChip type="real" source="Meta/Google Ads API" confidence="alta" />
        <span>medio: spend · impresiones · clics · CTR · CPC · frecuencia</span>
        <DataChip type="dedup" source="atribución de la plataforma" confidence="media" />
        <span>Conv. · ROAS · Revenue · Leads · CPL = reportado por la plataforma (inflable)</span>
        <a href="#atribucion" className="text-[var(--cyan)] underline">→ CPA/ROAS real por cita en Atribución</a>
      </div>
      <PaidTrend series={series} />
      <div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <TabButton label="Campañas" active={tab === "campaign"} onClick={() => { setTab("campaign"); setSortCol(null); }} />
          <TabButton label="Ad Sets" active={tab === "adset"} onClick={() => { setTab("adset"); setSortCol(null); }} />
          <TabButton label="Creatividades" active={tab === "ad"} onClick={() => { setTab("ad"); setSortCol(null); }} />
          {placementRows.length > 0 && <TabButton label="Placement" active={tab === "placement"} onClick={() => { setTab("placement"); setSortCol(null); }} />}
          {audienceRows.length > 0 && <TabButton label="Audiencia" active={tab === "audience"} onClick={() => { setTab("audience"); setSortCol(null); }} />}
          {keywordRows.length > 0 && <TabButton label="Keywords" active={tab === "keyword"} onClick={() => { setTab("keyword"); setSortCol(null); }} />}
        </div>
        {tab === "campaign" && (campaignRows.length > 0 ? renderTable(campaignRows) : <p className="text-muted-foreground">Sin datos</p>)}
        {tab === "adset" && (adsetRows.length > 0 ? renderTable(adsetRows) : <p className="text-muted-foreground">Sin datos</p>)}
        {tab === "ad" && (adRows.length > 0 ? renderTable(adRows) : <p className="text-muted-foreground">Sin datos</p>)}
        {tab === "placement" && (placementRows.length > 0 ? renderTable(placementRows) : <p className="text-muted-foreground">Sin datos</p>)}
        {tab === "audience" && (audienceRows.length > 0 ? renderTable(audienceRows) : <p className="text-muted-foreground">Sin datos</p>)}
        {tab === "keyword" && (keywordRows.length > 0 ? renderTable(keywordRows) : <p className="text-muted-foreground">Sin datos</p>)}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--sc-fg-muted)]">
          <DataChip type="dedup" source="atribución de la plataforma" confidence="media" />
          <span>Conv · CPA · ROAS = plataforma · CPA/ROAS pintados rojo→verde (mapa de calor)</span>
        </div>
      </div>
      <ProvenanceFooter source="meta_ads · google_ads" route="Meta / Google Ads API" client={slug} period={period} />
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

/** Reorder surface refs by a key order: dedupe + drop unknowns, append any not in
 *  `keys` at the tail, renumber `order`. Used for the optimistic DnD cache update
 *  (mirrors the server's reorderDashboardSurfaces). */
function reorderSurfaceRefs<T extends { surface: string; order: number }>(refs: T[], keys: string[]): T[] {
  const byKey = new Map(refs.map((r) => [r.surface, r]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const k of keys) {
    const r = byKey.get(k);
    if (r && !seen.has(k)) { seen.add(k); out.push({ ...r, order: out.length }); }
  }
  for (const r of refs) if (!seen.has(r.surface)) out.push({ ...r, order: out.length });
  return out;
}

/** Version trigger pill (chat / user-drag / template / seed / revert). */
function TriggerBadge({ trigger }: { trigger: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    chat: { bg: "#3B9EBF", fg: "#ffffff" },
    "user-drag": { bg: "#D8C9A3", fg: "#3a3320" },
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
];

// Setup is a header ⚙️ toggle (not a tab); Partnerships is surface #8, opened as a
// surface detail — so neither renders in the tab bar.
const HIDDEN_TAB_KEYS = new Set(["conexiones", "partnerships"]);

const TAB_LABELS: Record<string, string> = {
  overview: "Overview", surfaces: "Surfaces", channels: "Channels",
  conversion: "Conversion", trends: "Trends", conexiones: "Setup", partnerships: "Partnerships",
};

const TAB_ICONS: Record<string, string> = {
  overview: "⭐",
  surfaces: "🗂️",
  channels: "📡",
  conversion: "🎯",
  trends: "📉",
  conexiones: "🔌",
  partnerships: "🤝",
};

// Headline metric per surface from the DB-backed daily payload.
const SURFACE_HEADLINE: Partial<Record<SurfaceKey, { source: string; metric: string; label: string; format?: string }>> = {
  reputation: { source: "trust_score", metric: "trust_score", label: "Trust Score" },
  web: { source: "ga4", metric: "sessions", label: "sessions" },
  product: { source: "posthog", metric: "activation_events", label: "activaciones" },
  paid: { source: "meta-ads", metric: "spend", label: "spend", format: "currency" },
  pipeline: { source: "ghl", metric: "newContacts", label: "new leads" },
  email: { source: "instantly", metric: "replies", label: "replies" },
  social: { source: "metricool", metric: "impressions", label: "impresiones" },
};

function MetricsPage() {
  // Key the page by slug so it REMOUNTS on client change instead of being reused
  // across clients — that resets all per-client state (DnD order, in-flight saves,
  // tab) for free, so no slug-guards are needed inside (SAN-294).
  const slug = useSlugSync();
  return <MetricsPageInner key={slug || "__none__"} slug={slug} />;
}

export default MetricsPage;

function MetricsPageInner({ slug }: { slug: string }) {
  const t = useTranslations("metrics");
  const router = useRouter();
  const [tab, setTab] = useState<string>("overview");
  const [range, setRange] = useState<DateRange>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const [subView, setSubView] = useState<MetricsSubView>(null);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectStatus, setCollectStatus] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupDocPath, setSetupDocPath] = useState<string | null>(null);

  // Tab inicial por URL (?tab=surfaces|partnerships…) — enlazable desde chat/MCP.
  // Legacy ?tab=funnel → channels; ?tab=conexiones → setupOpen; ?tab=partnerships → surface detail.
  useEffect(() => {
    if (!router.isReady) return;
    const queryTab = Array.isArray(router.query.tab) ? router.query.tab[0] : router.query.tab;
    if (queryTab === "funnel") setTab("channels");
    else if (queryTab === "conexiones") setSetupOpen(true);
    else if (queryTab === "partnerships") { setTab("surfaces"); setSubView({ kind: "surface", key: "partnerships" }); }
    else if (queryTab) setTab(queryTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const selectTab = useCallback(
    (next: string) => {
      setTab(next);
      setSubView(null);
      setSetupOpen(false);
      const query = { ...router.query, tab: next } as Record<string, string | string[]>;
      if (next === "overview") delete query.tab;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router],
  );

  const { data: plan, isLoading: planLoading } = useMetricsPlan(slug);
  const { data: dashboardRec, isLoading: dashboardLoading } = useDashboardDefinition(slug);
  const { data: surfaceSummary } = useSurfaceSummary(slug);
  const { data: projectsData } = useProjects(slug || null);
  const definition: DashboardDefinition | null = dashboardRec?.definition ?? null;
  const metricsProjectRecord = useMemo(
    () => projectsData?.find((entry) => entry.project.id === METRICS_PROJECT_ID) || null,
    [projectsData],
  );
  const metricsSetupTasks = useMemo<SetupTaskView[]>(() => {
    if (metricsProjectRecord?.tasks?.length) {
      return metricsProjectRecord.tasks.map((task) => ({ ...task, isBlueprint: false }));
    }
    return blueprintMetricTasks(slug);
  }, [metricsProjectRecord, slug]);
  const metricsPrereqTask = useMemo(() => {
    for (const entry of projectsData || []) {
      const task = entry.tasks.find((candidate) => candidate.id === METRICS_PREREQ_TASK_ID);
      if (task) return task as SetupTaskView;
    }
    return null;
  }, [projectsData]);

  const queryClient = useQueryClient();
  const openChat = useOpenChat();
  const [versionsOpen, setVersionsOpen] = useState(false);

  // Surface reorder + revert as React Query mutations (optimistic update + rollback
  // + invalidate) — the house pattern. The page remounts on slug change (key=slug),
  // so there is no cross-client state to guard, no debounce, and no keepalive flush.
  const reorderMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      const res = await fetch(`/api/metrics/dashboard?slug=${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surfacesOrder: keys, trigger: "user-drag", changeNote: "Reordenadas superficies" }),
      });
      if (!res.ok) throw new Error("Failed to save surface order");
    },
    onMutate: async (keys: string[]) => {
      await queryClient.cancelQueries({ queryKey: ["metrics-dashboard", slug] });
      const prev = queryClient.getQueryData<DashboardRecord>(["metrics-dashboard", slug]);
      if (prev?.definition?.surfaces) {
        queryClient.setQueryData<DashboardRecord>(["metrics-dashboard", slug], {
          ...prev,
          definition: { ...prev.definition, surfaces: reorderSurfaceRefs(prev.definition.surfaces, keys) },
        });
      }
      return { prev };
    },
    onError: (_err, _keys, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["metrics-dashboard", slug], ctx.prev);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ["metrics-dashboard", slug] }); },
  });

  const revertMutation = useMutation({
    mutationFn: async (version: number) => {
      const res = await fetch(`/api/metrics/dashboard/revert?slug=${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toVersion: version }),
      });
      if (!res.ok) throw new Error("Failed to revert dashboard");
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ["metrics-dashboard", slug] }); },
  });

  const saving = reorderMutation.isPending || revertMutation.isPending;
  const revertTo = (version: number) => revertMutation.mutate(version);

  // Open the Merlin metrics-setup chat thread (manifest-driven; Merlin is the pillar
  // owner) with a contextual opener. The actual edits run through the MCP write tools
  // — this never handles credentials.
  function openMerlin(message: string) {
    if (!slug) return;
    openChat(slug, buildMetricsEditThread(slug, message));
  }

  function openSetupTaskChat(task: SetupTaskView) {
    if (!slug || !metricsProjectRecord || task.isBlueprint) return;
    openChat(slug, buildTaskThread(slug, task.id, task.name, METRICS_PROJECT_ID, {
      taskSkill: task.skill,
      taskChannel: task.channel,
      taskStatus: task.status,
      taskType: task.type,
      pillar: task.pillar,
      deliverableFile: firstDeliverableFile(task.deliverable_file),
      agent: task.agent,
      skills: task.skills?.length ? task.skills : task.skill ? [task.skill] : undefined,
      dependsOn: dependencyIds(task.depends_on),
    }));
  }

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
    if (range === "custom") {
      if (!customFrom && !customTo) return allDaily;
      return allDaily.filter((entry) => {
        if (customFrom && entry.date < customFrom) return false;
        if (customTo && entry.date > customTo) return false;
        return true;
      });
    }
    if (days === 0) return allDaily;
    if (days === 1) return allDaily.slice(-1);
    return allDaily.slice(-days);
  }, [allDaily, customFrom, customTo, days, range]);

  const prevEntries = useMemo(() => {
    if (range === "custom") {
      const count = rangeEntries.length;
      const firstDate = rangeEntries[0]?.date;
      if (!count || !firstDate) return [];
      return allDaily.filter((entry) => entry.date < firstDate).slice(-count);
    }
    if (days === 0) return [];
    if (days === 1) return allDaily.length > 1 ? allDaily.slice(-2, -1) : [];
    return allDaily.slice(-days * 2, -days);
  }, [allDaily, days, range, rangeEntries]);

  const sources = useMemo(() => normSources(rangeEntries), [rangeEntries]);
  const prevSources = useMemo(() => normSources(prevEntries), [prevEntries]);

  // Date range label
  const dateFrom = rangeEntries[0]?.date || "?";
  const dateTo = rangeEntries[rangeEntries.length - 1]?.date || "?";
  const rangeLabel = days === 1 && range !== "custom" ? `· ${dateTo}` : rangeEntries.length > 0 ? `· ${dateFrom} \u2192 ${dateTo} (${rangeEntries.length} d\u00edas)` : "";

  // Source declarations
  const ga4 = sources.ga4;
  const gsc = sources.gsc;
  const ads = sources["meta-ads"] || sources.meta_ads;
  const mc = sources.metricool;
  const ghl = sources.ghl;
  const posthog = sources.posthog;
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
  const _sourcePills: SourcePill[] = useMemo(() => {
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
      case "ads": return ads ? <AdsModule ads={ads} slug={slug} period={`${dateFrom} → ${dateTo}`} series={rangeEntries.map((e) => { const m = e.sources["meta-ads"] || e.sources.meta_ads; return { date: e.date, spend: mVal(m, "spend") || 0, roas: mVal(m, "roas") || 0 }; })} /> : null;
      case "social": return mc ? <SocialModule mc={mc} /> : null;
      case "crm": return ghl ? <CrmModule ghl={ghl} locationId={ghlLocationId} /> : null;
      default: return null;
    }
  }

  // ── Métricas v2: tabs + computed views from the definition (PR-5a) ──────────
  const tabs: MetricsTabItem[] = useMemo(() => {
    const defTabs = definition?.tabs;
    const base: MetricsTabItem[] = defTabs?.length
      ? [...defTabs]
          .filter((tb) => tb.visible && !HIDDEN_TAB_KEYS.has(tb.key))
          .sort((a, b) => a.order - b.order)
          .map((tb) => ({ key: tb.key, label: tb.label || TAB_LABELS[tb.key] || tb.key }))
      : FALLBACK_TABS.filter((tb) => !HIDDEN_TAB_KEYS.has(tb.key));
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
      const sourceCandidates = [head.source, ...surface.sources.filter((source) => source !== head.source)];
      for (const sourceName of sourceCandidates) {
        const v = mVal(pickSource(sources, sourceName), head.metric);
        if (v != null) {
          value = fmtByFormat(v, head.format);
          valueLabel = head.label;
          break;
        }
      }
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

  function surfaceHeadlineSeries(surface: SurfaceDef, head: (typeof SURFACE_HEADLINE)[SurfaceKey] | undefined): number[] {
    if (!head) return [];
    const sourceCandidates = [head.source, ...surface.sources.filter((source) => source !== head.source)];
    for (const sourceName of sourceCandidates) {
      const series = bucketDaily(rangeEntries, sourceName, head.metric, "day");
      if (series.some((value) => value !== 0)) return series;
    }
    return bucketDaily(rangeEntries, head.source, head.metric, "day");
  }

  // Server-side DnD: reorder and persist via reorderMutation (optimistic cache
  // update + rollback). dnd-kit fires once per drop, so no debounce is needed, and
  // orderedSurfaces already reflects the optimistic order via the query cache.
  function handleSurfaceDragEnd(event: DragEndEvent) {
    // Only when the dashboard is loaded + DB-backed and not mid-save (the handle is
    // disabled in those cases too — this is just defense).
    if (!dashboardRec?.configured || saving) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys: string[] = orderedSurfaces.map((s) => s.key);
    const oldIndex = keys.indexOf(String(active.id));
    const newIndex = keys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderMutation.mutate(arrayMove(keys, oldIndex, newIndex));
  }

  const topPages = useMemo(() => {
    if (!ga4?.metrics) return [] as MetricEntry[];
    return ga4.metrics.filter((x) => x.name === "topPage").sort((a, b) => b.value - a.value).slice(0, 10);
  }, [ga4]);

  const channelRows = useMemo<ChannelRow[]>(() => {
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
    const ga4Src = sources.ga4;
    const ga4Channels: Record<string, number> = {};
    if (ga4Src?.metrics) {
      ga4Src.metrics.filter((m) => m.name === "sessions" && (m.dimensions as Record<string, string>)?.channel)
        .forEach((m) => { ga4Channels[(m.dimensions as Record<string, string>).channel] = m.value; });
    }

    const channelMap: Record<string, { name: string; icon: string }> = {
      Facebook: { name: "Meta Ads", icon: "💰" },
      "facebook/Paid Social": { name: "Meta Ads", icon: "💰" },
      "Paid Social": { name: "Meta Ads", icon: "💰" },
      Email: { name: "Cold Email", icon: "📧" },
      Organic: { name: "Organic Search", icon: "🌐" },
    };
    const merged: Record<string, ChannelRow> = {};

    for (const [ch, leads] of Object.entries(channelLeads).sort((a, b) => b[1] - a[1])) {
      const info = channelMap[ch] || { name: ch, icon: "📡" };
      const isPaid = ch === "Facebook" || ch.includes("facebook") || ch.includes("Paid");
      const existing = merged[info.name];
      if (existing) {
        existing.leads += leads;
        if (isPaid) existing.spend = adsSpend;
      } else {
        merged[info.name] = {
          key: info.name,
          channel: info.name,
          icon: info.icon,
          leads,
          spend: isPaid ? adsSpend : 0,
          sessions: 0,
          cpl: null,
          delta: { value: "—", direction: "flat" },
        };
      }
    }

    for (const row of Object.values(merged)) {
      row.cpl = row.spend > 0 && row.leads > 0 ? row.spend / row.leads : null;
    }

    for (const [ch, sessions] of Object.entries(ga4Channels)) {
      const existing = Object.values(merged).find((row) => row.channel.toLowerCase().includes(ch.toLowerCase().split(" ")[0]));
      if (existing) {
        existing.sessions += sessions;
      } else if (ch !== "Direct" && ch !== "(not set)") {
        const icon = ch.includes("Social") ? "📱" : ch.includes("Search") ? "🌐" : ch.includes("Referral") ? "🔗" : ch.includes("Email") ? "📧" : "📡";
        merged[ch] = { key: ch, channel: ch, icon, leads: 0, sessions, spend: 0, cpl: null, delta: { value: "—", direction: "flat" } };
      }
    }

    return Object.values(merged).sort((a, b) => (b.leads || 0) - (a.leads || 0) || (b.sessions || 0) - (a.sessions || 0));
  }, [sources]);

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

  const _modulesGrid = planLoading ? (
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

  function deltaChip(delta?: { value: string; direction: "up" | "down" | "flat" }) {
    if (!delta?.value) return null;
    const tone = delta.direction === "up" ? "up" : delta.direction === "down" ? "down" : "flat";
    const marker = delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "•";
    return <MetricChip tone={tone}>{marker} {delta.value}</MetricChip>;
  }

  function surfaceStatusDot(connected: boolean, sourceCount: number) {
    if (connected) return "bg-sage";
    if (sourceCount > 0) return "bg-[var(--yellow)]";
    return "bg-[var(--sc-fg-subtle)]";
  }

  function renderOverview() {
    const connectedCount = SURFACES.filter((s) => surfaceInfoFor(s).connected).length;
    const pct = northStar.target != null && northStar.value != null && northStar.target > 0
      ? Math.min(100, Math.round((northStar.value / northStar.target) * 100))
      : null;
    const leadingCards = healthCards.slice(0, 3);
    const laggingCards = healthCards.slice(3, 6);

    if (!hasData && !hasConnectedApis) {
      return (
        <>
          {dataBanners}
          <MetricPanel halftone className="mb-6 border-navy p-10 text-center">
            <div className="text-4xl">📈</div>
            <h2 className="mt-3 font-heading text-2xl font-bold text-navy">Métricas — aún sin conectar</h2>
            <p className="mx-auto mt-2 max-w-xl text-[13px] text-[var(--sc-fg-muted)]">
              El dashboard se enciende al conectar fuentes. Puedes empezar por credenciales o pedirle a Merlin que diseñe el primer mapa de métricas.
            </p>
            <div className="mx-auto mt-5 flex max-w-md items-center justify-center gap-3">
              <span className="font-heading text-lg font-bold text-navy">{connectedCount}/{SURFACES.length}</span>
              <MetricProgressBar value={connectedCount} max={SURFACES.length} />
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a href={`/dashboard/${slug}/settings?tab=apis`} className="inline-flex items-center gap-1.5 rounded-sc-md border-2 border-ink bg-navy px-3 py-1.5 font-heading text-[12px] font-bold text-white shadow-pop-xs no-underline">
                🔌 Conectar fuentes
              </a>
              <MetricButton variant="cyan" onClick={() => openMerlin("Quiero diseñar el dashboard de métricas desde cero. Primero pregúntame qué objetivo quiero medir.")}>
                🔮 Diseñar con Merlin
              </MetricButton>
            </div>
          </MetricPanel>
          <div className="mb-3 flex items-center gap-2 font-heading text-base font-bold text-navy">
            <span>🗂️</span> Lo que vas a poder medir <span className="text-[12px] font-semibold text-[var(--sc-fg-muted)]">· todo por conectar</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SURFACES.map((surface) => (
              <MetricPanel key={surface.key} className="border-dashed p-4 opacity-80" halftone>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-heading text-[13px] font-bold text-navy"><span>{surface.emoji}</span>{surface.name}</div>
                  <span className="h-2.5 w-2.5 rounded-full border border-ink bg-[var(--sc-fg-subtle)]" />
                </div>
                <p className="text-[12px] text-[var(--sc-fg-muted)]">{surface.what}</p>
                <a href={`/dashboard/${slug}/settings?tab=apis`} className="mt-3 inline-flex font-heading text-[12px] font-bold text-rust no-underline">Conectar {"->"}</a>
              </MetricPanel>
            ))}
          </div>
        </>
      );
    }

    return (
      <>
        {dataBanners}
        <MetricPanel halftone pad={false} className="mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr]">
            <div className="border-b-[2.5px] border-ink bg-[var(--sc-paper-3)] p-5 lg:border-b-0 lg:border-r-[2.5px]">
              <div className="font-heading text-[12px] font-bold uppercase tracking-wide text-rust">⭐ North Star</div>
              <div className="mt-4 flex items-center gap-4">
                <div>
                  <div className="font-heading text-[46px] font-bold leading-none text-navy">{northStar.value != null ? northStar.value.toLocaleString() : "—"}</div>
                  <div className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">{northStar.label}</div>
                </div>
                {pct != null && (
                  <svg viewBox="0 0 96 96" className="h-24 w-24 shrink-0">
                    <circle cx="48" cy="48" r="42" fill="none" stroke="#E8DCC8" strokeWidth="9" />
                    <circle cx="48" cy="48" r="42" fill="none" stroke="#C45D35" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 42}`} strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`} transform="rotate(-90 48 48)" />
                    <text x="48" y="54" textAnchor="middle" className="fill-navy font-heading text-[20px] font-bold">{pct}%</text>
                  </svg>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {northStar.target != null && <span className="text-[12px] text-[var(--sc-fg-muted)]">Objetivo <b className="font-heading text-navy">{northStar.target.toLocaleString()}</b></span>}
                {deltaChip(northStar.delta)}
                <span className="text-[11px] text-[var(--sc-fg-muted)]">vs periodo previo</span>
              </div>
              <MetricSparkline values={northStar.spark} color="navy" className="mt-4" />
              <p className="mt-3 text-[12px] text-[var(--sc-fg-muted)]">
                Activación: <b>{displayPlan?.activationEvent || northStar.caption || "—"}</b><br />
                Arquetipo: <b>{displayPlan?.archetype || definition?.archetype || "—"}</b>
              </p>
            </div>
            <div className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="font-heading text-[10.5px] font-bold uppercase tracking-widest text-rust">Leading {"->"} ⭐ {"->"} Lagging</div>
                {monitoring?.health_score ? (
                  <MetricChip tone={(monitoring.health_score.score || 0) >= 60 ? "ok" : "warn"}>Health {monitoring.health_score.score || "—"}</MetricChip>
                ) : (
                  <MetricChip tone="flat">Onboarding</MetricChip>
                )}
              </div>
              <div className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">Inputs (leading)</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {leadingCards.map((card) => (
                  <MetricTile key={card.label} label={card.label} value={card.value} hint={deltaChip(card.delta)} tone="leading" />
                ))}
                {leadingCards.length === 0 && <MetricTile label="Inputs" value="—" hint="Conecta fuentes para medir inputs." tone="leading" />}
              </div>
              <div className="mb-2 mt-4 font-heading text-[11px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">Resultados (lagging){customMetricCards.length > 0 ? " · custom" : ""}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {laggingCards.map((card) => (
                  <MetricTile key={card.label} label={card.label} value={card.value} hint={deltaChip(card.delta)} tone="lagging" />
                ))}
                {customMetricCards.map((card) => (
                  <MetricTile key={card.label} label={card.label} value={card.value} tone="custom" hint={<><MetricChip tone="chat">chat</MetricChip><code className="mt-1 block break-all font-mono text-[10px]">{card.formula}</code></>} />
                ))}
              </div>
            </div>
          </div>
        </MetricPanel>
        {displayPlan?.funnel && (
          <MetricPanel className="mb-6">
            <div className="mb-3 flex items-center gap-2 font-heading text-base font-bold text-navy"><span>🪜</span> Embudo de activación</div>
            <div className="flex flex-wrap items-stretch">
              {buildFunnelSteps(displayPlan.funnel, sources).map((step, index, arr) => (
                <div key={`${step.step}-${index}`} className="relative min-w-[96px] flex-1 px-2 py-2 text-center">
                  <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">{step.step}</div>
                  <div className={cn("my-1 font-heading text-[24px] font-bold text-navy", !step.automated && "text-[var(--sc-fg-subtle)]")}>{step.value}</div>
                  <div className="inline-flex items-center gap-1 text-[10px] text-[var(--sc-fg-muted)]">{step.statusDot} {step.statusLabel}</div>
                  {index < arr.length - 1 && <span className="absolute right-[-6px] top-1/2 hidden -translate-y-1/2 font-heading text-xl text-[var(--sc-fg-subtle)] sm:block">{"->"}</span>}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--sc-fg-muted)]">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sage" /> automático</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--yellow)]" /> Sheets/manual</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive" /> sin conectar</span>
            </div>
          </MetricPanel>
        )}
      </>
    );
  }

  function renderSurfaces() {
    if (subView?.kind === "surface") return renderSurfaceDetail(subView.key);
    if (subView?.kind === "customSurface") return renderCustomSurfaceDetail(subView.key);

    return (
      <>
        {dataBanners}
        <div className="mb-4 text-[12.5px] text-[var(--sc-fg-muted)]">
          <b className="text-navy">Surfaces = tus sistemas/activos.</b> Una card por sistema. Las 8 estándar son iguales para todo cliente; las Custom son ilimitadas y bespoke.
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSurfaceDragEnd}>
          <SortableContext items={orderedSurfaces.map((s) => s.key)} strategy={rectSortingStrategy}>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {orderedSurfaces.map((s) => {
                const info = surfaceInfoFor(s);
                const head = SURFACE_HEADLINE[s.key];
                const series = surfaceHeadlineSeries(s, head);
                return (
                  <SortableSurfaceCard key={s.key} id={s.key} disabled={!dashboardRec?.configured || saving}>
                    <button type="button" onClick={() => setSubView({ kind: "surface", key: s.key })} className="block h-full w-full text-left">
                      <MetricPanel className={cn("h-full p-4 transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-pop-md", !info.connected && "border-dashed bg-[repeating-linear-gradient(135deg,var(--aged),var(--aged)_9px,#e3d6bf_9px,#e3d6bf_18px)]")}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-heading text-[13px] font-bold text-navy"><span>{s.emoji}</span>{s.name}</div>
                          <span className={cn("h-2.5 w-2.5 rounded-full border border-ink", surfaceStatusDot(info.connected, info.connectedSources.length))} />
                        </div>
                        <div className="font-heading text-[26px] font-bold leading-none text-navy">{info.value || (info.connected ? "✓" : "—")}</div>
                        <p className="mt-1 text-[11.5px] text-[var(--sc-fg-muted)]">{info.valueLabel || s.what}</p>
                        <MetricSparkline values={series} color={info.connected ? "navy" : "rust"} className="mt-3" />
                        <div className="mt-3 font-heading text-[11px] font-bold text-rust">{info.connected ? "Abrir detalle ->" : "Conectar ->"}</div>
                      </MetricPanel>
                    </button>
                  </SortableSurfaceCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        {/* Custom surfaces (bespoke) + create-with-Merlin — outside the standard reorder. */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {definition?.customSurfaces?.map((cs) => (
            <button key={cs.key} type="button" onClick={() => setSubView({ kind: "customSurface", key: cs.key })} className="block h-full text-left">
              <MetricPanel className="h-full border-dashed border-[var(--sc-rust-700)] bg-[#FBF1E8] p-4">
                <div className="mb-2 flex items-center gap-2 font-heading text-[13px] font-bold text-[var(--sc-rust-700)]">
                  <span>{cs.emoji || "⚗️"}</span>{cs.name}<MetricChip tone="custom">bespoke</MetricChip>
                </div>
                <div className="font-heading text-[26px] font-bold text-navy">{cs.cards?.length || 0}</div>
                <p className="text-[11.5px] text-[var(--sc-fg-muted)]">{cs.cards?.map((card) => card.title).slice(0, 2).join(" · ") || "Superficie custom"}</p>
                <div className="mt-3 font-heading text-[11px] font-bold text-rust">Abrir detalle {"->"}</div>
              </MetricPanel>
            </button>
          ))}
          <button type="button" onClick={() => openMerlin("Quiero crear una superficie custom (p.ej. A/B tests, satisfacción). ¿Qué fuentes necesito y qué cards proponemos?")} className="text-left">
            <MetricPanel className="flex min-h-[132px] flex-col items-center justify-center border-dashed border-[var(--sc-rust-700)] bg-[#FBF1E8] p-4 text-center">
              <div className="text-2xl">⚗️</div>
              <div className="font-heading font-bold text-[var(--sc-rust-700)]">Nueva superficie custom</div>
              <p className="mt-1 text-[11.5px] text-[var(--sc-fg-muted)]">Diseñar con Merlin / A·B</p>
              <span className="mt-3 inline-flex rounded-sc-pill border-2 border-ink bg-[var(--cyan)] px-3 py-1 font-heading text-[11.5px] font-bold text-white shadow-pop-xs">🔮 Crear con Merlin {"->"}</span>
            </MetricPanel>
          </button>
        </div>
      </>
    );
  }

  function renderSurfaceDetail(key: SurfaceKey) {
    if (key === "partnerships") {
      return (
        <div>
          <BackButton onClick={() => setSubView(null)}>Volver a Surfaces</BackButton>
          <MetricsPartnershipsTab slug={slug} />
        </div>
      );
    }
    const surface = SURFACES.find((s) => s.key === key);
    if (!surface) return null;
    const info = surfaceInfoFor(surface);
    const head = SURFACE_HEADLINE[surface.key];
    const sourceMetrics = surface.sources.flatMap((sourceName) => {
      const src = pickSource(sources, sourceName);
      if (!src?.metrics) return [] as MetricEntry[];
      return src.metrics.filter((metric) => !metric.dimensions).slice(0, 4);
    }).slice(0, 6);

    return (
      <div>
        <BackButton onClick={() => setSubView(null)}>Volver a Surfaces</BackButton>
        <div className="mb-5 flex flex-wrap items-center gap-3 border-b-[2.5px] border-ink pb-4">
          <h2 className="font-heading text-2xl font-bold text-navy">{surface.emoji} {surface.name}</h2>
          <span className="text-[13px] text-[var(--sc-fg-muted)]">detalle de superficie</span>
          <MetricButton variant="cyan" className="ml-auto" onClick={() => openMerlin(`Quiero editar la superficie ${surface.name}. Revisa sus fuentes, cards y métricas.`)}>
            ✨ Editar con Merlin
          </MetricButton>
        </div>

        {!info.connected ? (
          <MetricPanel halftone className="max-w-3xl p-7">
            <div className="mb-4 flex items-center gap-3">
              <div className="text-4xl">{surface.emoji}</div>
              <div>
                <h3 className="font-heading text-xl font-bold text-navy">{surface.name} sin conectar</h3>
                <p className="text-[13px] text-[var(--sc-fg-muted)]">{surface.what}</p>
              </div>
            </div>
            <div className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-rust">Qué necesita para encenderse</div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {surface.requires.mandatory.map((r) => <MetricChip key={r} tone="must">obligatorio · {r}</MetricChip>)}
              {surface.requires.oneOf.map((r) => <MetricChip key={r} tone="one">uno de · {r}</MetricChip>)}
              {surface.requires.optional.map((r) => <MetricChip key={r} tone="opt">opcional · {r}</MetricChip>)}
            </div>
            <p className="text-[12.5px] italic text-[var(--sc-fg-muted)]">{surface.how}</p>
            <a href={`/dashboard/${slug}/settings?tab=apis`} className="mt-4 inline-flex rounded-sc-pill border-2 border-ink bg-navy px-4 py-2 font-heading text-[12px] font-bold text-white shadow-pop-xs no-underline">
              🔌 Conectar en Ajustes › APIs {"->"}
            </a>
          </MetricPanel>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {info.connectedSources.map((source) => <MetricChip key={source} tone="flat">🔗 {source} ✓</MetricChip>)}
            </div>
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label={info.valueLabel || "Headline"} value={info.value || "✓"} hint={surface.what} />
              {sourceMetrics.slice(0, 3).map((metric) => (
                <MetricTile key={`${metric.name}-${metric.value}`} label={metric.name} value={fmtByFormat(metric.value)} hint="último periodo" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-rust">Tendencia ({rangeEntries.length || 0}d)</div>
                <MetricPanel>
                  <MetricSparkline values={surfaceHeadlineSeries(surface, head)} color="navy" className="h-28" />
                </MetricPanel>
              </div>
              <div>
                <div className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-rust">Desglose</div>
                {sourceMetrics.length > 0 ? (
                  <DataTable
                    columns={["Métrica", "Valor"]}
                    rows={sourceMetrics.map((metric) => ({
                      key: metric.name,
                      cells: [metric.name, <span key="value" className="font-heading font-bold">{fmtByFormat(metric.value)}</span>],
                    }))}
                  />
                ) : (
                  <MetricPanel className="p-5 text-[13px] text-[var(--sc-fg-muted)]">Sin desglose disponible para esta superficie.</MetricPanel>
                )}
              </div>
            </div>
            <p className="mt-5 text-[12.5px] text-[var(--sc-fg-muted)]">
              Esto es la profundidad del sistema <b>{surface.name}</b>. Para verlo como ruta de adquisición, ve a <b>Channels</b>.
            </p>
          </>
        )}
      </div>
    );
  }

  function renderCustomSurfaceDetail(key: string) {
    const custom = definition?.customSurfaces?.find((surface) => surface.key === key);
    if (!custom) return null;
    return (
      <div>
        <BackButton onClick={() => setSubView(null)}>Volver a Surfaces</BackButton>
        <div className="mb-5 flex flex-wrap items-center gap-3 border-b-[2.5px] border-ink pb-4">
          <h2 className="font-heading text-2xl font-bold text-navy">{custom.emoji || "⚗️"} {custom.name}</h2>
          <span className="text-[13px] text-[var(--sc-fg-muted)]">superficie custom · bespoke</span>
          <MetricButton variant="cyan" className="ml-auto" onClick={() => openMerlin(`Quiero añadir o editar cards en la superficie custom ${custom.name}.`)}>
            ✨ Editar con Merlin
          </MetricButton>
        </div>
        {custom.cards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {custom.cards.map((card) => (
              <MetricPanel key={card.title} className="border-dashed border-[var(--sc-rust-700)] bg-[#FBF1E8]">
                <div className="font-heading text-[13px] font-bold text-[var(--sc-rust-700)]">{custom.emoji || "⚗️"} {card.title}</div>
                <div className="mt-2 font-heading text-[26px] font-bold text-navy">{card.value || "—"}</div>
                <p className="mt-1 text-[11px] text-[var(--sc-fg-muted)]">{card.subtitle || card.source || "custom"}</p>
              </MetricPanel>
            ))}
          </div>
        ) : (
          <MetricPanel halftone className="max-w-3xl p-8 text-center">
            <div className="text-4xl">{custom.emoji || "⚗️"}</div>
            <h3 className="mt-3 font-heading text-xl font-bold text-navy">Superficie a medida (opt-in)</h3>
            <p className="mx-auto mt-2 max-w-xl text-[13px] text-[var(--sc-fg-muted)]">
              Para datos bespoke que no encajan en las 8 estándar: A/B tests, experimentos y KPIs propios.
            </p>
            <MetricButton variant="rust" className="mt-5" onClick={() => openMerlin(`Quiero crear la primera métrica para la superficie custom ${custom.name}.`)}>
              + Crear primera métrica {"->"}
            </MetricButton>
          </MetricPanel>
        )}
        <p className="mt-4 text-[12.5px] text-[var(--sc-fg-muted)]">
          Superficie bespoke (fuente: <b>{custom.source || "custom"}</b>) — fuera de las 8 estándar, versionada igual. Puedes tener tantas como quieras.
        </p>
      </div>
    );
  }

  function renderChannels() {
    if (subView?.kind === "channel") return renderChannelDetail(subView.key);
    const winnerKey = channelRows[0]?.key;
    return (
      <>
        {dataBanners}
        <div className="mb-4 text-[12.5px] text-[var(--sc-fg-muted)]">
          <b className="text-navy">Channels = tus rutas de adquisición, comparadas.</b> Una fila por ruta: input, coste, CPL/CPA y avance hacia la North Star.
        </div>
        {channelRows.length > 0 ? (
          <DataTable
            columns={["Canal", "Input", "Spend", "Leads/Reg.", "CPL / CPA", "Δ"]}
            rows={channelRows.map((row) => ({
              key: row.key,
              selected: row.key === winnerKey,
              onClick: () => setSubView({ kind: "channel", key: row.key }),
              cells: [
                <div key="channel" className="flex items-center gap-2 font-heading font-bold text-navy"><span>{row.icon}</span>{row.channel}{row.key === winnerKey && <MetricChip tone="ok">GANADOR</MetricChip>}</div>,
                <span key="input" className={row.sessions ? "" : "text-[var(--sc-fg-subtle)]"}>{row.sessions ? `${row.sessions.toLocaleString()} sessions` : "—"}</span>,
                <span key="spend" className="font-heading">{row.spend > 0 ? `€${row.spend.toFixed(0)}` : "—"}</span>,
                <span key="leads" className="font-heading">{row.leads || "—"}</span>,
                <b key="cpl" className="font-heading">{row.cpl != null ? `€${row.cpl.toFixed(1)}` : "—"}</b>,
                row.delta?.value && row.delta.value !== "—" ? deltaChip(row.delta) : <span key="delta" className="text-[var(--sc-fg-subtle)]">—</span>,
              ],
            }))}
          />
        ) : (
          <MetricPanel className="p-8 text-center text-[var(--sc-fg-muted)]">Sin datos de canales aún. Conecta fuentes para ver el funnel por canal.</MetricPanel>
        )}
        <p className="mt-3 text-[12px] text-[var(--sc-fg-muted)]">Ordenado por rendimiento; el ganador se resalta. Click en una fila para el embudo y campañas del canal.</p>
      </>
    );
  }

  function renderChannelDetail(key: string) {
    const row = channelRows.find((candidate) => candidate.key === key);
    if (!row) return null;
    const funnel = displayPlan?.funnel ? buildFunnelSteps(displayPlan.funnel, sources) : [];
    const campaignMetrics = (ads?.metrics || []).filter((metric) => metric.dimensions && (metric.dimensions as Record<string, string>).campaign);
    const campaigns: Record<string, Record<string, number>> = {};
    for (const metric of campaignMetrics) {
      const campaign = String((metric.dimensions as Record<string, string>).campaign);
      campaigns[campaign] ||= {};
      campaigns[campaign][metric.name] = metric.value;
    }
    const campaignRows = Object.entries(campaigns).slice(0, 6);

    return (
      <div>
        <BackButton onClick={() => setSubView(null)}>Volver a Channels</BackButton>
        <div className="mb-5 flex flex-wrap items-center gap-3 border-b-[2.5px] border-ink pb-4">
          <h2 className="font-heading text-2xl font-bold text-navy">{row.icon} {row.channel}</h2>
          <span className="text-[13px] text-[var(--sc-fg-muted)]">detalle de canal</span>
          <MetricButton variant="cyan" className="ml-auto" onClick={() => openMerlin(`Quiero revisar el canal ${row.channel}. Mira su CPL, campañas y contribución a la North Star.`)}>
            ✨ Editar con Merlin
          </MetricButton>
        </div>
        {funnel.length > 0 && (
          <>
            <div className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-rust">Embudo de esta ruta {"->"} hacia la North Star</div>
            <MetricPanel className="mb-5">
              <div className="flex flex-wrap items-stretch">
                {funnel.map((step, index, arr) => (
                  <div key={`${step.step}-${index}`} className="relative min-w-[96px] flex-1 px-2 py-2 text-center">
                    <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">{step.step}</div>
                    <div className="my-1 font-heading text-[24px] font-bold text-navy">{step.value}</div>
                    {index < arr.length - 1 && <span className="absolute right-[-6px] top-1/2 hidden -translate-y-1/2 font-heading text-xl text-[var(--sc-fg-subtle)] sm:block">{"->"}</span>}
                  </div>
                ))}
              </div>
            </MetricPanel>
          </>
        )}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-rust">Coste & eficiencia</div>
            <div className="grid grid-cols-2 gap-3">
              <MetricTile label="Spend" value={row.spend > 0 ? `€${row.spend.toFixed(0)}` : "—"} />
              <MetricTile label="Leads" value={row.leads || "—"} />
              <MetricTile label="CPL/CPA" value={row.cpl != null ? `€${row.cpl.toFixed(1)}` : "—"} />
              <MetricTile label="Δ periodo" value={row.delta?.value || "—"} />
            </div>
          </div>
          <div>
            <div className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-rust">Campañas que alimentan el canal</div>
            {campaignRows.length > 0 ? (
              <DataTable
                columns={["Campaña", "Spend", "Leads", "CPL"]}
                rows={campaignRows.map(([campaign, metrics]) => {
                  const spend = metrics.spend || 0;
                  const leads = metrics.leads || metrics.newContacts || 0;
                  const cpl = spend > 0 && leads > 0 ? spend / leads : null;
                  return {
                    key: campaign,
                    cells: [campaign, spend ? `€${spend.toFixed(0)}` : "—", leads || "—", cpl != null ? `€${cpl.toFixed(1)}` : "—"],
                  };
                })}
              />
            ) : (
              <MetricPanel className="p-5 text-[13px] text-[var(--sc-fg-muted)]">Sin desglose por campaña en el periodo seleccionado.</MetricPanel>
            )}
          </div>
        </div>
        <p className="mt-5 text-[12.5px] text-[var(--sc-fg-muted)]">
          Esto es la contribución al embudo de la ruta <b>{row.channel}</b>. Para la salud del sistema completo, abre la superficie correspondiente en Surfaces.
        </p>
      </div>
    );
  }

  function renderConversion() {
    const posthogConnected = connectedFromFiles.has("posthog");
    if (posthogConnected) {
      const pageviews = mVal(posthog, "pageviews");
      const activation = mVal(posthog, "activation_events");
      const recordings = mVal(posthog, "session_recordings");
      const reachedRows = (posthog?.metrics || [])
        .filter((x) => x.name === "funnel_step_reached" && x.dimensions)
        .sort((a, b) => (Number(a.dimensions?.order) || 0) - (Number(b.dimensions?.order) || 0));
      const funnel = reachedRows.map((s, i) => ({
        step: String(s.dimensions?.step ?? ""),
        reached: s.value,
        dropoff: i === 0 ? 0 : Math.max(0, reachedRows[i - 1].value - s.value),
      }));
      return (
        <div className="space-y-5">
          <MetricPanel halftone className="border-[3px] border-navy">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-heading text-[11px] font-bold uppercase tracking-wide text-rust">Conversion & Producto</div>
                <h2 className="mt-1 font-heading text-2xl font-bold text-navy">PostHog conectado</h2>
                <p className="mt-1 max-w-2xl text-[13px] text-[var(--sc-fg-muted)]">Heatmaps, grabaciones y dropoff por paso para entender dónde se atasca la activación.</p>
              </div>
              <MetricChip tone="ok">activo</MetricChip>
            </div>
          </MetricPanel>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Pageviews", value: pageviews, hint: "PostHog" },
              { label: "Activación", value: activation, hint: "activación" },
              { label: "Dropoff total", value: funnel.length ? funnel.reduce((s, x) => s + x.dropoff, 0) : null, hint: "perdidos en el funnel" },
              { label: "Grabaciones", value: recordings, hint: "session recordings" },
            ].map((c) => (
              <MetricTile key={c.label} label={c.label} value={c.value == null ? "—" : c.value.toLocaleString()} hint={c.hint} tone="leading" />
            ))}
          </div>
          {funnel.length > 0 ? (
            <DataTable
              columns={["Paso", "Alcanzaron", "Dropoff"]}
              rows={funnel.map((r, i) => ({
                key: `${r.step}-${i}`,
                cells: [
                  <span key="step" className="font-heading font-bold text-navy">{r.step}</span>,
                  <span key="reached" className="font-heading font-bold">{r.reached.toLocaleString()}</span>,
                  <span key="drop" className={cn(r.dropoff > 0 && "font-semibold text-destructive")}>{i === 0 ? "—" : `-${r.dropoff.toLocaleString()}`}</span>,
                ],
              }))}
            />
          ) : (
            <MetricPanel className="p-6 text-center text-[13px] text-[var(--sc-fg-muted)]">
              PostHog conectado. Define <code className="text-[11px]">funnelSteps</code> en los ajustes de la integración para ver el dropoff por paso.
            </MetricPanel>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <MetricPanel halftone className="border-[3px] border-[var(--cyan)] text-center">
          <div className="mx-auto max-w-xl">
            <div className="text-3xl">{"🎯"}</div>
            <h2 className="mt-2 font-heading text-2xl font-bold text-navy">Conversion & Producto</h2>
            <p className="mt-2 text-[13px] text-[var(--sc-fg-muted)]">Conecta PostHog para heatmaps, grabaciones de sesión y dropoff por paso del funnel de producto.</p>
            <a href={`/dashboard/${slug}/settings?tab=apis`} className="mt-4 inline-flex">
              <MetricButton variant="cyan">{"🔌"} Conectar PostHog {"->"}</MetricButton>
            </a>
          </div>
        </MetricPanel>
        {topPages.length > 0 && (
          <div>
            <div className="mb-2 font-heading text-[11px] font-bold uppercase tracking-wide text-rust">Top páginas <span className="font-normal text-[var(--sc-fg-muted)]">(GA4 · proxy de dropoff)</span></div>
            <DataTable
              columns={["Página", "Views", "Engagement"]}
              rows={topPages.map((p, i) => {
                const pg = (p.dimensions as Record<string, string>)?.page || "";
                const short = pg.length > 58 ? `${pg.slice(0, 58)}...` : pg;
                const engPct = Number((p.dimensions as Record<string, number>)?.engagementRate || 0);
                return {
                  key: `${pg}-${i}`,
                  cells: [
                    <span key="page" className="block max-w-[420px] overflow-hidden text-ellipsis whitespace-nowrap" title={pg}>{short}</span>,
                    <span key="views" className="font-heading font-bold">{p.value.toLocaleString()}</span>,
                    <MetricChip key="eng" tone={engPct >= 60 ? "ok" : "flat"}>{engPct}%</MetricChip>,
                  ],
                };
              })}
            />
          </div>
        )}
      </div>
    );
  }

  function renderTrends() {
    const trendMetrics = ([
      { source: "ga4", metric: "sessions", label: "Sessions", color: "navy" },
      { source: "ghl", metric: "newContacts", label: "New leads", color: "sage" },
      { source: "meta-ads", metric: "spend", label: "Spend", color: "rust", format: "currency" },
      { source: "gsc", metric: "impressions", label: "SEO impressions", color: "cyan" },
    ] as { source: string; metric: string; label: string; color: "rust" | "navy" | "sage" | "cyan"; format?: string }[])
      .filter((m) => mVal(pickSource(sources, m.source), m.metric) != null);
    return (
      <div className="space-y-5">
        <div className="inline-flex rounded-sc-lg border-2 border-ink bg-aged p-1 shadow-pop-xs">
          {(["day", "week", "month"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrain(g)}
              className={cn(
                "rounded-sc-md px-4 py-1.5 font-heading text-[12px] font-bold transition-colors",
                grain === g ? "border-2 border-ink bg-rust text-white shadow-pop-xs" : "text-[var(--sc-fg-muted)]"
              )}
            >
              {g === "day" ? "Día" : g === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        {trendMetrics.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trendMetrics.map((m) => {
              const cur = mVal(pickSource(sources, m.source), m.metric) || 0;
              const prev = mVal(pickSource(prevSources, m.source), m.metric);
              const d = mDelta(cur, prev);
              const series = bucketDaily(rangeEntries, m.source, m.metric, grain);
              return (
                <MetricPanel key={m.label} className="min-h-[176px]">
                  <div className="font-heading text-[11px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">{m.label}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-heading text-[28px] font-bold text-navy">{fmtByFormat(cur, m.format)}</span>
                    {deltaChip(d)}
                  </div>
                  <MetricSparkline values={series} color={m.color} className="mt-5" />
                  <div className="mt-2 text-[10.5px] text-[var(--sc-fg-muted)]">{series.length} {grain === "day" ? "días" : grain === "week" ? "semanas" : "meses"} · vs periodo anterior</div>
                </MetricPanel>
              );
            })}
          </div>
        ) : (
          <MetricPanel className="p-8 text-center text-[var(--sc-fg-muted)]">Sin datos de tendencia aún.</MetricPanel>
        )}
      </div>
    );
  }

  function renderSetup() {
    const projectExists = Boolean(metricsProjectRecord);

    // Documents = the Foundation metrics-plan task(s) (today just T01) + one
    // synthetic "Definición del dashboard" card (archetype shown as a label, not
    // a 3rd card). P00-Metrics generates no other document.
    const foundationDocs = metricsSetupTasks.filter((t) => t.type === "foundation");
    const dashboardDone = !!dashboardRec?.configured;
    const docCount = foundationDocs.length + 1; // + the dashboard-definition card
    const docsDone = foundationDocs.filter((t) => isTaskCompleted(t.status)).length + (dashboardDone ? 1 : 0);

    // Connections.
    const connStates = SURFACES.map((s) => {
      const info = surfaceInfoFor(s);
      return { surface: s, info, state: surfaceConnState(s, info) };
    });
    const connectedSurfaces = connStates.filter((c) => c.state === "on").length;
    const connPct = Math.round((connectedSurfaces / SURFACES.length) * 100);

    // Setup progress = documents + connected surfaces.
    const totalSteps = docCount + SURFACES.length;
    const doneSteps = docsDone + connectedSurfaces;
    const setupPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

    // Operational integrations only (T08–T10) — auto-generated surface-connection
    // tasks are excluded so they don't duplicate the Conexiones block.
    const operationalIntegrations = metricsSetupTasks.filter(
      (t) => t.type === "integration" && t.skill && OPERATIONAL_INTEGRATION_SKILLS.has(t.skill),
    );

    return (
      <div className="space-y-4">
        {/* prereq note — thin one-liner, never a card */}
        {metricsPrereqTask && (
          <MetricPanel className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="text-[12.5px]">
              <span className="font-heading font-bold uppercase tracking-wide text-rust">Prerequisito Foundation</span>
              {" · "}<span className="font-heading font-bold text-navy">{metricsPrereqTask.id} · {metricsPrereqTask.name}</span>
            </div>
            <TaskStatusBadge status={metricsPrereqTask.status} />
          </MetricPanel>
        )}

        {/* 1 · progress */}
        <MetricPanel halftone>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h2 className="mb-2 font-heading text-[17px] font-bold text-navy">🔧 Setup de Métricas — {doneSteps}/{totalSteps} pasos</h2>
              <div className="h-4 overflow-hidden rounded-sc-pill border-2 border-ink bg-aged shadow-pop-xs">
                <i className={cn("block h-full border-r-2 border-ink", setupPct === 100 ? "bg-sage" : "bg-rust")} style={{ width: `${setupPct}%` }} />
              </div>
            </div>
            <span className="font-heading text-3xl font-bold text-navy">{setupPct}%</span>
          </div>
          {!projectExists && (
            <div className="mt-3 rounded-sc-md border-2 border-dashed border-ink bg-aged px-3 py-2 text-[12px] text-[var(--sc-fg-muted)]">
              P00-Metrics aún no existe para este cliente. Esta vista muestra el setup declarado en el blueprint hasta que el proyecto se instancie.
            </div>
          )}
        </MetricPanel>

        {/* 2 · documentos del proyecto */}
        <MetricPanel>
          <div className="mb-2 flex items-center gap-2 font-heading text-[15px] font-bold text-navy">
            📑 Plan de métricas
            <span className="font-heading text-[12px] font-semibold text-[var(--sc-fg-muted)]">— documentos que genera el proyecto {METRICS_PROJECT_ID}</span>
          </div>
          {foundationDocs.map((task, i) => {
            const done = isTaskCompleted(task.status);
            const file = firstDeliverableFile(task.deliverable_file);
            return (
              <SetupDocCard
                key={task.id}
                index={i + 1}
                title={task.name}
                done={done}
                path={file}
                desc={task.description || task.deliverable || "Plan de KPIs, North Star y embudo — lo genera Merlin."}
                onChat={() => task.isBlueprint
                  ? openMerlin(`Quiero arrancar el plan de métricas («${task.name}»): definir North Star, KPIs por canal y embudo. ¿Por dónde empezamos?`)
                  : openSetupTaskChat(task)}
                taskHref={projectExists ? `/dashboard/${slug}/tasks/${task.id}` : undefined}
                onOpen={() => {
                  if (!file) { openSetupTaskChat(task); return; }
                  setSetupDocPath(file.startsWith("brand/") ? file : `brand/${slug}/${file}`);
                }}
                openLabel={done ? "Abrir →" : "+ Crear con Merlin"}
                fourthIcon="✅"
                fourthTitle={task.done_criteria || "Criterios de done"}
              />
            );
          })}
          <SetupDocCard
            index={foundationDocs.length + 1}
            title="Definición del dashboard"
            done={dashboardDone}
            path={`dashboard · ${definition?.archetype ?? "lead-to-sale"} · v${dashboardRec?.version ?? 0}`}
            desc="Superficies, North Star y métricas custom · versionado append-only (revertible)"
            onChat={() => openMerlin("Repasemos la definición del dashboard (superficies, North Star, métricas custom). ¿Qué cambiamos?")}
            taskHref={projectExists ? `/dashboard/${slug}/tasks/${METRICS_PROJECT_ID}` : undefined}
            onOpen={() => setVersionsOpen(true)}
            openLabel="Abrir →"
            fourthIcon="🕓"
            fourthTitle="Historial de versiones"
            onFourth={() => setVersionsOpen(true)}
          />
        </MetricPanel>

        {/* 3 · conexiones (compact) */}
        <MetricPanel>
          <div className="mb-3 flex items-center gap-2 font-heading text-[15px] font-bold text-navy">
            🔌 Conexiones
            <span className="font-heading text-[12px] font-semibold text-[var(--sc-fg-muted)]">— fuentes que encienden cada superficie · el estado enlaza a su API</span>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <b className="font-heading text-[16px] text-navy">{connectedSurfaces}/{SURFACES.length}</b>
            <span className="text-[12px] text-[var(--sc-fg-muted)]">superficies conectadas</span>
            <MetricProgressBar value={connectedSurfaces} max={SURFACES.length} />
            <span className="font-heading text-[12px] font-bold text-navy">{connPct}%</span>
          </div>

          <div className="space-y-1.5">
            {connStates.map(({ surface: s, info, state }) => {
              // Surfaces with no connectable API providers (e.g. Reputation = Trust
              // Engine) are automatic — show a static badge, not a deep-link.
              const autoSurface = SURFACE_API_PROVIDERS[s.key].length === 0;
              return (
                <div
                  key={s.key}
                  className={cn(
                    "flex flex-wrap items-center gap-2.5 rounded-sc-md border-2 border-ink px-2.5 py-1.5 shadow-pop-xs",
                    state === "on" ? "bg-[var(--sc-sage-100)]" : state === "partial" ? "bg-[#FBF6E2]" : "bg-card", /* amber tint — matches the mockup; no app token for this shade yet */
                  )}
                >
                  <span className="w-[21px] flex-shrink-0 text-center text-[16px]">{s.emoji}</span>
                  <div className="flex min-w-[215px] flex-1 flex-wrap items-baseline gap-2">
                    <span className="font-heading text-[13px] font-bold text-navy">{s.name}</span>
                    <span className="text-[11px] text-[var(--sc-fg-muted)]">{connWhat(s, info.connectedSources)}</span>
                    {state !== "on" && (
                      <span className="flex flex-wrap items-center gap-1">
                        {s.requires.mandatory.map((r) => <MetricChip key={r} tone="must">obligatorio · {r}</MetricChip>)}
                        {s.requires.oneOf.length > 0 && <MetricChip tone="one">uno de · {s.requires.oneOf.join(" / ")}</MetricChip>}
                        {s.requires.optional.map((r) => <MetricChip key={r} tone="opt">opcional · {r}</MetricChip>)}
                      </span>
                    )}
                  </div>
                  {autoSurface ? (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sc-pill border-[1.5px] border-ink bg-aged px-2.5 py-1 font-heading text-[11px] font-bold text-ink shadow-pop-xs">⚙️ Automático</span>
                  ) : (
                    <SetupApiLink slug={slug} surfaceKey={s.key} state={state} />
                  )}
                </div>
              );
            })}

            {/* Custom / Lab dashed row */}
            <button
              type="button"
              onClick={() => openMerlin("Quiero diseñar una superficie custom para Métricas (A/B, KPIs propios). Ayúdame a definir fuente, señal y KPI.")}
              className="flex w-full flex-wrap items-center gap-2.5 rounded-sc-md border-2 border-dashed border-[#7A331A] bg-[#FBF1E8] px-2.5 py-1.5 text-left shadow-pop-xs transition-all hover:-translate-y-px"
            >
              <span className="w-[21px] flex-shrink-0 text-center text-[16px]">⚗️</span>
              <div className="flex min-w-[215px] flex-1 flex-wrap items-baseline gap-2">
                <span className="font-heading text-[13px] font-bold text-[#7A331A]">Custom / Lab</span>
                <span className="rounded-sc-pill border-[1.5px] border-ink bg-[#7A331A] px-1.5 font-heading text-[9px] font-bold text-white">ilimitadas</span>
                <span className="text-[11px] text-[var(--sc-fg-muted)]">A/B, KPIs propios · Sheet / manual / API</span>
              </div>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sc-pill border-[1.5px] border-ink bg-[var(--cyan)] px-2.5 py-1 font-heading text-[11px] font-bold text-white shadow-pop-xs">🔮 Diseñar →</span>
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[10.5px] text-[var(--sc-fg-muted)]">
            <span><MetricChip tone="must" className="mr-1">obligatorio</MetricChip> debe estar</span>
            <span><MetricChip tone="one" className="mr-1">uno de</MetricChip> al menos uno</span>
            <span><MetricChip tone="opt" className="mr-1">opcional</MetricChip> mejora</span>
            <span className="ml-auto">Cada estado → <b>Ajustes › APIs</b> filtrado por esa superficie. Credenciales nunca por chat.</span>
          </div>
        </MetricPanel>

        {/* 3b · cadencia de recogida + salud (SAN-300) — null until sources exist */}
        <CadencePanel slug={slug} />

        {/* 4 · integraciones operativas (T08–T10) */}
        {operationalIntegrations.length > 0 && (
          <MetricPanel>
            <div className="mb-2 flex items-center gap-2 font-heading text-[15px] font-bold text-navy">
              🔗 Integraciones operativas
              <span className="font-heading text-[12px] font-semibold text-[var(--sc-fg-muted)]">— tareas de conexión del proyecto (owner: tú)</span>
            </div>
            {operationalIntegrations.map((task) => {
              const done = isTaskCompleted(task.status);
              return (
                <div key={task.id} className="flex flex-wrap items-center gap-2.5 border-b border-dashed border-ink/15 py-2 last:border-0">
                  <span className={cn("grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-full border-2 border-ink text-[11px]", done ? "bg-sage text-white" : "bg-card text-[var(--sc-fg-subtle)]")}>{done ? "✓" : "○"}</span>
                  <div className="min-w-[200px] flex-1">
                    <div className="font-heading text-[12.5px] font-bold text-navy">{task.name}</div>
                    <div className="text-[11px] text-[var(--sc-fg-muted)]">{task.description || task.deliverable || ""}</div>
                  </div>
                  {done ? (
                    <MetricButton variant="paper" className="px-3 py-1" onClick={() => openSetupTaskChat(task)}>✏️ Editar</MetricButton>
                  ) : (
                    <MetricButton variant="navy" className="px-3 py-1" onClick={() => openSetupTaskChat(task)}>Conectar →</MetricButton>
                  )}
                </div>
              );
            })}
          </MetricPanel>
        )}
      </div>
    );
  }

  // Versiones is a right-side SlideOver (like Plan), not a full-screen view — this
  // renders only its body; the panel chrome + close come from <SlideOver>.
  function renderVersionsContent() {
    const versions = dashboardRec?.versions ?? [];
    const current = dashboardRec?.version ?? 0;
    return (
      <div className="space-y-4">
        <div className="rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-3 text-[12.5px] text-[var(--sc-fg-muted)]">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-heading text-[10.5px] font-bold uppercase tracking-wide text-rust">Historial append-only</span>
            <MetricChip tone="warn">actual v{current}</MetricChip>
          </div>
          Cada cambio por chat, arrastre o plantilla crea una versión inmutable. Revertir copia ese estado a una versión nueva, auditada.
        </div>
        {!dashboardRec?.configured ? (
          <MetricPanel className="p-6 text-center text-[var(--sc-fg-muted)]">El versionado requiere base de datos (no disponible en este entorno).</MetricPanel>
        ) : versions.length === 0 ? (
          <MetricPanel className="p-6 text-center text-[var(--sc-fg-muted)]">Aún no hay versiones guardadas.</MetricPanel>
        ) : (
          <div className="space-y-3">
            {versions.map((v) => {
              const isCurrent = v.version === current;
              return (
                <MetricPanel key={v.version} className={cn(isCurrent && "border-l-[7px] border-l-[var(--yellow)]")}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-heading text-xl font-bold text-navy">v{v.version}{isCurrent ? " · actual" : ""}</span>
                      <TriggerBadge trigger={v.trigger} />
                    </div>
                    {!isCurrent && (
                      <MetricButton type="button" variant="paper" onClick={() => revertTo(v.version)} disabled={saving}>
                        Revertir a v{v.version}
                      </MetricButton>
                    )}
                  </div>
                  <div className="text-[12px] text-[var(--sc-fg-muted)]">{v.date}{v.changes ? ` · ${v.changes}` : ""}</div>
                </MetricPanel>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function applyCalendarShortcut(kind: "week" | "month" | "prevMonth" | "90d" | "quarter" | "year") {
    const latestDate = allDaily[allDaily.length - 1]?.date || formatLocalIsoDate(new Date());
    const end = parseLocalIsoDate(latestDate);
    let from = new Date(end);
    let to = new Date(end);

    if (kind === "week") {
      const mondayOffset = (end.getDay() + 6) % 7;
      from = addLocalDays(end, -mondayOffset);
    } else if (kind === "month") {
      from = new Date(end.getFullYear(), end.getMonth(), 1);
    } else if (kind === "prevMonth") {
      from = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      to = new Date(end.getFullYear(), end.getMonth(), 0);
    } else if (kind === "90d") {
      from = addLocalDays(end, -89);
    } else if (kind === "quarter") {
      const quarterMonth = Math.floor(end.getMonth() / 3) * 3;
      from = new Date(end.getFullYear(), quarterMonth, 1);
    } else if (kind === "year") {
      from = new Date(end.getFullYear(), 0, 1);
    }

    setCustomFrom(formatLocalIsoDate(from));
    setCustomTo(formatLocalIsoDate(to));
    setRange("custom");
    setDatePickerOpen(false);
  }

  function renderDateRangeControl() {
    const dateButtonLabel = range === "custom"
      ? `${customFrom || "Desde"} -> ${customTo || "Hasta"}`
      : DATE_RANGE_OPTIONS.find((option) => option.value === range)?.label || "Periodo";
    return (
      <>
        <div className="flex flex-wrap items-center gap-1 rounded-sc-lg border-2 border-ink bg-aged p-1 shadow-pop-xs">
          {DATE_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setRange(option.value);
                setDatePickerOpen(false);
              }}
              className={cn(
                "rounded-sc-md px-2.5 py-1.5 font-heading text-[11px] font-bold transition-colors",
                range === option.value ? "border-2 border-ink bg-rust text-white shadow-pop-xs" : "text-[var(--sc-fg-muted)]"
              )}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDatePickerOpen((open) => !open)}
            className={cn(
              "rounded-sc-md px-2.5 py-1.5 font-heading text-[11px] font-bold transition-colors",
              range === "custom" ? "border-2 border-ink bg-navy text-white shadow-pop-xs" : "text-[var(--sc-fg-muted)]"
            )}
            aria-label="Abrir calendario"
          >
            📅 {range === "custom" ? dateButtonLabel : "Fechas"}
          </button>
        </div>
        {datePickerOpen && (
          <MetricPanel className="absolute right-0 top-full z-30 mt-2 w-[min(92vw,380px)] p-4">
            <div className="mb-3 font-heading text-[12px] font-bold uppercase tracking-wide text-rust">Atajos</div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[
                ["week", "Esta semana"],
                ["month", "Este mes"],
                ["prevMonth", "Mes pasado"],
                ["90d", "Últimos 90d"],
                ["quarter", "Este trimestre"],
                ["year", "Este año"],
              ].map(([kind, label]) => (
                <MetricButton key={kind} variant="paper" className="justify-start" onClick={() => applyCalendarShortcut(kind as "week" | "month" | "prevMonth" | "90d" | "quarter" | "year")}>
                  {label}
                </MetricButton>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="font-heading text-[11px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">
                Desde
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => {
                    setCustomFrom(event.target.value);
                    setRange("custom");
                  }}
                  className="mt-1 w-full rounded-sc-md border-2 border-ink bg-background px-2 py-2 font-sans text-[13px] text-foreground"
                />
              </label>
              <label className="font-heading text-[11px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">
                Hasta
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => {
                    setCustomTo(event.target.value);
                    setRange("custom");
                  }}
                  className="mt-1 w-full rounded-sc-md border-2 border-ink bg-background px-2 py-2 font-sans text-[13px] text-foreground"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <MetricButton variant="ghost" onClick={() => setDatePickerOpen(false)}>Cerrar</MetricButton>
              <MetricButton variant="navy" onClick={() => {
                setRange("custom");
                setDatePickerOpen(false);
              }}>
                Aplicar
              </MetricButton>
            </div>
          </MetricPanel>
        )}
      </>
    );
  }

  function renderActiveTab() {
    switch (tab) {
      case "overview": return renderOverview();
      case "surfaces": return renderSurfaces();
      case "channels": return renderChannels();
      case "conversion": return renderConversion();
      case "trends": return renderTrends();
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

      <div className="mx-auto max-w-[1180px]">
        <MetricPanel halftone className="mb-5 overflow-visible border-[3px] border-navy">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[240px] flex-1">
              <h1 className="font-heading text-3xl font-bold text-navy"><TitleIcon name="metrics" />{t("title")}</h1>
              <p className="mt-1 text-sm text-[var(--sc-fg-muted)]">
                {slug} {isDataTab && !setupOpen && <span className="ml-2 text-[11px]">{rangeLabel}</span>}
              </p>
            </div>
            <div className="relative flex flex-wrap items-center justify-end gap-2">
              {!setupOpen && (
                <>
                  {isDataTab && renderDateRangeControl()}
                  <MetricButton variant="paper" onClick={() => setPlanOpen(true)} disabled={!effectivePlan}>📋 Plan</MetricButton>
                  <MetricButton variant="navy" onClick={() => setVersionsOpen(true)}>
                    🕓 Versiones{(dashboardRec?.versions?.length ?? 0) > 0 ? ` ${dashboardRec?.versions.length}` : ""}
                  </MetricButton>
                  <MetricButton variant="cyan" onClick={() => openMerlin("Quiero editar el dashboard de métricas (North Star, KPIs, superficies o una métrica custom). ¿Qué cambiamos?")}>✨ Merlin</MetricButton>
                  <MetricButton variant="sage" onClick={handleCollect} disabled={collecting || !hasConnectedApis} title={hasConnectedApis ? "Recolecta ahora todas las fuentes conectadas" : "Conecta al menos una fuente para poder recolectar"}>
                    {collecting ? "↻ Recolectando…" : "↻ Recolectar"}
                  </MetricButton>
                  {collectStatus && <span className="text-[11px] text-[var(--sc-fg-muted)] whitespace-nowrap">{collectStatus}</span>}
                </>
              )}
              <a href={`/dashboard/${slug}/tasks/${METRICS_PROJECT_ID}`} className="inline-flex">
                <MetricButton variant="paper">📁 Proyecto: {METRICS_PROJECT_ID}</MetricButton>
              </a>
              <MetricButton variant={setupOpen ? "navy" : "paper"} onClick={() => { setSetupOpen((v) => !v); setSubView(null); setVersionsOpen(false); }}>
                ⚙️ Setup
              </MetricButton>
            </div>
          </div>
        </MetricPanel>

        {setupOpen ? renderSetup() : (
          <>
            <MetricTabBar tabs={tabs.map((item) => ({ ...item, icon: TAB_ICONS[item.key] }))} active={tab} onSelect={selectTab} />
            <div className="mt-5">{renderActiveTab()}</div>
          </>
        )}
      </div>

      <SlideOver open={planOpen} onClose={() => setPlanOpen(false)} title={`${t("plan")} — ${slug}`}>
        {effectivePlan ? <JsonViewer data={effectivePlan} /> : null}
      </SlideOver>

      <SlideOver open={versionsOpen} onClose={() => setVersionsOpen(false)} title={`🕓 Versiones — ${slug}`}>
        {renderVersionsContent()}
      </SlideOver>

      {setupDocPath && <DocSlideOver slug={slug} docPath={setupDocPath} onClose={() => setSetupDocPath(null)} />}
    </DashboardLayout>
  );
}
