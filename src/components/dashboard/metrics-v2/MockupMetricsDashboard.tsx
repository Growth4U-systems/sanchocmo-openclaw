import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/router";
import {
  useDashboardDefinition,
  useMetricKpis,
  useMetricsHealth,
  usePartnershipReport,
  useSurfaceDetail,
  useSurfaceDetailWindow,
  useSurfaceSummary,
  type DashboardVersionMeta,
  type MetricKpiQualityStatus,
  type MetricKpiResult,
  type MetricKpiValue,
  type MetricsHealthResult,
  type MetricStageRollupChannelValue,
  type MetricStageRollupResult,
  type MetricStageRollupStageValue,
  type PartnershipReport,
  type PartnershipReportCreatorRow,
  type PartnershipReportPeriodDays,
  type SurfaceDetailResult,
  type SurfaceSummaryEntry,
} from "@/hooks/useMetrics";
import {
  CHANNEL_BUCKETS,
  mapChannelToBucket,
  type ChannelBucketKey,
} from "@/lib/metrics/channel-buckets";
import { useOpenChat } from "@/hooks/useChat";
import { buildMetricsEditThread } from "@/lib/chat-openers";
import {
  SURFACE_MANDATORY_SOURCES,
  SURFACES,
  type SurfaceDef,
  type SurfaceKey,
} from "@/lib/metrics/surfaces";
import {
  METRIC_DASHBOARD_TABS,
  METRICS_SURFACE_ORDER,
  SURFACE_DETAIL_CONFIGS,
  type MetricDashboardTab,
  type MetricDataState,
} from "@/lib/metrics/dashboard-view-model";
import type { CustomMetric, DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import { cn } from "@/lib/utils";
import {
  PaidSurfacePanel,
  PipelineSurfacePanel,
  ProductSurfacePanel,
  SocialSurfacePanel,
  WebSurfacePanel,
} from "./SurfaceDetailPanels";
import {
  drilldownStageForMatrixRow,
  SalesEngineDrilldownPanel,
  type SalesEngineCellSelection,
} from "./SalesEngineDrilldown";

type DateRange = "1d" | "7d" | "30d" | "90d";

const DAY_MS = 86_400_000;

const DATE_RANGES: Array<{ key: DateRange; label: string }> = [
  { key: "1d", label: "Ayer" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

const PARTNERSHIP_PERIODS: Record<DateRange, PartnershipReportPeriodDays> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const DEDICATED_DETAIL_SURFACES = new Set<SurfaceKey>([
  "paid",
  "pipeline",
  "product",
  "social",
  "web",
]);

const TAB_ICONS: Record<MetricDashboardTab, string> = {
  overview: "⭐",
  surfaces: "🗂️",
  channels: "📡",
  conversion: "🎯",
  trends: "📉",
};

const DEFAULT_FUNNEL_STAGE_LABELS = [
  "Sessions",
  "Leads",
  "Cualificados",
  "Reuniones",
  "Oportunidades",
];

const SURFACE_COPY: Partial<Record<SurfaceKey, { label: string; icon: string; metric: string }>> = {
  reputation: { label: "Reputation", icon: "🛡️", metric: "Trust Score · 6 pilares" },
  web: { label: "Web & SEO", icon: "🌐", metric: "Sessions · GSC · PageSpeed" },
  product: { label: "Product", icon: "🧪", metric: "Activación y dropoff" },
  pipeline: { label: "Pipeline / CRM", icon: "📇", metric: "Leads · reuniones · pipeline" },
  paid: { label: "Paid", icon: "💰", metric: "Spend · CPL · ROAS" },
  email: { label: "Email / Outbound", icon: "📧", metric: "Enviados · replies · reuniones" },
  social: { label: "Social", icon: "📱", metric: "Posts · impresiones · engagement" },
  partnerships: { label: "Partnerships", icon: "🤝", metric: "Signups · CPA · ratio a CAC objetivo" },
};

const TRUST_PILLARS = [
  { id: "reputation.borrowed_trust", label: "Borrowed Trust", description: "Mentions and references from third parties" },
  { id: "reputation.serp_trust", label: "SERP Trust", description: "Presence and ranking on Google" },
  { id: "reputation.brand_assets", label: "Brand Assets", description: "Visual and brand assets" },
  { id: "reputation.geo_presence", label: "GEO Presence", description: "Visibility in generative AI engines" },
  { id: "reputation.outbound_readiness", label: "Outbound Readiness", description: "Readiness to capture leads" },
  { id: "reputation.demand_engine", label: "Demand Engine", description: "Demand-generation infrastructure" },
];

interface SurfaceCardModel {
  key: SurfaceKey;
  icon: string;
  label: string;
  description: string;
  state: MetricDataState;
  sources: string[];
  value: string;
  kpi: MetricKpiValue | null;
}

export type MetricsDashboardLoadState = "loading" | "error" | "empty" | "demo" | "partial" | "ready";
type DashboardTabModel = (typeof METRIC_DASHBOARD_TABS)[number];

interface FunnelStageModel {
  id: string;
  label: string;
  displayValue: string;
  value: number | null;
  sources: string[];
  qualityStatus?: MetricKpiQualityStatus;
  aggregationStatus?: "missing" | "single_series" | "non_additive";
  seriesCount?: number;
  cost?: string | null;
}

interface FunnelRateModel {
  from: string;
  to: string;
  displayValue: string;
  value: number | null;
  leak: boolean;
  qualityStatus?: MetricKpiQualityStatus;
}

interface ChannelMatrixRow {
  id: string;
  channel: string;
  source: string | null;
  label: string;
  icon: string;
  stages: Array<{
    stageId: string;
    label: string;
    displayValue: string;
    value: number | null;
    qualityStatus?: MetricKpiQualityStatus;
  }>;
  rates: Array<{
    key: string;
    label: string;
    displayValue: string;
    value: number | null;
    qualityStatus?: MetricKpiQualityStatus;
  }>;
}

export function MockupMetricsDashboard({ slug }: { slug: string }) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>("30d");
  const [localTab, setLocalTab] = useState<MetricDashboardTab>("overview");
  const openChat = useOpenChat();

  const surfacesQuery = useSurfaceSummary(slug, range);
  const dashboardQuery = useDashboardDefinition(slug);
  const healthQuery = useMetricsHealth(slug);
  const kpiQuery = useMetricKpis(slug, range);
  const surfacesData = surfacesQuery.data;
  const dashboard = dashboardQuery.data;
  const health = healthQuery.data;
  const kpiData = kpiQuery.data;
  const failedHealthSources = healthErrorSources(health);
  const visibleTabs = useMemo(
    () => resolveVisibleDashboardTabs(dashboard?.definition),
    [dashboard?.definition],
  );
  const visibleSurfaceOrder = useMemo(
    () => resolveVisibleSurfaceOrder(dashboard?.definition),
    [dashboard?.definition],
  );
  const qualitySummary = summarizeDashboardMetricQuality(kpiData, surfacesData);
  const errorCount = [surfacesQuery.error, dashboardQuery.error, healthQuery.error, kpiQuery.error]
    .filter(Boolean).length;
  const dataState = resolveMetricsDashboardLoadState({
    errorCount,
    hasData: qualitySummary.hasDisplayData,
    hasRealData: qualitySummary.hasRealData,
    hasDemoData: qualitySummary.demo > 0,
    qualityWarningCount: qualitySummary.warning + qualitySummary.missing,
    loading: [surfacesQuery, dashboardQuery, healthQuery, kpiQuery].some((query) => query.isLoading),
  });

  const requestedTab = normalizeTab(router.query.tab) ?? localTab;
  const activeTab = visibleTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.key ?? null;
  const requestedSurface = normalizeSurface(router.query.surface);
  const activeSurface = requestedSurface && visibleSurfaceOrder.includes(requestedSurface)
    ? requestedSurface
    : null;
  const surfaceEntries = useMemo(
    () => indexSurfaceEntries(surfacesData?.surfaces),
    [surfacesData?.surfaces],
  );
  const surfaceCards = useMemo<SurfaceCardModel[]>(
    () =>
      visibleSurfaceOrder.flatMap((key) => {
        const def = SURFACES.find((surface) => surface.key === key);
        if (!def) return [];
        return [buildSurfaceCard(def, surfaceEntries[key], surfacesData?.configured, kpiData)];
      }),
    [kpiData, surfaceEntries, surfacesData?.configured, visibleSurfaceOrder],
  );
  const funnel = useMemo(() => buildFunnelModel(kpiData), [kpiData]);
  const channelRows = useMemo(() => buildChannelRows(kpiData?.stageRollups, funnel.stages), [funnel.stages, kpiData?.stageRollups]);
  // Motor de ventas (SAN-326): people-numbers come only from GHL, split by the
  // contact's acquisition channel. Reuses the pipeline surface-detail read but
  // over an explicit window whose `to` is TODAY: the CRM funnel is expected to
  // be current, so leads that entered GHL today must show up today. Every other
  // surface/panel keeps its complete-days preset behavior.
  const salesEngineRange = useMemo(() => salesEngineWindow(range), [range]);
  const pipelineDetail = useSurfaceDetailWindow(slug, "pipeline", salesEngineRange);
  const salesEngine = useMemo(
    () => buildSalesEngineMatrix(pipelineDetail.data),
    [pipelineDetail.data],
  );
  const salesEngineDrilldown = useMemo(
    () => ({ slug, from: salesEngineRange.from, to: salesEngineRange.to }),
    [slug, salesEngineRange.from, salesEngineRange.to],
  );

  function selectTab(next: MetricDashboardTab) {
    setLocalTab(next);
    const query = cleanRouteQuery(router.query);
    query.tab = next;
    if (next === "overview") delete query.tab;
    if (next !== "surfaces") delete query.surface;
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }

  function openSurface(surface: SurfaceKey) {
    setLocalTab("surfaces");
    const query = cleanRouteQuery(router.query);
    query.tab = "surfaces";
    query.surface = surface;
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }

  function closeSurface() {
    const query = cleanRouteQuery(router.query);
    query.tab = "surfaces";
    delete query.surface;
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }

  function openMerlin() {
    openChat(
      slug,
      buildMetricsEditThread(
        slug,
        "Quiero editar el dashboard de métricas v2 usando los mockups originales como referencia visual.",
      ),
    );
  }

  return (
    <div className="metrics-mockup">
      <div className="m-wrap">
        <div className="m-head">
          <div>
            <div className="m-title"><span>📈</span><h1>Métricas</h1></div>
            <div className="m-submeta">
              {slug} · {rangeLabel(range)}
              {dashboard?.definition?.archetype ? ` · ${dashboard.definition.archetype}` : ""}
            </div>
          </div>
          <div className="m-head-actions">
            <RangePicker value={range} onChange={setRange} />
            {visibleTabs.some((tab) => tab.key === "surfaces") && (
              <button type="button" className="m-btn" onClick={() => selectTab("surfaces")}>⚙️ Setup</button>
            )}
            <VersionsButton versions={dashboard?.versions ?? []} currentVersion={dashboard?.version ?? null} />
            <button type="button" className="m-btn m-btn-rust" onClick={openMerlin}>🔮 Merlin</button>
          </div>
        </div>

        <TabsNav tabs={visibleTabs} active={activeTab} onSelect={selectTab} />

        <DashboardDataStateBanner
          state={dataState}
          slug={slug}
          errorCount={errorCount}
          demoCount={qualitySummary.demo}
          warningCount={qualitySummary.warning}
          missingCount={qualitySummary.missing}
        />

        {health?.overall === "error" && (
          <div className="m-inline-alert m-inline-alert-error" role="alert">
            {failedHealthSources.length
              ? `Falló la última recolección de ${failedHealthSources.join(" · ")}.`
              : "La recolección programada está degradada."}
            {" "}Se conservan los datos anteriores, que pueden estar desactualizados.
          </div>
        )}

        {health?.overall === "stale" && (
          <div className="m-inline-alert">Los datos pueden estar desactualizados. Ejecuta una corrida diaria controlada antes de activar cron.</div>
        )}

        {dataState === "loading" || dataState === "error" ? (
          <DashboardUnavailableState state={dataState} />
        ) : activeTab == null ? (
          <div className="m-panel m-empty-state" role="status">
            <div>📊</div>
            <h3>Sin pestañas visibles</h3>
            <p>La versión activa del dashboard no tiene vistas habilitadas.</p>
          </div>
        ) : activeTab === "surfaces" && activeSurface ? (
          <SurfaceDetailView
            slug={slug}
            range={range}
            surface={activeSurface}
            dashboardDefinition={dashboard?.definition}
            entry={surfaceEntries[activeSurface]}
            configured={surfacesData?.configured}
            kpiData={kpiData}
            onBack={closeSurface}
          />
        ) : (
          <>
            {activeTab === "overview" && (
              <OverviewView
                dashboardDefinition={dashboard?.definition}
                kpiData={kpiData}
                funnel={funnel}
                salesEngine={salesEngine}
                salesEngineLoading={pipelineDetail.isLoading}
                salesEngineError={pipelineDetail.isError}
                salesEngineDrilldown={salesEngineDrilldown}
                surfaceCards={surfaceCards}
                openSurface={openSurface}
              />
            )}
            {activeTab === "surfaces" && (
              <SurfacesView surfaceCards={surfaceCards} openSurface={openSurface} />
            )}
            {activeTab === "channels" && (
              <ChannelsView
                funnel={funnel}
                rows={channelRows}
                salesEngine={salesEngine}
                salesEngineLoading={pipelineDetail.isLoading}
                salesEngineError={pipelineDetail.isError}
                salesEngineDrilldown={salesEngineDrilldown}
              />
            )}
            {activeTab === "conversion" && (
              <ConversionView funnel={funnel} rows={channelRows} stageRollups={kpiData?.stageRollups} />
            )}
            {activeTab === "trends" && (
              <TrendsView dashboardDefinition={dashboard?.definition} kpiData={kpiData} />
            )}
          </>
        )}
      </div>
      <MockupStyles />
    </div>
  );
}

export function resolveMetricsDashboardLoadState({
  loading,
  errorCount,
  hasData,
  hasRealData = hasData,
  hasDemoData = false,
  qualityWarningCount = 0,
}: {
  loading: boolean;
  errorCount: number;
  hasData: boolean;
  hasRealData?: boolean;
  hasDemoData?: boolean;
  qualityWarningCount?: number;
}): MetricsDashboardLoadState {
  if (loading && !hasData) return "loading";
  if (errorCount > 0 && !hasData) return "error";
  if (!hasData) return "empty";
  if (hasDemoData && !hasRealData) return "demo";
  if (errorCount > 0 || qualityWarningCount > 0 || hasDemoData) return "partial";
  return "ready";
}

export function resolveVisibleDashboardTabs(
  definition?: DashboardDefinition | null,
): DashboardTabModel[] {
  if (!definition?.tabs.length) return [...METRIC_DASHBOARD_TABS];
  const defaults = new Map(METRIC_DASHBOARD_TABS.map((tab) => [tab.key, tab]));
  const seen = new Set<MetricDashboardTab>();
  const tabs: DashboardTabModel[] = [];
  for (const configured of [...definition.tabs].sort((a, b) => a.order - b.order)) {
    const key = normalizeTab(configured.key);
    const fallback = key ? defaults.get(key) : undefined;
    if (!key || !fallback || !configured.visible || seen.has(key)) continue;
    seen.add(key);
    tabs.push({
      ...fallback,
      label: configured.label.trim() || fallback.label,
    });
  }
  return tabs;
}

export function resolveVisibleSurfaceOrder(
  definition?: DashboardDefinition | null,
): SurfaceKey[] {
  if (!definition?.surfaces.length) return [...METRICS_SURFACE_ORDER];
  const supported = new Set<SurfaceKey>(METRICS_SURFACE_ORDER);
  const seen = new Set<SurfaceKey>();
  const result: SurfaceKey[] = [];
  for (const configured of [...definition.surfaces].sort((a, b) => a.order - b.order)) {
    if (!configured.visible || !supported.has(configured.surface) || seen.has(configured.surface)) continue;
    seen.add(configured.surface);
    result.push(configured.surface);
  }
  return result;
}

export function healthErrorSources(health?: MetricsHealthResult): string[] {
  if (!health) return [];
  return [...new Set(
    health.sources
      .filter((source) => source.lastStatus?.toLowerCase() === "error")
      .map((source) => friendlySource(source.source)),
  )];
}

export function summarizeDashboardMetricQuality(
  kpis?: MetricKpiResult,
  surfaces?: { surfaces: SurfaceSummaryEntry[] },
): {
  demo: number;
  warning: number;
  missing: number;
  hasDisplayData: boolean;
  hasRealData: boolean;
} {
  const values = kpis?.values ?? [];
  const activeSources = qualitySourceSet(values, surfaces?.surfaces);
  const relevantValues = values.filter((value) => isRelevantQualityValue(value, activeSources));
  const displayValues = relevantValues.filter(hasDisplayableKpiValue);
  const stageQuality = kpis?.stageRollups.available
    ? kpis.stageRollups.summary.qualityStatus
    : null;
  const hasSurfaceData = Boolean(
    surfaces?.surfaces.some((surface) => surface.metrics.some((metric) => metric.value != null)),
  );
  const demo = displayValues.filter((value) => value.qualityStatus === "demo").length
    + (stageQuality === "demo" ? 1 : 0);
  const warning = displayValues.filter((value) => isWarningQuality(value.qualityStatus)).length
    + (stageQuality && isWarningQuality(stageQuality) ? 1 : 0);
  const missing = relevantValues.filter((value) => value.qualityStatus === "missing").length
    + (stageQuality === "missing" ? 1 : 0);
  const hasDisplayStage = Boolean(kpis?.stageRollups.available && stageQuality !== "missing");
  const hasRealStage = Boolean(
    kpis?.stageRollups.available && stageQuality !== "missing" && stageQuality !== "demo",
  );
  const hasRealSemanticValue = displayValues.some((value) => value.qualityStatus !== "demo");
  const hasOnlyUnclassifiedSurfaceData = hasSurfaceData && !displayValues.length && !hasDisplayStage;
  return {
    demo,
    warning,
    missing,
    hasDisplayData: hasSurfaceData || hasDisplayStage || displayValues.length > 0,
    // Surface summaries do not expose provenance. Once semantic values exist,
    // do not let an unclassified raw summary relabel demo-only data as real.
    hasRealData: hasRealStage || hasRealSemanticValue || hasOnlyUnclassifiedSurfaceData,
  };
}

export function DashboardDataStateBanner({
  state,
  slug,
  errorCount = 0,
  demoCount = 0,
  warningCount = 0,
  missingCount = 0,
}: {
  state: MetricsDashboardLoadState;
  slug: string;
  errorCount?: number;
  demoCount?: number;
  warningCount?: number;
  missingCount?: number;
}) {
  const partialDetails = [
    errorCount ? `${errorCount} ${errorCount === 1 ? "consulta falló" : "consultas fallaron"}` : null,
    demoCount ? `${demoCount} KPI ${demoCount === 1 ? "es demo" : "son demo"}` : null,
    warningCount ? `${warningCount} ${warningCount === 1 ? "requiere" : "requieren"} revisión` : null,
    missingCount ? `${missingCount} ${missingCount === 1 ? "no tiene" : "no tienen"} dato` : null,
  ].filter(Boolean).join(" · ");
  const copy: Record<MetricsDashboardLoadState, { label: string; detail: string }> = {
    loading: { label: "Cargando datos", detail: "Consultando las fuentes de métricas." },
    error: { label: "Error de carga", detail: "No se pudieron cargar las métricas. Reintenta en unos instantes." },
    empty: { label: "Sin datos", detail: "No hay valores para este rango. Revisa las fuentes y la última recolección." },
    demo: { label: "DEMO", detail: "Todos los valores disponibles son de demostración; no proceden de integraciones reales." },
    partial: { label: "Datos con avisos", detail: `${partialDetails || "La cobertura no es completa"}. Se muestran solo los valores disponibles.` },
    ready: { label: "Con datos", detail: "Comparando contra el periodo anterior cuando existe." },
  };
  return (
    <div className={cn("m-statebar", `m-data-state-${state}`)} data-state={state}>
      <span className="m-label">Estado de {slug || "cliente"}:</span>
      <span className="m-segment-static">{copy[state].label}</span>
      <span className="m-subtle">{copy[state].detail}</span>
    </div>
  );
}

function DashboardUnavailableState({ state }: { state: "loading" | "error" }) {
  return (
    <div className="m-panel m-empty-state" role={state === "error" ? "alert" : "status"}>
      <div>{state === "loading" ? "⏳" : "⚠️"}</div>
      <h3>{state === "loading" ? "Cargando métricas" : "No se pudieron cargar las métricas"}</h3>
      <p>{state === "loading" ? "Esperando la respuesta de las fuentes." : "No se mostrarán cifras hasta recuperar una respuesta válida."}</p>
    </div>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  return (
    <div className="m-range">
      {DATE_RANGES.map((item) => (
        <button
          key={item.key}
          type="button"
          className={value === item.key ? "on" : undefined}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
      <button type="button" title="Periodo a medida todavía no disponible" disabled>📅</button>
    </div>
  );
}

function VersionsButton({
  versions,
  currentVersion,
}: {
  versions: DashboardVersionMeta[];
  currentVersion: number | null;
}) {
  return (
    <span className="m-btn m-btn-navy" title={versions.map((item) => `v${item.version} · ${item.date.slice(0, 10)}`).join("\n")}>
      🕓 Versiones {currentVersion ? `v${currentVersion}` : ""}
    </span>
  );
}

function TabsNav({
  tabs,
  active,
  onSelect,
}: {
  tabs: DashboardTabModel[];
  active: MetricDashboardTab | null;
  onSelect: (tab: MetricDashboardTab) => void;
}) {
  return (
    <div className="m-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={cn("m-tab", active === tab.key && "on")}
          onClick={() => onSelect(tab.key)}
        >
          <span>{TAB_ICONS[tab.key]}</span>{tab.label}
        </button>
      ))}
    </div>
  );
}

function OverviewView({
  dashboardDefinition,
  kpiData,
  funnel,
  salesEngine,
  salesEngineLoading,
  salesEngineError,
  salesEngineDrilldown,
  surfaceCards,
  openSurface,
}: {
  dashboardDefinition?: DashboardDefinition | null;
  kpiData?: MetricKpiResult;
  funnel: ReturnType<typeof buildFunnelModel>;
  salesEngine: SalesEngineMatrixModel;
  salesEngineLoading?: boolean;
  salesEngineError?: boolean;
  salesEngineDrilldown?: SalesEngineDrilldownContext;
  surfaceCards: SurfaceCardModel[];
  openSurface: (surface: SurfaceKey) => void;
}) {
  const northStar = selectDashboardNorthStarKpi(kpiData, dashboardDefinition);
  const northStarLabel = dashboardDefinition?.northStar?.label || northStar?.label || "Reuniones cualificadas";
  const economy = buildEconomyCards(kpiData);
  const customMetrics = selectDashboardCustomMetrics(kpiData, dashboardDefinition, null);
  const objective = northStarTarget(dashboardDefinition);
  const progress = percentOfTarget(metricNumericValue(northStar), objective);

  return (
    <div>
      <div className="m-panel m-panel-halftone m-hero">
        <div className="m-hero-ns">
          <div className="m-eyebrow">⭐ North Star</div>
          <div className="m-ns-row">
            <div>
              <div className="m-ns-big">{displayKpiValue(northStar)}</div>
              <div className="m-ns-label">{northStarLabel}</div>
              <MetricQualityBadge kpi={northStar} />
            </div>
            <ProgressRing percent={progress} />
          </div>
          <div className="m-ns-meta">
            <span>Objetivo <b>{objective == null ? "Sin definir" : formatKpiTarget(objective, northStar)}</b></span>
            <DeltaBadge kpi={northStar} />
          </div>
          <div className="m-levers">
            <div>Volúmenes observados (sin sumar proveedores)</div>
            {funnel.stages.slice(0, 4).map((stage) => (
              <span key={stage.id} className="m-lever">
                {stage.label} <b>{stage.displayValue}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="m-hero-econ">
          <div className="m-eyebrow">💶 Economía</div>
          <div className="m-econ-grid">
            {economy.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                detail={card.detail}
                tone={card.tone}
                kpi={card.kpi}
              />
            ))}
          </div>
        </div>
      </div>

      <CustomMetricPanel metrics={customMetrics} />

      <SectionTitle icon="🪜" title="Volúmenes por etapa y proveedor" subtitle="observaciones separadas; no son un embudo deduplicado" />
      <UnifiedFunnel funnel={funnel} />

      <SectionTitle icon="🧲" title="Motor de ventas · funnel por canal" subtitle="personas desde GHL, canal según el origen del contacto · incluye hoy (parcial)" />
      <ChannelMatrix model={salesEngine} isLoading={salesEngineLoading} hasError={salesEngineError} drilldown={salesEngineDrilldown} />

      <SectionTitle icon="🗂️" title="Salud de las superficies" subtitle="cada tarjeta abre su detalle" />
      <SurfaceGrid cards={surfaceCards} onOpen={openSurface} />

      <SectionTitle icon="⚡" title="Movimientos" subtitle="señales desde Intelligence cuando existan" />
      <IntelligenceBridge surface="Overview" />
    </div>
  );
}

function SurfacesView({
  surfaceCards,
  openSurface,
}: {
  surfaceCards: SurfaceCardModel[];
  openSurface: (surface: SurfaceKey) => void;
}) {
  return (
    <div>
      <SectionTitle icon="🗂️" title="Surfaces" subtitle="inputs por sistema fuente" />
      <SurfaceGrid cards={surfaceCards} onOpen={openSurface} />
    </div>
  );
}

function ChannelsView({
  funnel,
  rows,
  salesEngine,
  salesEngineLoading,
  salesEngineError,
  salesEngineDrilldown,
}: {
  funnel: ReturnType<typeof buildFunnelModel>;
  rows: ChannelMatrixRow[];
  salesEngine: SalesEngineMatrixModel;
  salesEngineLoading?: boolean;
  salesEngineError?: boolean;
  salesEngineDrilldown?: SalesEngineDrilldownContext;
}) {
  return (
    <div>
      <div className="m-modelbar">
        <span className="m-label">Lectura disponible:</span>
        <span className="m-segment-static">Series por proveedor</span>
        <span className="m-subtle">No se suman proveedores: un mismo lead puede aparecer en varios sistemas.</span>
      </div>

      <FunnelAggregationNotice visible={funnel.sourceAggregated} />

      <CompactFunnel stages={funnel.stages} />

      <SectionTitle icon="🧲" title="Motor de ventas · funnel por canal" subtitle="personas desde GHL, canal según el origen del contacto · incluye hoy (parcial)" />
      <ChannelMatrix model={salesEngine} isLoading={salesEngineLoading} hasError={salesEngineError} drilldown={salesEngineDrilldown} />

      <SectionTitle icon="🧾" title="Inventario de observaciones" subtitle="sin ranking ni porcentaje global entre universos solapados" />
      <ContributionTable rows={rows} />

      <div className="m-two-col">
        <div>
          <SectionTitle icon="⚖️" title="Comparación de modelos" />
          <ModelComparison rows={rows} />
        </div>
        <div>
          <SectionTitle icon="🛤️" title="Journeys multi-touch" />
          <JourneysPanel rows={rows} />
        </div>
      </div>

      <SectionTitle icon="🔭" title="Señales por canal" />
      <IntelligenceBridge surface="Channels" />
    </div>
  );
}

function ConversionView({
  funnel,
  rows,
  stageRollups,
}: {
  funnel: ReturnType<typeof buildFunnelModel>;
  rows: ChannelMatrixRow[];
  stageRollups?: MetricStageRollupResult;
}) {
  return (
    <div>
      <SectionTitle icon="🪜" title="Conversión pendiente de identidad" subtitle="los volúmenes agregados no permiten deduplicar personas entre proveedores" />
      <div className="m-panel m-pad">
        <FunnelAggregationNotice visible={funnel.sourceAggregated} />
        <ConversionFunnel funnel={funnel} />
      </div>

      <SectionTitle icon="📊" title="Tasas por proveedor" subtitle="solo se publicarán con eventos enlazados a una identidad deduplicada" />
      <ConversionMatrix rows={rows} />

      <div className="m-two-col">
        <div>
          <SectionTitle icon="⏱️" title="Velocidad" />
          <VelocityPanel />
        </div>
        <div>
          <SectionTitle icon="🚨" title="Fugas no calculables" />
          <LeakPanel funnel={funnel} stageRollups={stageRollups} />
        </div>
      </div>

      <SectionTitle icon="🔭" title="Señales de conversión" />
      <IntelligenceBridge surface="Conversion" />
    </div>
  );
}

function TrendsView({
  dashboardDefinition,
  kpiData,
}: {
  dashboardDefinition?: DashboardDefinition | null;
  kpiData?: MetricKpiResult;
}) {
  const northStar = selectDashboardNorthStarKpi(kpiData, dashboardDefinition);
  const kpis = selectTrendKpis(kpiData, northStar);
  return (
    <div>
      <div className="m-statebar">
        <span className="m-label">Comparación:</span>
        <span className="m-segment-static">Periodo anterior</span>
        <span className="m-subtle">Esta vista muestra totales comparables; la serie por día/semana/mes aún no está disponible.</span>
      </div>

      <SectionTitle icon="⭐" title="North Star" subtitle="total del rango y periodo anterior" />
      <TrendHero kpi={northStar} />

      <SectionTitle icon="🔢" title="KPIs clave" subtitle="small-multiples para escanear sin mezclar series" />
      <div className="m-small-grid">
        {kpis.map((kpi, index) => (
          <SmallTrendCard key={kpi?.id ?? index} kpi={kpi} fallback={trendFallbacks[index % trendFallbacks.length]} />
        ))}
      </div>

      <SectionTitle icon="📌" title="Hitos del periodo" />
      <MarkersPanel />

      <SectionTitle icon="🔭" title="Lectura de tendencias" />
      <IntelligenceBridge surface="Trends" />
    </div>
  );
}

export function partnershipReportHasTrackedData(
  report?: PartnershipReport,
): boolean {
  const status = report?.tracking?.status;
  return (status === "real" || status === "demo")
    && (report?.tracking?.recordCount ?? 0) > 0
    && (report?.creators.length ?? 0) > 0;
}

export function partnershipReportHasCompleteFinancials(
  report?: PartnershipReport,
): boolean {
  return report?.totals?.investedEur != null
    && Number.isFinite(report.totals.investedEur)
    && report.totals.totalCostEur != null
    && Number.isFinite(report.totals.totalCostEur);
}

export function partnershipReportDataState(
  report: PartnershipReport | undefined,
  fallback: MetricDataState,
): MetricDataState {
  if (!report) return fallback;
  if (report.tracking?.status === "real" && partnershipReportHasTrackedData(report)) {
    return partnershipReportHasCompleteFinancials(report) ? "ON" : "PARCIAL";
  }
  if (report.tracking?.status === "demo" && partnershipReportHasTrackedData(report)) {
    return "PARCIAL";
  }
  return "CONECTADO SIN SNAPSHOTS";
}

function SurfaceDetailView({
  slug,
  range,
  surface,
  dashboardDefinition,
  entry,
  configured,
  kpiData,
  onBack,
}: {
  slug: string;
  range: DateRange;
  surface: SurfaceKey;
  dashboardDefinition?: DashboardDefinition | null;
  entry?: SurfaceSummaryEntry;
  configured?: boolean;
  kpiData?: MetricKpiResult;
  onBack: () => void;
}) {
  const def = SURFACES.find((item) => item.key === surface);
  const config = SURFACE_DETAIL_CONFIGS[surface];
  const copy = SURFACE_COPY[surface];
  const rendererKpis = useMemo(
    () => (kpiData?.values ?? [])
      .filter((kpi) => kpi.surface === surface)
      .sort((left, right) => scoreKpi(right) - scoreKpi(left)),
    [kpiData?.values, surface],
  );
  const customMetrics = selectDashboardCustomMetrics(kpiData, dashboardDefinition, surface);
  const builtInKpis = rendererKpis.filter((kpi) => !kpi.kpiId.startsWith("custom."));
  const rawState = def ? surfaceState(def, entry, configured) : "SIN DATOS";
  const state = surfaceStateWithKpiQuality(
    rawState,
    rendererKpis,
    entry?.sources,
    entry?.dataStatus === "connected_no_data",
  );
  const sources = [...new Set([
    ...(entry?.sources ?? []),
    ...observedMetricLineageSources(rendererKpis),
  ])];
  const partnershipPeriod = PARTNERSHIP_PERIODS[range];
  const partnershipReport = usePartnershipReport(surface === "partnerships" ? slug : null, partnershipPeriod);
  const detailSurface = DEDICATED_DETAIL_SURFACES.has(surface) ? surface : null;
  const surfaceDetail = useSurfaceDetail(detailSurface ? slug : null, detailSurface, range);
  const hasPartnershipData = partnershipReportHasTrackedData(partnershipReport.data);
  const effectiveState = surface === "partnerships"
    ? partnershipReportDataState(partnershipReport.data, state)
    : state;
  const effectiveSources = surface === "partnerships"
    ? hasPartnershipData
      ? [...new Set([...sources, "yalc"])]
      : sources.filter((source) => qualitySourceKey(source) !== "yalc")
    : sources;
  return (
    <div>
      <div className="m-detailbar">
        <button type="button" className="m-back" onClick={onBack}>← Surfaces</button>
        <h2>{copy?.icon ?? def?.emoji} {copy?.label ?? config.label}</h2>
      </div>
      <div className="m-statebar m-statebar-tight">
        <span className="m-label">Estado:</span>
        <span className={cn("m-health-pill", stateClass(effectiveState))}><StatusDot state={effectiveState} />{stateLabel(effectiveState)}</span>
        <span className="m-subtle">
          {effectiveSources.length ? `Datos: ${effectiveSources.map(friendlySource).join(" · ")}` : "Sin fuentes con datos recientes"}
        </span>
      </div>
      {surface === "reputation" ? (
        <ReputationSurface kpis={builtInKpis} state={effectiveState} />
      ) : surface === "web" ? (
        <WebSurfacePanel kpis={builtInKpis} detail={surfaceDetail.data} isLoading={surfaceDetail.isLoading} hasError={surfaceDetail.isError} />
      ) : surface === "email" ? (
        <OutboundSurface kpis={builtInKpis} state={effectiveState} sources={effectiveSources} />
      ) : surface === "partnerships" ? (
        <PartnershipsSurface kpis={builtInKpis} report={partnershipReport.data} reportError={partnershipReport.error} reportLoading={partnershipReport.isLoading} state={effectiveState} sources={effectiveSources} />
      ) : surface === "paid" ? (
        <PaidSurfacePanel kpis={builtInKpis} detail={surfaceDetail.data} isLoading={surfaceDetail.isLoading} hasError={surfaceDetail.isError} />
      ) : surface === "product" ? (
        <ProductSurfacePanel kpis={builtInKpis} detail={surfaceDetail.data} isLoading={surfaceDetail.isLoading} hasError={surfaceDetail.isError} />
      ) : surface === "pipeline" ? (
        <PipelineSurfacePanel kpis={builtInKpis} detail={surfaceDetail.data} isLoading={surfaceDetail.isLoading} hasError={surfaceDetail.isError} stageRollups={kpiData?.stageRollups} />
      ) : surface === "social" ? (
        <SocialSurfacePanel kpis={builtInKpis} detail={surfaceDetail.data} isLoading={surfaceDetail.isLoading} hasError={surfaceDetail.isError} />
      ) : (
        <GenericSurface title={copy?.label ?? config.label} icon={copy?.icon ?? def?.emoji ?? "📊"} kpis={builtInKpis} state={effectiveState} groups={surfaceGroups(surface)} />
      )}
      <CustomMetricPanel metrics={customMetrics} />
    </div>
  );
}

function ReputationSurface({
  kpis,
  state,
}: {
  kpis: MetricKpiValue[];
  state: MetricDataState;
}) {
  const trustCore = findKpi(kpis, ["reputation.trust_score", "trust_score"]);
  return (
    <div>
      <div className="m-panel m-surface-hero">
        <div>
          <div className="m-eyebrow">🛡️ Trust Core Global</div>
          <div className="m-ns-big">{trustCore ? displayKpiValue(trustCore) : stateLabel(state)}</div>
          <MetricQualityBadge kpi={trustCore} />
          <DeltaBadge kpi={trustCore} />
        </div>
      </div>
      <SectionTitle icon="🧱" title="Pilares Trust Core" />
      <div className="m-small-grid">
        {TRUST_PILLARS.map((pillar) => {
          const kpi = findKpi(kpis, [pillar.id]);
          return (
            <div key={pillar.id} className="m-smcard">
              <div className="m-smh"><div className="m-smn">{pillar.label}</div><DeltaBadge kpi={kpi} /></div>
              <div className="m-smv"><span>{displayKpiValue(kpi)}</span><small>/100</small></div>
              <MetricQualityBadge kpi={kpi} />
              <p>{pillar.description}</p>
            </div>
          );
        })}
      </div>
      <KpiComparisonTable kpis={[trustCore, ...TRUST_PILLARS.map((pillar) => findKpi(kpis, [pillar.id]))].filter(Boolean) as MetricKpiValue[]} />
    </div>
  );
}

export function WebSeoSurface({
  kpis,
  state,
}: {
  kpis: MetricKpiValue[];
  state: MetricDataState;
}) {
  const headline = [
    "web.sessions",
    "web.gsc_clicks",
    "web.gsc_impressions",
    "web.gsc_ctr",
    "web.gsc_position",
    "web.pagespeed_mobile",
    "web.pagespeed_desktop",
  ].map((id) => findKpi(kpis, [id])).filter(Boolean) as MetricKpiValue[];
  const headlineIds = new Set(headline.map((kpi) => kpi.id));
  const candidates = [
    ...headline,
    ...kpis.filter((kpi) => !headlineIds.has(kpi.id)),
  ];
  const orderedHeadline = [
    ...candidates.filter(hasDisplayableKpiValue),
    ...candidates.filter((kpi) => !hasDisplayableKpiValue(kpi)),
  ];
  return (
    <GenericSurface
      title="Web & SEO"
      icon="🌐"
      kpis={orderedHeadline.length ? orderedHeadline : kpis}
      state={state}
      groups={["Google Analytics 4", "Search Console", "PageSpeed"]}
    />
  );
}

export function OutboundSurface({
  kpis,
  state,
  sources,
}: {
  kpis: MetricKpiValue[];
  state: MetricDataState;
  sources: string[];
}) {
  const instantlySent = findKpi(kpis, ["outbound.instantly.sent"]);
  const instantlyUniqueOpens = findKpi(kpis, ["outbound.instantly.unique_opens"]);
  const instantlyUniqueReplies = findKpi(kpis, ["outbound.instantly.unique_replies"]);
  const instantlyOpportunities = findKpi(kpis, ["outbound.instantly.opportunities"]);
  const lemlistSent = findKpi(kpis, ["outbound.lemlist.sent"]);
  const lemlistDelivered = findKpi(kpis, ["outbound.lemlist.delivered"]);
  const lemlistOpens = findKpi(kpis, ["outbound.lemlist.opens"]);
  const lemlistReplies = findKpi(kpis, ["outbound.lemlist.replies"]);
  const lemlistPositive = findKpi(kpis, ["outbound.lemlist.positive_replies"]);
  const lemlistMeetings = findKpi(kpis, ["outbound.lemlist.meetings"]);
  const lemlistBounced = findKpi(kpis, ["outbound.lemlist.bounced"]);
  const lemlistUnsubscribed = findKpi(kpis, ["outbound.lemlist.unsubscribed"]);
  const expleeCampaigns = findKpi(kpis, ["outbound.explee.campaigns_current"]);
  const expleeEmailsSent = findKpi(kpis, ["outbound.explee.emails_sent_lifetime"]);
  const expleeReplies = findKpi(kpis, ["outbound.explee.replies_lifetime"]);
  const expleeReplyRate = findKpi(kpis, ["outbound.explee.reply_rate_lifetime"]);
  const expleeHotLeads = findKpi(kpis, ["outbound.explee.hot_leads_lifetime"]);
  const expleeSpend = findKpi(kpis, ["outbound.explee.spend_lifetime"]);
  const expleeCpl = findKpi(kpis, ["outbound.explee.cpl_lifetime"]);

  return (
    <div>
      <SurfaceSubhead
        icon="🎯"
        title="ICP Outreach"
        subtitle="cold email a ICP · Instantly / Lemlist / Explee"
        state={state}
        sources={sources}
      />

      <div className="m-statebar m-statebar-tight">
        <span className="m-label">Vista:</span>
        <span className="m-segment-static">Por proveedor</span>
        <span className="m-subtle">Instantly y Lemlist se muestran por separado. Explee se identifica como acumulado y no depende del selector de fechas.</span>
      </div>

      <SectionTitle icon="📨" title="Instantly" subtitle="contadores diarios del proveedor" />
      <div className="m-kpi-grid">
        <SurfaceKpiTile label="Envíos" value={metricDisplay(instantlySent)} kpi={instantlySent} />
        <SurfaceKpiTile label="Aperturas únicas" value={metricDisplay(instantlyUniqueOpens)} kpi={instantlyUniqueOpens} muted detail="Apple MPP puede afectar la señal" />
        <SurfaceKpiTile label="Replies únicos" value={metricDisplay(instantlyUniqueReplies)} kpi={instantlyUniqueReplies} tone="hero" />
        <SurfaceKpiTile label="Oportunidades reportadas" value={metricDisplay(instantlyOpportunities)} kpi={instantlyOpportunities} />
      </div>

      <SectionTitle icon="📨" title="Lemlist" subtitle="mensajes y leads reportados por el proveedor" />
      <div className="m-kpi-grid">
        <SurfaceKpiTile label="Mensajes enviados" value={metricDisplay(lemlistSent)} kpi={lemlistSent} />
        <SurfaceKpiTile label="Mensajes entregados" value={metricDisplay(lemlistDelivered)} kpi={lemlistDelivered} />
        <SurfaceKpiTile label="Aperturas reportadas" value={metricDisplay(lemlistOpens)} kpi={lemlistOpens} muted detail="Volumen; no se infiere unicidad" />
        <SurfaceKpiTile label="Replies reportados" value={metricDisplay(lemlistReplies)} kpi={lemlistReplies} detail="Volumen; no se infiere continuidad" />
        <SurfaceKpiTile label="Leads interesados" value={metricDisplay(lemlistPositive)} kpi={lemlistPositive} tone="hero" />
        <SurfaceKpiTile label="Reuniones reservadas" value={metricDisplay(lemlistMeetings)} kpi={lemlistMeetings} tone="hero" />
        <SurfaceKpiTile label="Mensajes rebotados" value={metricDisplay(lemlistBounced)} kpi={lemlistBounced} tone="gate" />
        <SurfaceKpiTile label="Leads desuscritos" value={metricDisplay(lemlistUnsubscribed)} kpi={lemlistUnsubscribed} />
      </div>

      <SectionTitle icon="🚀" title="Explee AutoGTM" subtitle="snapshot acumulado del proyecto · independiente del selector de fechas" />
      <div className="m-kpi-grid">
        <SurfaceKpiTile label="Campañas no archivadas" value={metricDisplay(expleeCampaigns)} kpi={expleeCampaigns} />
        <SurfaceKpiTile label="Emails enviados acumulados" value={metricDisplay(expleeEmailsSent)} kpi={expleeEmailsSent} />
        <SurfaceKpiTile label="Respuestas acumuladas" value={metricDisplay(expleeReplies)} kpi={expleeReplies} />
        <SurfaceKpiTile label="Tasa de respuesta acumulada" value={metricDisplay(expleeReplyRate)} kpi={expleeReplyRate} />
        <SurfaceKpiTile label="Hot leads acumulados" value={metricDisplay(expleeHotLeads)} kpi={expleeHotLeads} tone="hero" />
        <SurfaceKpiTile label="Gasto acumulado (USD)" value={metricDisplay(expleeSpend)} kpi={expleeSpend} />
        <SurfaceKpiTile label="Coste por hot lead (USD)" value={metricDisplay(expleeCpl)} kpi={expleeCpl} />
      </div>

      <SectionTitle icon="📈" title="Tendencia observada" subtitle="series separadas por proveedor; no es un funnel" />
      <MultiLinePanel
        legends={[
          { label: "Instantly · envíos", color: "navy" },
          { label: "Lemlist · envíos", color: "rust" },
          { label: "Lemlist · reuniones", color: "sage" },
        ]}
        lines={[
          sparkFromKpi(instantlySent),
          sparkFromKpi(lemlistSent),
          sparkFromKpi(lemlistMeetings),
        ]}
      />

      <SectionTitle icon="🧭" title="Lectura de los contadores" subtitle="volúmenes observados, no una cohorte secuencial" />
      <div className="m-panel m-pad m-empty-breakdown">
        <div>No se infiere continuidad entre pasos</div>
        <p>Envíos, aperturas, replies, interesados y reuniones son contadores independientes de cada API. Sin identificadores de persona/campaña enlazados no se calcula drop-off ni conversión entre ellos.</p>
      </div>

      <div className="m-two-col">
        <div>
          <SectionTitle icon="✉️" title="Reply por paso" />
          <EmptyBreakdownPanel text="Sin datos por paso en este rango." />
        </div>
        <div>
          <SectionTitle icon="🧪" title="A/B variante" />
          <EmptyBreakdownPanel text="Sin variantes en este rango." />
        </div>
      </div>

      <div className="m-statebar m-statebar-tight">
        <span className="m-label">Ratios de cohorte del rango:</span>
        <span className="m-subtle">No disponibles: las APIs no prueban que aperturas, replies o entregas pertenezcan a los envíos del mismo rango. La tasa acumulada de Explee se calcula únicamente con sus propios contadores; para el resto se necesita un join por campaña/destinatario.</span>
      </div>

      <div className="m-statebar m-statebar-tight">
        <span className="m-label">Atribución:</span>
        <span className="m-subtle">Las reuniones de Lemlist y los hot leads de Explee no se suman al funnel global sin un join de identidad verificable.</span>
      </div>

      <SectionTitle icon="🔭" title="Señales de esta superficie" />
      <IntelligenceBridge surface="Email / Outbound" />
    </div>
  );
}

function PartnershipsSurface({
  kpis,
  report,
  reportError,
  reportLoading,
  state,
  sources,
}: {
  kpis: MetricKpiValue[];
  report?: PartnershipReport;
  reportError?: unknown;
  reportLoading?: boolean;
  state: MetricDataState;
  sources: string[];
}) {
  const [openHandle, setOpenHandle] = useState<string | null>(null);
  const hasTrackedData = partnershipReportHasTrackedData(report);
  const hasYalc = hasTrackedData || kpis.some((kpi) => kpi.source === "yalc");
  const creators = report?.creators ?? [];
  const totals = report?.totals;
  const valueGenerated = totals && report ? totals.conversions * report.targetCacEur : null;
  const sortedCreators = [...creators].sort((a, b) => (b.roi ?? -1) - (a.roi ?? -1));

  return (
    <div>
      <SurfaceSubhead
        icon="🤝"
        title="Partnerships"
        subtitle="creators · CPA vs break-even · ratio a CAC objetivo"
        state={state}
        sources={hasYalc ? [...new Set([...sources, "yalc"])] : sources}
        health={report?.tracking?.status === "unavailable"
          ? "Yalc conectado · tracking real pendiente"
          : report?.tracking?.status === "real" && !partnershipReportHasCompleteFinancials(report)
            ? "Tracking real · fee pendiente en uno o más deals"
          : report?.tracking?.status === "demo"
            ? `${report.periodDays} días · datos demo explícitos`
            : report
              ? `${report.periodDays} días · CAC objetivo ${formatCurrencyEur(report.targetCacEur)}`
              : "Reporte por creator"}
      />

      {reportLoading && <div className="m-panel m-pad m-empty">Cargando reporte de Partnerships...</div>}
      {!!reportError && (
        <div className="m-panel m-pad m-empty">
          No se pudo cargar el reporte de Partnerships.
        </div>
      )}
      {!reportLoading && !reportError && (!report || !totals || !hasTrackedData || creators.length === 0) && (
        <div className="m-panel m-empty-state">
          <div>🤝</div>
          <h3>Partnerships conectado, sin performance verificable</h3>
          <p>Yalc responde, pero todavía no hay tracking real de creators con deal en esta ventana.</p>
        </div>
      )}

      {report && totals && hasTrackedData && creators.length > 0 && (
        <>
          <SectionTitle icon="💶" title="Economía y funnel" subtitle="CPA real vs break-even y funnel clicks → signups → KYC → 1ª transacción" />
          <div className="m-kpi-grid">
            <SurfaceKpiTile label="Fees totales de deals" value={formatCurrencyEur(totals.investedEur)} tone="navy" detail={totals.investedEur == null ? "fee pendiente en uno o más deals" : "no atribuidos al periodo"} />
            <SurfaceKpiTile label="CPA · 1ª TX del rango" value={totals.cpaRealEur == null ? "-" : formatCurrencyEur(totals.cpaRealEur)} tone={totals.belowBreakEven == null ? "navy" : totals.belowBreakEven ? "good" : "bad"} detail={`fees totales ÷ conversiones del rango · objetivo ${formatCurrencyEur(report.targetCacEur)}`} />
            <SurfaceKpiTile label="Valor a CAC objetivo" value={formatCurrencyEur(valueGenerated)} tone="navy" detail="umbral derivado: conversiones × CAC objetivo; no es revenue" />
            <SurfaceKpiTile label="Ratio a CAC objetivo" value={roiDisplay(totals.roi)} tone={totals.roi == null ? "navy" : totals.roi >= 1 ? "good" : "bad"} detail="(conversiones del rango × CAC objetivo) ÷ fees totales; no es ROI financiero" />
            <SurfaceKpiTile label="Clicks" value={formatCompact(totals.clicks)} />
            <SurfaceKpiTile label="Signups" value={formatCompact(totals.signups)} detail={`CR ${ratioDisplay(totals.signups, totals.clicks)}`} />
            <SurfaceKpiTile label="KYC aprobado" value={formatCompact(totals.kyc)} tone="cyan" detail={`${ratioDisplay(totals.kyc, totals.signups)} aprob.`} />
            <SurfaceKpiTile label="1ª transacción" value={formatCompact(totals.conversions)} tone="cyan" detail={`${ratioDisplay(totals.conversions, totals.kyc)} funded`} />
          </div>

          <SectionTitle icon="📈" title="Tendencia" subtitle="clicks agregados de creators en la ventana" />
          <MultiLinePanel legends={[{ label: "Clicks", color: "navy" }]} lines={[sumCreatorSparklines(creators)]} />

          <SectionTitle icon="🏆" title="Leaderboard por creator" subtitle="ordenado por ratio a CAC objetivo y CPA contra break-even" />
          <CreatorLeaderboard
            creators={sortedCreators}
            targetCac={report.targetCacEur}
            openHandle={openHandle}
            onToggle={setOpenHandle}
          />

          <SectionTitle icon="⚖️" title="CPA por creator vs break-even" subtitle="a la izquierda rentable, a la derecha necesita acción" />
          <BreakEvenBars creators={sortedCreators} targetCac={report.targetCacEur} />

          <SectionTitle icon="⚡" title="Movimientos" subtitle="mejoras, riesgo y actividad del programa" />
          <MoversPanel items={buildPartnershipMovers(sortedCreators)} empty="Sin movimientos detectados para Partnerships en este rango." />

          <SectionTitle icon="🧭" title="Salud · Renovar / Vigilar / Cortar" subtitle="decisión por economics reales del creator" />
          <RenewWatchCut creators={sortedCreators} targetCac={report.targetCacEur} />

          <SectionTitle icon="🔁" title="Contribución al embudo" subtitle="funnel fintech de Partnerships hacia la North Star" />
          <ContributionStrip
            steps={[
              { label: "Clicks", value: formatCompact(totals.clicks) },
              { label: "Signups", value: formatCompact(totals.signups), rate: ratioDisplay(totals.signups, totals.clicks) },
              { label: "KYC", value: formatCompact(totals.kyc), rate: ratioDisplay(totals.kyc, totals.signups) },
              { label: "1ª transacción", value: formatCompact(totals.conversions), lead: true, rate: ratioDisplay(totals.conversions, totals.kyc) },
            ]}
            note={`Partnerships aporta ${formatCompact(totals.conversions)} primeras transacciones con CPA ${totals.cpaRealEur == null ? "-" : formatCurrencyEur(totals.cpaRealEur)}.`}
          />

          <SectionTitle icon="🔭" title="Señales de esta superficie" />
          <IntelligenceBridge surface="Partnerships" />
        </>
      )}
    </div>
  );
}

function GenericSurface({
  title,
  icon,
  kpis,
  state,
  groups,
}: {
  title: string;
  icon: string;
  kpis: MetricKpiValue[];
  state: MetricDataState;
  groups: string[];
}) {
  return (
    <div>
      <div className="m-panel m-surface-hero">
        <div>
          <div className="m-eyebrow">{icon} {title}</div>
          <div className="m-ns-big">{kpis[0] ? displayKpiValue(kpis[0]) : stateLabel(state)}</div>
          <p>{kpis[0]?.label ?? "Sin datos para este rango"}</p>
          <MetricQualityBadge kpi={kpis[0]} />
        </div>
      </div>
      <div className="m-small-grid">
        {(kpis.length ? kpis.slice(0, 6) : groups.map((group) => ({
          id: group,
          label: group,
          displayValue: "-",
          comparison: null,
        } as MetricKpiValue))).map((kpi) => (
          <div key={kpi.id} className="m-smcard">
            <div className="m-smh"><div className="m-smn">{kpi.label}</div><DeltaBadge kpi={kpi.comparison ? kpi : null} /></div>
            <div className="m-smv"><span>{displayKpiValue(kpi)}</span></div>
            <MetricQualityBadge kpi={kpi} />
          </div>
        ))}
      </div>
      <KpiComparisonTable kpis={kpis} />
    </div>
  );
}

export interface DashboardCustomMetricModel {
  definition: CustomMetric;
  kpi: MetricKpiValue | null;
}

function customMetricTierLabel(tier?: string): string {
  switch (tier?.trim().toLowerCase()) {
    case "north-star":
    case "primary":
      return "North Star";
    case "leading":
      return "Leading";
    case "lagging":
      return "Lagging";
    case "diagnostic":
      return "Diagnóstico";
    default:
      return tier?.trim() || "Personalizada";
  }
}

export function CustomMetricPanel({
  metrics,
}: {
  metrics: DashboardCustomMetricModel[];
}) {
  if (!metrics.length) return null;
  return (
    <>
      <SectionTitle
        icon="🧮"
        title="Métricas personalizadas"
        subtitle="fórmulas de la versión activa del dashboard"
      />
      <div className="m-small-grid" data-custom-metrics>
        {metrics.map(({ definition, kpi }) => (
          <div key={definition.id} className="m-smcard">
            <div className="m-smh">
              <div className="m-smn">{definition.label}</div>
              <DeltaBadge kpi={kpi} />
            </div>
            <div className="m-smv"><span>{displayKpiValue(kpi)}</span></div>
            {kpi ? (
              <MetricQualityBadge kpi={kpi} />
            ) : (
              <QualityStatusBadge status="missing" provenance={`Formula: ${definition.formula}`} />
            )}
            <p>
              {customMetricTierLabel(definition.tier)}
              {definition.format ? ` · ${definition.format}` : ""}
              {" · "}{definition.formula}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

export function UnifiedFunnel({ funnel }: { funnel: ReturnType<typeof buildFunnelModel> }) {
  return (
    <div className="m-panel m-pad">
      <FunnelAggregationNotice visible={funnel.sourceAggregated} />
      <div className="m-funnel">
        {funnel.stages.map((stage, index) => (
          <div key={stage.id} className="m-funnel-item">
            <div className={cn("m-fstage", index === funnel.stages.length - 1 && "final")}>
              <span>{stage.label}</span>
              <b>{stage.displayValue}</b>
              <QualityStatusBadge status={stage.qualityStatus} provenance={stage.sources.map(friendlySource).join(" · ")} />
              {stage.cost && <small>{stage.cost}</small>}
              <div>{stage.sources.slice(0, 4).map((source) => <i key={source}>{sourceIcon(source)}</i>)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="m-funnel-foot">
        <span>Sin total global: los proveedores pueden observar a la misma persona.</span>
      </div>
    </div>
  );
}

function FunnelAggregationNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="m-aggregation-notice" role="note">
      Volúmenes separados por proveedor. No se suman ni se convierten en tasas,
      fugas o conversión global sin una identidad deduplicada.
    </div>
  );
}

function ConversionFunnel({ funnel }: { funnel: ReturnType<typeof buildFunnelModel> }) {
  return (
    <div>
      <div className="m-conv-funnel">
        {funnel.stages.map((stage, index) => (
          <div key={stage.id} className="m-conv-item">
            <div className={cn("m-cstage", index === funnel.stages.length - 1 && "last")}>
              <span>{stage.label}</span>
              <b>{stage.displayValue}</b>
              <QualityStatusBadge status={stage.qualityStatus} provenance={stage.sources.map(friendlySource).join(" · ")} />
            </div>
          </div>
        ))}
      </div>
      <div className="m-funnel-foot">
        <span>Conversión total no calculada.</span>
        <span>Se necesitan eventos enlazados por persona y transición.</span>
      </div>
    </div>
  );
}

function CompactFunnel({ stages }: { stages: FunnelStageModel[] }) {
  return (
    <div className="m-compact-funnel">
      {stages.map((stage, index) => (
        <span key={stage.id}>
          <b>{stage.label} {stage.displayValue}</b>
          {index < stages.length - 1 && <i>·</i>}
        </span>
      ))}
    </div>
  );
}

function SurfaceGrid({
  cards,
  onOpen,
}: {
  cards: SurfaceCardModel[];
  onOpen: (surface: SurfaceKey) => void;
}) {
  if (!cards.length) {
    return (
      <div className="m-panel m-pad m-empty">
        La versión activa del dashboard no tiene surfaces visibles.
      </div>
    );
  }
  return (
    <div className="m-surface-grid">
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          className={cn("m-surf", stateClass(card.state))}
          onClick={() => onOpen(card.key)}
        >
          <div className="m-surf-head">
            <span><i>{card.icon}</i>{card.label}</span>
            <span className="m-surf-status"><StatusDot state={card.state} />{stateLabel(card.state)}</span>
          </div>
          <div className="m-surf-value">{card.value}</div>
          <MetricQualityBadge kpi={card.kpi} />
          <div className="m-surf-meta">{card.description}</div>
          <div className="m-surf-sources">
            {card.sources.length ? `Datos: ${card.sources.map(friendlySource).join(" · ")}` : "Sin fuentes con datos recientes"}
          </div>
          <div className="m-surf-foot">
            <DeltaBadge kpi={card.kpi} />
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * Motor de ventas (SAN-326): one funnel, people-numbers from GHL only, split by
 * the contact's acquisition channel. Stages are rows; channel buckets are
 * columns. Each stage reads a GHL surface-detail metric: the undimensioned
 * rollup carries the honest total (a real 0 stays 0), the `{channel}` rows are
 * grouped into buckets. A stage whose metric was never collected shows "—".
 */
const SALES_ENGINE_STAGES: Array<{
  key: string;
  label: string;
  icon: string;
  channelMetric: string;
  totalMetric: string;
  currency?: boolean;
}> = [
  { key: "leads", label: "Leads", icon: "👥", channelMetric: "newContacts", totalMetric: "newContacts" },
  { key: "reuniones", label: "Reuniones", icon: "📅", channelMetric: "appointmentsByChannel", totalMetric: "appointmentsByChannel" },
  { key: "oportunidades", label: "Oportunidades", icon: "📈", channelMetric: "opportunitiesByChannel", totalMetric: "opportunitiesByChannel" },
  { key: "ganadas", label: "Ganadas", icon: "🏆", channelMetric: "wonByChannel", totalMetric: "wonOpportunities" },
  { key: "valor", label: "€ ganado", icon: "💶", channelMetric: "wonValueByChannel", totalMetric: "wonValue", currency: true },
];

export interface SalesEngineStageModel {
  key: string;
  label: string;
  icon: string;
  currency: boolean;
  /** false → the metric was never collected for this range; render "—". */
  present: boolean;
  quality: MetricKpiQualityStatus | null;
  total: number | null;
  cells: Array<{ bucket: ChannelBucketKey; value: number | null }>;
}

export interface SalesEngineMatrixModel {
  available: boolean;
  stages: SalesEngineStageModel[];
}

export function buildSalesEngineMatrix(
  detail?: SurfaceDetailResult,
): SalesEngineMatrixModel {
  const ghl = (detail?.sources ?? []).find(
    (source) => qualitySourceKey(source.source) === "ghl",
  );
  const metrics = ghl?.metrics ?? [];
  const stages = SALES_ENGINE_STAGES.map((spec) => {
    const channelRows = metrics.filter(
      (metric) => metric.metric === spec.channelMetric && metric.dimensions?.channel,
    );
    const totalRow = metrics.find(
      (metric) => metric.metric === spec.totalMetric && !metric.dimensions,
    );
    const present = Boolean(totalRow) || channelRows.length > 0;
    const bucketTotals = new Map<ChannelBucketKey, number>();
    for (const row of channelRows) {
      const bucket = mapChannelToBucket(row.dimensions?.channel ?? "");
      bucketTotals.set(bucket, (bucketTotals.get(bucket) ?? 0) + row.value);
    }
    const total = totalRow
      ? totalRow.value
      : present
        ? channelRows.reduce((sum, row) => sum + row.value, 0)
        : null;
    return {
      key: spec.key,
      label: spec.label,
      icon: spec.icon,
      currency: Boolean(spec.currency),
      present,
      quality: worstQualityStatus([
        totalRow?.quality ?? null,
        ...channelRows.map((row) => row.quality),
      ]),
      total,
      cells: CHANNEL_BUCKETS.map((bucket) => ({
        bucket: bucket.key,
        value: present ? bucketTotals.get(bucket.key) ?? 0 : null,
      })),
    };
  });
  return {
    available: Boolean(detail?.configured) && stages.some((stage) => stage.present),
    stages,
  };
}

function salesEngineCellValue(stage: SalesEngineStageModel, value: number | null): string {
  if (value == null) return "—";
  return stage.currency ? formatCurrencyEur(value) : formatCompact(value);
}

/**
 * Calendar window of the sales-engine matrix (SAN-326 drill-down): same start
 * as the preset ranges (which end on the last complete day) but extended
 * through TODAY, because the CRM funnel is expected to be current. The partial
 * day is declared in the section subtitle instead of excluded.
 */
export function salesEngineWindow(
  range: DateRange,
  now: Date = new Date(),
): { from: string; to: string } {
  const days = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 }[range];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const iso = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
  return { from: iso(today - days * DAY_MS), to: iso(today) };
}

/** Context the matrix needs to open live GHL drill-downs. */
export interface SalesEngineDrilldownContext {
  slug: string;
  from: string;
  to: string;
}

export interface SalesEngineConversionStep {
  key: string;
  label: string;
  /** Fraction (0.25 = 25 %); null when either side has no honest base. */
  value: number | null;
  display: string;
  hint: string | null;
}

export interface SalesEngineConversionModel {
  available: boolean;
  steps: SalesEngineConversionStep[];
  wonValueDisplay: string;
}

/**
 * Aggregate conversion rates of the sales-engine matrix (SAN-326): period
 * volumes divided pairwise (Leads→Reuniones→Oportunidades→Ganadas) plus the
 * won € total. A rate exists only when both stages carry real numbers and the
 * denominator is > 0 — anything else is "—" with a "sin base" hint. These are
 * same-window period rates, NOT per-lead cohort tracking.
 */
export function buildSalesEngineConversion(
  model: SalesEngineMatrixModel,
): SalesEngineConversionModel {
  const stageTotal = (key: string): number | null => {
    const stage = model.stages.find((item) => item.key === key);
    return stage && stage.present ? stage.total : null;
  };
  const pair = (key: string, label: string, fromKey: string, toKey: string): SalesEngineConversionStep => {
    const denominator = stageTotal(fromKey);
    const numerator = stageTotal(toKey);
    const computable = numerator != null && denominator != null && denominator > 0;
    return {
      key,
      label,
      value: computable ? numerator / denominator : null,
      display: computable ? formatPercent(numerator / denominator) : "—",
      hint: computable ? null : "sin base",
    };
  };
  const wonValue = stageTotal("valor");
  return {
    available: model.available,
    steps: [
      pair("leads-reuniones", "Leads → Reuniones", "leads", "reuniones"),
      pair("reuniones-oportunidades", "Reuniones → Oportunidades", "reuniones", "oportunidades"),
      pair("oportunidades-ganadas", "Oportunidades → Ganadas", "oportunidades", "ganadas"),
    ],
    wonValueDisplay: wonValue == null ? "—" : formatCurrencyEur(wonValue),
  };
}

function SalesEngineConversionStrip({ model }: { model: SalesEngineConversionModel }) {
  if (!model.available) return null;
  return (
    <div className="m-conv-strip" data-sales-engine-conversion>
      <div className="m-conv-strip-title">
        Conversión del período
        <small>tasas del mismo rango (volúmenes de la ventana), no cohortes por lead</small>
      </div>
      <div className="m-conv-strip-items">
        {model.steps.map((step) => (
          <span key={step.key} className="m-conv-step">
            {step.label}
            <b className={step.value == null ? "na" : undefined}>{step.display}</b>
            {step.hint ? <i>{step.hint}</i> : null}
          </span>
        ))}
        <span className="m-conv-step m-conv-won">
          € ganado total
          <b>{model.wonValueDisplay}</b>
        </span>
      </div>
    </div>
  );
}

export function ChannelMatrix({
  model,
  isLoading,
  hasError,
  drilldown,
}: {
  model: SalesEngineMatrixModel;
  isLoading?: boolean;
  hasError?: boolean;
  /** When present, cells with data open a live GHL lead list. */
  drilldown?: SalesEngineDrilldownContext;
}) {
  const [selection, setSelection] = useState<SalesEngineCellSelection | null>(null);
  const conversion = useMemo(() => buildSalesEngineConversion(model), [model]);
  if (!model.available) {
    if (isLoading) {
      return <div className="m-panel m-pad m-empty" role="status">Cargando el funnel por canal desde GHL…</div>;
    }
    if (hasError) {
      return <div className="m-panel m-pad m-empty" role="alert">No se pudo cargar el detalle de GHL; no se muestran cifras del motor de ventas.</div>;
    }
    return (
      <div className="m-panel m-pad m-empty">
        Sin datos de GHL para este rango. Las etapas del motor de ventas salen del CRM; conecta GoHighLevel o espera la próxima recolección.
      </div>
    );
  }

  function select(stage: SalesEngineStageModel, bucket: ChannelBucketKey | null) {
    const drillStage = drilldownStageForMatrixRow(stage.key);
    if (!drillStage) return;
    setSelection({
      stage: drillStage,
      stageLabel: stage.label,
      bucket,
      bucketLabel: bucket
        ? CHANNEL_BUCKETS.find((item) => item.key === bucket)?.label ?? bucket
        : "Total",
    });
  }

  function cell(stage: SalesEngineStageModel, bucket: ChannelBucketKey | null, value: number | null, isTotal: boolean) {
    const clickable = Boolean(
      drilldown && value != null && value > 0 && drilldownStageForMatrixRow(stage.key),
    );
    const body = (
      <>
        {isTotal ? <b>{salesEngineCellValue(stage, value)}</b> : salesEngineCellValue(stage, value)}
        {isTotal ? (
          <QualityStatusBadge
            status={stage.present ? stage.quality : "missing"}
            provenance="GHL"
          />
        ) : null}
      </>
    );
    if (!clickable) return <div className="m-mcell">{body}</div>;
    return (
      <button
        type="button"
        className="m-mcell m-mcell-btn"
        title="Ver la lista de registros en GoHighLevel"
        onClick={() => select(stage, bucket)}
      >
        {body}
      </button>
    );
  }

  return (
    <>
      <div className="m-panel m-table-panel" data-sales-engine-matrix>
        <table className="m-matrix">
          <thead>
            <tr>
              <th className="chan">Etapa</th>
              {CHANNEL_BUCKETS.map((bucket) => <th key={bucket.key}>{bucket.label}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {model.stages.map((stage) => (
              <tr key={stage.key}>
                <td className="chan"><span>{stage.icon}</span>{stage.label}</td>
                {stage.cells.map((item) => (
                  <td key={`${stage.key}-${item.bucket}`}>
                    {cell(stage, item.bucket, item.value, false)}
                  </td>
                ))}
                <td>{cell(stage, null, stage.total, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <SalesEngineConversionStrip model={conversion} />
        <div className="m-funnel-foot">
          <span>
            Personas y € desde GoHighLevel; el canal sale del origen del contacto. Visitas web e inversión viven en sus superficies.
            {drilldown ? " Toca una celda con datos para ver sus registros." : ""}
          </span>
        </div>
      </div>
      {drilldown && selection ? (
        <SalesEngineDrilldownPanel
          slug={drilldown.slug}
          from={drilldown.from}
          to={drilldown.to}
          selection={selection}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </>
  );
}

function ContributionTable({ rows }: { rows: ChannelMatrixRow[] }) {
  if (!rows.length) {
    return (
      <div className="m-panel m-pad m-empty">
        Sin observaciones por proveedor para este rango.
      </div>
    );
  }
  return (
    <div className="m-panel m-table-panel">
      <table className="m-ct">
        <thead>
          <tr><th>Proveedor · canal</th><th>Observaciones disponibles</th><th>Lectura</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const observations = row.stages.filter((stage) => stage.value != null);
            return (
            <tr key={row.id}>
              <td><span className="m-chan2"><i>{row.icon}</i>{row.label}</span></td>
              <td>{observations.length
                ? observations.map((stage) => `${stage.label}: ${stage.displayValue}`).join(" · ")
                : "-"}</td>
              <td>Serie independiente; no aditiva</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConversionMatrix({ rows }: { rows: ChannelMatrixRow[] }) {
  if (!rows.length) {
    return <div className="m-panel m-pad m-empty">Sin tasas de conversión por canal para este rango.</div>;
  }
  const maxRates = Math.max(...rows.map((row) => row.rates.length), 0);
  if (maxRates === 0) {
    return <div className="m-panel m-pad m-empty">Sin transiciones calculables por canal para este rango.</div>;
  }
  if (rows.every((row) => row.rates.every((rate) => rate.value == null))) {
    return (
      <div className="m-panel m-pad m-empty">
        Sin tasas calculables: se necesita enlazar cada transición a una identidad
        deduplicada dentro del mismo proveedor y rango.
      </div>
    );
  }
  const labels = Array.from({ length: maxRates }, (_, index) =>
    rows.find((row) => row.rates[index])?.rates[index]?.label ?? `Transición ${index + 1}`,
  );
  return (
    <div className="m-panel m-table-panel">
      <table className="m-cmtx">
        <thead>
          <tr><th>Canal</th>{labels.map((label) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 6).map((row) => (
            <tr key={row.id}>
              <td><span>{row.icon}</span>{row.label}</td>
              {labels.map((label, index) => {
                const rate = row.rates[index];
                return <td key={label}><div className={rate?.value == null ? "na" : undefined} style={conversionHeatStyle(rate?.value)}>{rate?.displayValue ?? "-"}<QualityStatusBadge status={rate?.qualityStatus} /></div></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelComparison({ rows }: { rows: ChannelMatrixRow[] }) {
  return (
    <div className="m-panel m-pad m-empty">
      Sin comparación de modelos. Las {rows.length} series por proveedor no contienen crédito first-touch, W-shaped o last-touch.
    </div>
  );
}

function JourneysPanel({ rows }: { rows: ChannelMatrixRow[] }) {
  return (
    <div className="m-panel m-pad m-empty">
      Sin journeys individuales. Las {rows.length} filas disponibles son agregados por canal y no permiten reconstruir recorridos por registro.
    </div>
  );
}

function VelocityPanel() {
  return (
    <div className="m-panel m-pad m-empty">
      Sin datos de velocidad. Se necesitan timestamps por lead y transición de etapa.
    </div>
  );
}

function LeakPanel({
  funnel,
  stageRollups,
}: {
  funnel: ReturnType<typeof buildFunnelModel>;
  stageRollups?: MetricStageRollupResult;
}) {
  const rates = funnel.rates.filter((rate) => rate.leak).sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  const leaks = rates.slice(0, 3);
  if (!leaks.length) {
    return <div className="m-panel m-pad m-empty">Sin fuga calculable. {stageRollups?.summary.nextAction ?? "Aún faltan datos suficientes por etapa."}</div>;
  }
  return (
    <div className="m-panel m-pad">
      {leaks.map((rate, index) => (
        <div key={`${rate.from}-${rate.to}`} className="m-leak">
          <span className={index === 0 ? "red" : "amber"} />
          <div><b>{rate.from} → {rate.to}: {rate.displayValue}</b><small>{dropoffLabel(rate.value)} de caída relativa</small></div>
        </div>
      ))}
    </div>
  );
}

function TrendHero({ kpi }: { kpi: MetricKpiValue | null }) {
  return (
    <div className="m-panel m-trend-hero">
      <div className="m-trend-top">
        <div>
          <span>⭐ North Star</span>
          <div><b>{displayKpiValue(kpi)}</b><small>{kpi?.label ?? "Reuniones cualificadas"}</small><DeltaBadge kpi={kpi} /><MetricQualityBadge kpi={kpi} /></div>
        </div>
        <div>Periodo anterior: <b>{kpi?.comparison?.previousDisplayValue ?? "-"}</b></div>
      </div>
      <div className="m-empty">Sin serie temporal en este read model; se muestra solo la comparación de totales.</div>
    </div>
  );
}

const trendFallbacks = [
  { icon: "🌐", label: "Sessions", value: "-", unit: "/sem" },
  { icon: "🎯", label: "Leads", value: "-", unit: "/sem" },
  { icon: "💸", label: "CPL", value: "-", unit: "coste/lead" },
  { icon: "💼", label: "Pipeline €", value: "-", unit: "abierto" },
  { icon: "📈", label: "ROAS", value: "-", unit: "blended" },
  { icon: "🛡️", label: "Trust Score", value: "-", unit: "/100" },
];

function SmallTrendCard({ kpi, fallback }: { kpi?: MetricKpiValue | null; fallback: typeof trendFallbacks[number] }) {
  return (
    <div className="m-smcard">
      <div className="m-smh"><div className="m-smn"><span>{fallback.icon}</span>{kpi?.label ?? fallback.label}</div><DeltaBadge kpi={kpi ?? null} /></div>
      <div className="m-smv"><span>{kpi ? displayKpiValue(kpi) : fallback.value}</span>{!kpi && <small>{fallback.unit}</small>}</div>
      <MetricQualityBadge kpi={kpi} />
      <div className="m-smfoot">Total del rango</div>
    </div>
  );
}

function MarkersPanel() {
  return (
    <div className="m-panel m-pad m-empty">
      Sin hitos registrados para este periodo. Las anotaciones aparecerán cuando exista una fuente de eventos.
    </div>
  );
}

function IntelligenceBridge({ surface }: { surface: string }) {
  return (
    <div className="m-panel m-intel">
      <div className="m-intel-head">
        <span>🔭</span>
        <div>
          <b>Señales de {surface}</b>
          <small>Sin señales calculadas para este rango. Cuando Intelligence detecte cambios relevantes, aparecerán aquí.</small>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  kpi,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "navy" | "rust" | "sage" | "cyan";
  kpi?: MetricKpiValue | null;
}) {
  return (
    <div className={`m-ecard ${tone}`}>
      <div>{label}</div>
      <b>{kpi ? displayKpiValue(kpi) : value}</b>
      <div>
        <DeltaBadge kpi={kpi} />
      </div>
      <small>{detail}</small>
      <MetricQualityBadge kpi={kpi} />
    </div>
  );
}

function SurfaceSubhead({
  icon,
  title,
  subtitle,
  state,
  sources,
  health,
}: {
  icon: string;
  title: string;
  subtitle: string;
  state: MetricDataState;
  sources: string[];
  health?: string;
}) {
  return (
    <div className="m-surface-subhead">
      <h2><span>{icon}</span>{title}</h2>
      <span className="m-subhead-sub">{subtitle}</span>
      <div className="m-subhead-state">
        <span className={cn("m-health-pill", stateClass(state))}>
          <StatusDot state={state} />{stateLabel(state)}
        </span>
        {health && <span className="m-health-context">{health}</span>}
        <span className="m-subhead-sources">
          {sources.length ? `Datos: ${sources.map(friendlySource).join(" · ")}` : "Sin fuentes con datos recientes"}
        </span>
      </div>
    </div>
  );
}

function SurfaceKpiTile({
  label,
  value,
  kpi,
  qualityKpi,
  tone,
  detail,
  muted,
}: {
  label: string;
  value: string;
  kpi?: MetricKpiValue | null;
  qualityKpi?: MetricKpiValue | null;
  tone?: "hero" | "gate" | "muted" | "good" | "bad" | "navy" | "cyan";
  detail?: string;
  muted?: boolean;
}) {
  return (
    <div className={cn("m-skpi", tone, muted && "muted")}>
      <div className="m-skpi-label">
        <span>{label}</span>
        {detail && <i>{detail}</i>}
      </div>
      <div className="m-skpi-value">{kpi ? displayKpiValue(kpi, "Sin dato") : value}</div>
      <div className="m-skpi-foot">
        {kpi ? <DeltaBadge kpi={kpi} /> : <span className="m-chip flat">-</span>}
        <MetricQualityBadge kpi={qualityKpi ?? kpi} />
      </div>
    </div>
  );
}

function MultiLinePanel({
  legends,
  lines,
}: {
  legends: Array<{ label: string; color: "navy" | "rust" | "sage" | "cyan" }>;
  lines: number[][];
}) {
  const visible = lines.filter((line) => line.length >= 2 && line.some((value) => value > 0));
  if (!visible.length) {
    return <div className="m-panel m-pad m-empty">Sin serie temporal suficiente para este rango.</div>;
  }
  return (
    <div className="m-panel m-line-panel">
      <div className="m-line-legend">
        {legends.slice(0, lines.length).map((legend) => (
          <span key={legend.label}><i className={legend.color} />{legend.label}</span>
        ))}
      </div>
      <MultiLineChart lines={visible} colors={legends.map((legend) => legend.color)} />
    </div>
  );
}

function MultiLineChart({
  lines,
  colors,
}: {
  lines: number[][];
  colors: Array<"navy" | "rust" | "sage" | "cyan">;
}) {
  const width = 740;
  const height = 170;
  const x0 = 46;
  const y0 = 14;
  const plotW = 648;
  const plotH = 130;
  const x = (index: number, length: number) => x0 + (plotW * index) / Math.max(1, length - 1);
  const palette = { navy: "#1E3A5F", rust: "#C45D35", sage: "#4A5D23", cyan: "#3B9EBF" };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="m-multiline" aria-hidden="true">
      {[0, 0.5, 1].map((factor) => (
        <line key={factor} x1={x0} y1={y0 + plotH * factor} x2={x0 + plotW} y2={y0 + plotH * factor} stroke="#E0D5C2" strokeWidth="1" />
      ))}
      {lines.map((line, index) => {
        const max = Math.max(...line, 1);
        const min = Math.min(...line, 0);
        const span = max - min || 1;
        const y = (value: number) => y0 + plotH - ((value - min) / span) * plotH;
        return (
          <path
            key={index}
            d={line.map((value, pointIndex) => `${pointIndex ? "L" : "M"}${x(pointIndex, line.length).toFixed(1)} ${y(value).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={palette[colors[index] ?? "navy"]}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function EmptyBreakdownPanel({ text }: { text: string }) {
  return (
    <div className="m-panel m-pad m-empty-breakdown">
      <div>Sin datos para este rango</div>
      <p>{text}</p>
    </div>
  );
}

interface MoverItem {
  tone: "up" | "warn" | "alert" | "act";
  icon: string;
  title: string;
  subtitle: string;
}

function MoversPanel({ items, empty }: { items: MoverItem[]; empty: string }) {
  if (!items.length) return <div className="m-panel m-pad m-empty">{empty}</div>;
  return (
    <div className="m-panel m-movers-panel">
      {items.map((item) => (
        <div key={item.title} className="m-mover">
          <span className={cn("m-mover-icon", item.tone)}>{item.icon}</span>
          <div><b>{item.title}</b><small>{item.subtitle}</small></div>
        </div>
      ))}
    </div>
  );
}

function ContributionStrip({
  steps,
  note,
}: {
  steps: Array<{ label: string; value: string; rate?: string; lead?: boolean }>;
  note: string;
}) {
  return (
    <div className="m-panel m-contrib-panel">
      <div className="m-contrib">
        {steps.map((step, index) => (
          <div key={step.label} className="m-contrib-frag">
            {index > 0 && <span className="m-contrib-arrow">{step.rate && <i>{step.rate}</i>}→</span>}
            <div className={cn("m-cstep", step.lead && "leadout")}>
              <div className="cn">{step.label}</div>
              <div className="cv">{step.value}</div>
            </div>
          </div>
        ))}
        <span className="m-contrib-note">{note}</span>
      </div>
    </div>
  );
}

function CreatorLeaderboard({
  creators,
  targetCac,
  openHandle,
  onToggle,
}: {
  creators: PartnershipReportCreatorRow[];
  targetCac: number;
  openHandle: string | null;
  onToggle: (handle: string | null) => void;
}) {
  const maxInvestment = Math.max(...creators.map((creator) => creator.totalCostEur ?? creator.feeEur ?? 0), 1);
  return (
    <div className="m-panel m-table-panel">
      <table className="m-creator-table">
        <thead>
          <tr>
            <th>Creator</th>
            <th className="r">Fee total</th>
            <th className="r">Clicks</th>
            <th className="r">Signups</th>
            <th className="r">1ª TX</th>
            <th className="r">CPA</th>
            <th className="r">Ratio CAC obj.</th>
            <th className="r">EPC</th>
          </tr>
        </thead>
        <tbody>
          {creators.map((creator) => {
            const open = openHandle === creator.handle;
            const investment = creator.totalCostEur ?? creator.feeEur ?? null;
            return (
              <Fragment key={creator.handle}>
                <tr className={open ? "sel" : undefined} onClick={() => onToggle(open ? null : creator.handle)}>
                  <td><b>{creator.handle}</b>{creator.network && <small>{creator.network}</small>}</td>
                  <td className="r barcell"><span className="bg" style={{ width: `${Math.round(((investment ?? 0) / maxInvestment) * 100)}%` }} /><span className="v">{formatCurrencyEur(investment)}</span></td>
                  <td className="r">{formatCompact(creator.clicks)}</td>
                  <td className="r">{formatCompact(creator.signups)}</td>
                  <td className="r">{formatCompact(creator.conversions)}</td>
                  <td className="r"><span className={cn("m-heat", creator.belowBreakEven == null ? undefined : creator.belowBreakEven ? "good" : "bad")}>{creator.cpaRealEur == null ? "-" : formatCurrencyEur(creator.cpaRealEur)}</span></td>
                  <td className="r"><b>{roiDisplay(creator.roi)}</b></td>
                  <td className="r">{formatCurrencyEur(epcForCreator(creator, targetCac))}</td>
                </tr>
                {open && (
                  <tr className="creator-detail">
                    <td colSpan={8}>
                      {creator.posts.length ? (
                        <div className="m-post-list">
                          {creator.posts.slice(0, 4).map((post) => (
                            <span key={post.id}>{post.date.slice(5)} · {post.format} · {formatCompact(post.clicks)} clicks · {formatCompact(post.conversions)} tx</span>
                          ))}
                        </div>
                      ) : (
                        <div className="m-empty">Sin posts en la ventana.</div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BreakEvenBars({
  creators,
  targetCac,
}: {
  creators: PartnershipReportCreatorRow[];
  targetCac: number;
}) {
  const visible = creators.filter((creator) => creator.cpaRealEur != null).slice(0, 8);
  if (!visible.length) return <div className="m-panel m-pad m-empty">Sin CPA por creator calculable todavía.</div>;
  const width = 700;
  const rowH = 30;
  const left = 120;
  const top = 28;
  const plotW = 540;
  const max = Math.max(targetCac * 1.25, ...visible.map((creator) => creator.cpaRealEur ?? 0), 1);
  const height = top + visible.length * rowH + 28;
  const x = (value: number) => left + (value / max) * plotW;
  return (
    <div className="m-panel m-pad">
      <svg viewBox={`0 0 ${width} ${height}`} className="m-break-even" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((factor) => {
          const value = Math.round(max * factor);
          return (
            <g key={factor}>
              <line x1={x(value)} y1={top} x2={x(value)} y2={top + visible.length * rowH} stroke="#E0D5C2" />
              <text x={x(value)} y={top + visible.length * rowH + 16} textAnchor="middle">{formatCurrencyEur(value)}</text>
            </g>
          );
        })}
        {visible.map((creator, index) => {
          const cpa = creator.cpaRealEur ?? 0;
          const y = top + index * rowH + 5;
          const good = cpa <= targetCac;
          return (
            <g key={creator.handle}>
              <rect x={left} y={y} width={Math.max(4, x(cpa) - left)} height="18" fill={good ? "#EAF0DC" : "#F6D9D2"} stroke={good ? "#4A5D23" : "#C0392B"} strokeWidth="2" />
              <text x={left - 8} y={y + 13} textAnchor="end" className="label">{creator.handle}</text>
              <text x={x(cpa) + 6} y={y + 13} className={good ? "good" : "bad"}>{formatCurrencyEur(cpa)}</text>
            </g>
          );
        })}
        <line x1={x(targetCac)} y1={top - 4} x2={x(targetCac)} y2={top + visible.length * rowH + 2} stroke="#1A1A2E" strokeWidth="2" strokeDasharray="5 3" />
        <rect x={x(targetCac) - 50} y={top - 18} width="100" height="15" fill="#F4C430" stroke="#1A1A2E" strokeWidth="1.5" rx="3" />
        <text x={x(targetCac)} y={top - 7} textAnchor="middle" className="threshold">break-even {formatCurrencyEur(targetCac)}</text>
      </svg>
    </div>
  );
}

function RenewWatchCut({
  creators,
  targetCac,
}: {
  creators: PartnershipReportCreatorRow[];
  targetCac: number;
}) {
  const renew = creators.filter((creator) => (creator.roi ?? 0) >= 1.5 && creator.belowBreakEven).slice(0, 4);
  const watch = creators.filter((creator) => (creator.roi ?? 0) >= 1 && !renew.includes(creator)).slice(0, 4);
  const cut = creators.filter((creator) => (creator.roi ?? 0) < 1 || ((creator.cpaRealEur ?? 0) > targetCac * 1.25)).slice(0, 4);
  return (
    <div className="m-rwc">
      <DecisionColumn title="Renovar / Escalar" tone="renew" items={renew} />
      <DecisionColumn title="Vigilar" tone="watch" items={watch} />
      <DecisionColumn title="Cortar / Renegociar" tone="cut" items={cut} />
    </div>
  );
}

function DecisionColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "renew" | "watch" | "cut";
  items: PartnershipReportCreatorRow[];
}) {
  return (
    <div className="m-rwcol">
      <div className={cn("m-rwh", tone)}>{title}<span>{items.length}</span></div>
      <div className="m-rwbody">
        {items.length ? items.map((item) => (
          <div key={item.handle} className="m-rwrow">
            <b>{item.handle}</b>
            <span>Ratio CAC obj. {roiDisplay(item.roi)} · CPA {item.cpaRealEur == null ? "-" : formatCurrencyEur(item.cpaRealEur)}</span>
          </div>
        )) : <div className="m-empty">Sin creators.</div>}
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="m-sectiontitle">
      <span>{icon}</span>
      <h2>{title}</h2>
      {subtitle && <small>{subtitle}</small>}
    </div>
  );
}

function ProgressRing({ percent }: { percent: number | null }) {
  const radius = 40;
  const circumference = Math.PI * 2 * radius;
  const safe = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <svg
      width="88"
      height="88"
      viewBox="0 0 96 96"
      className="m-ring"
      role="img"
      aria-label={percent == null ? "Objetivo sin definir" : `${Math.round(safe)}% del objetivo`}
    >
      <circle cx="48" cy="48" r={radius} fill="none" stroke="#E8DCC8" strokeWidth="9" />
      {percent != null && (
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="#C45D35"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * safe) / 100}
          transform="rotate(-90 48 48)"
        />
      )}
      <text x="48" y="54" textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="21" fill="#1E3A5F">
        {percent == null ? "—" : `${Math.round(safe)}%`}
      </text>
    </svg>
  );
}

const QUALITY_SEVERITY: Record<MetricKpiQualityStatus, number> = {
  ok: 0,
  partial: 1,
  stale: 2,
  dirty: 3,
  demo: 4,
  missing: 5,
};

function isWarningQuality(status: MetricKpiQualityStatus): boolean {
  return status === "partial" || status === "dirty" || status === "stale";
}

function hasDisplayableKpiValue(kpi: MetricKpiValue): boolean {
  return kpi.qualityStatus !== "missing" && (kpi.value != null || Boolean(kpi.valueText));
}

const PLACEHOLDER_KPI_IDS = new Set([
  "channels.attribution_results",
  "conversion.stage_rollups",
  "trends.annotations",
]);

function qualitySourceKey(source: string): string {
  const normalized = normalizeComparable(source);
  const aliases: Record<string, string> = {
    "go high level": "ghl",
    "google ads": "google ads",
    "google analytics": "ga4",
    "google search console": "gsc",
    "meta ads": "meta ads",
    creators: "yalc",
    "trust core": "trust score",
    "trust engine": "trust score",
  };
  return aliases[normalized] ?? normalized;
}

function qualitySourceSet(
  kpis: MetricKpiValue[],
  surfaces: SurfaceSummaryEntry[] = [],
  observedSources: string[] = [],
): Set<string> {
  const sources = new Set<string>();
  const add = (source: string) => sources.add(qualitySourceKey(source));
  for (const source of observedSources) add(source);
  for (const surface of surfaces) {
    for (const source of surface.sources) add(source);
    for (const metric of surface.metrics) add(metric.source);
  }
  for (const kpi of kpis.filter(hasDisplayableKpiValue)) {
    for (const source of metricLineageSources(kpi)) add(source);
  }
  return sources;
}

function isRelevantQualityValue(
  kpi: MetricKpiValue,
  activeSources: Set<string>,
): boolean {
  if (hasDisplayableKpiValue(kpi)) return true;
  if (PLACEHOLDER_KPI_IDS.has(kpi.kpiId)) return false;
  return metricLineageSources(kpi)
    .some((source) => activeSources.has(qualitySourceKey(source)));
}

function worstKpiQuality(
  kpis: MetricKpiValue[],
  activeSources = qualitySourceSet(kpis),
): MetricKpiQualityStatus | null {
  return worstQualityStatus(
    kpis
      .filter((kpi) => isRelevantQualityValue(kpi, activeSources))
      .map((kpi) => kpi.qualityStatus),
  );
}

function worstQualityStatus(
  statuses: Array<MetricKpiQualityStatus | null | undefined>,
): MetricKpiQualityStatus | null {
  return statuses.reduce<MetricKpiQualityStatus | null>((worst, status) => {
    if (!status) return worst;
    if (!worst) return status;
    return QUALITY_SEVERITY[status] > QUALITY_SEVERITY[worst] ? status : worst;
  }, null);
}

export function metricQualityCopy(status: MetricKpiQualityStatus): {
  label: string;
  detail: string;
  tone: "demo" | "warn" | "missing" | "ok";
} {
  if (status === "demo") return { label: "DEMO", detail: "Dato de demostración; no procede de una integración real.", tone: "demo" };
  if (status === "dirty") return { label: "REVISAR", detail: "La fuente marcó este dato para revisión.", tone: "warn" };
  if (status === "stale") return { label: "ATRASADO", detail: "Este dato está fuera de su cadencia de actualización.", tone: "warn" };
  if (status === "partial") return { label: "PARCIAL", detail: "El cálculo tiene cobertura incompleta.", tone: "warn" };
  if (status === "missing") return { label: "SIN DATO", detail: "No existe un valor válido para este KPI y rango.", tone: "missing" };
  return { label: "VERIFICADO", detail: "Dato disponible con cobertura completa.", tone: "ok" };
}

export function displayKpiValue(kpi?: MetricKpiValue | null, fallback = "-"): string {
  if (!kpi || kpi.qualityStatus === "missing" || !hasDisplayableKpiValue(kpi)) return fallback;
  return kpi.displayValue;
}

function metricNumericValue(kpi?: MetricKpiValue | null): number | null {
  if (!kpi || kpi.qualityStatus === "missing") return null;
  return numericValue(kpi.value);
}

export function MetricQualityBadge({ kpi }: { kpi?: MetricKpiValue | null }) {
  if (!kpi) return null;
  const provenance = kpi.provenanceLabel || [kpi.source, kpi.metricName].filter(Boolean).join(" · ");
  return <QualityStatusBadge status={kpi.qualityStatus} provenance={provenance} />;
}

function QualityStatusBadge({
  status,
  provenance,
}: {
  status?: MetricKpiQualityStatus | null;
  provenance?: string | null;
}) {
  if (!status || status === "ok") return null;
  const quality = metricQualityCopy(status);
  return (
    <span
      className={cn("m-quality-badge", quality.tone)}
      title={[quality.detail, provenance ? `Origen: ${provenance}` : null].filter(Boolean).join(" ")}
    >
      {quality.label}
    </span>
  );
}

export function deltaTone(kpi?: MetricKpiValue | null): "up" | "down" | "flat" {
  if (kpi?.comparison?.sentiment === "positive") return "up";
  if (kpi?.comparison?.sentiment === "negative") return "down";
  return "flat";
}

function DeltaBadge({ kpi }: { kpi?: MetricKpiValue | null }) {
  if (kpi?.qualityStatus === "missing") return <span className="m-chip flat">-</span>;
  const delta = kpi?.comparison?.displayDelta;
  if (!delta) return <span className="m-chip flat">-</span>;
  return (
    <span className={cn("m-chip", deltaTone(kpi))}>
      {kpi.comparison?.direction === "down" ? "▼" : kpi.comparison?.direction === "up" ? "▲" : "•"} {delta}
    </span>
  );
}

function StatusDot({ state }: { state: MetricDataState }) {
  return <span className={cn("m-dot", stateClass(state))} title={stateLabel(state)} />;
}

function KpiComparisonTable({ kpis }: { kpis: MetricKpiValue[] }) {
  const uniqueKpis = dedupeKpis(kpis);
  if (!uniqueKpis.length) return null;
  return (
    <div>
      <SectionTitle icon="↔️" title="Comparación del periodo" />
      <div className="m-panel m-table-panel">
        <table className="m-ct">
          <thead><tr><th>Métrica</th><th>Actual</th><th>Periodo anterior</th><th>Δ</th></tr></thead>
          <tbody>
            {uniqueKpis.map((kpi) => (
              <tr key={kpi.id}>
                <td>{kpi.label} <MetricQualityBadge kpi={kpi} /></td>
                <td className="num">{displayKpiValue(kpi)}</td>
                <td className="num">{kpi.qualityStatus === "missing" ? "-" : (kpi.comparison?.previousDisplayValue ?? "-")}</td>
                <td><DeltaBadge kpi={kpi} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function dedupeKpis(kpis: MetricKpiValue[]): MetricKpiValue[] {
  const seen = new Set<string>();
  return kpis.filter((kpi) => {
    const key = kpi.kpiId || kpi.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildFunnelModel(data?: MetricKpiResult) {
  const stageRollups = data?.stageRollups;
  const stages = stageRollups?.available
    ? stageRollups.stages.map((stage) => stageToModel(stage))
    : fallbackFunnelStages(data);
  return {
    stages,
    // Aggregated provider observations have no shared person identity. Keep
    // transitions explicitly unavailable even if an older API payload still
    // contains a percentage.
    rates: buildUnavailableRates(stages),
    totalConversion: "-",
    sourceAggregated: stageRollups?.available === true,
  };
}

function stageToModel(stage: MetricStageRollupStageValue): FunnelStageModel {
  return {
    id: stage.stageId,
    label: stage.label,
    displayValue: stage.qualityStatus === "missing" ? "-" : stage.displayValue,
    value: stage.qualityStatus === "missing" ? null : numericValue(stage.value),
    sources: stage.sources,
    qualityStatus: stage.qualityStatus,
    aggregationStatus: stage.aggregationStatus,
    seriesCount: stage.seriesCount,
  };
}

function fallbackFunnelStages(data?: MetricKpiResult): FunnelStageModel[] {
  return DEFAULT_FUNNEL_STAGE_LABELS.map((label) => {
    const kpi = findKpi(data?.values ?? [], funnelCandidates(label));
    return {
      id: normalizeComparable(label).replace(/\s+/g, "_"),
      label,
      displayValue: displayKpiValue(kpi),
      value: metricNumericValue(kpi),
      sources: kpi?.source ? [kpi.source] : [],
      qualityStatus: kpi?.qualityStatus,
      cost: label === "Leads" ? displayKpiValue(findKpi(data?.values ?? [], ["cpl", "cost per lead"]), "") || null : null,
    };
  });
}

function buildUnavailableRates(stages: FunnelStageModel[]): FunnelRateModel[] {
  return stages.slice(0, -1).map((stage, index) => {
    const next = stages[index + 1];
    return {
      from: stage.label,
      to: next.label,
      displayValue: "-",
      value: null,
      leak: false,
      qualityStatus: stage.value != null && next.value != null
        ? "partial"
        : "missing",
    };
  });
}

export function buildChannelRows(stageRollups: MetricStageRollupResult | undefined, stages: FunnelStageModel[]): ChannelMatrixRow[] {
  if (!stageRollups?.available) return [];
  return stageRollups.channels.map((channel) => channelToRow(channel, stages));
}

function channelToRow(
  channel: MetricStageRollupChannelValue,
  stages: FunnelStageModel[],
): ChannelMatrixRow {
  const inferredSources = uniqueStrings(
    channel.stages.flatMap((stage) => stage.sources.map(sourceFromMetricRef)),
  );
  const source = channel.source ?? (inferredSources.length === 1 ? inferredSources[0] : null);
  const providerSeparated = Boolean(source);
  return {
    id: channel.seriesKey ?? `${channel.channel}:${source ?? (inferredSources.join("+") || "unknown")}`,
    channel: channel.channel,
    source,
    label: source
      ? `${channel.label} · ${friendlySource(source)}`
      : `${channel.label} · ${inferredSources.length || "varios"} proveedores sin separar`,
    icon: channelIcon(channel.channel, channel.label),
    stages: stages.map((stage) => {
      const value = channel.stages.find((item) => item.stageId === stage.id || item.label === stage.label);
      const valueSources = uniqueStrings((value?.sources ?? []).map(sourceFromMetricRef));
      const safeProviderSeries = providerSeparated || valueSources.length <= 1;
      const numeric = value?.qualityStatus === "missing" || !safeProviderSeries
        ? null
        : numericValue(value?.value);
      return {
        stageId: stage.id,
        label: stage.label,
        displayValue: !safeProviderSeries && valueSources.length > 1
          ? `${valueSources.length} series sin sumar`
          : value?.qualityStatus === "missing"
            ? "-"
            : (value?.displayValue ?? "-"),
        value: numeric,
        qualityStatus: !safeProviderSeries ? "partial" : value?.qualityStatus,
      };
    }),
    rates: channel.rates.map((rate) => ({
      key: `${rate.fromStageId}-${rate.toStageId}`,
      label: `${rate.fromLabel}→${rate.toLabel}`,
      displayValue: "-",
      value: null,
      qualityStatus: rate.qualityStatus === "missing" ? "missing" : "partial",
    })),
  };
}

function sourceFromMetricRef(value: string): string {
  const separator = value.indexOf(".");
  return separator > 0 ? value.slice(0, separator) : value;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function buildSurfaceCard(
  def: SurfaceDef,
  entry: SurfaceSummaryEntry | undefined,
  configured: boolean | undefined,
  kpiData: MetricKpiResult | undefined,
): SurfaceCardModel {
  const copy = SURFACE_COPY[def.key];
  const kpis = selectSurfaceKpis(kpiData, def.key);
  const primary =
    kpis.find(hasDisplayableKpiValue) ??
    entry?.metrics?.find((metric) => metric.value != null);
  const primaryKpi = "displayValue" in (primary ?? {}) ? primary as MetricKpiValue : null;
  const rawState = surfaceState(def, entry, configured);
  const state = surfaceStateWithKpiQuality(
    rawState,
    kpis,
    entry?.sources,
    entry?.dataStatus === "connected_no_data",
  );
  const sources = [...new Set([
    ...(entry?.sources ?? []),
    ...observedMetricLineageSources(kpis),
  ])];
  const value = primaryKpi
    ? displayKpiValue(primaryKpi)
    : (primary?.value != null ? formatCompact(primary.value) : stateValue(state));
  return {
    key: def.key,
    icon: copy?.icon ?? def.emoji,
    label: copy?.label ?? SURFACE_DETAIL_CONFIGS[def.key].label,
    description: copy?.metric ?? def.what,
    state,
    sources,
    value,
    kpi: primaryKpi,
  };
}

function buildEconomyCards(data?: MetricKpiResult) {
  const values = data?.values ?? [];
  const investment = findKpi(values, ["spend", "inversion", "inversión", "investment"]);
  const cac = findKpi(values, ["cac", "cpa", "coste por cliente"]);
  const revenue = findKpi(values, ["revenue", "revenue generado", "ingresos"]);
  const roas = findKpi(values, ["roas", "roi"]);
  return [
    { label: investment ? `💸 ${investment.label}` : "💸 Sin KPI blended de inversión", value: displayKpiValue(investment), detail: sourceMetricLabel(investment), tone: "navy" as const, kpi: investment },
    { label: cac ? `🎯 ${cac.label}` : "🎯 Sin KPI blended de CAC", value: displayKpiValue(cac), detail: sourceMetricLabel(cac), tone: "rust" as const, kpi: cac },
    { label: revenue ? `💰 ${revenue.label}` : "💰 Sin KPI blended de revenue", value: displayKpiValue(revenue), detail: sourceMetricLabel(revenue), tone: "sage" as const, kpi: revenue },
    { label: roas ? `📈 ${roas.label}` : "📈 Sin KPI blended de ROAS", value: displayKpiValue(roas), detail: sourceMetricLabel(roas), tone: "cyan" as const, kpi: roas },
  ];
}

function selectTrendKpis(data?: MetricKpiResult, northStar?: MetricKpiValue | null): Array<MetricKpiValue | null> {
  const values = data?.values ?? [];
  const selected = [
    findKpi(values, ["sessions"]),
    findKpi(values, ["leads"]),
    findKpi(values, ["cpl", "cost per lead"]),
    findKpi(values, ["pipeline", "pipelineValue"]),
    findKpi(values, ["roas"]),
    findKpi(values, ["trust_score", "reputation.trust_score"]),
  ].filter(Boolean) as MetricKpiValue[];
  const result = [...selected];
  for (const kpi of values.filter((item) => item.id !== northStar?.id).sort((a, b) => scoreKpi(b) - scoreKpi(a))) {
    if (result.length >= 6) break;
    if (!result.some((item) => item.id === kpi.id)) result.push(kpi);
  }
  while (result.length < 6) result.push(null as unknown as MetricKpiValue);
  return result.slice(0, 6);
}

function selectSurfaceKpis(data: MetricKpiResult | undefined, surface: SurfaceKey): MetricKpiValue[] {
  return (data?.values ?? [])
    .filter((kpi) => kpi.dashboardBlock === "surface" && kpi.surface === surface)
    .sort((a, b) => scoreKpi(b) - scoreKpi(a));
}

function customMetricSurface(surface?: string): SurfaceKey | null {
  const normalized = surface?.trim().toLowerCase();
  return normalized && SURFACES.some((item) => item.key === normalized)
    ? (normalized as SurfaceKey)
    : null;
}

export function selectDashboardCustomMetrics(
  data?: MetricKpiResult,
  dashboardDefinition?: DashboardDefinition | null,
  surface: SurfaceKey | null = null,
): DashboardCustomMetricModel[] {
  const values = new Map(
    (data?.values ?? [])
      .filter((value) => value.kpiId.startsWith("custom."))
      .map((value) => [value.kpiId, value]),
  );
  return (dashboardDefinition?.customMetrics ?? [])
    .filter((definition) => customMetricSurface(definition.surface) === surface)
    .map((definition) => ({
      definition,
      kpi: values.get(`custom.${definition.id}`) ?? null,
    }));
}

function metricLineageSources(kpi: MetricKpiValue): string[] {
  const inputSources = (kpi.inputRefs ?? [])
    .map((ref) => ref.source)
    .filter((source): source is string => typeof source === "string" && Boolean(source.trim()));
  if (kpi.source === "custom" && inputSources.length) return [...new Set(inputSources)];
  return kpi.source ? [kpi.source] : inputSources;
}

export function observedMetricLineageSources(kpis: MetricKpiValue[]): string[] {
  return [...new Set(
    kpis.filter(hasDisplayableKpiValue).flatMap(metricLineageSources),
  )];
}

export function selectDashboardNorthStarKpi(
  data?: MetricKpiResult,
  dashboardDefinition?: DashboardDefinition | null,
): MetricKpiValue | null {
  const values = data?.values ?? [];
  if (!values.length) return null;
  const northStar = dashboardDefinition?.northStar;
  const ref = normalizeComparable(northStar?.kpiRef);
  const label = normalizeComparable(northStar?.label);

  if (ref) {
    const explicit = values.find((kpi) =>
      [kpi.kpiId, kpi.label, kpi.metricName, `${kpi.source ?? ""}.${kpi.metricName ?? ""}`]
        .some((candidate) => normalizeComparable(candidate) === ref),
    );
    if (explicit) return explicit;
  }

  if (label) {
    const labelMatch = values.find((kpi) => normalizeComparable(kpi.label) === label);
    if (labelMatch) return labelMatch;
    const inferred = values.find((kpi) => northStarMatchesKpi(label, kpi));
    if (inferred) return inferred;
  }

  return data?.northStar ?? null;
}

const QUALIFIED_NORTH_STAR_PATTERN = /cualific|qualif|\bsql\b/;

function northStarMatchesKpi(label: string, kpi: MetricKpiValue): boolean {
  const haystack = normalizeComparable(`${kpi.kpiId} ${kpi.label} ${kpi.source ?? ""} ${kpi.metricName ?? ""}`);
  if (
    QUALIFIED_NORTH_STAR_PATTERN.test(label) &&
    !QUALIFIED_NORTH_STAR_PATTERN.test(haystack)
  ) return false;
  if (/meeting|reunion|cita|appointment/.test(label)) return /meeting|reunion|cita|appointment/.test(haystack);
  if (/lead|contact|cualific|qualif|\bsql\b/.test(label)) return /lead|contact|cualific|qualif|\bsql\b/.test(haystack);
  if (/deal|opportunit|oportunidad|proposal|propuesta/.test(label)) return /deal|opportunit|oportunidad|proposal|propuesta/.test(haystack);
  if (/revenue|gmv|venta|sales|ingreso/.test(label)) return /revenue|gmv|venta|sales|ingreso|value/.test(haystack);
  return false;
}

function findKpi(kpis: MetricKpiValue[], candidates: string[]): MetricKpiValue | null {
  const normalized = candidates.map(normalizeComparable).filter(Boolean);
  const exact = kpis.find((kpi) => {
    const fields = [
      kpi.kpiId,
      kpi.metricName ?? "",
      `${kpi.source ?? ""}.${kpi.metricName ?? ""}`,
      kpi.label,
    ].map(normalizeComparable);
    return normalized.some((candidate) => fields.some((field) => field === candidate));
  });
  if (exact) return exact;

  return kpis.find((kpi) => {
    const fields = [
      kpi.kpiId,
      kpi.metricName ?? "",
      kpi.label,
    ].map(normalizeComparable);
    return normalized.some((candidate) =>
      candidate.length >= 4 && fields.some((field) => field.includes(candidate) || candidate.includes(field)),
    );
  }) ?? null;
}

function funnelCandidates(label: string): string[] {
  const comparable = normalizeComparable(label);
  if (comparable.includes("session")) return ["sessions", "ga4.sessions", "web.sessions"];
  if (comparable.includes("lead")) return ["leads", "newContacts", "pipeline.ghl.new_contacts"];
  if (comparable.includes("cual")) return ["qualified", "sql", "cualificados"];
  if (comparable.includes("reunion")) return ["meetings", "appointments", "reuniones"];
  if (comparable.includes("oportun") || comparable.includes("deal")) return ["opportunities", "deals", "closed won"];
  return [label];
}

function sourceMetricLabel(kpi?: MetricKpiValue | null): string {
  if (!kpi) return "Sin dato para este rango";
  if (kpi.source && kpi.metricName) return `${friendlySource(kpi.source)} · ${friendlyMetric(kpi.metricName)}`;
  return kpi.provenanceLabel ? friendlyMetric(kpi.provenanceLabel) : "KPIs calculados";
}

function friendlySource(source: string): string {
  const labels: Record<string, string> = {
    ga4: "GA4",
    gsc: "Search Console",
    ghl: "GHL",
    google_ads: "Google Ads",
    "google-ads": "Google Ads",
    instantly: "Instantly",
    explee: "Explee AutoGTM",
    meta_ads: "Meta Ads",
    "meta-ads": "Meta Ads",
    metricool: "Metricool",
    pagespeed: "PageSpeed",
    posthog: "PostHog",
    trust_score: "Trust Core",
    yalc: "Partnerships",
  };
  return labels[source] ?? friendlyMetric(source);
}

function friendlyMetric(metric: string): string {
  const labels: Record<string, string> = {
    appointments: "reuniones",
    clicks: "clicks",
    deals: "deals",
    impressions: "impresiones",
    leads: "leads",
    newContacts: "nuevos contactos",
    pipelineValue: "pipeline",
    revenue: "revenue",
    roas: "ROAS",
    sessions: "sessions",
    spend: "inversión",
    trust_score: "Trust Core Global",
  };
  return labels[metric] ?? metric.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function scoreKpi(kpi: MetricKpiValue): number {
  let score = kpi.value != null ? 10 : 0;
  if (kpi.qualityStatus === "ok") score += 5;
  if (kpi.qualityStatus === "partial") score += 4;
  if (kpi.dashboardBlock === "overview") score += 4;
  return score;
}

export function surfaceState(def: SurfaceDef, entry: SurfaceSummaryEntry | undefined, configured?: boolean): MetricDataState {
  if (!configured) return "SIN DATOS";
  if (!entry?.connected) return "OFF";
  const req = SURFACE_MANDATORY_SOURCES[def.key];
  if (req) {
    const sources = new Set(entry.sources);
    const allOk = !req.allOf || req.allOf.every((source) => sources.has(source));
    const anyOk = !req.anyOf || req.anyOf.some((source) => sources.has(source));
    if (!allOk || !anyOk) return "PARCIAL";
  }
  if (!entry.metrics?.length) return "CONECTADO SIN SNAPSHOTS";
  return "ON";
}

export function surfaceStateWithKpiQuality(
  rawState: MetricDataState,
  kpis: MetricKpiValue[],
  observedSources: string[] = [],
  authoritativeNoData = false,
): MetricDataState {
  if (authoritativeNoData && rawState === "CONECTADO SIN SNAPSHOTS") return rawState;
  if (!kpis.some(hasDisplayableKpiValue)) return rawState;
  const quality = worstKpiQuality(kpis, qualitySourceSet(kpis, [], observedSources));
  if (quality && quality !== "ok") return "PARCIAL";
  return rawState === "CONECTADO SIN SNAPSHOTS" ? "ON" : rawState;
}

function indexSurfaceEntries(entries?: SurfaceSummaryEntry[]): Partial<Record<SurfaceKey, SurfaceSummaryEntry>> {
  const out: Partial<Record<SurfaceKey, SurfaceSummaryEntry>> = {};
  for (const entry of entries ?? []) out[entry.surface] = entry;
  return out;
}

function normalizeTab(value: unknown): MetricDashboardTab | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return METRIC_DASHBOARD_TABS.some((tab) => tab.key === raw) ? (raw as MetricDashboardTab) : null;
}

function normalizeSurface(value: unknown): SurfaceKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return METRICS_SURFACE_ORDER.includes(raw as SurfaceKey) ? (raw as SurfaceKey) : null;
}

function cleanRouteQuery(query: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" || Array.isArray(value)) out[key] = value;
  }
  return out;
}

function normalizeComparable(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
}

function numericValue(value: unknown): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricDisplay(kpi?: MetricKpiValue | null): string {
  return displayKpiValue(kpi, "Sin dato");
}

function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-ES", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  }).format(value);
}

function formatCurrencyEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `€${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: Math.abs(value) < 100 ? 1 : 0,
  }).format(value)}`;
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: value < 0.1 ? 1 : 0 }).format(value);
}

function safeRatio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function ratioDisplay(numerator: number | null | undefined, denominator: number | null | undefined): string {
  return formatPercent(safeRatio(numerator, denominator));
}

function sparkFromKpi(kpi?: MetricKpiValue | null): number[] {
  if (kpi?.qualityStatus === "missing") return [];
  const current = metricNumericValue(kpi);
  const previous = numericValue(kpi?.comparison?.previousValue);
  if (current == null || previous == null) return [];
  return [previous, current];
}

export function northStarTarget(definition?: DashboardDefinition | null): number | null {
  return numericValue(definition?.northStar?.target);
}

export function percentOfTarget(value?: number | null, target?: number | null): number | null {
  const numeric = numericValue(value);
  const numericTarget = numericValue(target);
  if (numeric == null || numericTarget == null || numericTarget <= 0) return null;
  return (numeric / numericTarget) * 100;
}

function formatKpiTarget(target: number, kpi?: MetricKpiValue | null): string {
  if (kpi?.unit === "account_currency") return `${formatCompact(target)} moneda cuenta`;
  if (kpi?.unit === "currency") return formatCurrencyEur(target);
  if (kpi?.unit === "%") return `${formatCompact(target)}%`;
  if (kpi?.unit === "ratio") return `${formatCompact(target)}x`;
  return formatCompact(target);
}

export function stageRateToFraction(value: unknown): number | null {
  const numeric = numericValue(value);
  if (numeric == null) return null;
  return Math.max(0, Math.min(1, numeric / 100));
}

function rangeLabel(range: DateRange): string {
  return DATE_RANGES.find((item) => item.key === range)?.label ?? range;
}

function stateValue(state: MetricDataState): string {
  if (state === "ON") return "Sin datos para este rango";
  if (state === "PARCIAL") return "Datos parciales";
  if (state === "CONECTADO SIN SNAPSHOTS") return "Fuente detectada sin resumen";
  if (state === "COMING SOON") return "Próximamente";
  if (state === "OFF") return "Sin datos recientes";
  return "Métricas no configuradas";
}

export function stateLabel(state: MetricDataState): string {
  if (state === "ON") return "Datos recibidos";
  if (state === "PARCIAL") return "Datos parciales";
  if (state === "CONECTADO SIN SNAPSHOTS") return "Fuente detectada sin resumen";
  if (state === "COMING SOON") return "Próximamente";
  if (state === "OFF") return "Sin datos recientes";
  return "Métricas no configuradas";
}

function stateClass(state: MetricDataState): string {
  if (state === "ON") return "on";
  if (state === "PARCIAL" || state === "CONECTADO SIN SNAPSHOTS") return "partial";
  return "off";
}

function conversionHeatStyle(value?: number | null): CSSProperties {
  if (value == null) return {};
  const t = Math.max(0, Math.min(1, value / 0.55));
  const r = Math.round(246 - (246 - 218) * t);
  const g = Math.round(200 + (236 - 200) * t);
  const b = Math.round(190 + (206 - 190) * t);
  return { background: `rgb(${r},${g},${b})` };
}

export function dropoffLabel(value?: number | null): string {
  if (value == null) return "-";
  const fraction = Math.max(0, Math.min(1, value));
  return `−${Math.round((1 - fraction) * 100)}%`;
}

function sumCreatorSparklines(creators: PartnershipReportCreatorRow[]): number[] {
  const maxLength = Math.max(...creators.map((creator) => creator.sparkline.length), 0);
  if (!maxLength) return [];
  return Array.from({ length: maxLength }, (_, index) =>
    creators.reduce((sum, creator) => sum + (creator.sparkline[index] ?? 0), 0),
  );
}

function roiDisplay(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}x`;
}

function epcForCreator(creator: PartnershipReportCreatorRow, targetCac: number): number | null {
  if (!creator.clicks) return null;
  return (creator.conversions * targetCac) / creator.clicks;
}

function buildPartnershipMovers(creators: PartnershipReportCreatorRow[]): MoverItem[] {
  const items: MoverItem[] = [];
  const withRoi = creators.filter((creator) => creator.roi != null);
  const best = [...withRoi].sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))[0];
  const worst = [...withRoi].sort((a, b) => (a.roi ?? 0) - (b.roi ?? 0))[0];
  const inactive = creators.find((creator) => creator.clicks === 0 && creator.postsLive === 0);
  if (best) {
    items.push({ tone: "up", icon: "↗", title: `${best.handle} lidera el ratio a CAC objetivo ${roiDisplay(best.roi)}`, subtitle: `CPA ${best.cpaRealEur == null ? "-" : formatCurrencyEur(best.cpaRealEur)} contra break-even ${formatCurrencyEur(best.breakEvenCpaEur)}` });
  }
  const promising = creators.find((creator) => creator.conversions > 0 && creator.cpaRealEur != null && creator.belowBreakEven);
  if (promising && promising.handle !== best?.handle) {
    items.push({ tone: "act", icon: "✓", title: `${promising.handle} bajo break-even`, subtitle: `${formatCompact(promising.conversions)} primeras transacciones` });
  }
  if (worst && worst.roi != null && worst.roi < 1) {
    items.push({ tone: "alert", icon: "!", title: `${worst.handle} bajo break-even`, subtitle: `Ratio CAC obj. ${roiDisplay(worst.roi)} · renegociar fee o cortar` });
  }
  if (inactive) {
    items.push({ tone: "warn", icon: "•", title: `${inactive.handle} sin actividad`, subtitle: "0 clicks y 0 posts live en la ventana" });
  }
  return items.slice(0, 4);
}

function sourceIcon(source: string): string {
  const normalized = normalizeComparable(source);
  if (normalized.includes("ga4") || normalized.includes("gsc") || normalized.includes("web")) return "🌐";
  if (normalized.includes("meta") || normalized.includes("ads") || normalized.includes("paid")) return "💰";
  if (normalized.includes("instant") || normalized.includes("email")) return "📧";
  if (normalized.includes("yalc") || normalized.includes("partner")) return "🤝";
  if (normalized.includes("metricool") || normalized.includes("social")) return "📱";
  return "📊";
}

function channelIcon(channel: string, label: string): string {
  const value = normalizeComparable(`${channel} ${label}`);
  if (value.includes("paid") || value.includes("ads")) return "💰";
  if (value.includes("organic") || value.includes("seo") || value.includes("web")) return "🌐";
  if (value.includes("email") || value.includes("outbound") || value.includes("instantly")) return "📧";
  if (value.includes("partner")) return "🤝";
  if (value.includes("social")) return "📱";
  if (value.includes("direct")) return "🔗";
  return "📊";
}

function surfaceGroups(surface: SurfaceKey): string[] {
  if (surface === "paid") return ["Meta Ads", "Google Ads", "Campaigns"];
  if (surface === "email") return ["Instantly", "Replies", "Meetings"];
  if (surface === "social") return ["Metricool", "Posts", "Engagement"];
  if (surface === "partnerships") return ["YALC", "Creators", "Ratio CAC objetivo"];
  return ["KPIs", "Breakdown", "Health"];
}

function MockupStyles() {
  return (
    <style jsx global>{`
      .metrics-mockup {
        --parchment:#F5F0E6; --paper:#FDF8EF; --paper2:#FFFAEC; --aged:#E8DCC8;
        --ink:#1A1A2E; --ink-soft:#3B2A22; --muted:#6B5044; --subtle:#9A8473;
        --rust:#C45D35; --rust-600:#A34A28; --rust-50:#FBE4D6;
        --navy:#1E3A5F; --sage:#4A5D23; --sage-tint:#EAF0DC;
        --sun:#F4C430; --cyan:#3B9EBF; --red:#C0392B; --redbg:#F6D9D2;
        --amber:#FBF1D2; --amber-ink:#9a7d1e;
        --border:#D4C9B8; --border-strong:#C9B89C;
        --pop-xs:2px 2px 0 0 var(--ink); --pop-sm:3px 3px 0 0 var(--ink); --pop-md:5px 5px 0 0 var(--ink);
        --r-sm:6px; --r-md:10px; --r-lg:14px; --r-pill:999px;
        --halftone:radial-gradient(rgba(31,20,16,0.10) 1.1px, transparent 1.5px);
        min-height:100vh;
        padding:22px 26px 70px;
        background:var(--parchment);
        color:var(--ink-soft);
        font-family:'Nunito',system-ui,sans-serif;
        font-size:14.5px;
        line-height:1.45;
      }
      .metrics-mockup *{box-sizing:border-box;}
      .metrics-mockup button{font-family:inherit;cursor:pointer;}
      .metrics-mockup button:disabled{cursor:not-allowed;opacity:.5;}
      .m-wrap{max-width:1100px;margin:0 auto;}
      .m-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:4px;}
      .m-title{display:flex;align-items:center;gap:10px;}
      .m-title span{font-size:23px;}
      .m-title h1,.m-detailbar h2,.m-sectiontitle h2{font-family:'Space Grotesk',system-ui,sans-serif;color:var(--navy);margin:0;letter-spacing:0;font-weight:700;}
      .m-title h1{font-size:24px;}
      .m-submeta{color:var(--muted);font-size:12.5px;margin-top:3px;}
      .m-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      .m-btn{display:inline-flex;align-items:center;gap:6px;background:var(--paper);border:2px solid var(--ink);border-radius:var(--r-md);padding:7px 12px;font-weight:800;font-size:12.5px;color:var(--ink-soft);box-shadow:var(--pop-xs);}
      .m-btn-rust{background:var(--rust);color:#fff;}
      .m-btn-navy{background:var(--navy);color:#fff;}
      .m-range{display:inline-flex;border:2px solid var(--ink);border-radius:var(--r-md);overflow:hidden;box-shadow:var(--pop-xs);}
      .m-range button{border:none;background:var(--paper);padding:6px 10px;font-weight:700;font-size:12px;color:var(--muted);border-right:1.5px solid var(--border);}
      .m-range button:last-child{border-right:none;}
      .m-range button.on{background:var(--rust);color:#fff;}
      .m-tabs{display:flex;gap:7px;border-bottom:2.5px solid var(--ink);margin-top:14px;flex-wrap:wrap;}
      .m-tab{background:var(--paper);border:2.5px solid var(--ink);border-bottom:none;border-radius:12px 12px 0 0;padding:8px 14px;font-weight:800;font-size:13px;color:var(--muted);position:relative;top:2.5px;}
      .m-tab span{margin-right:6px;}
      .m-tab.on{background:var(--rust);color:#fff;}
      .m-inline-alert{margin-top:12px;border:2px solid var(--ink);border-radius:var(--r-md);background:var(--sun);box-shadow:var(--pop-xs);padding:8px 12px;font-size:12px;font-weight:800;}
      .m-inline-alert-error{background:var(--redbg);color:var(--red);border-color:var(--red);}
      .m-aggregation-notice{margin:0 0 12px;border:1.5px solid var(--ink);border-radius:var(--r-sm);background:var(--amber);padding:7px 10px;font-size:11px;font-weight:800;color:var(--amber-ink);}
      .m-panel{background:var(--paper);border:2.5px solid var(--ink);border-radius:var(--r-lg);box-shadow:var(--pop-sm);position:relative;overflow:hidden;}
      .m-panel-halftone:before,.m-intel:before{content:'';position:absolute;inset:0;background-image:var(--halftone);background-size:13px 13px;opacity:.45;pointer-events:none;}
      .m-panel>*{position:relative;}
      .m-pad{padding:14px 16px;}
      .m-statebar,.m-modelbar{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin:16px 0 14px;}
      .m-label{font-size:11.5px;font-weight:800;color:var(--muted);}
      .m-segment-static{background:var(--navy);color:#fff;border:2px solid var(--ink);border-radius:var(--r-pill);box-shadow:var(--pop-xs);padding:5px 13px;font-size:11.5px;font-weight:800;}
      .m-data-state-error .m-segment-static{background:var(--red);}
      .m-data-state-demo .m-segment-static{background:#6D3BB5;color:#fff;}
      .m-data-state-empty .m-segment-static,.m-data-state-partial .m-segment-static{background:var(--sun);color:var(--ink);}
      .m-subtle{font-size:11px;color:var(--subtle);}
      .m-hero{display:grid;grid-template-columns:330px 1fr;gap:0;}
      .m-hero-ns{padding:20px 22px;border-right:2.5px solid var(--ink);background:var(--paper2);}
      .m-hero-econ{padding:18px 20px;}
      .m-eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--rust-600);display:flex;align-items:center;gap:7px;margin-bottom:6px;}
      .m-ns-row{display:flex;align-items:center;gap:16px;}
      .m-ns-big{font-family:'Space Grotesk',system-ui,sans-serif;font-size:48px;font-weight:700;color:var(--navy);line-height:.98;letter-spacing:0;}
      .m-ns-label{font-size:12px;color:var(--muted);font-weight:700;}
      .m-ns-meta{margin-top:11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);}
      .m-ns-meta b{color:var(--navy);font-family:'Space Grotesk';}
      .m-levers{margin-top:14px;padding-top:12px;border-top:1.5px dashed var(--border-strong);}
      .m-levers>div{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--subtle);margin-bottom:7px;}
      .m-lever{display:inline-flex;align-items:center;gap:6px;background:var(--paper);border:1.5px solid var(--ink);border-radius:var(--r-pill);padding:3px 9px;font-size:11px;font-weight:700;box-shadow:var(--pop-xs);margin:0 5px 5px 0;}
      .m-lever b{color:var(--navy);font-family:'Space Grotesk';}
      .m-econ-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      .m-ecard{background:var(--paper2);border:2px solid var(--ink);border-radius:var(--r-md);padding:12px 13px;box-shadow:var(--pop-xs);border-left-width:5px;}
      .m-ecard.navy{border-left-color:var(--navy);}
      .m-ecard.rust{border-left-color:var(--rust);}
      .m-ecard.sage{border-left-color:var(--sage);}
      .m-ecard.cyan{border-left-color:var(--cyan);}
      .m-ecard>div:first-child{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);}
      .m-ecard>b{display:block;font-family:'Space Grotesk';font-size:27px;font-weight:700;color:var(--navy);margin:3px 0 6px;line-height:1;}
      .m-ecard>div:nth-child(3){display:flex;align-items:center;justify-content:space-between;gap:8px;}
      .m-ecard small{display:block;font-size:10.5px;color:var(--subtle);margin-top:5px;}
      .m-chip{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-size:11px;padding:2px 8px;border-radius:var(--r-pill);border:1.5px solid var(--ink);white-space:nowrap;}
      .m-chip.up{background:var(--sage-tint);color:var(--sage);}
      .m-chip.down{background:var(--redbg);color:var(--red);}
      .m-chip.flat{background:var(--aged);color:var(--muted);}
      .m-quality-badge{display:inline-flex;align-items:center;width:max-content;border:1.5px solid currentColor;border-radius:var(--r-pill);padding:1px 6px;font-family:'Space Grotesk';font-size:9px;font-weight:800;line-height:1.25;letter-spacing:.03em;white-space:nowrap;vertical-align:middle;}
      .m-quality-badge.demo{background:#F1E8FF;color:#5C2D91;}
      .m-quality-badge.warn{background:#FFF1C2;color:#785800;}
      .m-quality-badge.missing{background:var(--aged);color:var(--muted);}
      .m-frate .m-quality-badge,.m-cconv .m-quality-badge{background:#FFF1C2;color:#785800;border:1.5px solid currentColor;border-radius:var(--r-pill);padding:1px 5px;font-size:8px;box-shadow:none;}
      .m-frate .m-quality-badge.demo,.m-cconv .m-quality-badge.demo{background:#F1E8FF;color:#5C2D91;}
      .m-frate .m-quality-badge.missing,.m-cconv .m-quality-badge.missing{background:var(--aged);color:var(--muted);}
      .m-sectiontitle{font-size:16px;margin:24px 0 12px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
      .m-sectiontitle>span{font-size:18px;}
      .m-sectiontitle h2{font-size:16px;}
      .m-sectiontitle small{font-size:12px;font-weight:600;color:var(--muted);}
      .m-funnel,.m-conv-funnel{display:flex;align-items:stretch;gap:0;flex-wrap:nowrap;overflow-x:auto;padding:4px 2px 2px;}
      .m-funnel-item,.m-conv-item{display:flex;align-items:stretch;min-width:0;flex:1 1 0;}
      .m-fstage,.m-cstage{flex:1 1 0;min-width:120px;background:var(--paper2);border:2px solid var(--ink);border-radius:var(--r-md);padding:11px;box-shadow:var(--pop-xs);text-align:left;}
      .m-fstage span,.m-cstage span{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
      .m-fstage b,.m-cstage b{display:block;font-family:'Space Grotesk';font-size:24px;font-weight:700;color:var(--navy);line-height:1.05;margin-top:2px;}
      .m-fstage small{font-size:10.5px;color:var(--rust-600);font-weight:700;margin-top:2px;}
      .m-fstage div{margin-top:7px;display:flex;gap:3px;flex-wrap:wrap;}
      .m-fstage i{font-style:normal;font-size:11px;width:19px;height:19px;display:grid;place-items:center;border:1.5px solid var(--ink);border-radius:5px;background:var(--paper);}
      .m-fstage.final,.m-cstage.last{background:var(--sage-tint);}
      .m-frate,.m-cconv{flex:0 0 64px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 2px;}
      .m-cconv{flex-basis:92px;}
      .m-frate span,.m-cconv span{font-family:'Space Grotesk';font-size:13.5px;font-weight:700;color:var(--navy);background:var(--paper);border:1.5px solid var(--ink);border-radius:var(--r-pill);padding:1px 8px;box-shadow:var(--pop-xs);}
      .m-cconv span{font-size:17px;border-width:2px;padding:2px 12px;}
      .m-frate i{font-style:normal;color:var(--subtle);font-weight:800;font-size:15px;margin-top:3px;}
      .m-cconv small{font-size:9.5px;font-weight:800;color:var(--muted);margin-top:4px;}
      .m-frate.leak span,.m-cconv.leak span{background:var(--redbg);border-color:var(--red);color:var(--red);}
      .m-funnel-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:13px;padding-top:12px;border-top:1.5px dashed var(--border-strong);font-size:12px;color:var(--muted);font-weight:700;}
      .m-funnel-foot b{color:var(--navy);font-family:'Space Grotesk';}
      .m-surface-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;}
      .m-surf{background:var(--paper);border:2.5px solid var(--ink);border-radius:var(--r-lg);padding:13px;box-shadow:var(--pop-sm);transition:transform .09s,box-shadow .09s;text-align:left;min-height:156px;}
      .m-surf:hover{transform:translate(-1px,-1px);box-shadow:var(--pop-md);}
      .m-surf.partial{box-shadow:3px 3px 0 0 var(--sun),var(--pop-xs);}
      .m-surf.off{background:repeating-linear-gradient(135deg,var(--aged),var(--aged) 9px,#e3d6bf 9px,#e3d6bf 18px);}
      .m-surf-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:7px;}
      .m-surf-head span{display:flex;align-items:center;gap:7px;font-weight:800;font-size:12.5px;color:var(--navy);}
      .m-surf-head .m-surf-status{font-size:9.5px;color:var(--muted);text-align:right;line-height:1.15;}
      .m-surf-head i{font-style:normal;font-size:15px;}
      .m-dot{width:9px;height:9px;border-radius:50%;display:inline-block;border:1.5px solid var(--ink);flex:0 0 9px;}
      .m-dot.on{background:var(--sage);}
      .m-dot.partial{background:var(--sun);}
      .m-dot.off{background:var(--subtle);}
      .m-surf-value{font-family:'Space Grotesk';font-size:23px;font-weight:700;color:var(--navy);line-height:1.05;}
      .m-surf-meta{font-size:11px;color:var(--muted);margin-top:3px;min-height:28px;}
      .m-surf-sources{font-size:9.5px;color:var(--subtle);font-weight:700;margin-top:5px;min-height:14px;}
      .m-surf-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:8px;}
      .m-table-panel{padding:14px 16px;overflow-x:auto;}
      .m-matrix,.m-ct,.m-cmtx{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;}
      .m-matrix th,.m-ct th,.m-cmtx th{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--muted);padding:8px 6px;text-align:center;border-bottom:2px solid var(--ink);}
      .m-matrix th.chan,.m-matrix td.chan{text-align:left;width:170px;}
      .m-matrix td{padding:4px 5px;text-align:center;}
      .m-matrix td.chan{font-weight:800;color:var(--navy);white-space:nowrap;}
      .m-matrix td.chan span,.m-cmtx td:first-child span{display:inline-grid;width:22px;height:22px;border-radius:6px;border:1.5px solid var(--ink);place-items:center;font-size:12px;background:var(--paper2);vertical-align:middle;margin-right:7px;}
      .m-mcell{border:1.5px solid var(--ink);border-radius:5px;padding:7px 4px;font-family:'Space Grotesk';font-weight:700;color:var(--ink-soft);min-width:84px;}
      .m-mcell.win{box-shadow:0 0 0 2px var(--sun);}
      .m-mcell span{display:block;font-size:8.5px;font-weight:700;color:inherit;opacity:.8;}
      button.m-mcell-btn{display:block;width:100%;background:var(--paper2);text-align:center;font-size:inherit;transition:transform .08s,box-shadow .08s;}
      button.m-mcell-btn:hover{transform:translate(-1px,-1px);box-shadow:var(--pop-xs);background:#fff7ea;}
      .m-conv-strip{margin-top:13px;padding-top:12px;border-top:1.5px dashed var(--border-strong);}
      .m-conv-strip-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--rust-600);display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
      .m-conv-strip-title small{font-size:10px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--subtle);}
      .m-conv-strip-items{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
      .m-conv-step{display:inline-flex;align-items:center;gap:7px;background:var(--paper2);border:1.5px solid var(--ink);border-radius:var(--r-pill);padding:4px 11px;font-size:11px;font-weight:700;color:var(--muted);box-shadow:var(--pop-xs);}
      .m-conv-step b{font-family:'Space Grotesk';font-size:13px;color:var(--navy);}
      .m-conv-step b.na{color:var(--subtle);}
      .m-conv-step i{font-style:normal;font-size:9px;font-weight:800;color:var(--amber-ink);background:var(--amber);border:1px solid var(--ink);border-radius:var(--r-pill);padding:0 6px;}
      .m-conv-won{background:var(--sage-tint);}
      .m-conv-won b{color:var(--sage);}
      .m-drill-overlay{position:fixed;inset:0;z-index:60;background:rgba(26,26,46,.42);display:flex;align-items:flex-start;justify-content:center;padding:6vh 18px 18px;overflow-y:auto;}
      .m-drill{width:min(880px,100%);max-height:84vh;display:flex;flex-direction:column;background:var(--paper);}
      .m-drill-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:2.5px solid var(--ink);background:var(--paper2);}
      .m-drill-head b{display:block;font-family:'Space Grotesk';font-size:16px;font-weight:700;color:var(--navy);}
      .m-drill-head small{display:block;font-size:11px;font-weight:700;color:var(--muted);margin-top:2px;}
      .m-drill-close{padding:5px 10px;}
      .m-drill-table{overflow:auto;}
      .m-drill .m-detail-table{min-width:620px;}
      .m-drill-state{padding:26px 18px;font-size:12.5px;font-weight:700;color:var(--muted);text-align:center;}
      .m-drill-error{color:var(--red);}
      .m-drill-foot{padding:9px 16px;border-top:1.5px dashed var(--border-strong);font-size:10.5px;font-weight:800;color:var(--subtle);}
      .m-ct{border-collapse:collapse;font-size:12.5px;}
      .m-ct th{text-align:left;padding:8px 9px;}
      .m-ct td{padding:9px;border-bottom:1.5px solid var(--border);}
      .m-ct tr.win td{background:var(--sage-tint);}
      .m-ct tr.win td:first-child{border-left:5px solid var(--sage);}
      .m-ct .num{font-family:'Space Grotesk';font-weight:700;color:var(--navy);}
      .m-chan2{font-weight:800;color:var(--navy);display:flex;align-items:center;gap:8px;}
      .m-chan2 i{width:22px;height:22px;border-radius:6px;border:1.5px solid var(--ink);display:grid;place-items:center;font-style:normal;background:var(--paper2);}
      .m-chan2 b{font-size:9px;background:var(--sage);color:#fff;padding:1px 6px;border-radius:var(--r-pill);border:1.5px solid var(--ink);}
      .m-share{position:relative;min-width:90px;}
      .m-share span{position:absolute;left:0;top:4px;bottom:4px;background:var(--sage-tint);border:1px solid var(--sage);border-radius:3px;}
      .m-share b{position:relative;z-index:1;font-family:'Space Grotesk';}
      .m-two-col{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;}
      .m-cmtx{border-collapse:separate;border-spacing:3px;}
      .m-cmtx th{text-align:center;border-bottom:0;}
      .m-cmtx th:first-child,.m-cmtx td:first-child{text-align:left;width:170px;font-weight:800;color:var(--navy);white-space:nowrap;}
      .m-cmtx td div{border:1.5px solid var(--ink);border-radius:5px;padding:7px 4px;text-align:center;font-family:'Space Grotesk';font-weight:700;}
      .m-cmtx td div.na{background:repeating-linear-gradient(135deg,var(--aged),var(--aged) 5px,#e3d6bf 5px,#e3d6bf 10px);color:var(--subtle);}
      .m-lag>div{display:grid;grid-template-columns:84px 1fr 40px;gap:9px;align-items:center;font-size:12px;margin-bottom:9px;}
      .m-lag span{font-weight:700;color:var(--navy);}
      .m-lag i{height:16px;border:2px solid var(--ink);border-radius:var(--r-pill);background:var(--aged);overflow:hidden;box-shadow:var(--pop-xs);}
      .m-lag b{display:block;height:100%;background:var(--cyan);border-right:2px solid var(--ink);}
      .m-lag strong{text-align:right;font-family:'Space Grotesk';font-weight:700;color:var(--navy);}
      .m-leak{display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1.5px dashed rgba(26,26,46,.14);}
      .m-leak>span{width:11px;height:11px;border-radius:50%;border:1.5px solid var(--ink);flex:0 0 11px;}
      .m-leak>span.red{background:var(--red);}
      .m-leak>span.amber{background:var(--sun);}
      .m-leak div{flex:1;}
      .m-leak b{display:block;color:var(--navy);font-size:12.5px;}
      .m-leak small{display:block;color:var(--muted);font-size:11px;}
      .m-leak button{border:2px solid var(--ink);background:var(--paper);border-radius:var(--r-sm);padding:4px 10px;font-weight:800;font-size:11px;box-shadow:var(--pop-xs);}
      .m-trend-hero{padding:14px 8px 10px 4px;}
      .m-trend-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:2px 12px 10px;}
      .m-trend-top>div:first-child>span{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--rust-600);}
      .m-trend-top b{font-family:'Space Grotesk';font-size:38px;font-weight:700;color:var(--navy);letter-spacing:0;}
      .m-trend-top small{font-size:13px;color:var(--muted);font-weight:700;margin:0 10px;}
      .m-trend-top>div:last-child{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:11.5px;font-weight:700;color:var(--muted);}
      .m-trend-top i{width:22px;height:0;display:inline-block;}
      .m-trend-top i.line{border-top:3px solid var(--rust);}
      .m-trend-top i.dash{border-top:2.5px dashed var(--subtle);}
      .m-small-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;}
      .m-smcard{background:var(--paper);border:2.5px solid var(--ink);border-radius:var(--r-md);box-shadow:var(--pop-xs);padding:12px 13px 8px;}
      .m-smh{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;}
      .m-smn{display:flex;align-items:center;gap:7px;font-weight:800;font-size:12.5px;color:var(--navy);}
      .m-smv{display:flex;align-items:baseline;gap:7px;margin:2px 0 6px;}
      .m-smv span{font-family:'Space Grotesk';font-size:24px;font-weight:700;color:var(--navy);letter-spacing:0;}
      .m-smv small{font-size:10.5px;color:var(--subtle);font-weight:700;}
      .m-smcard p{font-size:11px;color:var(--muted);min-height:32px;margin:3px 0 8px;}
      .m-smfoot{font-size:10px;color:var(--subtle);margin-top:5px;text-align:right;font-weight:800;}
      .m-intel{background:var(--paper2);padding:13px 16px;}
      .m-intel-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:2px 2px 11px;border-bottom:2px dashed var(--border-strong);margin-bottom:9px;}
      .m-intel-head>span{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border:2.5px solid var(--ink);border-radius:var(--r-md);background:var(--navy);color:#fff;font-size:18px;box-shadow:var(--pop-xs);}
      .m-intel-head div{flex:1;min-width:230px;}
      .m-intel-head b{display:block;color:var(--navy);font-size:13.5px;}
      .m-intel-head small{display:block;font-size:11px;color:var(--muted);margin-top:2px;}
      .m-intel-head button{background:var(--navy);color:#fff;border:2.5px solid var(--ink);border-radius:var(--r-md);padding:8px 14px;font-weight:800;font-size:12.5px;box-shadow:var(--pop-sm);}
      .m-detailbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0 14px;}
      .m-back{display:inline-flex;align-items:center;gap:8px;background:var(--paper);border:2.5px solid var(--ink);border-radius:var(--r-md);padding:8px 14px;font-weight:800;font-size:13px;color:var(--ink-soft);box-shadow:var(--pop-sm);}
      .m-detailbar h2{font-size:19px;}
      .m-surface-hero{padding:18px 20px;display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:18px;}
      .m-surface-hero p{font-size:12px;color:var(--muted);margin:6px 0 0;}
      .m-surface-subhead{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:2px 0 6px;padding-bottom:13px;border-bottom:2.5px solid var(--ink);}
      .m-surface-subhead h2{display:flex;align-items:center;gap:10px;margin:0;font-family:'Space Grotesk';font-size:24px;font-weight:700;color:var(--navy);letter-spacing:0;}
      .m-surface-subhead h2 span{font-size:22px;}
      .m-subhead-sub{font-size:11.5px;color:var(--muted);font-weight:700;}
      .m-subhead-state{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-left:auto;}
      .m-health-pill{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-size:11px;color:var(--muted);}
      .m-health-pill.on{color:var(--sage);}
      .m-health-pill.partial{color:var(--amber-ink);}
      .m-health-pill.off{color:var(--muted);}
      .m-health-context,.m-subhead-sources{font-size:10.5px;color:var(--muted);font-weight:700;}
      .m-subhead-sources{color:var(--subtle);}
      .m-statebar-tight{margin-top:13px;margin-bottom:2px;}
      .m-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;}
      .m-skpi{background:var(--paper2);border:2px solid var(--ink);border-radius:var(--r-md);padding:11px 12px;box-shadow:var(--pop-xs);min-height:116px;}
      .m-skpi.hero,.m-skpi.good{border-left:5px solid var(--sage);}
      .m-skpi.gate,.m-skpi.navy{border-left:5px solid var(--navy);}
      .m-skpi.bad{border-left:5px solid var(--red);}
      .m-skpi.cyan{border-left:5px solid var(--cyan);}
      .m-skpi.muted{opacity:.66;}
      .m-skpi-label{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);}
      .m-skpi-label i{font-style:normal;font-size:8.5px;color:var(--subtle);border:1.5px solid var(--border-strong);border-radius:var(--r-pill);padding:0 5px;text-transform:none;letter-spacing:0;}
      .m-skpi-value{font-family:'Space Grotesk';font-size:22px;font-weight:700;color:var(--navy);line-height:1;margin:5px 0 8px;letter-spacing:0;}
      .m-skpi-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;}
      .m-line-panel{padding:14px 16px;}
      .m-line-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;font-weight:700;margin-bottom:8px;color:var(--muted);}
      .m-line-legend span{display:inline-flex;align-items:center;gap:6px;}
      .m-line-legend i{width:16px;height:4px;border-radius:2px;border:1px solid var(--ink);}
      .m-line-legend i.navy{background:var(--navy);}
      .m-line-legend i.rust{background:var(--rust);}
      .m-line-legend i.sage{background:var(--sage);}
      .m-line-legend i.cyan{background:var(--cyan);}
      .m-multiline,.m-break-even{width:100%;height:auto;display:block;}
      .m-seq-funnel{display:flex;flex-direction:column;gap:6px;}
      .m-seq-row{display:grid;grid-template-columns:120px 1fr 110px;gap:10px;align-items:center;}
      .m-seq-name{font-weight:800;color:var(--navy);font-size:12px;display:flex;align-items:center;gap:5px;}
      .m-seq-name i{font-style:normal;font-size:8.5px;font-weight:800;color:var(--amber-ink);background:var(--amber);border:1.5px solid var(--ink);border-radius:var(--r-pill);padding:0 5px;}
      .m-seq-track{height:30px;}
      .m-seq-track span{height:30px;border:2px solid var(--ink);border-radius:var(--r-sm);box-shadow:var(--pop-xs);display:flex;align-items:center;padding-left:11px;color:#fff;font-family:'Space Grotesk';font-weight:700;font-size:13px;min-width:0;max-width:100%;}
      .m-seq-note{font-size:11px;color:var(--muted);font-weight:700;}
      .m-empty-breakdown{min-height:136px;display:flex;flex-direction:column;justify-content:center;}
      .m-empty-breakdown div{font-family:'Space Grotesk';font-size:20px;font-weight:700;color:var(--navy);}
      .m-empty-breakdown p{font-size:12px;color:var(--muted);margin:5px 0 0;}
      .m-movers-panel{padding:6px 16px;}
      .m-mover{display:flex;align-items:center;gap:11px;padding:10px 4px;border-bottom:1.5px dashed rgba(26,26,46,.14);flex-wrap:wrap;}
      .m-mover:last-child{border-bottom:none;}
      .m-mover-icon{width:30px;height:30px;flex:0 0 30px;display:grid;place-items:center;border:2px solid var(--ink);border-radius:var(--r-sm);font-size:14px;box-shadow:var(--pop-xs);font-weight:900;}
      .m-mover-icon.up{background:var(--sage-tint);color:var(--sage);}
      .m-mover-icon.warn{background:var(--amber);color:var(--amber-ink);}
      .m-mover-icon.alert{background:var(--redbg);color:var(--red);}
      .m-mover-icon.act{background:#E7F0F4;color:#1d6c84;}
      .m-mover div{flex:1;min-width:230px;}
      .m-mover b{display:block;font-weight:800;color:var(--navy);font-size:12.5px;}
      .m-mover small{display:block;font-size:11px;color:var(--muted);}
      .m-deliv{padding:16px;}
      .m-thresholds{display:flex;flex-direction:column;gap:9px;}
      .m-threshold-row{display:grid;grid-template-columns:120px 1fr 70px;gap:9px;align-items:center;}
      .m-threshold-row>span{font-weight:700;color:var(--navy);font-size:12px;}
      .m-threshold-row>i{height:14px;border:2px solid var(--ink);border-radius:var(--r-pill);overflow:hidden;display:flex;box-shadow:var(--pop-xs);position:relative;font-style:normal;}
      .m-threshold-row b{display:block;height:100%;}
      .m-threshold-row b.g{background:var(--sage-tint);width:60%;}
      .m-threshold-row b.a{background:var(--amber);width:20%;}
      .m-threshold-row b.r{background:var(--redbg);width:20%;}
      .m-threshold-row em{position:absolute;top:-3px;width:3px;height:20px;background:var(--ink);border-radius:2px;font-style:normal;}
      .m-threshold-row strong{text-align:right;font-family:'Space Grotesk';font-weight:700;font-size:12px;color:var(--navy);}
      .m-contrib-panel{padding:12px 16px;background:var(--paper2);}
      .m-contrib{display:flex;align-items:center;gap:0;flex-wrap:wrap;}
      .m-contrib-frag{display:flex;align-items:center;}
      .m-contrib-arrow{color:var(--subtle);font-weight:800;font-size:13px;padding:0 4px;display:flex;flex-direction:column;align-items:center;}
      .m-contrib-arrow i{font-style:normal;font-size:9px;font-weight:800;color:var(--muted);}
      .m-cstep{text-align:center;padding:8px 13px;}
      .m-cstep .cn{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--muted);}
      .m-cstep .cv{font-family:'Space Grotesk';font-size:21px;font-weight:700;color:var(--navy);}
      .m-cstep.leadout .cv{color:var(--rust-600);}
      .m-contrib-note{margin-left:auto;font-size:11.5px;color:var(--muted);max-width:360px;}
      .m-creator-table{width:100%;border-collapse:collapse;font-size:12px;}
      .m-creator-table th{text-align:left;font-size:10px;font-weight:800;text-transform:uppercase;color:var(--muted);padding:8px;border-bottom:2px solid var(--ink);}
      .m-creator-table th.r,.m-creator-table td.r{text-align:right;}
      .m-creator-table td{padding:8px;border-bottom:1.5px solid var(--border);}
      .m-creator-table tbody tr:not(.creator-detail){cursor:pointer;}
      .m-creator-table tbody tr:not(.creator-detail):hover td{background:#fff7ea;}
      .m-creator-table tr.sel td{background:#FCEFE6;}
      .m-creator-table td b{color:var(--navy);}
      .m-creator-table td small{display:inline-block;margin-left:6px;font-size:10px;color:var(--subtle);font-weight:700;}
      .barcell{position:relative;}
      .barcell .bg{position:absolute;left:0;top:3px;bottom:3px;background:var(--rust-50);border:1px solid #E6C3AD;border-radius:3px;z-index:0;}
      .barcell .v{position:relative;z-index:1;font-family:'Space Grotesk';font-weight:700;color:var(--navy);}
      .m-heat{font-weight:800;border-radius:5px;padding:2px 7px;display:inline-block;}
      .m-heat.good{background:var(--sage-tint);color:var(--sage);}
      .m-heat.bad{background:var(--redbg);color:var(--red);}
      .creator-detail td{background:var(--paper2);}
      .m-post-list{display:flex;gap:8px;flex-wrap:wrap;}
      .m-post-list span{border:1.5px solid var(--ink);border-radius:var(--r-pill);background:var(--paper);padding:3px 9px;font-size:11px;font-weight:800;color:var(--navy);}
      .m-break-even text{font-size:8.5px;fill:var(--subtle);font-weight:700;}
      .m-break-even text.label{font-size:11px;fill:var(--navy);}
      .m-break-even text.good{font-size:10.5px;fill:var(--sage);font-weight:800;}
      .m-break-even text.bad{font-size:10.5px;fill:var(--red);font-weight:800;}
      .m-break-even text.threshold{font-size:9px;fill:var(--ink);font-weight:800;}
      .m-rwc{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
      .m-rwcol{border:2.5px solid var(--ink);border-radius:var(--r-md);box-shadow:var(--pop-xs);overflow:hidden;background:var(--paper);}
      .m-rwh{padding:8px 11px;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid var(--ink);}
      .m-rwh.renew{background:var(--sage-tint);color:var(--sage);}
      .m-rwh.watch{background:var(--amber);color:var(--amber-ink);}
      .m-rwh.cut{background:var(--redbg);color:var(--red);}
      .m-rwbody{padding:7px 11px;display:flex;flex-direction:column;gap:7px;}
      .m-rwrow b{display:block;color:var(--navy);font-family:'Space Grotesk';font-size:12px;}
      .m-rwrow span{display:block;color:var(--muted);font-size:10.5px;}
      .m-empty-state{padding:26px 24px;text-align:center;border-color:var(--navy);}
      .m-empty-state>div{font-size:42px;}
      .m-empty-state h3{font-family:'Space Grotesk';font-size:23px;color:var(--navy);margin:8px 0 4px;}
      .m-empty-state p{max-width:600px;margin:2px auto 0;color:var(--muted);font-weight:700;}
      .m-empty{color:var(--muted);font-weight:700;}
      .m-detail-status{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:13px 0 20px;padding:9px 12px;border:2px solid var(--ink);border-radius:var(--r-md);background:var(--paper2);box-shadow:var(--pop-xs);font-size:11px;color:var(--navy);}
      .m-detail-status>span{width:10px;height:10px;border:1.5px solid var(--ink);border-radius:50%;background:var(--sage);flex:0 0 10px;}
      .m-detail-status>b{font-weight:800;letter-spacing:.02em;}
      .m-detail-status>small{margin-left:auto;color:var(--muted);font-weight:700;}
      .m-detail-status.loading>span,.m-detail-status.empty>span{background:var(--sun);}
      .m-detail-status.error>span{background:var(--red);}
      .m-detail-status.partial{background:var(--amber);}
      .m-detail-status.partial>span{background:var(--sun);}
      .m-detail-section{margin:22px 0 30px;min-width:0;}
      .m-detail-section>header{display:flex;align-items:flex-start;gap:11px;margin:0 0 10px;padding-bottom:8px;border-bottom:2px solid var(--ink);}
      .m-detail-section>header>span{display:grid;place-items:center;width:30px;height:30px;flex:0 0 30px;border:2px solid var(--ink);border-radius:50%;background:var(--navy);color:#fff;font-family:'Space Grotesk';font-size:10px;font-weight:800;box-shadow:var(--pop-xs);}
      .m-detail-section>header h3{font-family:'Space Grotesk';font-size:17px;font-weight:700;color:var(--navy);margin:0;letter-spacing:0;}
      .m-detail-section>header p{font-size:11px;color:var(--muted);font-weight:700;margin:2px 0 0;max-width:820px;}
      .m-detail-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}
      .m-detail-kpi{min-width:0;background:var(--paper);border:2px solid var(--ink);border-radius:var(--r-md);box-shadow:var(--pop-xs);padding:11px 12px;}
      .m-detail-kpi:nth-child(4n+1){background:var(--paper2);}
      .m-detail-kpi-label{min-height:28px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.035em;color:var(--muted);}
      .m-detail-kpi-value{overflow-wrap:anywhere;font-family:'Space Grotesk';font-size:22px;font-weight:700;color:var(--navy);line-height:1.05;margin:4px 0 9px;}
      .m-detail-kpi-foot{display:flex;align-items:center;justify-content:space-between;gap:7px;color:var(--subtle);font-size:9px;font-weight:800;}
      .m-detail-table-wrap{overflow-x:auto;}
      .m-detail-table-limit{padding:7px 10px;border-bottom:1.5px dashed var(--border-strong);background:var(--amber);color:var(--amber-ink);font-size:10px;font-weight:800;}
      .m-detail-table{width:100%;min-width:680px;border-collapse:collapse;font-size:11.5px;}
      .m-detail-table th{padding:8px 9px;border-bottom:2px solid var(--ink);background:var(--paper2);color:var(--muted);font-size:9px;font-weight:800;text-align:left;text-transform:uppercase;letter-spacing:.035em;white-space:nowrap;}
      .m-detail-table td{padding:8px 9px;border-bottom:1.5px solid var(--border);color:var(--ink-soft);vertical-align:middle;}
      .m-detail-table tbody tr:last-child td{border-bottom:0;}
      .m-detail-table tbody tr:hover td{background:#fff7ea;}
      .m-detail-table .num{text-align:right;font-family:'Space Grotesk';font-variant-numeric:tabular-nums;}
      .m-detail-table td b{color:var(--navy);font-weight:800;}
      .m-detail-empty{min-height:92px;display:flex;align-items:center;background:repeating-linear-gradient(135deg,var(--aged),var(--aged) 10px,#e3d6bf 10px,#e3d6bf 20px);color:var(--muted);font-size:12px;}
      .m-detail-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;}
      .m-detail-split>.m-detail-section{margin-top:0;}
      .m-provider-funnel{padding:13px 15px;}
      .m-provider-funnel-row{display:grid;grid-template-columns:minmax(130px,210px) minmax(180px,1fr) auto;gap:11px;align-items:center;padding:9px 2px;border-bottom:1.5px dashed var(--border-strong);}
      .m-provider-funnel-row:last-child{border-bottom:0;}
      .m-provider-funnel-label b{display:block;color:var(--navy);font-size:12px;}
      .m-provider-funnel-label small{display:block;color:var(--muted);font-size:9.5px;margin-top:1px;}
      .m-provider-funnel-track{height:29px;position:relative;display:flex;align-items:center;border:2px solid var(--ink);border-radius:var(--r-sm);background:var(--aged);overflow:hidden;}
      .m-provider-funnel-track>span{position:absolute;inset:0 auto 0 0;background:var(--cyan);border-right:2px solid var(--ink);}
      .m-provider-funnel-track>b{position:relative;z-index:1;margin-left:9px;color:var(--navy);font-family:'Space Grotesk';font-size:12px;}
      .m-product-funnel{padding:14px 16px;}
      .m-product-funnel-row{display:grid;grid-template-columns:32px minmax(200px,1fr) 70px auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1.5px dashed var(--border-strong);}
      .m-product-funnel-order{display:grid;place-items:center;width:28px;height:28px;border:2px solid var(--ink);border-radius:50%;background:var(--sun);font-family:'Space Grotesk';font-size:11px;font-weight:800;}
      .m-product-funnel-main>div:first-child{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:4px;}
      .m-product-funnel-main b{color:var(--navy);font-size:12px;}
      .m-product-funnel-main span{color:var(--muted);font-size:9.5px;font-weight:700;text-align:right;}
      .m-product-funnel-track{height:11px;border:1.5px solid var(--ink);border-radius:var(--r-pill);background:var(--aged);overflow:hidden;}
      .m-product-funnel-track span{display:block;height:100%;background:var(--navy);border-right:1.5px solid var(--ink);}
      .m-product-funnel-row>strong{font-family:'Space Grotesk';font-size:16px;color:var(--navy);text-align:right;}
      .m-product-funnel>footer{padding-top:11px;color:var(--muted);font-size:10.5px;font-weight:800;}
      .m-social-posts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;}
      .m-social-posts>.m-detail-table-limit{grid-column:1/-1;border:2px solid var(--ink);border-radius:var(--r-sm);}
      .m-social-post{min-width:0;border:2px solid var(--ink);border-radius:var(--r-md);background:var(--paper);box-shadow:var(--pop-xs);padding:12px;}
      .m-social-post>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:7px;border-bottom:1.5px dashed var(--border-strong);}
      .m-social-post>header>span{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--rust-600);}
      .m-social-post>p{min-height:34px;margin:9px 0;color:var(--navy);font-size:11.5px;font-weight:700;overflow-wrap:anywhere;}
      .m-social-post dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0 0 10px;}
      .m-social-post dl>div{min-width:0;padding:5px 6px;background:var(--paper2);border:1px solid var(--border);border-radius:var(--r-sm);}
      .m-social-post dt{font-size:8px;text-transform:uppercase;color:var(--muted);font-weight:800;overflow-wrap:anywhere;}
      .m-social-post dd{margin:1px 0 0;font-family:'Space Grotesk';font-size:12px;font-weight:700;color:var(--navy);}
      .m-social-post>a{font-size:10px;font-weight:800;color:var(--rust-600);text-decoration:underline;}
      .m-detail-muted{font-size:10px;font-weight:700;color:var(--subtle);}
      .m-discoverability-rail{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;margin:13px 0 20px;padding:10px 12px;border:2.5px solid var(--ink);border-radius:var(--r-md);box-shadow:var(--pop-xs);background:var(--paper);}
      .m-discoverability-rail>b{padding:4px 9px;border:2px solid var(--ink);border-radius:var(--r-pill);background:var(--navy);color:#fff;font-size:10px;}
      .m-discoverability-rail>span{font-size:10.5px;color:var(--muted);font-weight:800;}
      .m-discoverability-rail>i{font-style:normal;padding-left:10px;border-left:1.5px dashed var(--border-strong);font-size:10px;color:var(--subtle);font-weight:800;}
      @media(max-width:1100px){
        .m-hero{grid-template-columns:1fr;}
        .m-hero-ns{border-right:none;border-bottom:2.5px solid var(--ink);}
        .m-surface-grid{grid-template-columns:repeat(2,1fr);}
        .m-two-col{grid-template-columns:1fr;}
        .m-kpi-grid{grid-template-columns:repeat(2,1fr);}
        .m-detail-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
        .m-detail-split{grid-template-columns:1fr;}
        .m-rwc{grid-template-columns:1fr;}
      }
      @media(max-width:780px){
        .metrics-mockup{padding:16px 14px 50px;}
        .m-small-grid,.m-econ-grid{grid-template-columns:1fr;}
        .m-surface-grid{grid-template-columns:1fr;}
        .m-head-actions{width:100%;}
        .m-kpi-grid{grid-template-columns:1fr;}
        .m-detail-kpi-grid,.m-social-posts{grid-template-columns:1fr;}
        .m-provider-funnel-row{grid-template-columns:1fr;}
        .m-product-funnel-row{grid-template-columns:32px minmax(0,1fr) 54px;}
        .m-product-funnel-row>.m-quality-badge{grid-column:2/-1;}
        .m-product-funnel-main>div:first-child{align-items:flex-start;flex-direction:column;gap:2px;}
        .m-product-funnel-main span{text-align:left;}
        .m-social-post dl{grid-template-columns:repeat(2,minmax(0,1fr));}
        .m-discoverability-rail{grid-template-columns:1fr;}
        .m-discoverability-rail>i{padding:8px 0 0;border-left:0;border-top:1.5px dashed var(--border-strong);}
        .m-seq-row{grid-template-columns:92px 1fr;}
        .m-seq-note{grid-column:2;}
      }
    `}</style>
  );
}
