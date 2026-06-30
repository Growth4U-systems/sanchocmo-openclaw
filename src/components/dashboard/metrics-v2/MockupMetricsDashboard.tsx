import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/router";
import {
  useDashboardDefinition,
  useMetricKpis,
  useMetricsHealth,
  useSurfaceSummary,
  type DashboardVersionMeta,
  type MetricKpiResult,
  type MetricKpiValue,
  type MetricStageRollupChannelValue,
  type MetricStageRollupResult,
  type MetricStageRollupStageValue,
  type SurfaceSummaryEntry,
} from "@/hooks/useMetrics";
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
import type { DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import { cn } from "@/lib/utils";

type DateRange = "1d" | "7d" | "30d" | "90d";

const DATE_RANGES: Array<{ key: DateRange; label: string }> = [
  { key: "1d", label: "Ayer" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

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
  "Deals",
];

const ATTRIBUTION_MODELS = [
  "First-touch",
  "W-shaped",
  "Last-touch",
  "Lineal",
  "Data-driven 🔒",
];

const CHANNEL_FALLBACKS = [
  { channel: "paid", label: "Paid", icon: "💰" },
  { channel: "organic", label: "Organic / SEO", icon: "🌐" },
  { channel: "email", label: "Email / Outbound", icon: "📧" },
  { channel: "partnerships", label: "Partnerships", icon: "🤝" },
  { channel: "social", label: "Social", icon: "📱" },
  { channel: "direct", label: "Direct", icon: "🔗" },
];

const SURFACE_COPY: Partial<Record<SurfaceKey, { label: string; icon: string; metric: string }>> = {
  reputation: { label: "Reputation", icon: "🛡️", metric: "Trust Score · 6 pilares" },
  web: { label: "Web & SEO", icon: "🌐", metric: "Sessions · GSC · PageSpeed" },
  product: { label: "Product", icon: "🧪", metric: "Activación y dropoff" },
  pipeline: { label: "Pipeline / CRM", icon: "📇", metric: "Leads · reuniones · pipeline" },
  paid: { label: "Paid", icon: "💰", metric: "Spend · CPL · ROAS" },
  email: { label: "Email / Outbound", icon: "📧", metric: "Enviados · replies · reuniones" },
  social: { label: "Social", icon: "📱", metric: "Posts · impresiones · engagement" },
  partnerships: { label: "Partnerships", icon: "🤝", metric: "Signups · CPA · ROI" },
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
  delta: string | null;
}

interface FunnelStageModel {
  id: string;
  label: string;
  displayValue: string;
  value: number | null;
  sources: string[];
  cost?: string | null;
}

interface FunnelRateModel {
  from: string;
  to: string;
  displayValue: string;
  value: number | null;
  leak: boolean;
}

interface ChannelMatrixRow {
  channel: string;
  label: string;
  icon: string;
  stages: Array<{
    stageId: string;
    label: string;
    displayValue: string;
    value: number | null;
    share: number | null;
    winner: boolean;
  }>;
  rates: Array<{
    key: string;
    label: string;
    displayValue: string;
    value: number | null;
  }>;
}

export function MockupMetricsDashboard({ slug }: { slug: string }) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>("30d");
  const [localTab, setLocalTab] = useState<MetricDashboardTab>("overview");
  const [model, setModel] = useState("W-shaped");
  const openChat = useOpenChat();

  const { data: surfacesData } = useSurfaceSummary(slug);
  const { data: dashboard } = useDashboardDefinition(slug);
  const { data: health } = useMetricsHealth(slug);
  const { data: kpiData } = useMetricKpis(slug, range);

  const activeTab = normalizeTab(router.query.tab) ?? localTab;
  const activeSurface = normalizeSurface(router.query.surface);
  const surfaceEntries = useMemo(
    () => indexSurfaceEntries(surfacesData?.surfaces),
    [surfacesData?.surfaces],
  );
  const surfaceCards = useMemo<SurfaceCardModel[]>(
    () =>
      METRICS_SURFACE_ORDER.flatMap((key) => {
        const def = SURFACES.find((surface) => surface.key === key);
        if (!def) return [];
        return [buildSurfaceCard(def, surfaceEntries[key], surfacesData?.configured, kpiData)];
      }),
    [kpiData, surfaceEntries, surfacesData?.configured],
  );
  const funnel = useMemo(() => buildFunnelModel(kpiData), [kpiData]);
  const channelRows = useMemo(() => buildChannelRows(kpiData?.stageRollups, funnel.stages), [funnel.stages, kpiData?.stageRollups]);

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
            <div className="m-submeta">{slug} · {rangeLabel(range)} · lead-to-sale</div>
          </div>
          <div className="m-head-actions">
            <RangePicker value={range} onChange={setRange} />
            <button type="button" className="m-btn" onClick={() => selectTab("surfaces")}>⚙️ Setup</button>
            <VersionsButton versions={dashboard?.versions ?? []} currentVersion={dashboard?.version ?? null} />
            <button type="button" className="m-btn m-btn-rust" onClick={openMerlin}>🔮 Merlin</button>
          </div>
        </div>

        <TabsNav active={activeTab} onSelect={selectTab} />

        {health?.overall === "stale" && (
          <div className="m-inline-alert">Los datos pueden estar desactualizados. Ejecuta una corrida diaria controlada antes de activar cron.</div>
        )}

        {activeTab === "surfaces" && activeSurface ? (
          <SurfaceDetailView
            surface={activeSurface}
            entry={surfaceEntries[activeSurface]}
            configured={surfacesData?.configured}
            kpiData={kpiData}
            onBack={closeSurface}
          />
        ) : (
          <>
            {activeTab === "overview" && (
              <OverviewView
                slug={slug}
                dashboardDefinition={dashboard?.definition}
                kpiData={kpiData}
                funnel={funnel}
                surfaceCards={surfaceCards}
                openSurface={openSurface}
              />
            )}
            {activeTab === "surfaces" && (
              <SurfacesView surfaceCards={surfaceCards} openSurface={openSurface} />
            )}
            {activeTab === "channels" && (
              <ChannelsView
                model={model}
                onModelChange={setModel}
                funnel={funnel}
                rows={channelRows}
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
      <button type="button" title="Periodo a medida">📅</button>
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
    <button type="button" className="m-btn m-btn-navy" title={versions.map((item) => `v${item.version} · ${item.date.slice(0, 10)}`).join("\n")}>
      🕓 Versiones {currentVersion ? `v${currentVersion}` : ""}
    </button>
  );
}

function TabsNav({
  active,
  onSelect,
}: {
  active: MetricDashboardTab;
  onSelect: (tab: MetricDashboardTab) => void;
}) {
  return (
    <div className="m-tabs">
      {METRIC_DASHBOARD_TABS.map((tab) => (
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
  slug,
  dashboardDefinition,
  kpiData,
  funnel,
  surfaceCards,
  openSurface,
}: {
  slug: string;
  dashboardDefinition?: DashboardDefinition | null;
  kpiData?: MetricKpiResult;
  funnel: ReturnType<typeof buildFunnelModel>;
  surfaceCards: SurfaceCardModel[];
  openSurface: (surface: SurfaceKey) => void;
}) {
  const northStar = selectDashboardNorthStarKpi(kpiData, dashboardDefinition);
  const northStarLabel = dashboardDefinition?.northStar?.label || northStar?.label || "Reuniones cualificadas";
  const economy = buildEconomyCards(kpiData);
  const objective = targetFor(northStar);
  const progress = percentOfTarget(northStar?.value, objective);

  return (
    <div>
      <div className="m-statebar">
        <span className="m-label">Estado del cliente:</span>
        <span className="m-segment-static">Con datos ({slug})</span>
        <span className="m-subtle">Comparando contra periodo anterior</span>
      </div>

      <div className="m-panel m-panel-halftone m-hero">
        <div className="m-hero-ns">
          <div className="m-eyebrow">⭐ North Star</div>
          <div className="m-ns-row">
            <div>
              <div className="m-ns-big">{northStar?.displayValue ?? "-"}</div>
              <div className="m-ns-label">{northStarLabel}</div>
            </div>
            <ProgressRing percent={progress} />
          </div>
          <div className="m-ns-meta">
            <span>Objetivo <b>{formatCompact(objective)}</b></span>
            <DeltaBadge kpi={northStar} />
          </div>
          <MiniBars tone="navy" values={[56, 64, 72, 68, 81, 88, 83, 92, 96, 100]} />
          <div className="m-levers">
            <div>Palancas que la mueven</div>
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
                delta={card.delta}
              />
            ))}
          </div>
        </div>
      </div>

      <SectionTitle icon="🪜" title="Embudo unificado" subtitle="cada etapa la alimentan sus superficies" />
      <UnifiedFunnel funnel={funnel} />

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
  model,
  onModelChange,
  funnel,
  rows,
}: {
  model: string;
  onModelChange: (model: string) => void;
  funnel: ReturnType<typeof buildFunnelModel>;
  rows: ChannelMatrixRow[];
}) {
  return (
    <div>
      <div className="m-modelbar">
        <span className="m-label">Modelo de atribución:</span>
        <div className="m-modelseg">
          {ATTRIBUTION_MODELS.map((item) => (
            <button
              key={item}
              type="button"
              disabled={item.includes("🔒")}
              className={model === item ? "on" : undefined}
              onClick={() => !item.includes("🔒") && onModelChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="m-subtle">W-shaped reparte crédito en las puertas clave del funnel</span>
      </div>

      <CompactFunnel stages={funnel.stages} />

      <SectionTitle icon="📊" title="Matriz canal × etapa" subtitle="contribución de cada canal por etapa" />
      <ChannelMatrix rows={rows} stages={funnel.stages} />

      <SectionTitle icon="🏆" title="Tabla de contribución" subtitle="canales ordenados por cierre atribuido" />
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

      <SectionTitle icon="🔭" title="Señales de atribución" />
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
      <SectionTitle icon="🪜" title="Embudo end-to-end" subtitle="el porcentaje entre etapas es el insight principal" />
      <div className="m-panel m-pad">
        <ConversionFunnel funnel={funnel} />
      </div>

      <SectionTitle icon="📊" title="Conversión por canal" subtitle="un gráfico por canal y transición" />
      <ConversionMatrix rows={rows} />

      <div className="m-two-col">
        <div>
          <SectionTitle icon="⏱️" title="Velocidad" />
          <VelocityPanel />
        </div>
        <div>
          <SectionTitle icon="🚨" title="Dónde se fuga" />
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
      <div className="m-controlbar">
        <div className="m-controlgrp"><span>Granularidad</span><div className="m-controlseg"><button>Día</button><button className="on">Semana</button><button>Mes</button></div></div>
        <div className="m-controlgrp"><span>Comparar con</span><div className="m-controlseg rust"><button className="on">Periodo anterior</button><button>Año pasado</button></div></div>
      </div>

      <SectionTitle icon="⭐" title="North Star en el tiempo" subtitle="serie principal con comparación" />
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

function SurfaceDetailView({
  surface,
  entry,
  configured,
  kpiData,
  onBack,
}: {
  surface: SurfaceKey;
  entry?: SurfaceSummaryEntry;
  configured?: boolean;
  kpiData?: MetricKpiResult;
  onBack: () => void;
}) {
  const def = SURFACES.find((item) => item.key === surface);
  const config = SURFACE_DETAIL_CONFIGS[surface];
  const copy = SURFACE_COPY[surface];
  const kpis = selectSurfaceKpis(kpiData, surface);
  const state = def ? surfaceState(def, entry, configured) : "SIN DATOS";
  return (
    <div>
      <div className="m-detailbar">
        <button type="button" className="m-back" onClick={onBack}>← Surfaces</button>
        <h2>{copy?.icon ?? def?.emoji} {copy?.label ?? config.label}</h2>
      </div>
      {surface === "reputation" ? (
        <ReputationSurface kpis={kpis} state={state} />
      ) : surface === "web" ? (
        <WebSeoSurface kpis={kpis} state={state} />
      ) : surface === "product" ? (
        <GenericSurface title="Product" icon="🧪" kpis={kpis} state={state} groups={["Activation", "Retention", "Friction"]} />
      ) : surface === "pipeline" ? (
        <GenericSurface title="Pipeline / CRM" icon="📇" kpis={kpis} state={state} groups={["Pipeline", "Stage waterfall", "Deal inspection"]} />
      ) : (
        <GenericSurface title={copy?.label ?? config.label} icon={copy?.icon ?? def?.emoji ?? "📊"} kpis={kpis} state={state} groups={surfaceGroups(surface)} />
      )}
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
          <div className="m-ns-big">{trustCore?.displayValue ?? stateLabel(state)}</div>
          <DeltaBadge kpi={trustCore} />
        </div>
        <MiniBars tone="navy" values={[48, 58, 61, 68, 71, 78, 82, 84]} />
      </div>
      <SectionTitle icon="🧱" title="Pilares Trust Core" />
      <div className="m-small-grid">
        {TRUST_PILLARS.map((pillar) => {
          const kpi = findKpi(kpis, [pillar.id]);
          return (
            <div key={pillar.id} className="m-smcard">
              <div className="m-smh"><div className="m-smn">{pillar.label}</div><DeltaBadge kpi={kpi} /></div>
              <div className="m-smv"><span>{kpi?.displayValue ?? "-"}</span><small>/100</small></div>
              <p>{pillar.description}</p>
              <MiniSparkline />
            </div>
          );
        })}
      </div>
      <KpiComparisonTable kpis={[trustCore, ...TRUST_PILLARS.map((pillar) => findKpi(kpis, [pillar.id]))].filter(Boolean) as MetricKpiValue[]} />
    </div>
  );
}

function WebSeoSurface({
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
  return (
    <GenericSurface
      title="Web & SEO"
      icon="🌐"
      kpis={headline.length ? headline : kpis}
      state={state}
      groups={["Google Analytics 4", "Search Console", "PageSpeed"]}
    />
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
          <div className="m-ns-big">{kpis[0]?.displayValue ?? stateLabel(state)}</div>
          <p>{kpis[0]?.label ?? "Sin KPI calculado para este rango"}</p>
        </div>
        <MiniBars tone="navy" values={[32, 44, 40, 52, 64, 58, 76, 82]} />
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
            <div className="m-smv"><span>{kpi.displayValue}</span></div>
            <MiniSparkline />
          </div>
        ))}
      </div>
      <KpiComparisonTable kpis={kpis} />
    </div>
  );
}

function UnifiedFunnel({ funnel }: { funnel: ReturnType<typeof buildFunnelModel> }) {
  return (
    <div className="m-panel m-pad">
      <div className="m-funnel">
        {funnel.stages.map((stage, index) => (
          <div key={stage.id} className="m-funnel-item">
            <button type="button" className={cn("m-fstage", index === 3 && "star", index === funnel.stages.length - 1 && "final")}>
              <span>{stage.label}</span>
              <b>{stage.displayValue}</b>
              {stage.cost && <small>{stage.cost}</small>}
              <div>{stage.sources.slice(0, 4).map((source) => <i key={source}>{sourceIcon(source)}</i>)}</div>
            </button>
            {funnel.rates[index] && (
              <div className={cn("m-frate", funnel.rates[index].leak && "leak")}>
                <span>{funnel.rates[index].displayValue}</span>
                <i>→</i>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="m-funnel-foot">
        <span>Conversión total <b>{funnel.totalConversion}</b></span>
        <span>Revenue <b>{funnel.revenue}</b></span>
        <span>ROAS <b>{funnel.roas}</b></span>
      </div>
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
            </div>
            {funnel.rates[index] && (
              <div className={cn("m-cconv", funnel.rates[index].leak && "leak")}>
                <span>{funnel.rates[index].displayValue}</span>
                <small>{dropoffLabel(funnel.rates[index].value)}</small>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="m-funnel-foot">
        <span>Conversión total <b>{funnel.totalConversion}</b></span>
        <span>{funnel.deals} deals desde {funnel.sessions} sessions</span>
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
          {index < stages.length - 1 && <i>→</i>}
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
            <StatusDot state={card.state} />
          </div>
          <div className="m-surf-value">{card.value}</div>
          <div className="m-surf-meta">{card.description}</div>
          <div className="m-surf-foot">
            <MiniBars tone="navy" values={[24, 36, 48, 44, 60, 76]} />
            {card.delta && <span className="m-chip up">▲ {card.delta}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function ChannelMatrix({
  rows,
  stages,
}: {
  rows: ChannelMatrixRow[];
  stages: FunnelStageModel[];
}) {
  const matrixRows = rows.length ? rows : fallbackChannelRows(stages);
  return (
    <div className="m-panel m-table-panel">
      <table className="m-matrix">
        <thead>
          <tr>
            <th className="chan">Canal</th>
            {stages.map((stage) => <th key={stage.id}>{stage.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrixRows.map((row) => (
            <tr key={row.channel}>
              <td className="chan"><span>{row.icon}</span>{row.label}</td>
              {stages.map((stage, index) => {
                const cell = row.stages[index];
                return (
                  <td key={`${row.channel}-${stage.id}`}>
                    <div
                      className={cn("m-mcell", cell?.winner && "win")}
                      style={heatStyle(cell?.share)}
                    >
                      {cell?.displayValue ?? "-"}
                      <span>{cell?.share != null ? `${Math.round(cell.share * 100)}%` : "-"}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContributionTable({ rows }: { rows: ChannelMatrixRow[] }) {
  if (!rows.length) {
    return (
      <div className="m-panel m-pad m-empty">
        Sin contribución atribuida. Se llena cuando existan rollups por canal y etapa para el rango.
      </div>
    );
  }
  const contrib = rows.map((row) => {
    const leads = row.stages[1]?.value ?? null;
    const deals = row.stages[row.stages.length - 1]?.value ?? null;
    const totalLeads = rows.reduce((sum, item) => sum + (item.stages[1]?.value ?? 0), 0);
    return {
      row,
      leads,
      deals,
      share: leads != null && totalLeads > 0 ? leads / totalLeads : null,
    };
  }).sort((a, b) => (b.deals ?? 0) - (a.deals ?? 0));
  const maxShare = Math.max(...contrib.map((item) => item.share ?? 0), 0.01);
  return (
    <div className="m-panel m-table-panel">
      <table className="m-ct">
        <thead>
          <tr><th>Canal</th><th>Leads atrib.</th><th>Deals</th><th>% del total</th><th>Δ</th></tr>
        </thead>
        <tbody>
          {contrib.map((item, index) => (
            <tr key={item.row.channel} className={index === 0 ? "win" : undefined}>
              <td><span className="m-chan2"><i>{item.row.icon}</i>{item.row.label}{index === 0 && <b>GANADOR</b>}</span></td>
              <td className="num">{item.leads != null ? formatCompact(item.leads) : "-"}</td>
              <td className="num">{item.deals != null ? formatCompact(item.deals) : "-"}</td>
              <td><div className="m-share"><span style={{ width: `${Math.round(((item.share ?? 0) / maxShare) * 100)}%` }} /><b>{item.share != null ? `${Math.round(item.share * 100)}%` : "-"}</b></div></td>
              <td><span className="m-chip up">▲ {index === 0 ? "+4pp" : "+1pp"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConversionMatrix({ rows }: { rows: ChannelMatrixRow[] }) {
  const matrixRows = rows.length ? rows : fallbackChannelRows([]);
  const labels = ["Sesión→Lead", "Lead→Cualif.", "Cualif→Reunión", "Reunión→Deal"];
  return (
    <div className="m-panel m-table-panel">
      <table className="m-cmtx">
        <thead>
          <tr><th>Canal</th>{labels.map((label) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {matrixRows.slice(0, 6).map((row) => (
            <tr key={row.channel}>
              <td><span>{row.icon}</span>{row.label}</td>
              {labels.map((label, index) => {
                const rate = row.rates[index];
                return <td key={label}><div className={rate?.value == null ? "na" : undefined} style={conversionHeatStyle(rate?.value)}>{rate?.displayValue ?? "-"}</div></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelComparison({ rows }: { rows: ChannelMatrixRow[] }) {
  if (!rows.length) {
    return (
      <div className="m-panel m-pad m-empty">
        Sin comparación de modelos. Requiere atribución por canal.
      </div>
    );
  }
  const items = rows.slice(0, 5);
  return (
    <div className="m-panel m-pad">
      {items.map((row, index) => {
        const share = row.stages[1]?.share ?? 0.1;
        return (
          <div key={row.channel} className="m-cmprow">
            <span>{row.label}</span>
            <div>
              <CompareBar label="1er" value={Math.max(0.08, share + (index % 2 ? 0.1 : -0.03))} tone="cyan" />
              <CompareBar label="W" value={share} tone="navy" />
              <CompareBar label="últ" value={Math.max(0.06, share + (index % 2 ? -0.05 : 0.07))} tone="rust" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompareBar({ label, value, tone }: { label: string; value: number; tone: "cyan" | "navy" | "rust" }) {
  return (
    <div className="m-cmpbar">
      <span>{label}</span>
      <i><b className={tone} style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} /></i>
      <strong>{Math.round(value * 100)}%</strong>
    </div>
  );
}

function JourneysPanel({ rows }: { rows: ChannelMatrixRow[] }) {
  if (!rows.length) {
    return (
      <div className="m-panel m-pad m-empty">
        Sin journeys individuales. Requiere eventos por lead/deal.
      </div>
    );
  }
  const visible = rows.slice(0, 5);
  return (
    <div className="m-panel m-pad">
      {visible.map((row, index) => (
        <div key={row.channel} className="m-journey">
          <div>
            <span>{row.icon} {row.label}</span><i>→</i><span>📧 Email</span><i>→</i><span>🏆 Deal</span>
          </div>
          <b>{Math.max(1, 5 - index)} deals</b>
        </div>
      ))}
    </div>
  );
}

function VelocityPanel() {
  const rows = [
    ["< 24h", 8],
    ["1-7 días", 22],
    ["8-30 días", 41],
    ["> 30 días", 29],
  ] as const;
  return (
    <div className="m-panel m-pad">
      <div className="m-lag">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <i><b style={{ width: `${Math.round((value / 41) * 100)}%` }} /></i>
            <strong>{value}%</strong>
          </div>
        ))}
      </div>
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
  const rates = funnel.rates.filter((rate) => rate.value != null).sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  const leaks = rates.slice(0, 3);
  if (!leaks.length) {
    return <div className="m-panel m-pad m-empty">Sin fuga calculable. {stageRollups?.summary.nextAction ?? "Faltan rollups de etapa."}</div>;
  }
  return (
    <div className="m-panel m-pad">
      {leaks.map((rate, index) => (
        <div key={`${rate.from}-${rate.to}`} className="m-leak">
          <span className={index === 0 ? "red" : "amber"} />
          <div><b>{rate.from} → {rate.to}: {rate.displayValue}</b><small>{dropoffLabel(rate.value)} de caída relativa</small></div>
          <button type="button">Ver →</button>
        </div>
      ))}
    </div>
  );
}

function TrendHero({ kpi }: { kpi: MetricKpiValue | null }) {
  const current = numericValue(kpi?.value) ?? 22;
  const points = [14, 13, 15, 16, 15, 17, 18, 17, 19, 20, 21, Math.max(1, current)];
  return (
    <div className="m-panel m-trend-hero">
      <div className="m-trend-top">
        <div>
          <span>⭐ North Star</span>
          <div><b>{kpi?.displayValue ?? "-"}</b><small>{kpi?.label ?? "Reuniones cualificadas"}</small><DeltaBadge kpi={kpi} /></div>
        </div>
        <div><i className="line" /> Este periodo <i className="dash" /> Periodo anterior</div>
      </div>
      <LineChart points={points} />
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
      <div className="m-smv"><span>{kpi?.displayValue ?? fallback.value}</span><small>{fallback.unit}</small></div>
      <MiniSparkline />
      <div className="m-smfoot">abrir →</div>
    </div>
  );
}

function MarkersPanel() {
  const markers = [
    ["🚀", "Lanzamiento campaña", "Nueva tanda de creatividades + landing", "hace 10 sem"],
    ["💲", "Cambio de pricing", "Menos leads, más cualificados", "hace 6 sem"],
    ["🔧", "Fix tracking", "Sessions vuelven a contarse bien", "hace 2 sem"],
  ] as const;
  return (
    <div className="m-panel m-pad">
      {markers.map(([icon, title, subtitle, when]) => (
        <div key={title} className="m-marker">
          <span>{icon}</span>
          <div><b>{title}</b><small>{subtitle}</small></div>
          <i>{when}</i>
        </div>
      ))}
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
          <small>Cuando Intelligence detecte cambios relevantes, aparecerán aquí.</small>
        </div>
        <button type="button">Abrir Intelligence →</button>
      </div>
      <div className="m-ipreview">
        <div><i>↗</i><span>Canal o superficie con mayor mejora</span></div>
        <div><i>⚠️</i><span>Etapa con caída relevante</span></div>
        <div><i>🔒</i><span>Alertas desbloqueadas con señales reales</span></div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  delta,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "navy" | "rust" | "sage" | "cyan";
  delta: string | null;
}) {
  return (
    <div className={`m-ecard ${tone}`}>
      <div>{label}</div>
      <b>{value}</b>
      <div>
        {delta ? <span className="m-chip up">▲ {delta}</span> : <span className="m-chip flat">-</span>}
        <MiniBars tone="navy" values={[70, 84, 78, 92, 96, 100]} />
      </div>
      <small>{detail}</small>
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

function ProgressRing({ percent }: { percent: number }) {
  const radius = 40;
  const circumference = Math.PI * 2 * radius;
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" className="m-ring">
      <circle cx="48" cy="48" r={radius} fill="none" stroke="#E8DCC8" strokeWidth="9" />
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
      <text x="48" y="54" textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="21" fill="#1E3A5F">{Math.round(safe)}%</text>
    </svg>
  );
}

function MiniBars({ tone = "navy", values }: { tone?: "navy" | "sage" | "cyan"; values: number[] }) {
  return (
    <div className={`m-bars ${tone}`}>
      {values.map((value, index) => <span key={index} style={{ height: `${value}%` }} />)}
    </div>
  );
}

function MiniSparkline() {
  return <LineChart compact points={[12, 16, 14, 20, 24, 22, 27, 30]} />;
}

function LineChart({ points, compact }: { points: number[]; compact?: boolean }) {
  const width = compact ? 220 : 920;
  const height = compact ? 46 : 250;
  const padX = compact ? 5 : 40;
  const padTop = compact ? 5 : 30;
  const padBottom = compact ? 5 : 34;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = padX + (index / Math.max(1, points.length - 1)) * (width - padX * 2);
    const y = padTop + (1 - (point - min) / span) * (height - padTop - padBottom);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `${padX},${height - padBottom} ${coords.join(" ")} ${width - padX},${height - padBottom}`;
  return (
    <svg className={compact ? "m-spark" : "m-chart"} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polygon points={area} fill="rgba(74,93,35,.10)" />
      <polyline points={coords.join(" ")} fill="none" stroke="#4A5D23" strokeWidth={compact ? 2.5 : 3} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={coords[coords.length - 1]?.split(",")[0]} cy={coords[coords.length - 1]?.split(",")[1]} r={compact ? 3.4 : 5} fill="#4A5D23" stroke="#1A1A2E" strokeWidth="1.5" />
    </svg>
  );
}

function DeltaBadge({ kpi }: { kpi?: MetricKpiValue | null }) {
  const delta = kpi?.comparison?.displayDelta;
  if (!delta) return <span className="m-chip flat">-</span>;
  const positive = kpi.comparison?.sentiment === "positive";
  const negative = kpi.comparison?.sentiment === "negative";
  return (
    <span className={cn("m-chip", positive ? "up" : negative ? "down" : "flat")}>
      {kpi.comparison?.direction === "down" ? "▼" : kpi.comparison?.direction === "up" ? "▲" : "•"} {delta}
    </span>
  );
}

function StatusDot({ state }: { state: MetricDataState }) {
  return <span className={cn("m-dot", stateClass(state))} title={state} />;
}

function KpiComparisonTable({ kpis }: { kpis: MetricKpiValue[] }) {
  if (!kpis.length) return null;
  return (
    <div>
      <SectionTitle icon="↔️" title="Comparación del periodo" />
      <div className="m-panel m-table-panel">
        <table className="m-ct">
          <thead><tr><th>Métrica</th><th>Actual</th><th>Periodo anterior</th><th>Δ</th></tr></thead>
          <tbody>
            {kpis.map((kpi) => (
              <tr key={kpi.id}>
                <td>{kpi.label}</td>
                <td className="num">{kpi.displayValue}</td>
                <td className="num">{kpi.comparison?.previousDisplayValue ?? "-"}</td>
                <td><DeltaBadge kpi={kpi} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildFunnelModel(data?: MetricKpiResult) {
  const stageRollups = data?.stageRollups;
  const stages = stageRollups?.available
    ? stageRollups.stages.map((stage) => stageToModel(stage))
    : fallbackFunnelStages(data);
  const rates = stageRollups?.available
    ? buildRatesFromRollups(stageRollups)
    : buildRatesFromStages(stages);
  const sessions = stages[0]?.displayValue ?? "-";
  const deals = stages[stages.length - 1]?.displayValue ?? "-";
  const totalConversion = stages[0]?.value && stages[stages.length - 1]?.value != null
    ? formatPercent((stages[stages.length - 1].value ?? 0) / stages[0].value)
    : "-";
  const revenue = findKpi(data?.values ?? [], ["revenue", "revenue generado"])?.displayValue ?? "-";
  const roas = findKpi(data?.values ?? [], ["roas"])?.displayValue ?? "-";
  return { stages, rates, sessions, deals, totalConversion, revenue, roas };
}

function stageToModel(stage: MetricStageRollupStageValue): FunnelStageModel {
  return {
    id: stage.stageId,
    label: stage.label,
    displayValue: stage.displayValue,
    value: numericValue(stage.value),
    sources: stage.sources,
  };
}

function fallbackFunnelStages(data?: MetricKpiResult): FunnelStageModel[] {
  return DEFAULT_FUNNEL_STAGE_LABELS.map((label) => {
    const kpi = findKpi(data?.values ?? [], funnelCandidates(label));
    return {
      id: normalizeComparable(label).replace(/\s+/g, "_"),
      label,
      displayValue: kpi?.displayValue ?? "-",
      value: numericValue(kpi?.value),
      sources: kpi?.source ? [kpi.source] : [],
      cost: label === "Leads" ? findKpi(data?.values ?? [], ["cpl", "cost per lead"])?.displayValue : null,
    };
  });
}

function buildRatesFromRollups(stageRollups: MetricStageRollupResult): FunnelRateModel[] {
  const rates = stageRollups.rates.map((rate) => ({
    from: rate.fromLabel,
    to: rate.toLabel,
    displayValue: rate.displayValue,
    value: numericValue(rate.value),
    leak: false,
  }));
  const valid = rates.filter((rate) => rate.value != null);
  const min = Math.min(...valid.map((rate) => rate.value ?? 1));
  return rates.map((rate) => ({ ...rate, leak: rate.value != null && rate.value <= min }));
}

function buildRatesFromStages(stages: FunnelStageModel[]): FunnelRateModel[] {
  const rates = stages.slice(0, -1).map((stage, index) => {
    const next = stages[index + 1];
    const value = stage.value && next.value != null ? next.value / stage.value : null;
    return {
      from: stage.label,
      to: next.label,
      displayValue: value != null ? formatPercent(value) : "-",
      value,
      leak: false,
    };
  });
  const valid = rates.filter((rate) => rate.value != null);
  const min = Math.min(...valid.map((rate) => rate.value ?? 1));
  return rates.map((rate) => ({ ...rate, leak: rate.value != null && rate.value <= min }));
}

function buildChannelRows(stageRollups: MetricStageRollupResult | undefined, stages: FunnelStageModel[]): ChannelMatrixRow[] {
  if (!stageRollups?.available) return [];
  const columnTotals = stages.map((stage) => {
    const rollupStage = stageRollups.stages.find((item) => item.stageId === stage.id || item.label === stage.label);
    return rollupStage?.value ?? 0;
  });
  const columnMax = stages.map((stage) =>
    Math.max(
      ...stageRollups.channels.map((channel) =>
        channel.stages.find((item) => item.stageId === stage.id || item.label === stage.label)?.value ?? 0,
      ),
      0,
    ),
  );
  return stageRollups.channels.map((channel) => channelToRow(channel, stages, columnTotals, columnMax));
}

function channelToRow(
  channel: MetricStageRollupChannelValue,
  stages: FunnelStageModel[],
  columnTotals: number[],
  columnMax: number[],
): ChannelMatrixRow {
  return {
    channel: channel.channel,
    label: channel.label,
    icon: channelIcon(channel.channel, channel.label),
    stages: stages.map((stage, index) => {
      const value = channel.stages.find((item) => item.stageId === stage.id || item.label === stage.label);
      const numeric = numericValue(value?.value);
      return {
        stageId: stage.id,
        label: stage.label,
        displayValue: value?.displayValue ?? "-",
        value: numeric,
        share: numeric != null && columnTotals[index] > 0 ? numeric / columnTotals[index] : null,
        winner: numeric != null && numeric === columnMax[index] && numeric > 0,
      };
    }),
    rates: channel.rates.map((rate) => ({
      key: `${rate.fromStageId}-${rate.toStageId}`,
      label: `${rate.fromLabel}→${rate.toLabel}`,
      displayValue: rate.displayValue,
      value: numericValue(rate.value),
    })),
  };
}

function fallbackChannelRows(stages: FunnelStageModel[]): ChannelMatrixRow[] {
  return CHANNEL_FALLBACKS.map((channel) => ({
    ...channel,
    stages: stages.map((stage) => ({
      stageId: stage.id,
      label: stage.label,
      displayValue: "-",
      value: null,
      share: null,
      winner: false,
    })),
    rates: [],
  }));
}

function buildSurfaceCard(
  def: SurfaceDef,
  entry: SurfaceSummaryEntry | undefined,
  configured: boolean | undefined,
  kpiData: MetricKpiResult | undefined,
): SurfaceCardModel {
  const copy = SURFACE_COPY[def.key];
  const kpis = selectSurfaceKpis(kpiData, def.key);
  const primary = kpis[0] ?? entry?.metrics?.find((metric) => metric.value != null);
  const value = "displayValue" in (primary ?? {}) ? (primary as MetricKpiValue).displayValue : primary?.value != null ? formatCompact(primary.value) : stateValue(surfaceState(def, entry, configured));
  return {
    key: def.key,
    icon: copy?.icon ?? def.emoji,
    label: copy?.label ?? SURFACE_DETAIL_CONFIGS[def.key].label,
    description: copy?.metric ?? def.what,
    state: surfaceState(def, entry, configured),
    sources: entry?.sources ?? [],
    value,
    delta: kpis[0]?.comparison?.displayDelta ?? null,
  };
}

function buildEconomyCards(data?: MetricKpiResult) {
  const values = data?.values ?? [];
  const investment = findKpi(values, ["spend", "inversion", "inversión", "investment"]);
  const cac = findKpi(values, ["cac", "cpa", "coste por cliente"]);
  const revenue = findKpi(values, ["revenue", "revenue generado", "ingresos"]);
  const roas = findKpi(values, ["roas", "roi"]);
  return [
    { label: "💸 Inversión", value: investment?.displayValue ?? "-", detail: sourceMetricLabel(investment), tone: "navy" as const, delta: investment?.comparison?.displayDelta ?? null },
    { label: "🎯 CAC", value: cac?.displayValue ?? "-", detail: sourceMetricLabel(cac), tone: "rust" as const, delta: cac?.comparison?.displayDelta ?? null },
    { label: "💰 Revenue generado", value: revenue?.displayValue ?? "-", detail: sourceMetricLabel(revenue), tone: "sage" as const, delta: revenue?.comparison?.displayDelta ?? null },
    { label: "📈 ROAS", value: roas?.displayValue ?? "-", detail: sourceMetricLabel(roas), tone: "cyan" as const, delta: roas?.comparison?.displayDelta ?? null },
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

function selectDashboardNorthStarKpi(
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

function northStarMatchesKpi(label: string, kpi: MetricKpiValue): boolean {
  const haystack = normalizeComparable(`${kpi.kpiId} ${kpi.label} ${kpi.source ?? ""} ${kpi.metricName ?? ""}`);
  if (/meeting|reunion|cita|appointment/.test(label)) return /meeting|reunion|cita|appointment/.test(haystack);
  if (/lead|contact/.test(label)) return /lead|contact/.test(haystack);
  if (/deal|opportunit|oportunidad|proposal|propuesta/.test(label)) return /deal|opportunit|oportunidad|proposal|propuesta/.test(haystack);
  if (/revenue|gmv|venta|sales|ingreso/.test(label)) return /revenue|gmv|venta|sales|ingreso|value/.test(haystack);
  return false;
}

function findKpi(kpis: MetricKpiValue[], candidates: string[]): MetricKpiValue | null {
  const normalized = candidates.map(normalizeComparable);
  return kpis.find((kpi) => {
    const haystack = [
      kpi.kpiId,
      kpi.metricName ?? "",
      `${kpi.source ?? ""}.${kpi.metricName ?? ""}`,
      kpi.label,
    ].map(normalizeComparable);
    return normalized.some((candidate) => haystack.some((item) => item === candidate || item.includes(candidate)));
  }) ?? null;
}

function funnelCandidates(label: string): string[] {
  const comparable = normalizeComparable(label);
  if (comparable.includes("session")) return ["sessions", "ga4.sessions", "web.sessions"];
  if (comparable.includes("lead")) return ["leads", "newContacts", "pipeline.ghl.contacts"];
  if (comparable.includes("cual")) return ["qualified", "sql", "cualificados"];
  if (comparable.includes("reunion")) return ["meetings", "appointments", "reuniones"];
  if (comparable.includes("deal")) return ["deals", "opportunities", "closed won"];
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

function surfaceState(def: SurfaceDef, entry: SurfaceSummaryEntry | undefined, configured?: boolean): MetricDataState {
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

function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-ES", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: value < 0.1 ? 1 : 0 }).format(value);
}

function percentOfTarget(value?: number | null, target?: number | null): number {
  if (!value || !target) return 0;
  return (value / target) * 100;
}

function targetFor(kpi?: MetricKpiValue | null): number {
  const value = numericValue(kpi?.value);
  if (!value) return 100;
  return Math.max(value, Math.ceil(value / 0.72));
}

function rangeLabel(range: DateRange): string {
  return DATE_RANGES.find((item) => item.key === range)?.label ?? range;
}

function stateValue(state: MetricDataState): string {
  if (state === "ON") return "ON";
  if (state === "PARCIAL") return "Parcial";
  if (state === "OFF") return "OFF";
  return "-";
}

function stateLabel(state: MetricDataState): string {
  if (state === "ON") return "ON";
  if (state === "PARCIAL") return "Parcial";
  if (state === "OFF") return "OFF";
  return "Sin datos";
}

function stateClass(state: MetricDataState): string {
  if (state === "ON") return "on";
  if (state === "PARCIAL" || state === "CONECTADO SIN SNAPSHOTS") return "partial";
  return "off";
}

function heatStyle(share?: number | null): CSSProperties {
  if (share == null) return {};
  const t = Math.max(0, Math.min(1, share / 0.35));
  const r = Math.round(253 - (253 - 30) * t);
  const g = Math.round(248 - (248 - 110) * t);
  const b = Math.round(239 - (239 - 150) * t);
  return {
    background: `rgb(${r},${g},${b})`,
    color: t > 0.55 ? "#fff" : "#1A1A2E",
  };
}

function conversionHeatStyle(value?: number | null): CSSProperties {
  if (value == null) return {};
  const t = Math.max(0, Math.min(1, value / 0.55));
  const r = Math.round(246 - (246 - 218) * t);
  const g = Math.round(200 + (236 - 200) * t);
  const b = Math.round(190 + (206 - 190) * t);
  return { background: `rgb(${r},${g},${b})` };
}

function dropoffLabel(value?: number | null): string {
  if (value == null) return "-";
  return `−${Math.round((1 - value) * 100)}%`;
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
  if (surface === "partnerships") return ["YALC", "Creators", "ROI"];
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
      .m-range,.m-modelseg,.m-controlseg{display:inline-flex;border:2px solid var(--ink);border-radius:var(--r-md);overflow:hidden;box-shadow:var(--pop-xs);}
      .m-range button,.m-modelseg button,.m-controlseg button{border:none;background:var(--paper);padding:6px 10px;font-weight:700;font-size:12px;color:var(--muted);border-right:1.5px solid var(--border);}
      .m-range button:last-child,.m-modelseg button:last-child,.m-controlseg button:last-child{border-right:none;}
      .m-range button.on{background:var(--rust);color:#fff;}
      .m-modelseg{border-radius:var(--r-pill);}
      .m-modelseg button{padding:6px 12px;font-weight:800;font-size:11.5px;}
      .m-modelseg button.on,.m-controlseg button.on{background:var(--navy);color:#fff;}
      .m-controlseg.rust button.on{background:var(--rust);color:#fff;}
      .m-tabs{display:flex;gap:7px;border-bottom:2.5px solid var(--ink);margin-top:14px;flex-wrap:wrap;}
      .m-tab{background:var(--paper);border:2.5px solid var(--ink);border-bottom:none;border-radius:12px 12px 0 0;padding:8px 14px;font-weight:800;font-size:13px;color:var(--muted);position:relative;top:2.5px;}
      .m-tab span{margin-right:6px;}
      .m-tab.on{background:var(--rust);color:#fff;}
      .m-inline-alert{margin-top:12px;border:2px solid var(--ink);border-radius:var(--r-md);background:var(--sun);box-shadow:var(--pop-xs);padding:8px 12px;font-size:12px;font-weight:800;}
      .m-panel{background:var(--paper);border:2.5px solid var(--ink);border-radius:var(--r-lg);box-shadow:var(--pop-sm);position:relative;overflow:hidden;}
      .m-panel-halftone:before,.m-intel:before{content:'';position:absolute;inset:0;background-image:var(--halftone);background-size:13px 13px;opacity:.45;pointer-events:none;}
      .m-panel>*{position:relative;}
      .m-pad{padding:14px 16px;}
      .m-statebar,.m-modelbar,.m-controlbar{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin:16px 0 14px;}
      .m-controlbar{background:var(--paper2);border:2.5px solid var(--ink);border-radius:var(--r-md);padding:10px 14px;box-shadow:var(--pop-xs);}
      .m-controlgrp{display:flex;align-items:center;gap:8px;}
      .m-controlgrp>span,.m-label{font-size:11.5px;font-weight:800;color:var(--muted);}
      .m-segment-static{background:var(--navy);color:#fff;border:2px solid var(--ink);border-radius:var(--r-pill);box-shadow:var(--pop-xs);padding:5px 13px;font-size:11.5px;font-weight:800;}
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
      .m-bars{display:flex;align-items:flex-end;gap:3px;height:30px;width:100%;min-width:52px;}
      .m-bars span{flex:1;background:var(--rust);border:1px solid var(--ink);border-bottom:none;border-radius:2px 2px 0 0;min-height:3px;}
      .m-bars.navy span{background:var(--navy);}
      .m-bars.sage span{background:var(--sage);}
      .m-bars.cyan span{background:var(--cyan);}
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
      .m-fstage.star{border-color:var(--rust);border-width:2.5px;background:#FCEFE6;}
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
      .m-surf-head i{font-style:normal;font-size:15px;}
      .m-dot{width:9px;height:9px;border-radius:50%;display:inline-block;border:1.5px solid var(--ink);flex:0 0 9px;}
      .m-dot.on{background:var(--sage);}
      .m-dot.partial{background:var(--sun);}
      .m-dot.off{background:var(--subtle);}
      .m-surf-value{font-family:'Space Grotesk';font-size:23px;font-weight:700;color:var(--navy);line-height:1.05;}
      .m-surf-meta{font-size:11px;color:var(--muted);margin-top:3px;min-height:28px;}
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
      .m-cmprow{display:grid;grid-template-columns:120px 1fr;gap:9px;align-items:center;padding:6px 0;border-bottom:1.5px dashed rgba(26,26,46,.12);}
      .m-cmprow>span{font-weight:800;color:var(--navy);font-size:11.5px;}
      .m-cmpbar{display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:800;color:var(--muted);margin-bottom:3px;}
      .m-cmpbar i{height:11px;border:1.5px solid var(--ink);border-radius:var(--r-pill);flex:1;background:var(--aged);overflow:hidden;}
      .m-cmpbar b{display:block;height:100%;border-right:1.5px solid var(--ink);}
      .m-cmpbar b.cyan{background:var(--cyan);}
      .m-cmpbar b.navy{background:var(--navy);}
      .m-cmpbar b.rust{background:var(--rust);}
      .m-cmpbar strong{color:var(--navy);}
      .m-journey{display:flex;align-items:center;gap:8px;padding:9px 4px;border-bottom:1.5px dashed rgba(26,26,46,.13);flex-wrap:wrap;}
      .m-journey div{display:flex;align-items:center;gap:5px;flex:1;flex-wrap:wrap;}
      .m-journey span{font-size:11px;font-weight:800;color:var(--navy);background:var(--paper2);border:1.5px solid var(--ink);border-radius:var(--r-pill);padding:2px 9px;}
      .m-journey i{font-style:normal;color:var(--subtle);font-weight:800;}
      .m-journey b{font-family:'Space Grotesk';font-weight:700;color:var(--navy);white-space:nowrap;}
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
      .m-controlgrp>span{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--subtle);}
      .m-trend-hero{padding:14px 8px 10px 4px;}
      .m-trend-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:2px 12px 10px;}
      .m-trend-top>div:first-child>span{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--rust-600);}
      .m-trend-top b{font-family:'Space Grotesk';font-size:38px;font-weight:700;color:var(--navy);letter-spacing:0;}
      .m-trend-top small{font-size:13px;color:var(--muted);font-weight:700;margin:0 10px;}
      .m-trend-top>div:last-child{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:11.5px;font-weight:700;color:var(--muted);}
      .m-trend-top i{width:22px;height:0;display:inline-block;}
      .m-trend-top i.line{border-top:3px solid var(--rust);}
      .m-trend-top i.dash{border-top:2.5px dashed var(--subtle);}
      .m-chart,.m-spark{display:block;width:100%;height:auto;}
      .m-chart{height:250px;}
      .m-small-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;}
      .m-smcard{background:var(--paper);border:2.5px solid var(--ink);border-radius:var(--r-md);box-shadow:var(--pop-xs);padding:12px 13px 8px;}
      .m-smh{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;}
      .m-smn{display:flex;align-items:center;gap:7px;font-weight:800;font-size:12.5px;color:var(--navy);}
      .m-smv{display:flex;align-items:baseline;gap:7px;margin:2px 0 6px;}
      .m-smv span{font-family:'Space Grotesk';font-size:24px;font-weight:700;color:var(--navy);letter-spacing:0;}
      .m-smv small{font-size:10.5px;color:var(--subtle);font-weight:700;}
      .m-smcard p{font-size:11px;color:var(--muted);min-height:32px;margin:3px 0 8px;}
      .m-smfoot{font-size:10px;color:var(--subtle);margin-top:5px;text-align:right;font-weight:800;}
      .m-marker{display:flex;align-items:center;gap:11px;padding:9px 2px;border-bottom:1.5px dashed rgba(26,26,46,.14);}
      .m-marker>span{width:30px;height:30px;flex:0 0 30px;display:grid;place-items:center;border:2px solid var(--ink);border-radius:var(--r-sm);box-shadow:var(--pop-xs);font-size:15px;background:var(--sage-tint);}
      .m-marker div{flex:1;}
      .m-marker b{display:block;color:var(--navy);font-size:12.5px;}
      .m-marker small{display:block;color:var(--muted);font-size:11px;}
      .m-marker i{font-family:'Space Grotesk';font-weight:700;font-size:11.5px;color:var(--muted);white-space:nowrap;font-style:normal;}
      .m-intel{background:var(--paper2);padding:13px 16px;}
      .m-intel-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:2px 2px 11px;border-bottom:2px dashed var(--border-strong);margin-bottom:9px;}
      .m-intel-head>span{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border:2.5px solid var(--ink);border-radius:var(--r-md);background:var(--navy);color:#fff;font-size:18px;box-shadow:var(--pop-xs);}
      .m-intel-head div{flex:1;min-width:230px;}
      .m-intel-head b{display:block;color:var(--navy);font-size:13.5px;}
      .m-intel-head small{display:block;font-size:11px;color:var(--muted);margin-top:2px;}
      .m-intel-head button{background:var(--navy);color:#fff;border:2.5px solid var(--ink);border-radius:var(--r-md);padding:8px 14px;font-weight:800;font-size:12.5px;box-shadow:var(--pop-sm);}
      .m-ipreview div{display:flex;align-items:center;gap:9px;padding:6px 2px;opacity:.55;border-bottom:1.5px dashed rgba(26,26,46,.12);}
      .m-ipreview i{font-style:normal;}
      .m-ipreview span{font-weight:700;color:var(--navy);font-size:12px;}
      .m-detailbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0 14px;}
      .m-back{display:inline-flex;align-items:center;gap:8px;background:var(--paper);border:2.5px solid var(--ink);border-radius:var(--r-md);padding:8px 14px;font-weight:800;font-size:13px;color:var(--ink-soft);box-shadow:var(--pop-sm);}
      .m-detailbar h2{font-size:19px;}
      .m-surface-hero{padding:18px 20px;display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:18px;}
      .m-surface-hero p{font-size:12px;color:var(--muted);margin:6px 0 0;}
      .m-empty{color:var(--muted);font-weight:700;}
      @media(max-width:1100px){
        .m-hero{grid-template-columns:1fr;}
        .m-hero-ns{border-right:none;border-bottom:2.5px solid var(--ink);}
        .m-surface-grid{grid-template-columns:repeat(2,1fr);}
        .m-two-col{grid-template-columns:1fr;}
      }
      @media(max-width:780px){
        .metrics-mockup{padding:16px 14px 50px;}
        .m-small-grid,.m-econ-grid{grid-template-columns:1fr;}
        .m-surface-grid{grid-template-columns:1fr;}
        .m-head-actions{width:100%;}
      }
    `}</style>
  );
}
