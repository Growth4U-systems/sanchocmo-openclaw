"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { KpiCard } from "@/components/shared/kpi-card";
import { cn } from "@/lib/utils";
import { TRUST_PILLAR_KEYS, type TrustPillarKey } from "@/lib/trust-score/client";

// ============================================================
// Metrics Column — Faithful port of renderV2Metrics()
// ============================================================

interface MetricsSource {
  status: string;
  metrics: MetricEntry[];
}

interface MetricEntry {
  name: string;
  value: number;
  dimensions?: Record<string, string>;
}

interface MetricsPlan {
  label?: string;
  archetype?: string;
  funnel?: FunnelStep[];
  kpis?: PlanKpi[];
}

interface FunnelStep {
  step: string;
  source: string;
  metric: string;
}

interface PlanKpi {
  name: string;
  metric: string;
  source: string;
  category: string;
  format?: string;
}

interface HealthScore {
  overall?: number;
  overallScore?: number;
  trend?: string;
  previous_week?: number;
  last_weekly_report?: string;
  by_category?: Record<string, { score: number; trend?: string }>;
  categories?: Record<string, { score: number; trend?: string }>;
  active_alerts?: unknown[];
  topAlerts?: unknown[];
}

interface MetricsColumnProps {
  slug: string;
}

interface TrustScoreData {
  primary?: {
    trust_score?: number;
    pillars?: Record<TrustPillarKey, { score?: number; findings?: string[] }>;
    top_gaps?: string[];
    verdict?: string;
  };
  competitors?: Array<{ brand_name?: string; trust_score?: number }>;
  comparison?: { primary_gaps?: string[] };
  fetchedAt?: string;
  _stale?: boolean;
}

// --- Helpers ---

function mGet(src: MetricsSource | undefined, name: string): number | null {
  if (!src?.metrics) return null;
  const m = src.metrics.find(
    (x) => x.name === name && (!x.dimensions || x.dimensions.source === "manual")
  );
  return m ? m.value : null;
}

function fmt(v: number | null): string {
  if (v === null) return "\u2014";
  if (v >= 1000) return v.toLocaleString();
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function deltaCalc(
  cur: number | null,
  prev: number | null
): { value: string; direction: "up" | "down" | "flat" } | undefined {
  if (cur === null || prev === null || prev === 0) return undefined;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return undefined;
  return {
    value: `${Math.abs(pct)}%`,
    direction: pct > 0 ? "up" : "down",
  };
}

function psiColor(score: number): string {
  if (score >= 90) return "#22A06B";
  if (score >= 50) return "#E5A100";
  return "#DE350B";
}

const DATE_RANGE_OPTIONS = [
  { label: "7 dias", value: "7" },
  { label: "30 dias", value: "30" },
  { label: "Todo", value: "0" },
];

const SOURCE_CONFIG = [
  {
    key: "ga4",
    alt: "google-analytics",
    label: "Google Analytics",
    icon: "\uD83D\uDD0D",
    metrics: [
      { n: "sessions", l: "Sesiones" },
      { n: "totalUsers", l: "Usuarios" },
      { n: "newUsers", l: "Nuevos" },
      { n: "bounceRate", l: "Bounce", fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
      {
        n: "averageSessionDuration",
        l: "Duracion",
        fmt: (v: number) => {
          const m = Math.floor(v / 60);
          const s = Math.round(v % 60);
          return `${m}:${String(s).padStart(2, "0")}`;
        },
      },
    ],
  },
  {
    key: "gsc",
    alt: "google-search-console",
    label: "Search Console",
    icon: "\uD83D\uDD0E",
    metrics: [
      { n: "clicks", l: "Clicks" },
      { n: "impressions", l: "Impresiones" },
      { n: "ctr", l: "CTR", fmt: (v: number) => `${v.toFixed(1)}%` },
      { n: "position", l: "Posicion", fmt: (v: number) => v.toFixed(1) },
    ],
  },
  {
    key: "meta-ads",
    alt: "meta",
    label: "Meta Ads",
    icon: "\uD83D\uDCE3",
    metrics: [
      { n: "impressions", l: "Impresiones" },
      { n: "clicks", l: "Clicks" },
      { n: "ctr", l: "CTR", fmt: (v: number) => `${v.toFixed(1)}%` },
      { n: "cpc", l: "CPC", fmt: (v: number) => `\u20AC${v.toFixed(2)}` },
      { n: "leads", l: "Leads" },
    ],
  },
  {
    key: "metricool",
    label: "Social",
    icon: "\uD83D\uDCF1",
    metrics: [
      { n: "impressions", l: "Impresiones" },
      { n: "clicks", l: "Clicks" },
      { n: "likes", l: "Likes" },
      { n: "avgEngagement", l: "Engagement", fmt: (v: number) => `${v.toFixed(1)}%` },
    ],
  },
  {
    key: "ghl",
    label: "CRM (GHL)",
    icon: "\uD83D\uDCDE",
    metrics: [
      { n: "newContacts", l: "Nuevos contactos" },
      { n: "totalContacts", l: "Total contactos" },
      { n: "appointments", l: "Citas" },
    ],
  },
];

const CAT_LABELS: Record<string, string> = {
  traffic: "\uD83D\uDD0D Trafico",
  seo: "\uD83D\uDD0E SEO",
  paid: "\uD83D\uDCE3 Paid Ads",
  social: "\uD83D\uDCF1 Social",
  crm: "\uD83D\uDCDE CRM",
  funnel: "\uD83D\uDD04 Funnel",
  efficiency: "\u26A1 Eficiencia",
};

const HEALTH_CAT_LABELS: Record<string, string> = {
  funnel: "Funnel",
  paid: "Paid",
  traffic: "Trafico",
  seo: "SEO",
  social: "Social",
};

const TRUST_PILLAR_LABELS: Record<TrustPillarKey, string> = {
  borrowed_trust: "Borrowed Trust",
  serp_trust: "SERP Trust",
  brand_assets: "Brand Assets",
  geo_presence: "GEO Presence",
  outbound_readiness: "Outbound Readiness",
  demand_engine: "Demand Engine",
};

function tsColor(score: number): string {
  if (score >= 70) return "#4A5D23";
  if (score >= 40) return "#B8860B";
  return "#C45D35";
}

// Aggregate entries across date range
function aggregate(entries: Array<{ sources?: Record<string, MetricsSource> }>) {
  const merged: Record<string, MetricsSource> = {};
  const feedNames = new Set([
    "recentLead",
    "postDetail",
    "recentConversation",
    "pipeline",
    "sourceBreakdown",
    "topPage",
  ]);

  for (const entry of entries) {
    for (const [srcName, srcData] of Object.entries(entry.sources || {})) {
      if (srcData.status !== "ok") continue;
      if (!merged[srcName]) merged[srcName] = { status: "ok", metrics: [] };
      merged[srcName].metrics.push(...(srcData.metrics || []));
    }
  }

  for (const [, srcData] of Object.entries(merged)) {
    const byKey: Record<string, MetricEntry & { _count: number }> = {};
    const feeds: MetricEntry[] = [];

    for (const m of srcData.metrics) {
      if (feedNames.has(m.name)) {
        feeds.push(m);
        continue;
      }
      const dimKey = m.dimensions ? JSON.stringify(m.dimensions) : "";
      const key = m.name + "|" + dimKey;
      if (!byKey[key]) {
        byKey[key] = { ...m, _count: 1 };
      } else {
        const isRate =
          m.name.includes("Rate") ||
          m.name.includes("ctr") ||
          m.name.includes("cpc") ||
          m.name.includes("position") ||
          m.name.includes("Engagement") ||
          m.name.includes("bounce");
        if (isRate) {
          byKey[key].value =
            (byKey[key].value * byKey[key]._count + m.value) / (byKey[key]._count + 1);
        } else {
          byKey[key].value += m.value;
        }
        byKey[key]._count++;
      }
    }

    srcData.metrics = [
      ...Object.values(byKey).map((m) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _count: _unused, ...rest } = m;
        return rest;
      }),
      ...feeds,
    ];
  }

  return merged;
}

export function MetricsColumn({ slug }: MetricsColumnProps) {
  const [range, setRange] = useState("30");

  const { data: metricsData, isLoading } = useQuery({
    queryKey: ["metrics-v2", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics?slug=${slug}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });

  const { data: plan } = useQuery<MetricsPlan>({
    queryKey: ["metrics-plan", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/plan?slug=${slug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const { data: monData } = useQuery<{ health_score?: HealthScore; pending_recommendations_count?: number }>({
    queryKey: ["monitoring", slug],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring?slug=${slug}`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const { data: psiData } = useQuery({
    queryKey: ["pagespeed", slug],
    queryFn: async () => {
      const res = await fetch(`/api/pagespeed?slug=${slug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!slug,
    staleTime: 120_000,
  });

  const { data: tsData } = useQuery<TrustScoreData | null>({
    queryKey: ["trust-score", slug],
    queryFn: async () => {
      const res = await fetch(`/api/trust-score?slug=${slug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!slug,
    staleTime: 120_000,
  });

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-6 text-center">Cargando metricas...</div>;
  }

  const rolling = metricsData?.rolling || metricsData?.daily || [];
  const hasMetrics = rolling.length > 0 && rolling.some((d: Record<string, unknown>) => Object.keys((d as { sources?: Record<string, unknown> }).sources || {}).length > 0);

  // No metrics states
  if (!hasMetrics) {
    const ds = metricsData?.dataSources || {};
    const connectedApis = Object.entries(ds).filter(([, v]) => (v as { status: string }).status === "connected");

    return (
      <div>
        {connectedApis.length > 0 ? (
          <div className="bg-[#F0F7EE] border border-[#4A5D23] rounded-lg p-3 mb-3 flex items-center gap-2.5">
            <span className="text-base">{"\u2705"}</span>
            <div className="flex-1">
              <div className="text-xs font-bold text-[#4A5D23]">
                APIs conectadas: {connectedApis.map(([k]) => k.toUpperCase()).join(", ")}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Esperando primera recoleccion de datos
              </div>
            </div>
          </div>
        ) : (
          <Link
            href={`/dashboard/${slug}/settings?tab=apis`}
            className="block bg-[#FEF3EE] border border-rust rounded-lg p-3 mb-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">{"\uD83D\uDD0C"}</span>
              <div className="flex-1">
                <div className="text-xs font-bold text-rust">Conecta tus APIs</div>
                <div className="text-[10px] text-muted-foreground">
                  GA4, Search Console, Meta Ads, CRM...
                </div>
              </div>
              <span className="text-[11px] font-bold text-rust">Configurar {"\u2192"}</span>
            </div>
          </Link>
        )}

        {/* PageSpeed placeholder */}
        <PageSpeedSection data={psiData} />
        <TrustScoreSection data={tsData} history={metricsData?.daily} />
      </div>
    );
  }

  // Filter by date range
  const rangeDays = parseInt(range);
  let filtered = rolling;
  if (rangeDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    filtered = rolling.filter(
      (d: Record<string, unknown>) => ((d as { dateRange?: { from?: string }; date?: string }).dateRange?.from || (d as { date?: string }).date || "") >= cutoffStr
    );
    if (filtered.length === 0) filtered = rolling;
  }

  const src = aggregate(filtered);

  // Previous period for delta comparison
  let pSrc: Record<string, MetricsSource> = {};
  if (rangeDays > 0) {
    const cutoff2 = new Date();
    cutoff2.setDate(cutoff2.getDate() - rangeDays * 2);
    const cutoff1 = new Date();
    cutoff1.setDate(cutoff1.getDate() - rangeDays);
    const prevFiltered = rolling.filter((d: Record<string, unknown>) => {
      const from = (d as { dateRange?: { from?: string }; date?: string }).dateRange?.from || (d as { date?: string }).date || "";
      return from >= cutoff2.toISOString().slice(0, 10) && from < cutoff1.toISOString().slice(0, 10);
    });
    if (prevFiltered.length > 0) pSrc = aggregate(prevFiltered);
  }

  return (
    <div>
      {/* Date range filter */}
      <div className="mb-3">
        <DateRangeFilter options={DATE_RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>

      {/* Health Score */}
      {monData?.health_score && (
        <HealthScoreCard
          hs={monData.health_score}
          recCount={monData.pending_recommendations_count || 0}
        />
      )}

      {/* Plan mode: funnel + categorized KPIs */}
      {plan?.funnel && plan.funnel.length > 0 ? (
        <PlanMetrics plan={plan} src={src} pSrc={pSrc} />
      ) : (
        <GenericMetrics src={src} pSrc={pSrc} />
      )}

      {/* PageSpeed */}
      <PageSpeedSection data={psiData} />

      {/* Trust Score */}
      <TrustScoreSection data={tsData} history={metricsData?.daily} />

      {/* Link to full metrics */}
      <div className="text-center mt-2">
        <Link href={`/dashboard/${slug}/metrics`} className="text-xs text-rust hover:underline">
          Ver metricas completas {"\u2192"}
        </Link>
      </div>
    </div>
  );
}

// --- Sub-components ---

function HealthScoreCard({ hs, recCount }: { hs: HealthScore; recCount: number }) {
  const score = hs.overall ?? hs.overallScore ?? 0;
  const cats = hs.by_category || hs.categories || {};
  const alerts = hs.active_alerts || hs.topAlerts || [];
  const alertCount = Array.isArray(alerts) ? alerts.length : 0;
  const trend = hs.trend === "improving" ? "\u2191" : hs.trend === "declining" ? "\u2193" : "\u2192";
  const trendColor =
    hs.trend === "improving" ? "text-[#4A5D23]" : hs.trend === "declining" ? "text-rust" : "text-muted-foreground";
  const scoreColor = score >= 70 ? "#4A5D23" : score >= 40 ? "#B8860B" : "#C45D35";

  return (
    <div className="bg-card border border-border rounded-lg p-3.5 mb-3.5">
      <div className="flex items-center gap-3.5 mb-3">
        <div
          className="w-[60px] h-[60px] rounded-full border-4 flex items-center justify-center shrink-0"
          style={{ borderColor: scoreColor }}
        >
          <span className="text-[22px] font-extrabold" style={{ color: scoreColor }}>
            {score}
          </span>
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-bold tracking-wide">
            Health Score <span className={cn("text-[15px] ml-0.5", trendColor)}>{trend}</span>
          </div>
          {hs.previous_week && (
            <div className="text-[9px] text-muted-foreground mt-0.5">
              vs {hs.previous_week} semana anterior
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 items-end">
          {alertCount > 0 && (
            <span className="bg-rust text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {alertCount} alerta{alertCount > 1 ? "s" : ""}
            </span>
          )}
          {recCount > 0 && (
            <span className="bg-[#4A5D23] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {recCount} rec.
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5">
        {Object.entries(cats).map(([k, v]) => {
          const barColor = v.score >= 70 ? "#4A5D23" : v.score >= 40 ? "#B8860B" : "#C45D35";
          const tArr = v.trend === "up" ? "\u2191" : v.trend === "down" ? "\u2193" : "\u2192";
          return (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-[52px]">
                {HEALTH_CAT_LABELS[k] || k}
              </span>
              <div className="flex-1 h-1.5 bg-[#E5E2DC] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${v.score}%`, background: barColor }}
                />
              </div>
              <span className="text-[10px] font-bold w-7 text-right" style={{ color: barColor }}>
                {v.score}{" "}
                <span className="text-[8px]">{tArr}</span>
              </span>
            </div>
          );
        })}
      </div>

      {hs.last_weekly_report && (
        <div className="text-[9px] text-muted-foreground mt-2.5 text-right">
          Ultimo analisis: {hs.last_weekly_report}
        </div>
      )}
    </div>
  );
}

function PlanMetrics({
  plan,
  src,
  pSrc,
}: {
  plan: MetricsPlan;
  src: Record<string, MetricsSource>;
  pSrc: Record<string, MetricsSource>;
}) {
  const categories: Record<string, Array<PlanKpi & { value: number | null }>> = {};

  for (const kpi of plan.kpis || []) {
    const cat = kpi.category || "other";
    if (!categories[cat]) categories[cat] = [];
    let val: number | null = null;
    if (kpi.source && kpi.metric && src[kpi.source]) {
      val = mGet(src[kpi.source], kpi.metric);
    }
    categories[cat].push({ ...kpi, value: val });
  }

  return (
    <div>
      {/* Funnel bar */}
      {plan.funnel && plan.funnel.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-3 mb-3">
          <div className="text-[11px] font-bold mb-2">
            {"\uD83D\uDD04"} Funnel {"\u2014"} {plan.label || plan.archetype || ""}
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {plan.funnel.map((step, i) => {
              const val = step.source ? mGet(src[step.source], step.metric) : null;
              const pVal = step.source && pSrc[step.source] ? mGet(pSrc[step.source], step.metric) : null;
              const d = deltaCalc(val, pVal);
              return (
                <div key={step.step} className="flex items-center gap-1">
                  <div className="text-center min-w-[56px]">
                    <div className="text-[15px] font-bold">{val !== null ? fmt(val) : "\u2014"}</div>
                    <div className="text-[9px] text-muted-foreground">{step.step}</div>
                    {d && (
                      <span
                        className={cn(
                          "text-[9px] font-semibold",
                          d.direction === "up" ? "text-green-600" : "text-red-500"
                        )}
                      >
                        {d.direction === "up" ? "\u2191" : "\u2193"} {d.value}
                      </span>
                    )}
                  </div>
                  {i < plan.funnel!.length - 1 && (
                    <span className="text-muted-foreground text-[10px]">{"\u2192"}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPIs by category */}
      {Object.entries(categories).map(([cat, kpis]) => {
        const hasValues = kpis.some((k) => k.value !== null);
        if (!hasValues) return null;
        return (
          <div key={cat} className="mb-3">
            <div className="flex items-center gap-2 text-[11px] font-bold mb-1.5">
              {CAT_LABELS[cat] || cat}
              <span className="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-semibold">
                OK
              </span>
            </div>
            {kpis.map((kpi) => {
              if (kpi.value === null) return null;
              let display: string;
              if (kpi.format === "percent") display = `${Number(kpi.value).toFixed(1)}%`;
              else if (kpi.format === "seconds") {
                const m = Math.floor(kpi.value / 60);
                const s = Math.round(kpi.value % 60);
                display = `${m}:${String(s).padStart(2, "0")}`;
              } else if (
                kpi.name.includes("Spend") ||
                kpi.name.includes("CPC") ||
                kpi.name.includes("CPL")
              ) {
                display = `\u20AC${Number(kpi.value).toFixed(2)}`;
              } else {
                display = fmt(kpi.value);
              }
              return (
                <div
                  key={kpi.metric}
                  className="flex justify-between py-1 text-[11px] border-b border-border/50 last:border-0"
                >
                  <span className="text-muted-foreground">{kpi.name}</span>
                  <span className="font-semibold">{display}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function GenericMetrics({
  src,
  pSrc,
}: {
  src: Record<string, MetricsSource>;
  pSrc: Record<string, MetricsSource>;
}) {
  // Build KPI cards
  const ga = src.ga4;
  const pGa = pSrc.ga4;
  const meta = src["meta-ads"];
  const pMeta = pSrc["meta-ads"];
  const ghl = src.ghl;
  const pGhl = pSrc.ghl;

  const kpis: Array<{ v: string; l: string; c: string; d: ReturnType<typeof deltaCalc> }> = [];

  const sessions = mGet(ga, "sessions");
  const pSessions = mGet(pGa, "sessions");
  if (sessions !== null) kpis.push({ v: fmt(sessions), l: "Sesiones", c: "#0065FF", d: deltaCalc(sessions, pSessions) });

  const spend = mGet(meta, "spend");
  const pSpend = mGet(pMeta, "spend");
  if (spend !== null) kpis.push({ v: `\u20AC${Number(spend).toFixed(0)}`, l: "Ad Spend", c: "#C45D35", d: deltaCalc(spend, pSpend) });

  const leads = mGet(meta, "leads");
  const pLeads = mGet(pMeta, "leads");
  if (leads !== null) kpis.push({ v: fmt(leads), l: "Leads", c: "#22A06B", d: deltaCalc(leads, pLeads) });

  const contacts = mGet(ghl, "totalContacts") || mGet(ghl, "newContacts");
  const pContacts = mGet(pGhl, "totalContacts") || mGet(pGhl, "newContacts");
  if (contacts !== null) kpis.push({ v: fmt(contacts), l: "CRM", c: "#00B8D9", d: deltaCalc(contacts, pContacts) });

  return (
    <div>
      {/* KPI grid */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {kpis.slice(0, 4).map((k) => (
            <KpiCard
              key={k.l}
              value={k.v}
              label={k.l}
              delta={k.d}
            />
          ))}
        </div>
      )}

      {/* Source breakdown */}
      {SOURCE_CONFIG.map((sc) => {
        const s = src[sc.key] || (sc.alt ? src[sc.alt] : undefined);
        if (!s?.metrics || s.metrics.length === 0) return null;
        const isOk = s.status !== "error";

        const rows: Array<{ l: string; v: string }> = [];
        for (const mDef of sc.metrics) {
          const val = mGet(s, mDef.n);
          if (val === null) continue;
          const display = mDef.fmt ? mDef.fmt(val) : fmt(val);
          rows.push({ l: mDef.l, v: display });
        }
        if (rows.length === 0) return null;

        return (
          <div key={sc.key} className="mb-3">
            <div className="flex items-center gap-2 text-[11px] font-bold mb-1.5">
              {sc.icon} {sc.label}
              <span
                className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded font-semibold",
                  isOk ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                )}
              >
                {isOk ? "OK" : "ERR"}
              </span>
            </div>
            {rows.map((row) => (
              <div
                key={row.l}
                className="flex justify-between py-1 text-[11px] border-b border-border/50 last:border-0"
              >
                <span className="text-muted-foreground">{row.l}</span>
                <span className="font-semibold">{row.v}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PageSpeedSection({ data }: { data: { mobile?: Record<string, number>; fetchedAt?: string; _stale?: boolean } | null | undefined }) {
  const m = data?.mobile || {};
  const scores = [
    { key: "performance", label: "Perf", value: m.performance },
    { key: "seo", label: "SEO", value: m.seo },
    { key: "accessibility", label: "A11y", value: m.accessibility },
    { key: "bestPractices", label: "Practicas", value: m.bestPractices },
  ];

  const hasScores = scores.some((s) => s.value != null);
  const age = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
    : "";

  return (
    <div className="mt-3 mb-2">
      <div className="flex items-center justify-between text-[11px] font-bold mb-2">
        {"\u26A1"} PageSpeed Insights
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {scores.map((s) => {
          const score = s.value ?? 0;
          const color = hasScores ? psiColor(score) : "#E5E2DC";
          return (
            <div key={s.key} className="text-center">
              <div
                className="w-10 h-10 rounded-full border-[3px] flex items-center justify-center mx-auto mb-1 text-sm font-extrabold"
                style={{ borderColor: color, color: hasScores ? color : "#7A7A7A" }}
              >
                {hasScores ? score : "\u2026"}
              </div>
              <div className="text-[9px] text-muted-foreground">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Core Web Vitals */}
      {m.lcp != null && (
        <div className="bg-muted/30 rounded-md p-2 mb-1">
          <div className="text-[9px] font-bold text-muted-foreground mb-1">CORE WEB VITALS</div>
          <CwvRow label="LCP" value={m.lcp} unit="s" good={2.5} bad={4.0} />
          <CwvRow label="CLS" value={m.cls ?? 0} unit="" good={0.1} bad={0.25} />
          <CwvRow label="TBT" value={m.tbt ?? 0} unit="ms" good={200} bad={600} />
        </div>
      )}

      {age && (
        <div className="text-[9px] text-muted-foreground text-center">
          {age}
          {data?._stale ? " (cache)" : ""} {"\u00B7"} Mobile
        </div>
      )}
    </div>
  );
}

function TrustScoreSection({
  data,
  history,
}: {
  data: TrustScoreData | null | undefined;
  history?: Array<{ date: string; sources?: Record<string, { metrics?: Array<{ name: string; value: number }> }> }>;
}) {
  const primary = data?.primary;
  const score = primary?.trust_score ?? null;
  const pillars = primary?.pillars || ({} as NonNullable<TrustScoreData["primary"]>["pillars"]);
  const gaps = data?.comparison?.primary_gaps || primary?.top_gaps || [];
  const competitors = data?.competitors || [];

  // Tendencia del score global desde la m\u00E9trica diaria persistida (sources.trust_score).
  const trend: number[] = (history || [])
    .map((d) => {
      const m = d.sources?.trust_score?.metrics?.find((x) => x.name === "trust_score");
      return m ? m.value : null;
    })
    .filter((v): v is number => v != null);
  // Delta dentro de la MISMA serie persistida (consistente con el sparkline): último vs anterior.
  const trendLast = trend.length ? trend[trend.length - 1] : null;
  const trendPrev = trend.length > 1 ? trend[trend.length - 2] : null;
  const delta = trendLast != null && trendPrev != null ? Math.round(trendLast - trendPrev) : null;

  const age = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
    : "";
  const hasData = score != null;
  const max = trend.length ? Math.max(...trend, 1) : 1;
  const bars = trend.slice(-14);

  return (
    <div className="mt-3 mb-2">
      <div className="flex items-center justify-between text-[11px] font-bold mb-2">
        <span>{"\uD83D\uDEE1\uFE0F"} Trust Score</span>
        {delta != null && delta !== 0 && (
          <span className={cn("text-[10px] font-semibold", delta > 0 ? "text-[#4A5D23]" : "text-rust")}>
            {delta > 0 ? "\u2191" : "\u2193"} {Math.abs(delta)}
          </span>
        )}
      </div>

      {/* Score global + sparkline */}
      <div className="flex items-center gap-3.5 mb-3">
        <div
          className="w-[52px] h-[52px] rounded-full border-4 flex items-center justify-center shrink-0"
          style={{ borderColor: hasData ? tsColor(score!) : "#E5E2DC" }}
        >
          <span className="text-[19px] font-extrabold" style={{ color: hasData ? tsColor(score!) : "#7A7A7A" }}>
            {hasData ? score : "\u2026"}
          </span>
        </div>
        {bars.length > 1 && (
          <div className="flex-1 flex items-end gap-0.5 h-[40px]">
            {bars.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: tsColor(v), opacity: 0.55 + (i / Math.max(1, bars.length - 1)) * 0.45 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 6 pilares */}
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5 mb-2">
        {TRUST_PILLAR_KEYS.map((k) => {
          const pScore = pillars?.[k]?.score ?? null;
          const barColor = pScore != null ? tsColor(pScore) : "#E5E2DC";
          return (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground w-[64px] truncate" title={TRUST_PILLAR_LABELS[k]}>
                {TRUST_PILLAR_LABELS[k]}
              </span>
              <div className="flex-1 h-1.5 bg-[#E5E2DC] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pScore ?? 0}%`, background: barColor }} />
              </div>
              <span className="text-[10px] font-bold w-6 text-right" style={{ color: barColor }}>
                {pScore ?? "\u2014"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Gaps vs competidores */}
      {gaps.length > 0 && (
        <div className="bg-muted/30 rounded-md p-2 mb-1">
          <div className="text-[9px] font-bold text-muted-foreground mb-1">PRINCIPALES GAPS</div>
          {gaps.slice(0, 3).map((g, i) => (
            <div key={i} className="text-[10px] text-muted-foreground py-0.5 flex gap-1">
              <span className="text-rust">{"\u2022"}</span>
              <span className="flex-1">{g}</span>
            </div>
          ))}
        </div>
      )}

      {/* Scores de competidores */}
      {competitors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {competitors.map((c, i) => (
            <span key={i} className="text-[9px] bg-[#E5E2DC] text-muted-foreground px-1.5 py-0.5 rounded-full">
              {c.brand_name || "?"}: <b style={{ color: tsColor(c.trust_score ?? 0) }}>{c.trust_score ?? "\u2014"}</b>
            </span>
          ))}
        </div>
      )}

      {age && (
        <div className="text-[9px] text-muted-foreground text-center">
          {age}{data?._stale ? " (cache)" : ""}
        </div>
      )}
    </div>
  );
}

function CwvRow({
  label,
  value,
  unit,
  good,
  bad,
}: {
  label: string;
  value: number;
  unit: string;
  good: number;
  bad: number;
}) {
  const color = value <= good ? "#22A06B" : value <= bad ? "#E5A100" : "#DE350B";
  return (
    <div className="flex justify-between py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold" style={{ color }}>
        {value}
        {unit}
      </span>
    </div>
  );
}
