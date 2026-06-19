import { useState, useMemo, useCallback, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useQuery } from "@tanstack/react-query";
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
import { useMetricsPlan } from "@/hooks/useMetrics";
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
  if (!src) return null;
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
// Main Component
// ============================================================

// Sub-tabs de Metrics (SAN-81): Funnel = la vista clásica por fuentes ·
// Partnerships = reporting por creator (cierra el loop de la calc).
type MetricsTab = "funnel" | "partnerships";

const METRICS_TABS: { key: MetricsTab; label: string }[] = [
  { key: "funnel", label: "Funnel" },
  { key: "partnerships", label: "Partnerships" },
];

export default function MetricsPage() {
  const slug = useSlugSync();
  const t = useTranslations("metrics");
  const router = useRouter();
  const [tab, setTab] = useState<MetricsTab>("funnel");
  const [range, setRange] = useState<DateRange>("7d");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectStatus, setCollectStatus] = useState("");
  const [planOpen, setPlanOpen] = useState(false);

  // Tab inicial por URL (?tab=partnerships) — enlazable desde chat/MCP.
  useEffect(() => {
    if (!router.isReady) return;
    const queryTab = Array.isArray(router.query.tab) ? router.query.tab[0] : router.query.tab;
    if (queryTab === "partnerships" || queryTab === "funnel") setTab(queryTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const selectTab = useCallback(
    (next: MetricsTab) => {
      setTab(next);
      const query = { ...router.query, tab: next } as Record<string, string | string[]>;
      if (next === "funnel") delete query.tab;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router],
  );

  const { data: plan, isLoading: planLoading } = useMetricsPlan(slug);

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

  // Calculate plan-driven KPIs
  const planKpis = useMemo(() => {
    if (!effectivePlan?.kpis) return [];
    const calculated: { name: string; value: string; category: string; isGood: boolean }[] = [];
    for (const kpi of effectivePlan.kpis) {
      if (!kpi.formula) continue;
      try {
        const parts = kpi.formula.match(/([a-z-]+)\.(\w+)/g) || [];
        let formula = kpi.formula;
        let canCalc = true;
        for (const part of parts) {
          const [src, metric] = part.split(".");
          const srcData = sources[src] || sources[src.replace(/-/g, "_")];
          if (srcData?.status === "ok") {
            const m = srcData.metrics.find((x) => x.name === metric && !x.dimensions);
            if (m) formula = formula.replace(part, String(m.value));
            else canCalc = false;
          } else canCalc = false;
        }
        if (canCalc) {
          // eslint-disable-next-line no-eval
          const result = eval(formula);
          if (typeof result === "number" && isFinite(result)) {
            const fmtVal = kpi.format === "currency" ? `\u20AC${result.toFixed(2)}` : kpi.format === "percent" ? `${result.toFixed(1)}%` : result.toFixed(1);
            const isGood = kpi.name === "CPL" ? result < 20 : true;
            calculated.push({ name: kpi.name, value: fmtVal, category: kpi.category, isGood });
          }
        }
      } catch { /* skip */ }
    }
    return calculated;
  }, [effectivePlan, sources]);

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
            {slug} {tab === "funnel" && <span className="text-[11px] ml-2">{rangeLabel}</span>}
          </p>
        </div>

        {tab === "funnel" && (
        <div className="flex items-center gap-2 flex-wrap">
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
        </div>
        )}
      </div>

      {/* Sub-tabs: Funnel \u00B7 Partnerships (SAN-81) */}
      <div className="flex flex-wrap gap-2 mb-6">
        {METRICS_TABS.map((item) => (
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

      {tab === "partnerships" && <MetricsPartnershipsTab slug={slug} />}

      {tab === "funnel" && (
      <>
      {/* Manual data banner */}
      {metricsData?.manualDataPending && metricsData.metricsSheet?.url && (
        <div className="flex items-center gap-3 p-3 mb-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
          <span className="text-lg">{"\uD83D\uDCDD"}</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-yellow-800">{t("manualBanner")}</div>
            <div className="text-[11px] text-muted-foreground">Signups, KYC, dep\u00f3sitos... Rellena la Sheet y pulsa Sincronizar.</div>
          </div>
          <a href={metricsData.metricsSheet.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-yellow-500 text-white font-semibold rounded text-[12px] whitespace-nowrap">
            Rellenar en Sheets {"\u2192"}
          </a>
          <button onClick={handleCollect} disabled={collecting} className="px-3 py-1.5 bg-sage text-white font-semibold rounded text-[12px] whitespace-nowrap disabled:opacity-50">
            Sincronizar
          </button>
          {collectStatus && <span className="text-[10px] text-muted-foreground">{collectStatus}</span>}
        </div>
      )}

      {/* No data but APIs connected — collect prompt */}
      {!hasData && hasConnectedApis && (
        <div className="border-2 border-sage rounded-lg bg-green-50 p-5 text-center mb-6">
          <div className="text-xl mb-2">{"\u2705"} APIs conectadas: {Object.entries(metricsData?.dataSources || {}).filter(([, v]) => v.status === "connected").map(([k]) => k.toUpperCase()).join(", ")}</div>
          <div className="text-[13px] text-muted-foreground mb-3">Las APIs est\u00e1n conectadas pero a\u00fan no se han recolectado datos. Pulsa el bot\u00f3n para lanzar la primera recolecci\u00f3n.</div>
          <button onClick={handleCollect} disabled={collecting} className="px-6 py-2.5 bg-sage text-white font-bold rounded-md text-sm disabled:opacity-50">
            Recolectar datos ahora
          </button>
          {collectStatus && <div className="mt-2 text-[12px] text-muted-foreground">{collectStatus}</div>}
        </div>
      )}

      {/* Plan-driven funnel card */}
      {effectivePlan?.funnel && hasData && (
        <PlanFunnelCard plan={effectivePlan} sources={sources} metricsData={metricsData || {}} />
      )}

      {/* Health KPI grid */}
      {healthCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
          {healthCards.map((card) => (
            <KpiCard key={card.label} value={card.value} label={card.label} delta={card.delta} status={card.status} />
          ))}
        </div>
      )}

      {/* Source pills */}
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

      {/* Dynamic metric modules grid (draggable) */}
      {planLoading ? (
        <p className="text-muted-foreground">Cargando m\u00f3dulos de m\u00e9tricas...</p>
      ) : orderedModules.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedModules.map((m) => m.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {orderedModules.map((mod) => (
                <SortableModuleCard
                  key={mod.id}
                  mod={mod}
                  expanded={expandedModule === mod.id}
                  onToggleExpand={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}
                >
                  {renderModuleContent(mod)}
                </SortableModuleCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : !hasData && !hasConnectedApis ? (
        <div className="border-[3px] border-ink rounded-lg bg-card p-10 shadow-comic text-center">
          <p className="text-muted-foreground">{t("noModules")}</p>
          <p className="text-xs text-muted-foreground mt-2">{t("emptyData")}</p>
        </div>
      ) : null}

      {/* Monitoring / Performance analysis */}
      {monitoring?.health_score && (
        <div className="mt-6 border-[3px] border-ink rounded-lg bg-card p-5 shadow-comic">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center font-heading text-xl text-white border-2 border-ink"
              style={{
                background: (monitoring.health_score.score || 0) >= 70
                  ? "var(--sage)" : (monitoring.health_score.score || 0) >= 40
                    ? "var(--yellow)" : "var(--red, #ef4444)",
              }}
            >
              {monitoring.health_score.score || "\u2014"}
            </div>
            <div>
              <h2 className="font-semibold text-sm">{t("monitoring")}</h2>
              <p className="text-xs text-muted-foreground">{monitoring.health_score.summary || "Health score"}</p>
            </div>
          </div>
        </div>
      )}

      <SlideOver open={planOpen} onClose={() => setPlanOpen(false)} title={`${t("plan")} — ${slug}`}>
        {effectivePlan ? <JsonViewer data={effectivePlan} /> : null}
      </SlideOver>
      </>
      )}
    </DashboardLayout>
  );
}
