import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { GitBranch, Settings, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
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
  type MetricQualityStatus,
} from "@/lib/metrics/dashboard-view-model";
import type { DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import { cn } from "@/lib/utils";
import {
  Chip,
  IntelBridge,
  MetricTile,
  Panel,
} from "@/components/dashboard/metrics-v2";
import {
  BreakdownTable,
  DeltaBadge,
  EmptyMetricState,
  MetricQualityBadge,
  MiniSparkline,
  MoversPanel,
  SurfaceStatusCard,
} from "@/components/dashboard/metrics-v2/shell-primitives";

type DateRange = "1d" | "7d" | "30d" | "90d";

const DATE_RANGES: Array<{ key: DateRange; label: string }> = [
  { key: "1d", label: "Ayer" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

const FUNNEL_STAGES = [
  "Visitas web",
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
  "Data-driven",
];
type DataLineageGate = {
  title: string;
  source: string;
  status: MetricQualityStatus;
  detail: string;
  nextAction: string;
};

const DATA_LINEAGE_GATES: DataLineageGate[] = [
  {
    title: "Capa semántica",
    source: "KPIs calculados",
    status: "partial",
    detail:
      "Los KPIs directos ya se leen desde la tabla calculada cuando existe un run del rango.",
    nextAction: "Mantener formulas, embudo y attribution como sin dato hasta que existan sus capas.",
  },
  {
    title: "Funnel y atribución",
    source: "Embudo unificado + eventos",
    status: "missing",
    detail:
      "Overview funnel, Channels y Conversion dependen del mapa de etapas y eventos o conteos por etapa.",
    nextAction: "Configurar etapa por fuente, métrica y dimensiones antes de tasas.",
  },
  {
    title: "Aliases de métricas",
    source: "Aliases de fuentes",
    status: "partial",
    detail:
      "Hay drift conocido: emailsSent/sent, inp_mobile/tbt_mobile y source ids con guion/underscore.",
    nextAction: "Aliases directos normalizados; formulas posteriores deben reutilizar esa capa.",
  },
  {
    title: "Fuentes en revisión",
    source: "GHL",
    status: "dirty",
    detail:
      "GHL queda marcado para revisar; sus cifras no deben mostrarse como exactas sin etiqueta.",
    nextAction: "Propagar el estado de revisión a la KPI final y usar fuente de verdad cuando exista.",
  },
  {
    title: "Seeds y demos",
    source: "paid/product/partnerships",
    status: "demo",
    detail:
      "Seeds representativos sirven para QA visual, no para negocio real ni estado OK.",
    nextAction: "Excluir seeds de KPIs OK o etiquetarlos como demo.",
  },
  {
    title: "Revenue real",
    source: "CRM/Stripe/Koibox",
    status: "missing",
    detail:
      "CAC y ROAS reales requieren closed-won/revenue fiable; pixel ads solo da plataforma/dedup.",
    nextAction: "Conectar fuente de revenue antes de economy band live.",
  },
];

function MetricsPage() {
  const slug = useSlugSync();
  return <MetricsPageInner key={slug || "__none__"} slug={slug} />;
}

export default MetricsPage;

function MetricsPageInner({ slug }: { slug: string }) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>("30d");
  const [localTab, setLocalTab] = useState<MetricDashboardTab>("overview");
  const [model, setModel] = useState("W-shaped");
  const [setupOpen, setSetupOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
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
        const entry = surfaceEntries[key];
        return [buildSurfaceCard(def, entry, surfacesData?.configured)];
      }),
    [surfaceEntries, surfacesData?.configured],
  );

  useEffect(() => {
    if (!router.isReady) return;
    const queryTab = Array.isArray(router.query.tab)
      ? router.query.tab[0]
      : router.query.tab;
    if (queryTab === "conexiones") setSetupOpen(true);
  }, [router.isReady, router.query.tab]);

  function selectTab(next: MetricDashboardTab) {
    setLocalTab(next);
    setSetupOpen(false);
    setVersionsOpen(false);
    const query = cleanRouteQuery(router.query);
    query.tab = next;
    if (next === "overview") delete query.tab;
    if (next !== "surfaces") delete query.surface;
    router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  }

  function openSurface(surface: SurfaceKey) {
    setLocalTab("surfaces");
    setSetupOpen(false);
    setVersionsOpen(false);
    const query = cleanRouteQuery(router.query);
    query.tab = "surfaces";
    query.surface = surface;
    router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  }

  function closeSurface() {
    const query = cleanRouteQuery(router.query);
    query.tab = "surfaces";
    delete query.surface;
    router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  }

  function toggleSetup() {
    const next = !setupOpen;
    setSetupOpen(next);
    setVersionsOpen(false);
    const query = cleanRouteQuery(router.query);
    delete query.surface;
    if (next) query.tab = "conexiones";
    else if (activeTab === "overview") delete query.tab;
    else query.tab = activeTab;
    router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  }

  function openMerlin() {
    openChat(
      slug,
      buildMetricsEditThread(
        slug,
        "Quiero editar el dashboard de métricas: North Star, KPIs, surfaces, Channels, Conversion o Trends. Revisa el shell actual y dime qué cambiarías.",
      ),
    );
  }

  return (
    <DashboardLayout fullBleed>
      <Head>
        <title>{`Métricas — ${slug} — Mission Control`}</title>
      </Head>
      <div className="min-h-screen bg-[var(--sc-paper)] px-4 pb-5 pt-16 sm:px-6 sm:py-5 lg:px-8">
        <div className="mx-auto max-w-[1320px] space-y-5">
          <MetricsHeader
            slug={slug}
            range={range}
            onRangeChange={setRange}
            versions={dashboard?.versions?.length ?? 0}
            configured={dashboard?.configured}
            health={health?.overall}
            setupOpen={setupOpen}
            versionsOpen={versionsOpen}
            onSetupClick={toggleSetup}
            onVersionsClick={() => {
              setVersionsOpen((open) => !open);
              setSetupOpen(false);
            }}
            onMerlinClick={openMerlin}
          />
          {versionsOpen && (
            <VersionsPanel
              versions={dashboard?.versions ?? []}
              currentVersion={dashboard?.version ?? null}
            />
          )}
          {setupOpen ? (
            <SetupView
              configured={dashboard?.configured}
              health={health?.overall}
              kpiData={kpiData}
              surfaceCards={surfaceCards}
              openSurface={openSurface}
            />
          ) : (
            <>
              <TabNav active={activeTab} onSelect={selectTab} />
              {activeTab === "overview" && (
                <OverviewView
                  slug={slug}
                  surfaceCards={surfaceCards}
                  openSurface={openSurface}
                  configured={surfacesData?.configured}
                  dashboardDefinition={dashboard?.definition}
                  kpiData={kpiData}
                />
              )}
              {activeTab === "surfaces" &&
                (activeSurface ? (
                  <SurfaceDetailView
                    slug={slug}
                    surface={activeSurface}
                    entry={surfaceEntries[activeSurface]}
                    configured={surfacesData?.configured}
                    kpiData={kpiData}
                    onBack={closeSurface}
                  />
                ) : (
                  <SurfacesView
                    surfaceCards={surfaceCards}
                    openSurface={openSurface}
                  />
                ))}
              {activeTab === "channels" && (
                <ChannelsView
                  model={model}
                  onModelChange={setModel}
                  kpiData={kpiData}
                />
              )}
              {activeTab === "conversion" && <ConversionView kpiData={kpiData} />}
              {activeTab === "trends" && (
                <TrendsView
                  dashboardDefinition={dashboard?.definition}
                  kpiData={kpiData}
                />
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function MetricsHeader({
  slug,
  range,
  onRangeChange,
  versions,
  configured,
  health,
  setupOpen,
  versionsOpen,
  onSetupClick,
  onVersionsClick,
  onMerlinClick,
}: {
  slug: string;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  versions: number;
  configured?: boolean;
  health?: string;
  setupOpen: boolean;
  versionsOpen: boolean;
  onSetupClick: () => void;
  onVersionsClick: () => void;
  onMerlinClick: () => void;
}) {
  return (
    <Panel halftone className="border-[3px] border-navy">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-[28px] font-bold leading-tight text-navy sm:text-[34px]">
              Métricas
            </h1>
            <MetricQualityBadge
              status={configured ? "partial" : "missing"}
              source={configured ? "dashboard definition" : "setup"}
            />
          </div>
          <p className="mt-1 text-[13px] text-[var(--sc-fg-muted)]">
            {slug} · rango{" "}
            {DATE_RANGES.find((item) => item.key === range)?.label} · KPIs
            directos leídos, sin attribution avanzada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-sc-md border-2 border-ink bg-card p-1 shadow-pop-xs">
            {DATE_RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onRangeChange(item.key)}
                className={cn(
                  "rounded-sc-sm px-3 py-1.5 font-heading text-[12px] font-bold",
                  range === item.key
                    ? "bg-rust text-white"
                    : "text-[var(--sc-fg-muted)] hover:bg-aged",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <HeaderButton
            icon={<Settings size={15} />}
            label="Setup"
            active={setupOpen}
            onClick={onSetupClick}
          />
          <HeaderButton
            icon={<GitBranch size={15} />}
            label={`Versiones ${versions ? String(versions) : ""}`.trim()}
            active={versionsOpen}
            onClick={onVersionsClick}
          />
          <HeaderButton
            icon={<Sparkles size={15} />}
            label="Merlin"
            tone="cyan"
            onClick={onMerlinClick}
          />
          {health && (
            <Chip
              tone={
                health === "ok" ? "ok" : health === "stale" ? "warn" : "flat"
              }
            >
              Health · {health}
            </Chip>
          )}
        </div>
      </div>
    </Panel>
  );
}

function HeaderButton({
  icon,
  label,
  tone = "paper",
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tone?: "paper" | "cyan";
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sc-md border-2 border-ink px-3 py-2 font-heading text-[12px] font-bold shadow-pop-xs",
        tone === "cyan"
          ? "bg-[var(--cyan)] text-white"
          : active
            ? "bg-navy text-white"
            : "bg-card text-[var(--sc-ink-soft)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function VersionsPanel({
  versions,
  currentVersion,
}: {
  versions: DashboardVersionMeta[];
  currentVersion: number | null;
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-[18px] font-bold text-navy">
            Versiones
          </h2>
          <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
            Historial de definiciones del dashboard. Revertir queda fuera del
            shell de PR 2.
          </p>
        </div>
        {currentVersion != null && (
          <MetricQualityBadge status="partial" source={`v${currentVersion}`} />
        )}
      </div>
      <div className="mt-4 space-y-2">
        {versions.length ? (
          versions.map((version) => (
            <div
              key={`${version.version}-${version.date}`}
              className="rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-3 shadow-pop-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-heading text-[13px] font-bold text-navy">
                  v{version.version}
                </span>
                <span className="text-[11px] text-[var(--sc-fg-muted)]">
                  {version.date.slice(0, 10)} · {version.trigger}
                </span>
              </div>
              {version.changes && (
                <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
                  {version.changes}
                </p>
              )}
            </div>
          ))
        ) : (
          <EmptyMetricState
            title="Sin versiones guardadas"
            requiredSource="Definición del dashboard"
            nextAction="Cuando Merlin o el editor guarden una definición, aparecerá aquí."
            state="SIN DATOS"
          />
        )}
      </div>
    </Panel>
  );
}

function SetupView({
  configured,
  health,
  kpiData,
  surfaceCards,
  openSurface,
}: {
  configured?: boolean;
  health?: string;
  kpiData?: MetricKpiResult;
  surfaceCards: SurfaceCardModel[];
  openSurface: (surface: SurfaceKey) => void;
}) {
  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-[20px] font-bold text-navy">
              Setup
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] text-[var(--sc-fg-muted)]">
              Preparación del dashboard: definición activa, salud de colectores
              y conexión de surfaces.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricQualityBadge
              status={configured ? "partial" : "missing"}
              source={configured ? "Definición activa" : "sin definición"}
            />
            {health && (
              <Chip
                tone={
                  health === "ok" ? "ok" : health === "stale" ? "warn" : "flat"
                }
              >
                Health · {health}
              </Chip>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <EmptyMetricState
            title="Definición del dashboard"
            requiredSource="Definición del dashboard"
            nextAction={
              configured
                ? "Definición activa encontrada; los KPIs directos se leen desde el run más reciente del rango."
                : "Diseñar o guardar la primera definición con Merlin."
            }
            state={configured ? "CONECTADO SIN SNAPSHOTS" : "SIN DATOS"}
          />
          {kpiData?.run ? (
            <div className="rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-4 shadow-pop-xs">
              <div className="flex flex-wrap items-center gap-2">
                <StatePill state={qualityToState(kpiData.summary.qualityStatus)} />
                <h3 className="font-heading text-[13px] font-bold text-navy">
                  KPIs semánticos
                </h3>
              </div>
              <p className="mt-2 text-[12px] text-[var(--sc-fg-muted)]">
                Run {kpiData.run.id.slice(-8)} · {kpiData.summary.total} KPIs ·{" "}
                {kpiData.run.rangeFrom} a {kpiData.run.rangeTo}.
              </p>
              <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
                OK {kpiData.summary.ok} · parcial {kpiData.summary.partial} ·
                missing {kpiData.summary.missing} · demo {kpiData.summary.demo}.
              </p>
            </div>
          ) : (
            <EmptyMetricState
              title="KPIs semánticos"
              requiredSource="KPIs calculados"
              nextAction="Ejecutar el runner de KPIs para este cliente/rango; la UI no computa en lectura."
              state="SIN DATOS"
            />
          )}
          <EmptyMetricState
            title="Funnel semántico"
            requiredSource="Embudo unificado"
            nextAction="Pendiente de mapear etapa por fuente, métrica y dimensiones."
            state="SIN DATOS"
          />
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-[18px] font-bold text-navy">
              Gates de datos antes de PR 3
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] text-[var(--sc-fg-muted)]">
              Hallazgos del mapa de linaje: estos bloqueos explican qué debe
              quedar sin dato, parcial, en revisión o demo antes de computar KPIs.
            </p>
          </div>
          <MetricQualityBadge status="pending" source="Mapa de datos" />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {DATA_LINEAGE_GATES.map((gate) => (
            <div
              key={gate.title}
              className="rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-3 shadow-pop-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <MetricQualityBadge status={gate.status} source={gate.source} />
                <h3 className="font-heading text-[13px] font-bold text-navy">
                  {gate.title}
                </h3>
              </div>
              <p className="mt-2 text-[12px] text-[var(--sc-fg-muted)]">
                {gate.detail}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-[var(--sc-fg-soft)]">
                {gate.nextAction}
              </p>
            </div>
          ))}
        </div>
      </Panel>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-[18px] font-bold text-navy">
            Conexiones por surface
          </h2>
          <span className="text-[12px] text-[var(--sc-fg-muted)]">
            ON, PARCIAL, OFF o conectado sin snapshots.
          </span>
        </div>
        <SurfaceGrid cards={surfaceCards} onOpen={openSurface} />
      </section>
    </div>
  );
}

function TabNav({
  active,
  onSelect,
}: {
  active: MetricDashboardTab;
  onSelect: (tab: MetricDashboardTab) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-sc-lg border-[2.5px] border-ink bg-card p-2 shadow-pop-sm">
      <div className="flex min-w-max gap-2">
        {METRIC_DASHBOARD_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            className={cn(
              "rounded-sc-md border-2 border-ink px-4 py-2 text-left shadow-pop-xs",
              active === tab.key
                ? "bg-navy text-white"
                : "bg-[var(--sc-paper-3)] text-[var(--sc-ink-soft)]",
            )}
          >
            <div className="font-heading text-[13px] font-bold">
              {tab.label}
            </div>
            <div
              className={cn(
                "mt-0.5 max-w-[210px] text-[11px]",
                active === tab.key
                  ? "text-white/80"
                  : "text-[var(--sc-fg-muted)]",
              )}
            >
              {tab.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function OverviewView({
  slug,
  surfaceCards,
  openSurface,
  configured,
  dashboardDefinition,
  kpiData,
}: {
  slug: string;
  surfaceCards: SurfaceCardModel[];
  openSurface: (surface: SurfaceKey) => void;
  configured?: boolean;
  dashboardDefinition?: DashboardDefinition | null;
  kpiData?: MetricKpiResult;
}) {
  const northStar = selectDashboardNorthStarKpi(kpiData, dashboardDefinition);
  const northStarDefinition = dashboardDefinition?.northStar ?? null;
  const northStarLabel =
    northStarDefinition?.label || northStar?.label || "North Star pendiente";
  const northStarDefined = Boolean(northStarDefinition?.label || northStarDefinition?.kpiRef);
  const overviewKpis = selectOverviewKpis(kpiData, northStar);
  const economyKpis = selectEconomyKpis(kpiData);
  const stageRollups = kpiData?.stageRollups;

  return (
    <div className="space-y-5">
      <Panel>
        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="custom">North Star</Chip>
              <DeltaBadge label={northStar ? "sin serie" : "sin delta"} />
            </div>
            <h2 className="mt-3 font-heading text-[24px] font-bold text-navy">
              {northStarLabel}
            </h2>
            <p className="mt-2 max-w-[720px] text-[13px] text-[var(--sc-fg-muted)]">
              {northStar
                ? `${sourceMetricLabel(northStar)} · ${coverageLabel(northStar)}.`
                : northStarDefined
                  ? "La North Star está definida en el dashboard, pero todavía no hay una KPI calculada enlazada para este rango."
                  : "El panel necesita una North Star definida y un cálculo KPI persistido para el rango seleccionado."}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {overviewKpis.length
                ? overviewKpis.map((kpi) => (
                  <KpiTile key={kpi.id} kpi={kpi} />
                ))
                : [
                  "North Star",
                  "Lead -> Cualificado",
                  "Cualificado -> Reunion",
                  "Coste / reunion",
                ].map((label) => (
                  <MetricTile
                    key={label}
                    label={label}
                    value="-"
                    hint={
                      <MetricQualityBadge
                        status="missing"
                        source="KPIs calculados"
                      />
                    }
                  />
                ))}
            </div>
          </div>
          {northStar ? (
            <div className="rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-4 shadow-pop-xs">
              <MetricQualityBadge
                status={asQualityStatus(northStar.qualityStatus)}
                source={sourceMetricLabel(northStar)}
              />
              <div className="mt-3 font-heading text-[34px] font-bold leading-none text-navy">
                {northStar.displayValue}
              </div>
              <p className="mt-3 text-[12px] text-[var(--sc-fg-muted)]">
                {coverageLabel(northStar)} · {northStar.rangeFrom} a{" "}
                {northStar.rangeTo}
              </p>
              <p className="mt-2 text-[11px] text-[var(--sc-fg-muted)]">
                Deltas y serie historica siguen vacios hasta la capa de trends.
              </p>
            </div>
          ) : (
            <EmptyMetricState
              title={
                configured
                  ? "North Star sin dato calculado"
                  : "Dashboard no configurado"
              }
              requiredSource="KPIs calculados"
              nextAction={
                northStarDefined
                  ? "Mapear la North Star definida a una fuente, métrica o fórmula con datos reales."
                  : "Definir la North Star del dashboard y ejecutar el cálculo de KPIs."
              }
              state={configured ? "CONECTADO SIN SNAPSHOTS" : "SIN DATOS"}
            />
          )}
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-[18px] font-bold text-navy">
              Economía
            </h2>
            <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
              Inversión, CAC, revenue y ROAS aparecen solo cuando exista
              CRM/spend con procedencia.
            </p>
          </div>
          <MetricQualityBadge
            status={economyKpis.length ? asQualityStatus(kpiData?.summary.qualityStatus) : "pending"}
            source={economyKpis.length ? "KPIs calculados" : "Paid + partnerships + CRM"}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {economyKpis.length
            ? economyKpis.map((kpi) => <KpiTile key={kpi.id} kpi={kpi} tone="lagging" />)
            : ["Inversion", "CAC", "Revenue generado", "ROAS"].map((label) => (
              <MetricTile
                key={label}
                label={label}
                value="-"
                hint="Sin dato live todavia"
              />
            ))}
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-[18px] font-bold text-navy">
              Embudo unificado
            </h2>
            <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
              Conteos por etapa desde los datos disponibles. Es una vista agregada:
              no deduplica leads entre fuentes ni calcula journeys individuales.
            </p>
          </div>
          <MetricQualityBadge
            status={stageRollups?.available ? asQualityStatus(stageRollups.summary.qualityStatus) : "missing"}
            source="Embudo unificado"
          />
        </div>
        <div className="mt-4">
          <StageRollupFunnel stageRollups={stageRollups} />
        </div>
      </Panel>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-[18px] font-bold text-navy">
            Salud de las superficies
          </h2>
          <span className="text-[12px] text-[var(--sc-fg-muted)]">
            Cada card abre su detalle.
          </span>
        </div>
        <SurfaceGrid cards={surfaceCards} onOpen={openSurface} />
      </section>

      <IntelBridge
        surface={`Overview · ${slug}`}
        href={`/dashboard/${slug}/intelligence`}
        signals={[
          "Cambios cross-surface pendientes de Intelligence signals.",
          stageRollups?.available
            ? "Fugas del funnel visibles como vista agregada; attribution avanzada pendiente."
            : "Fugas del funnel pendientes hasta tener datos suficientes por etapa.",
          "Recomendaciones bloqueadas hasta que existan datos reales.",
        ]}
      />
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
    <div className="space-y-5">
      <Panel>
        <h2 className="font-heading text-[20px] font-bold text-navy">
          Surfaces
        </h2>
        <p className="mt-1 max-w-[760px] text-[13px] text-[var(--sc-fg-muted)]">
          Estado de cada superficie canónica. Outbound separa ICP Outreach y
          Partnerships en sus details para evitar mezclar economics con email.
        </p>
      </Panel>
      <SurfaceGrid cards={surfaceCards} onOpen={openSurface} />
    </div>
  );
}

function SurfaceDetailView({
  slug,
  surface,
  entry,
  configured,
  kpiData,
  onBack,
}: {
  slug: string;
  surface: SurfaceKey;
  entry?: SurfaceSummaryEntry;
  configured?: boolean;
  kpiData?: MetricKpiResult;
  onBack: () => void;
}) {
  const config = SURFACE_DETAIL_CONFIGS[surface];
  const def = SURFACES.find((item) => item.key === surface);
  const state = def ? surfaceState(def, entry, configured) : "SIN DATOS";
  const surfaceKpis = selectSurfaceKpis(kpiData, surface);
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="rounded-sc-md border-2 border-ink bg-card px-3 py-2 font-heading text-[12px] font-bold shadow-pop-xs"
      >
        ← Volver a Surfaces
      </button>
      <Panel className="border-[3px] border-navy">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Chip tone="custom">{config.eyebrow}</Chip>
            <h2 className="mt-3 font-heading text-[26px] font-bold text-navy">
              {def?.emoji} {config.label}
            </h2>
            <p className="mt-1 max-w-[780px] text-[13px] text-[var(--sc-fg-muted)]">
              {config.headline}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatePill state={state} />
            <MetricQualityBadge
              status={state === "ON" ? "partial" : "missing"}
              source={entry?.sources?.join(" · ") || "sin fuente"}
            />
          </div>
        </div>
      </Panel>

      {surface === "email" && (
        <Panel>
          <div className="flex flex-wrap gap-2">
            <Chip tone="custom">ICP Outreach</Chip>
            <Chip tone="flat">Partnerships vive en su propia surface</Chip>
          </div>
        </Panel>
      )}

      {surface === "partnerships" && (
        <Panel>
          <div className="flex flex-wrap gap-2">
            <Chip tone="custom">Partnerships</Chip>
            <Chip tone="flat">
              Break-even y creator economics, sin mezclar con outbound email
            </Chip>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {config.sections.map((section) => (
          <EmptyMetricState
            key={section.title}
            title={section.title}
            requiredSource={section.requiredSource}
            nextAction={section.nextAction}
            state={state === "ON" ? "CONECTADO SIN SNAPSHOTS" : state}
          />
        ))}
      </div>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-[16px] font-bold text-navy">
              KPIs directos
            </h3>
            <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
              Valores persistidos por surface. No hay formulas ni atribucion en
              esta lectura.
            </p>
          </div>
          <MetricQualityBadge
            status={surfaceKpis.length ? asQualityStatus(kpiData?.summary.qualityStatus) : "missing"}
            source="KPIs calculados"
          />
        </div>
        {surfaceKpis.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {surfaceKpis.slice(0, 8).map((kpi) => (
              <KpiTile key={kpi.id} kpi={kpi} />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyMetricState
              title="Sin KPIs directos para esta surface"
              requiredSource="KPIs calculados"
              nextAction="El run actual no incluye valores para esta superficie o todavía no se ejecutó para el rango."
              state={state === "ON" ? "CONECTADO SIN SNAPSHOTS" : state}
            />
          </div>
        )}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-[16px] font-bold text-navy">
              Breakdown preparado
            </h3>
            <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
              La tabla espera dimensiones reales; no se rellena con ejemplos.
            </p>
          </div>
          <MetricQualityBadge status="pending" source="metrics/breakdown" />
        </div>
        <div className="mt-4">
          <BreakdownTable
            columns={["Dimensión", "Métrica", "Valor", "Estado"]}
            empty={
              <EmptyMetricState
                title="Sin breakdown"
                requiredSource="Snapshots con dimensiones reales"
                nextAction="PR posterior conectará dimensiones por query, campaña, post, creator o etapa."
                state="SIN DATOS"
              />
            }
          />
        </div>
      </Panel>

      <MoversPanel title={`Movimientos · ${config.label}`} />
      <IntelBridge
        surface={config.label}
        href={`/dashboard/${slug}/intelligence`}
        signals={[
          "Insights bloqueados hasta que Intelligence tenga señales por surface.",
          "No se muestran rankings ni recomendaciones simuladas.",
          "Las acciones se enlazarán a Intelligence cuando exista el motor.",
        ]}
      />
    </div>
  );
}

function ChannelsView({
  model,
  onModelChange,
  kpiData,
}: {
  model: string;
  onModelChange: (model: string) => void;
  kpiData?: MetricKpiResult;
}) {
  const stageRollups = kpiData?.stageRollups;
  const matrixColumns = stageRollups?.available
    ? ["Canal", ...stageRollups.stages.map((stage) => stage.label)]
    : ["Canal", ...FUNNEL_STAGES];
  const matrixRows = buildChannelMatrixRows(stageRollups);

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-[20px] font-bold text-navy">
              Channels
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] text-[var(--sc-fg-muted)]">
              Matriz por canal y etapa desde los datos disponibles. Todavía no
              es un modelo de atribución; W-shaped queda bloqueado hasta eventos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ATTRIBUTION_MODELS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => item !== "Data-driven" && onModelChange(item)}
                disabled={item === "Data-driven"}
                className={cn(
                  "rounded-sc-md border-2 border-ink px-3 py-1.5 font-heading text-[12px] font-bold shadow-pop-xs disabled:opacity-50",
                  model === item
                    ? "bg-rust text-white"
                    : "bg-card text-[var(--sc-ink-soft)]",
                )}
              >
                {item}
                {item === "Data-driven" ? " · locked" : ""}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      <StageRollupFunnel stageRollups={stageRollups} />
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-[16px] font-bold text-navy">
              Matriz canal × etapa
            </h3>
            <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
              Conteos agregados por canal y etapa. No se muestran como revenue
              atribuido ni como dedupe final.
            </p>
          </div>
          <MetricQualityBadge
            status={stageRollups?.available ? asQualityStatus(stageRollups.summary.qualityStatus) : "missing"}
            source="Embudo unificado"
          />
        </div>
        <div className="mt-4">
          <BreakdownTable
            columns={matrixColumns}
            rows={matrixRows}
            empty={
              <EmptyMetricState
                title="Sin matriz"
                requiredSource="Embudo unificado"
                nextAction={stageRollups?.summary.nextAction ?? "Mapear etapa de negocio a fuente y metrica."}
              />
            }
          />
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="font-heading text-[16px] font-bold text-navy">
            Tabla de contribución
          </h3>
          <EmptyMetricState
            title="Sin contribución atribuida"
            requiredSource="Resultados de atribución"
            nextAction="No se calcula W-shaped ni revenue atribuido en PR 2."
          />
        </Panel>
        <Panel>
          <h3 className="font-heading text-[16px] font-bold text-navy">
            Comparación de modelos
          </h3>
          <EmptyMetricState
            title="Model comparison locked"
            requiredSource="Resultados de atribución"
            nextAction="Disponible cuando existan first/last/linear/W-shaped computados."
            state="COMING SOON"
          />
        </Panel>
      </div>
      <Panel>
        <h3 className="font-heading text-[16px] font-bold text-navy">
          Journeys
        </h3>
        <EmptyMetricState
          title="Customer journeys bloqueado"
          requiredSource="Eventos individuales por lead/deal"
          nextAction="Hace falta evento individual por lead/deal; PR 2 no implementa atribución avanzada."
          state="COMING SOON"
        />
      </Panel>
    </div>
  );
}

function ConversionView({ kpiData }: { kpiData?: MetricKpiResult }) {
  const stageRollups = kpiData?.stageRollups;
  const channelRateRows = buildChannelRateRows(stageRollups);

  return (
    <div className="space-y-5">
      <Panel>
        <h2 className="font-heading text-[20px] font-bold text-navy">
          Conversion
        </h2>
        <p className="mt-1 max-w-[780px] text-[13px] text-[var(--sc-fg-muted)]">
          Embudo end-to-end y tasas básicas desde datos agregados por etapa.
          Velocity y journeys siguen bloqueados hasta eventos individuales.
        </p>
      </Panel>
      <StageRollupFunnel stageRollups={stageRollups} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-[16px] font-bold text-navy">
                Conversion by channel
              </h3>
              <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
                Tasas calculadas sobre conteos agregados. Si falta numerador o
                denominador, la fila queda fuera.
              </p>
            </div>
            <MetricQualityBadge
              status={stageRollups?.available ? asQualityStatus(stageRollups.summary.qualityStatus) : "missing"}
              source="Embudo unificado"
            />
          </div>
          <div className="mt-4">
          <BreakdownTable
            columns={["Canal", "Entrada", "Salida", "Tasa", "Estado"]}
            rows={channelRateRows}
            empty={
              <EmptyMetricState
                title="Sin tasas por canal"
                requiredSource="Embudo unificado"
                nextAction={stageRollups?.summary.nextAction ?? "Ejecutar cálculo de embudo por canal y etapa."}
              />
            }
          />
          </div>
        </Panel>
        <Panel>
          <h3 className="font-heading text-[16px] font-bold text-navy">
            Velocity
          </h3>
          <EmptyMetricState
            title="Sin velocidad"
            requiredSource="Eventos individuales por lead/deal"
            nextAction="Necesita timestamps de paso por etapa."
          />
        </Panel>
      </div>
      <StageLeakPanel stageRollups={stageRollups} />
    </div>
  );
}

function StageRollupFunnel({
  stageRollups,
}: {
  stageRollups?: MetricStageRollupResult;
}) {
  if (!stageRollups?.available) {
    return (
      <EmptyMetricState
        title="Sin datos de embudo"
        requiredSource="Embudo unificado"
        nextAction={stageRollups?.summary.nextAction ?? "El dashboard intenta generar el embudo automáticamente cuando existen datos para el rango."}
      />
    );
  }

  return (
    <div
      className="grid gap-2 lg:grid-cols-[repeat(var(--stage-count),minmax(0,1fr))]"
      style={{ "--stage-count": stageRollups.stages.length } as CSSProperties}
    >
      {stageRollups.stages.map((stage) => {
        const nextRate = stageRollups.rates.find(
          (rate) => rate.fromStageId === stage.stageId,
        );
        return (
          <div
            key={stage.stageId}
            className="relative rounded-sc-md border-2 border-ink bg-card p-3 shadow-pop-xs"
          >
            <div className="font-heading text-[11px] font-bold uppercase text-[var(--sc-fg-muted)]">
              {stage.label}
            </div>
            <div className="mt-2 font-heading text-[24px] font-bold text-navy">
              {stage.displayValue}
            </div>
            <div className="mt-2">
              <MetricQualityBadge
                status={asQualityStatus(stage.qualityStatus)}
                source={stageRollupSourceLabel(stage)}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--sc-fg-muted)]">
              {stageDataCompletenessLabel(stage)} · {stage.channels.length || 0} canales
            </p>
            {nextRate && (
              <div className="mt-3 border-t border-border pt-2 text-[11px] font-semibold text-[var(--sc-fg-muted)]">
                {nextRate.toLabel}:{" "}
                <span className="text-navy">{nextRate.displayValue}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StageValueCell({ stage }: { stage: MetricStageRollupStageValue }) {
  return (
    <div className="min-w-[96px] space-y-1">
      <div className="font-heading text-[15px] font-bold text-navy">
        {stage.displayValue}
      </div>
      <MetricQualityBadge
        status={asQualityStatus(stage.qualityStatus)}
        source="Embudo unificado"
      />
    </div>
  );
}

function ChannelCell({ channel }: { channel: MetricStageRollupChannelValue }) {
  return (
    <div className="space-y-1">
      <div className="font-heading text-[13px] font-bold text-navy">
        {channel.label}
      </div>
      <div className="text-[11px] text-[var(--sc-fg-muted)]">
        total canal {channel.displayValue}
      </div>
    </div>
  );
}

function buildChannelMatrixRows(stageRollups?: MetricStageRollupResult) {
  if (!stageRollups?.available) return undefined;
  return stageRollups.channels.map((channel) => ({
    key: channel.channel,
    cells: [
      <ChannelCell key={`${channel.channel}-label`} channel={channel} />,
      ...channel.stages.map((stage) => (
        <StageValueCell
          key={`${channel.channel}-${stage.stageId}`}
          stage={stage}
        />
      )),
    ],
  }));
}

function buildChannelRateRows(stageRollups?: MetricStageRollupResult) {
  if (!stageRollups?.available) return undefined;
  const rows = stageRollups.channels.flatMap((channel) =>
    channel.rates
      .filter((rate) => rate.value != null)
      .map((rate) => ({
        key: `${channel.channel}-${rate.fromStageId}-${rate.toStageId}`,
        cells: [
          channel.label,
          rate.fromLabel,
          rate.toLabel,
          <span
            key={`${channel.channel}-${rate.fromStageId}-${rate.toStageId}-value`}
            className="font-heading font-bold text-navy"
          >
            {rate.displayValue}
          </span>,
          <MetricQualityBadge
            key={`${channel.channel}-${rate.fromStageId}-${rate.toStageId}-status`}
            status={asQualityStatus(rate.qualityStatus)}
            source="Embudo agregado"
          />,
        ],
      })),
  );
  return rows.length ? rows : undefined;
}

function StageLeakPanel({
  stageRollups,
}: {
  stageRollups?: MetricStageRollupResult;
}) {
  const rates = (stageRollups?.rates ?? [])
    .filter((rate) => rate.value != null)
    .sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  const worst = rates[0];

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-[16px] font-bold text-navy">
            Leak panel
          </h3>
          <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
            Fuga básica calculada por tasas entre etapas agregadas. No usa
            targets ni benchmarks inventados.
          </p>
        </div>
        <MetricQualityBadge
          status={worst ? asQualityStatus(worst.qualityStatus) : "missing"}
          source="Embudo unificado"
        />
      </div>
      {worst ? (
        <div className="mt-4 rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-4 shadow-pop-xs">
          <div className="font-heading text-[12px] font-bold uppercase text-[var(--sc-fg-muted)]">
            Mayor fuga observada
          </div>
          <div className="mt-2 font-heading text-[22px] font-bold text-navy">
            {worst.fromLabel} → {worst.toLabel}: {worst.displayValue}
          </div>
          <p className="mt-2 text-[12px] text-[var(--sc-fg-muted)]">
            Numerador {worst.numerator ?? "-"} · denominador {worst.denominator ?? "-"}.
            Interpretar como vista agregada hasta que exista attribution.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyMetricState
            title="Sin leak calculable"
            requiredSource="Embudo unificado"
            nextAction={stageRollups?.summary.nextAction ?? "Hace falta al menos dos etapas con valores en el rango."}
          />
        </div>
      )}
    </Panel>
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
  const trendKpis = selectOverviewKpis(kpiData, northStar);
  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-[20px] font-bold text-navy">
              Trends
            </h2>
            <p className="mt-1 max-w-[780px] text-[13px] text-[var(--sc-fg-muted)]">
              Tendencias e hitos quedan preparados. La serie de North Star no se
              simula.
            </p>
          </div>
          <MetricQualityBadge
            status={kpiData?.run ? asQualityStatus(kpiData.summary.qualityStatus) : "pending"}
            source="Runs KPI + anotaciones"
          />
        </div>
        {kpiData?.run && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricTile
              label="Run KPI"
              value={kpiData.run.id.slice(-8)}
              hint={`${kpiData.summary.ok}/${kpiData.summary.total} KPIs ok`}
            />
            <MetricTile
              label="North Star"
              value={northStar?.displayValue ?? "-"}
              hint={northStar ? sourceMetricLabel(northStar) : "Sin KPI enlazado"}
            />
            <MetricTile
              label="Rango computado"
              value={`${kpiData.run.rangeFrom.slice(5)} -> ${kpiData.run.rangeTo.slice(5)}`}
              hint="La serie historica sigue pendiente."
            />
          </div>
        )}
        <div className="mt-5">
          <MiniSparkline state="SIN DATOS" label="North Star trend pendiente" />
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {trendKpis.length ? (
          trendKpis.map((kpi) => (
            <Panel key={kpi.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-[14px] font-bold text-navy">
                  {kpi.label}
                </h3>
                <MetricQualityBadge
                  status={asQualityStatus(kpi.qualityStatus)}
                  source={sourceMetricLabel(kpi)}
                />
              </div>
              <div className="mt-3">
                <MiniSparkline state="SIN DATOS" label={`${kpi.label} sin serie`} />
              </div>
              <p className="mt-2 text-[11px] text-[var(--sc-fg-muted)]">
                Valor actual: {kpi.displayValue}. Sin puntos historicos
                derivados.
              </p>
            </Panel>
          ))
        ) : (
          ["North Star", "Inversion", "Revenue", "Conversion rate"].map((label) => (
            <Panel key={label}>
              <h3 className="font-heading text-[14px] font-bold text-navy">
                {label}
              </h3>
              <div className="mt-3">
                <MiniSparkline />
              </div>
              <p className="mt-2 text-[11px] text-[var(--sc-fg-muted)]">
                Sin serie computada.
              </p>
            </Panel>
          ))
        )}
      </div>
      <Panel>
        <h3 className="font-heading text-[16px] font-bold text-navy">
          Hitos y anotaciones
        </h3>
        <EmptyMetricState
          title="Sin anotaciones"
          requiredSource="Anotaciones de campañas"
          nextAction="Las campañas, cambios y eventos se mostrarán aquí cuando existan."
        />
      </Panel>
      <MoversPanel title="Intelligence preview" state="COMING SOON" />
    </div>
  );
}

interface SurfaceCardModel {
  key: SurfaceKey;
  icon: string;
  label: string;
  description: string;
  state: MetricDataState;
  sources: string[];
}

function SurfaceGrid({
  cards,
  onOpen,
}: {
  cards: SurfaceCardModel[];
  onOpen: (surface: SurfaceKey) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <SurfaceStatusCard
          key={card.key}
          icon={card.icon}
          label={card.label}
          description={card.description}
          state={card.state}
          sources={card.sources}
          onOpen={() => onOpen(card.key)}
        />
      ))}
    </div>
  );
}

function StatePill({ state }: { state: MetricDataState }) {
  const tone =
    state === "ON"
      ? "ok"
      : state === "PARCIAL" || state === "CONECTADO SIN SNAPSHOTS"
        ? "warn"
        : state === "COMING SOON"
          ? "custom"
          : "flat";
  return <Chip tone={tone}>{state}</Chip>;
}

function KpiTile({
  kpi,
  tone = "leading",
}: {
  kpi: MetricKpiValue;
  tone?: "paper" | "leading" | "lagging" | "custom";
}) {
  const lowCoverage =
    kpi.qualityStatus === "partial" &&
    kpi.sourceCoverage > 0 &&
    kpi.sourceCoverage < 0.5;
  return (
    <MetricTile
      label={kpi.label}
      value={
        <span className="break-words text-[20px]">
          {kpi.displayValue}
          {lowCoverage && (
            <span className="mt-1 block font-sans text-[10px] font-bold uppercase leading-tight text-rust">
              {coverageLabel(kpi)}
            </span>
          )}
        </span>
      }
      tone={tone}
      hint={
        <div className="space-y-1">
          <MetricQualityBadge
            status={asQualityStatus(kpi.qualityStatus)}
            source={sourceMetricLabel(kpi)}
          />
          <div>{lineageLabel(kpi)}</div>
        </div>
      }
    />
  );
}

function asQualityStatus(status?: MetricKpiValue["qualityStatus"] | MetricKpiResult["summary"]["qualityStatus"]): MetricQualityStatus {
  return status ?? "missing";
}

function qualityToState(status?: MetricKpiResult["summary"]["qualityStatus"]): MetricDataState {
  if (!status || status === "missing") return "SIN DATOS";
  if (status === "ok") return "ON";
  return "PARCIAL";
}

function sourceMetricLabel(kpi?: MetricKpiValue | null): string {
  if (!kpi) return "KPIs calculados";
  if (kpi.source && kpi.metricName) {
    return `${friendlySource(kpi.source)} · ${friendlyMetric(kpi.metricName)}`;
  }
  return friendlyProvenance(kpi.provenanceLabel) || "KPIs calculados";
}

function coverageLabel(kpi: MetricKpiValue): string {
  const totalDays = daysInclusive(kpi.rangeFrom, kpi.rangeTo);
  const coveredDays = Math.min(totalDays, Math.max(0, Math.round(kpi.sourceCoverage * totalDays)));
  if (kpi.sourceCoverage >= 0.995) return `${totalDays} de ${totalDays} días con datos`;
  if (kpi.sourceCoverage <= 0) return `0 de ${totalDays} días con datos`;
  return `${coveredDays} de ${totalDays} días con datos`;
}

function lineageLabel(kpi: MetricKpiValue): string {
  const entries = kpi.inputRefs.length;
  const suffix = entries === 1 ? "entrada usada" : "entradas usadas";
  return `${coverageLabel(kpi)} · ${entries} ${suffix}`;
}

function stageRollupSourceLabel(stage: MetricStageRollupStageValue): string {
  if (!stage.sources.length) return "Embudo unificado";
  return stage.sources.slice(0, 2).map(friendlySourceMetric).join(", ");
}

function stageDataCompletenessLabel(stage: MetricStageRollupStageValue): string {
  if (stage.inputRefsCount === 0) return "sin entradas de origen";
  return `${stage.inputRefsCount} ${stage.inputRefsCount === 1 ? "entrada de origen" : "entradas de origen"}`;
}

function daysInclusive(from: string, to: string): number {
  const fromTime = new Date(`${from}T00:00:00Z`).getTime();
  const toTime = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime < fromTime) return 1;
  return Math.floor((toTime - fromTime) / 86_400_000) + 1;
}

function friendlySourceMetric(value: string): string {
  const [source, ...metricParts] = value.split(".");
  const metric = metricParts.join(".");
  return metric ? `${friendlySource(source)} · ${friendlyMetric(metric)}` : friendlySource(source);
}

function friendlyProvenance(value?: string | null): string {
  if (!value) return "";
  if (value === "metric_stage_rollups") return "Embudo unificado";
  if (value.includes(" -> ")) {
    const [left, stage] = value.split(" -> ");
    return `${friendlySourceMetric(left)} a ${friendlyMetric(stage)}`;
  }
  return friendlySourceMetric(value);
}

function friendlySource(source: string): string {
  const labels: Record<string, string> = {
    ga4: "GA4",
    gsc: "Search Console",
    ghl: "GHL",
    google_ads: "Google Ads",
    "google-ads": "Google Ads",
    instantly: "Instantly",
    lemlist: "Lemlist",
    meta_ads: "Meta Ads",
    "meta-ads": "Meta Ads",
    metric_kpi_values: "KPIs calculados",
    metric_stage_rollups: "Embudo unificado",
    metricool: "Metricool",
    pagespeed: "PageSpeed",
    posthog: "PostHog",
    semantic: "Capa semántica",
    trust_score: "Trust Engine",
    yalc: "Partnerships",
  };
  return labels[source] ?? friendlyMetric(source);
}

function friendlyMetric(metric: string): string {
  const labels: Record<string, string> = {
    appointments: "reuniones",
    activation_events: "eventos de activación",
    activation_rate: "tasa de activación",
    avgEngagement: "engagement medio",
    brand_assets: "Brand Assets",
    borrowed_trust: "Borrow Trust",
    bounced: "rebotes",
    comments: "comentarios",
    clicks: "clicks",
    conversions: "conversiones",
    cpc: "CPC",
    ctr: "CTR",
    deals: "deals",
    delivered: "entregados",
    demand_engine: "Demand Agents",
    engagementRate: "engagement rate",
    frequency: "frecuencia",
    followers: "seguidores",
    geo_presence: "Geo Presence",
    hookRate: "hook rate",
    impressionShare: "cuota de impresiones",
    impressions: "impresiones",
    interested: "respuestas positivas",
    likes: "likes",
    lostImpressionShare: "cuota perdida de impresiones",
    leads: "leads",
    meetings: "reuniones",
    metric_stage_rollups: "embudo unificado",
    newContacts: "nuevos contactos",
    newUsers: "usuarios nuevos",
    north_star_weekly: "North Star semanal",
    opens: "aperturas",
    outbound_readiness: "Out of Readiness",
    pageviews: "pageviews",
    performance_desktop: "PageSpeed desktop",
    performance_mobile: "PageSpeed mobile",
    pipelineValue: "valor de pipeline",
    position: "posición media",
    reach: "alcance",
    replies: "respuestas",
    revenue: "revenue",
    roas: "ROAS",
    saves: "guardados",
    screenPageViews: "pageviews",
    sent: "enviados",
    shares: "compartidos",
    sessions: "sesiones",
    serp_trust: "Served Trust",
    spend: "inversión",
    totalContacts: "contactos totales",
    totalOpportunities: "oportunidades totales",
    totalUsers: "usuarios",
    trust_score: "Trust Core Global",
    unsubscribed: "bajas",
    users: "usuarios",
    videoViews: "visualizaciones de video",
  };
  if (labels[metric]) return labels[metric];
  return metric
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function selectOverviewKpis(data?: MetricKpiResult, primary?: MetricKpiValue | null): MetricKpiValue[] {
  if (!data?.values?.length) return [];
  const overview = data.values.filter(
    (kpi) => kpi.dashboardBlock === "overview" && kpi.id !== primary?.id,
  );
  const populatedOverview = overview.filter((kpi) => kpi.value != null);
  const missingOverview = overview.filter((kpi) => kpi.value == null);
  const rest = data.values
    .filter((kpi) => kpi.id !== primary?.id && kpi.dashboardBlock !== "overview")
    .sort((a, b) => scoreKpi(b) - scoreKpi(a));
  return [
    ...(primary ? [primary] : []),
    ...populatedOverview,
    ...rest,
    ...missingOverview,
  ].slice(0, 4);
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
    if (!northStar?.label && data?.northStar) return data.northStar;
    return null;
  }

  return data?.northStar ?? null;
}

function northStarMatchesKpi(label: string, kpi: MetricKpiValue): boolean {
  const haystack = normalizeComparable(`${kpi.kpiId} ${kpi.label} ${kpi.source ?? ""} ${kpi.metricName ?? ""}`);
  if (/meeting|reunion|cita|appointment/.test(label)) {
    return /meeting|reunion|cita|appointment/.test(haystack);
  }
  if (/lead|contact/.test(label)) {
    return /lead|contact/.test(haystack);
  }
  if (/deal|opportunit|oportunidad|proposal|propuesta/.test(label)) {
    return /deal|opportunit|oportunidad|proposal|propuesta/.test(haystack);
  }
  if (/revenue|gmv|venta|sales|ingreso/.test(label)) {
    return /revenue|gmv|venta|sales|ingreso|value/.test(haystack);
  }
  if (/activation|activacion|activated/.test(label)) {
    return /activation|activacion|activated/.test(haystack);
  }
  return false;
}

function normalizeComparable(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
}

function selectEconomyKpis(data?: MetricKpiResult): MetricKpiValue[] {
  if (!data?.values?.length) return [];
  return data.values
    .filter((kpi) => {
      const haystack = `${kpi.label} ${kpi.metricName ?? ""} ${kpi.unit ?? ""}`.toLowerCase();
      return /spend|inversi|cac|cpa|cpl|revenue|roas|roi|coste|cost/.test(haystack);
    })
    .sort((a, b) => scoreKpi(b) - scoreKpi(a))
    .slice(0, 4);
}

function selectSurfaceKpis(data: MetricKpiResult | undefined, surface: SurfaceKey): MetricKpiValue[] {
  return (data?.values ?? [])
    .filter((kpi) => kpi.dashboardBlock === "surface" && kpi.surface === surface)
    .sort((a, b) => scoreKpi(b) - scoreKpi(a));
}

function scoreKpi(kpi: MetricKpiValue): number {
  let score = kpi.value != null ? 10 : 0;
  if (kpi.qualityStatus === "ok") score += 5;
  if (kpi.qualityStatus === "partial") score += 4;
  if (kpi.qualityStatus === "dirty" || kpi.qualityStatus === "stale") score += 3;
  if (kpi.qualityStatus === "demo") score += 1;
  if (kpi.dashboardBlock === "overview") score += 4;
  return score;
}

function buildSurfaceCard(
  def: SurfaceDef,
  entry: SurfaceSummaryEntry | undefined,
  configured?: boolean,
): SurfaceCardModel {
  return {
    key: def.key,
    icon: def.emoji,
    label: SURFACE_DETAIL_CONFIGS[def.key].label,
    description: def.what,
    state: surfaceState(def, entry, configured),
    sources: entry?.sources ?? [],
  };
}

function surfaceState(
  def: SurfaceDef,
  entry: SurfaceSummaryEntry | undefined,
  configured?: boolean,
): MetricDataState {
  if (!configured) return "SIN DATOS";
  if (!entry?.connected) return "OFF";
  const req = SURFACE_MANDATORY_SOURCES[def.key];
  if (req) {
    const sources = new Set(entry.sources);
    const allOk =
      !req.allOf || req.allOf.every((source) => sources.has(source));
    const anyOk = !req.anyOf || req.anyOf.some((source) => sources.has(source));
    if (!allOk || !anyOk) return "PARCIAL";
  }
  if (!entry.metrics?.length) return "CONECTADO SIN SNAPSHOTS";
  return "ON";
}

function indexSurfaceEntries(
  entries?: SurfaceSummaryEntry[],
): Partial<Record<SurfaceKey, SurfaceSummaryEntry>> {
  const out: Partial<Record<SurfaceKey, SurfaceSummaryEntry>> = {};
  for (const entry of entries ?? []) out[entry.surface] = entry;
  return out;
}

function normalizeTab(value: unknown): MetricDashboardTab | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return METRIC_DASHBOARD_TABS.some((tab) => tab.key === raw)
    ? (raw as MetricDashboardTab)
    : null;
}

function normalizeSurface(value: unknown): SurfaceKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return METRICS_SURFACE_ORDER.includes(raw as SurfaceKey)
    ? (raw as SurfaceKey)
    : null;
}

function cleanRouteQuery(
  query: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" || Array.isArray(value)) out[key] = value;
  }
  return out;
}
