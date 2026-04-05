import { useRouter } from "next/router";
import { useState, useMemo, useCallback, useEffect } from "react";
import Head from "next/head";
import { useTranslations } from "next-intl";
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
import { KpiCard } from "@/components/shared/kpi-card";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
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

interface MetricModule {
  id: string;
  icon: string;
  name: string;
  summary: { label: string; value: string | number }[];
  detail?: { headers: string[]; rows: (string | number)[][] };
}

interface MetricsData {
  slug?: string;
  daily?: { date: string; sources: Record<string, { status: string; metrics: { name: string; value: number; dimensions?: Record<string, string> }[] }> }[];
  dataSources?: Record<string, { status: string }>;
  plan?: {
    label?: string;
    archetype?: string;
    activationEvent?: string;
    primaryKPI?: string;
    funnel?: { step: string; source: string; metric: string; manual?: boolean }[];
    kpis?: { name: string; category: string; formula?: string; format?: string; _calculatedValue?: string }[];
  };
  manualDataPending?: boolean;
  metricsSheet?: { url: string; spreadsheetId?: string };
  recommended?: { label: string; apiId?: string }[];
  modules?: MetricModule[];
  metrics_modules?: MetricModule[];
}

interface MonitoringData {
  health_score?: { score: number; summary: string };
  pending_recommendations?: { title: string; rationale?: string }[] | { recommendations: { title: string; rationale?: string }[] };
}

// ============================================================
// Date range options
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

function mVal(src: { metrics: { name: string; value: number; dimensions?: Record<string, string> }[] }, name: string): number | null {
  const m = src.metrics.find((x) => x.name === name && !x.dimensions);
  return m ? m.value : null;
}

function calcDelta(current: number | null, prev: number | null): HealthCard["delta"] {
  if (current == null || prev == null || prev === 0) return undefined;
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0) return { value: `+${pct}%`, direction: "up" };
  if (pct < 0) return { value: `${pct}%`, direction: "down" };
  return { value: "0%", direction: "flat" };
}

function normSources(daily: MetricsData["daily"], days: number): Record<string, { status: string; metrics: { name: string; value: number; dimensions?: Record<string, string> }[] }> {
  if (!daily || daily.length === 0) return {};
  const sorted = [...daily].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const entries = days === 0 ? sorted : sorted.slice(-days);
  const merged: Record<string, { status: string; metrics: { name: string; value: number; dimensions?: Record<string, string> }[] }> = {};
  for (const entry of entries) {
    for (const [srcName, srcData] of Object.entries(entry.sources || {})) {
      if (srcData.status !== "ok") continue;
      if (!merged[srcName]) merged[srcName] = { status: "ok", metrics: [] };
      merged[srcName].metrics.push(...(srcData.metrics || []));
    }
  }
  // Simple aggregation: keep latest value per metric name (without dimensions)
  for (const srcData of Object.values(merged)) {
    const byKey: Record<string, { name: string; value: number; dimensions?: Record<string, string>; _count: number }> = {};
    const feeds: typeof srcData.metrics = [];
    const feedNames = new Set(["recentLead", "postDetail", "recentConversation", "pipeline", "sourceBreakdown", "topPage"]);
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
    srcData.metrics = [
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ...Object.values(byKey).map(({ _count, ...rest }) => rest),
      ...feeds,
    ];
  }
  return merged;
}

// ============================================================
// Sortable Module Card
// ============================================================

function SortableModuleCard({ mod }: { mod: MetricModule }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-2 border-border rounded-xl bg-card transition-colors hover:border-rust",
        isDragging && "border-dashed border-rust"
      )}
    >
      {/* Header with drag handle */}
      <div
        className="flex justify-between items-center px-5 pt-4 pb-3 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <h3 className="font-heading text-[15px] font-bold flex items-center gap-2">
          <span className="text-muted-foreground select-none">{"\u2630"}</span>
          {mod.icon} {mod.name}
        </h3>
        {mod.detail && (
          <button
            onClick={(e) => { e.stopPropagation(); setDetailOpen((v) => !v); }}
            className={cn(
              "bg-transparent border-none cursor-pointer text-muted-foreground text-[16px] p-1 transition-transform",
              detailOpen && "rotate-180"
            )}
          >
            {"\u25BC"}
          </button>
        )}
      </div>

      {/* KPI summary row */}
      <div className="px-5 pb-4">
        <div className="flex gap-4 flex-wrap">
          {mod.summary.map((kpi, i) => (
            <div key={i} className="text-center min-w-[70px]">
              <div className="text-[22px] font-bold font-heading">{kpi.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{kpi.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible detail section */}
      {mod.detail && detailOpen && (
        <div className="border-t border-border px-5 py-4 text-[13px]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {mod.detail.headers.map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      "text-[10px] uppercase tracking-wide text-muted-foreground font-semibold p-1",
                      i > 0 && "text-right"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mod.detail.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-border">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        "p-1.5",
                        ci > 0 && "text-right font-heading font-semibold",
                        typeof cell === "number" && cell > 0 && "text-sage",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function MetricsPage() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const t = useTranslations("metrics");
  const [range, setRange] = useState<DateRange>("7d");

  // Fetch metrics plan
  const { data: plan, isLoading: planLoading } = useMetricsPlan(slug);

  // Fetch full metrics data
  const { data: metricsData } = useQuery<MetricsData>({
    queryKey: ["metrics-data", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics?slug=${slug}`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  // Fetch monitoring
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

  // Module ordering (persisted in localStorage)
  const [moduleOrder, setModuleOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!slug) return;
    const stored = localStorage.getItem(`mc-metrics-order-${slug}`);
    if (stored) {
      try { setModuleOrder(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, [slug]);

  const saveOrder = useCallback(
    (order: string[]) => {
      setModuleOrder(order);
      if (slug) localStorage.setItem(`mc-metrics-order-${slug}`, JSON.stringify(order));
    },
    [slug]
  );

  // Aggregate data for selected range
  const days = RANGE_DAYS[range];
  const sources = useMemo(() => normSources(metricsData?.daily, days), [metricsData?.daily, days]);
  const prevSources = useMemo(() => {
    if (!metricsData?.daily || days === 0) return {};
    const sorted = [...metricsData.daily].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const prevEntries = sorted.slice(-days * 2, -days);
    return normSources(prevEntries, 0);
  }, [metricsData?.daily, days]);

  // Health KPI cards
  const healthCards: HealthCard[] = useMemo(() => {
    const cards: HealthCard[] = [];
    const ga4 = sources.ga4;
    const gsc = sources.gsc;
    const ads = sources["meta-ads"] || sources.meta_ads;
    const ghl = sources.ghl;
    const pGa4 = prevSources.ga4;
    const pGsc = prevSources.gsc;

    if (ga4?.status === "ok") {
      const v = mVal(ga4, "sessions") || 0;
      const pv = pGa4 ? mVal(pGa4, "sessions") : null;
      cards.push({ label: "Sessions", value: v.toLocaleString(), delta: calcDelta(v, pv), status: v > 0 ? "good" : "neutral" });
      const usr = mVal(ga4, "totalUsers") || 0;
      const pUsr = pGa4 ? mVal(pGa4, "totalUsers") : null;
      cards.push({ label: "Users", value: usr.toLocaleString(), delta: calcDelta(usr, pUsr), status: "neutral" });
      const bounce = mVal(ga4, "bounceRate");
      if (bounce != null) {
        const pct = Math.round(bounce * 100);
        cards.push({ label: "Bounce Rate", value: `${pct}%`, status: pct > 70 ? "bad" : pct > 50 ? "warn" : "good" });
      }
    }
    if (gsc?.status === "ok") {
      const v = mVal(gsc, "impressions") || 0;
      const pv = pGsc ? mVal(pGsc, "impressions") : null;
      cards.push({ label: "SEO Impressions", value: v.toLocaleString(), delta: calcDelta(v, pv), status: v > 0 ? "good" : "neutral" });
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
    return cards;
  }, [sources, prevSources]);

  // Source pills
  const sourcePills: SourcePill[] = useMemo(() => {
    const ds = metricsData?.dataSources || {};
    return Object.keys(ds).map((s) => {
      const src = sources[s] || sources[s.replace(/_/g, "-")] || sources[s.replace(/-/g, "_")];
      const st = src ? (src.status === "ok" ? "ok" : "error") : "disconnected";
      return { name: s, label: SOURCE_NAMES[s] || s, status: st as SourcePill["status"] };
    });
  }, [metricsData?.dataSources, sources]);

  // Modules (from plan or direct)
  const rawModules: MetricModule[] = useMemo(() => {
    return plan?.modules || plan?.metrics_modules || metricsData?.modules || metricsData?.metrics_modules || [];
  }, [plan, metricsData]);

  const orderedModules = useMemo(() => {
    if (moduleOrder.length === 0) return rawModules;
    const byId = Object.fromEntries(rawModules.map((m) => [m.id, m]));
    const ordered = moduleOrder.map((id) => byId[id]).filter(Boolean);
    const remaining = rawModules.filter((m) => !moduleOrder.includes(m.id));
    return [...ordered, ...remaining];
  }, [rawModules, moduleOrder]);

  // DnD sensors
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

  // Monitoring recommendations
  const recommendations = useMemo(() => {
    if (!monitoring?.pending_recommendations) return [];
    const raw = monitoring.pending_recommendations;
    if (Array.isArray(raw)) return raw.slice(0, 5);
    return (raw.recommendations || []).slice(0, 5);
  }, [monitoring]);

  const hasData = (metricsData?.daily && metricsData.daily.length > 0) || rawModules.length > 0;

  return (
    <DashboardLayout>
      <Head>
        <title>{t("title")} — {slug} — Mission Control</title>
      </Head>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{slug}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range selector */}
          <DateRangeFilter
            options={DATE_RANGE_OPTIONS}
            value={range}
            onChange={(v) => setRange(v as DateRange)}
          />

          {/* Quick links */}
          <div className="flex gap-1.5">
            <a
              href={`/dashboard/${slug}/apis`}
              className="px-3 py-1 border border-border rounded-md text-[11px] font-semibold text-muted-foreground bg-background hover:border-rust transition-colors"
            >
              {"\uD83D\uDD0C"} {t("apis")}
            </a>
            {metricsData?.plan && (
              <span className="px-3 py-1 border border-border rounded-md text-[11px] font-semibold text-muted-foreground bg-background">
                {"\uD83D\uDCCB"} {t("plan")}
              </span>
            )}
            {metricsData?.metricsSheet?.url && (
              <a
                href={metricsData.metricsSheet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 border border-border rounded-md text-[11px] font-semibold text-muted-foreground bg-background hover:border-rust transition-colors"
              >
                {"\uD83D\uDCCA"} {t("sheets")}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Manual data banner */}
      {metricsData?.manualDataPending && metricsData.metricsSheet?.url && (
        <div className="flex items-center gap-3 p-3 mb-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
          <span className="text-lg">{"\uD83D\uDCDD"}</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-yellow-800">{t("manualBanner")}</div>
            <div className="text-[11px] text-muted-foreground">Signups, KYC, dep\u00f3sitos... Rellena la Sheet y sincroniza.</div>
          </div>
          <a
            href={metricsData.metricsSheet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-yellow-500 text-white font-semibold rounded text-[12px] whitespace-nowrap"
          >
            Rellenar en Sheets {"\u2192"}
          </a>
        </div>
      )}

      {/* Health KPI grid */}
      {healthCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
          {healthCards.map((card) => (
            <KpiCard
              key={card.label}
              value={card.value}
              label={card.label}
              delta={card.delta}
              status={card.status}
            />
          ))}
        </div>
      )}

      {/* Source pills */}
      {sourcePills.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {sourcePills.map((pill) => {
            const dotColor = pill.status === "ok" ? "bg-green-500" : pill.status === "error" ? "bg-red-500" : "bg-yellow-400";
            return (
              <span
                key={pill.name}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-card border border-border rounded-full text-[12px] font-medium"
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
                {pill.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Metric modules grid (draggable) */}
      {planLoading ? (
        <p className="text-muted-foreground">Cargando m\u00f3dulos de m\u00e9tricas...</p>
      ) : orderedModules.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedModules.map((m) => m.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {orderedModules.map((mod) => (
                <SortableModuleCard key={mod.id} mod={mod} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : !hasData ? (
        <div className="border-[3px] border-ink rounded-lg bg-card p-10 shadow-comic text-center">
          <p className="text-muted-foreground">{t("noModules")}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {t("range.7d" as const)} | {t("emptyData")}
          </p>
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
                  ? "var(--sage)"
                  : (monitoring.health_score.score || 0) >= 40
                    ? "var(--yellow)"
                    : "var(--red, #ef4444)",
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

      {/* Next steps recommendations */}
      {recommendations.length > 0 && (
        <div className="mt-4">
          <CollapsibleSection title={t("nextSteps")} icon={"\u2192"} defaultOpen>
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-rust mt-0.5">{"\u2192"}</span>
                  <div>
                    <span className="font-medium">{rec.title}</span>
                    {rec.rationale && (
                      <p className="text-xs text-muted-foreground">{rec.rationale}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </DashboardLayout>
  );
}
