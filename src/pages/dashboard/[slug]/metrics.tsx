import { useEffect, useMemo, useState, type ReactNode } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { GitBranch, Settings, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useOpenChat } from "@/hooks/useChat";
import {
  useDashboardDefinition,
  useMetricsHealth,
  useSurfaceSummary,
  type DashboardVersionMeta,
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
  MiniFunnel,
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
  "Data-driven",
];
const CHANNELS = [
  "Paid",
  "Organic / SEO",
  "Outbound ICP",
  "Partnerships",
  "Social",
  "Direct",
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
    source: "metric_kpi_values",
    status: "missing",
    detail:
      "Los valores finales, deltas, input refs y quality_status todavía no están persistidos.",
    nextAction: "PR 3 debe computar KPIs directos desde metric_snapshots.",
  },
  {
    title: "Funnel y atribución",
    source: "metric_stage_rollups/events",
    status: "missing",
    detail:
      "Overview funnel, Channels y Conversion dependen de stage map y eventos o rollups por etapa.",
    nextAction: "Configurar etapa ← source.metric/dimensions antes de tasas.",
  },
  {
    title: "Aliases de métricas",
    source: "source/metric aliases",
    status: "partial",
    detail:
      "Hay drift conocido: emailsSent/sent, inp_mobile/tbt_mobile y source ids con guion/underscore.",
    nextAction: "Normalizar aliases antes de resolver formulas de PR 3.",
  },
  {
    title: "Fuentes conocidas dirty",
    source: "GHL",
    status: "dirty",
    detail:
      "GHL aparece marcado como dirty; sus cifras no deben mostrarse como exactas sin etiqueta.",
    nextAction: "Propagar dirty a KPI final y usar fuente de verdad cuando exista.",
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
                />
              )}
              {activeTab === "surfaces" &&
                (activeSurface ? (
                  <SurfaceDetailView
                    slug={slug}
                    surface={activeSurface}
                    entry={surfaceEntries[activeSurface]}
                    configured={surfacesData?.configured}
                    onBack={closeSurface}
                  />
                ) : (
                  <SurfacesView
                    surfaceCards={surfaceCards}
                    openSurface={openSurface}
                  />
                ))}
              {activeTab === "channels" && (
                <ChannelsView model={model} onModelChange={setModel} />
              )}
              {activeTab === "conversion" && <ConversionView />}
              {activeTab === "trends" && <TrendsView />}
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
            {DATE_RANGES.find((item) => item.key === range)?.label} · PR 2 UI
            shell, sin cómputo KPI avanzado.
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
            requiredSource="metric_dashboards"
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
  surfaceCards,
  openSurface,
}: {
  configured?: boolean;
  health?: string;
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
              source={configured ? "metric_dashboards" : "sin definición"}
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
            requiredSource="metric_dashboards"
            nextAction={
              configured
                ? "Definición activa encontrada; PR 3/4 conectarán valores semánticos."
                : "Diseñar o guardar la primera definición con Merlin."
            }
            state={configured ? "CONECTADO SIN SNAPSHOTS" : "SIN DATOS"}
          />
          <EmptyMetricState
            title="KPIs semánticos"
            requiredSource="metric_kpi_values"
            nextAction="Pendiente de PR 3: cómputo directo desde metric_snapshots."
            state="SIN DATOS"
          />
          <EmptyMetricState
            title="Funnel semántico"
            requiredSource="metric_stage_rollups"
            nextAction="Pendiente de mapping etapa ← source.metric/dimensions."
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
              quedar missing, partial, dirty o demo antes de computar KPIs.
            </p>
          </div>
          <MetricQualityBadge status="pending" source="data lineage map" />
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
}: {
  slug: string;
  surfaceCards: SurfaceCardModel[];
  openSurface: (surface: SurfaceKey) => void;
  configured?: boolean;
}) {
  return (
    <div className="space-y-5">
      <Panel>
        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="custom">North Star</Chip>
              <DeltaBadge />
            </div>
            <h2 className="mt-3 font-heading text-[24px] font-bold text-navy">
              North Star pendiente de semantic KPI
            </h2>
            <p className="mt-2 max-w-[720px] text-[13px] text-[var(--sc-fg-muted)]">
              El panel está preparado para mostrar el KPI principal con input
              refs y deltas cuando PR 3/4 conecte `metric_kpi_values`.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                "Sessions",
                "Lead → Cualificado",
                "Cualificado → Reunión",
                "Coste / reunión",
              ].map((label) => (
                <MetricTile
                  key={label}
                  label={label}
                  value="—"
                  hint={
                    <MetricQualityBadge
                      status="missing"
                      source="metric_kpi_values"
                    />
                  }
                />
              ))}
            </div>
          </div>
          <EmptyMetricState
            title={
              configured
                ? "Sin KPI computado todavía"
                : "Dashboard no configurado"
            }
            requiredSource="metric_kpi_values"
            nextAction="PR 3 calculará KPIs directos; PR 4 expondrá el API dashboard-data."
            state={configured ? "CONECTADO SIN SNAPSHOTS" : "SIN DATOS"}
          />
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
            status="pending"
            source="paid + partnerships + crm"
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {["Inversión", "CAC", "Revenue generado", "ROAS"].map((label) => (
            <MetricTile
              key={label}
              label={label}
              value="—"
              hint="Sin dato live todavía"
            />
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 className="font-heading text-[18px] font-bold text-navy">
          Embudo unificado
        </h2>
        <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
          La estructura está lista; los porcentajes se llenan cuando exista
          mapping etapa ← surface.metric.
        </p>
        <div className="mt-4">
          <MiniFunnel stages={FUNNEL_STAGES} state="SIN DATOS" />
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
          "Cambios cross-surface pendientes de metric_signals.",
          "Fugas del funnel pendientes de metric_stage_rollups.",
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
  onBack,
}: {
  slug: string;
  surface: SurfaceKey;
  entry?: SurfaceSummaryEntry;
  configured?: boolean;
  onBack: () => void;
}) {
  const config = SURFACE_DETAIL_CONFIGS[surface];
  const def = SURFACES.find((item) => item.key === surface);
  const state = def ? surfaceState(def, entry, configured) : "SIN DATOS";
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
                requiredSource="metric_snapshots dimensions"
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
          "Insights bloqueados hasta que metric_signals tenga señales reales.",
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
}: {
  model: string;
  onModelChange: (model: string) => void;
}) {
  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-[20px] font-bold text-navy">
              Channels
            </h2>
            <p className="mt-1 max-w-[760px] text-[13px] text-[var(--sc-fg-muted)]">
              Vista de atribución preparada. El modelo avanzado queda bloqueado
              hasta que existan `metric_stage_events` y resultados de
              atribución.
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
      <MiniFunnel stages={FUNNEL_STAGES} state="SIN DATOS" />
      <Panel>
        <h3 className="font-heading text-[16px] font-bold text-navy">
          Matriz canal × etapa
        </h3>
        <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
          Sin números hasta tener rollups por stage/channel.
        </p>
        <div className="mt-4">
          <BreakdownTable
            columns={["Canal", ...FUNNEL_STAGES]}
            rows={CHANNELS.map((channel) => ({
              key: channel,
              cells: [
                channel,
                ...FUNNEL_STAGES.map(() => (
                  <span
                    key={`${channel}-empty`}
                    className="text-[var(--sc-fg-muted)]"
                  >
                    —
                  </span>
                )),
              ],
            }))}
            empty={
              <EmptyMetricState
                title="Sin matriz"
                requiredSource="metric_stage_rollups"
                nextAction="Mapear etapa de negocio a source.metric/dimensions."
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
            requiredSource="metric_attribution_results"
            nextAction="No se calcula W-shaped ni revenue atribuido en PR 2."
          />
        </Panel>
        <Panel>
          <h3 className="font-heading text-[16px] font-bold text-navy">
            Comparación de modelos
          </h3>
          <EmptyMetricState
            title="Model comparison locked"
            requiredSource="metric_attribution_results"
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
          requiredSource="metric_stage_events"
          nextAction="Hace falta evento individual por lead/deal; PR 2 no implementa atribución avanzada."
          state="COMING SOON"
        />
      </Panel>
    </div>
  );
}

function ConversionView() {
  return (
    <div className="space-y-5">
      <Panel>
        <h2 className="font-heading text-[20px] font-bold text-navy">
          Conversion
        </h2>
        <p className="mt-1 max-w-[780px] text-[13px] text-[var(--sc-fg-muted)]">
          Embudo end-to-end, conversion matrix, velocidad y leaks preparados sin
          calcular tasas todavía.
        </p>
      </Panel>
      <MiniFunnel stages={FUNNEL_STAGES} state="SIN DATOS" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <h3 className="font-heading text-[16px] font-bold text-navy">
            Conversion by channel
          </h3>
          <BreakdownTable
            columns={["Canal", "Entrada", "Salida", "Tasa", "Estado"]}
            empty={
              <EmptyMetricState
                title="Sin tasas por canal"
                requiredSource="metric_stage_rollups"
                nextAction="PR posterior agregará stage/channel y comparativos."
              />
            }
          />
        </Panel>
        <Panel>
          <h3 className="font-heading text-[16px] font-bold text-navy">
            Velocity
          </h3>
          <EmptyMetricState
            title="Sin velocidad"
            requiredSource="metric_stage_events"
            nextAction="Necesita timestamps de paso por etapa."
          />
        </Panel>
      </div>
      <MoversPanel title="Leak panel" state="COMING SOON" />
    </div>
  );
}

function TrendsView() {
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
            status="pending"
            source="metric_kpi_runs + metric_annotations"
          />
        </div>
        <div className="mt-5">
          <MiniSparkline state="SIN DATOS" label="North Star trend pendiente" />
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {["North Star", "Inversión", "Revenue", "Conversion rate"].map(
          (label) => (
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
          ),
        )}
      </div>
      <Panel>
        <h3 className="font-heading text-[16px] font-bold text-navy">
          Hitos y anotaciones
        </h3>
        <EmptyMetricState
          title="Sin anotaciones"
          requiredSource="metric_annotations"
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
