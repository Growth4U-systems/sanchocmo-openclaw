import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MetricKpiResult, MetricKpiValue, MetricsHealthResult, PartnershipReport, SurfaceDetailResult, SurfaceSummaryEntry } from "@/hooks/useMetrics";
import type { DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import {
  buildMetricStageRollupReadModel,
  type MetricStageRollupReadInput,
} from "@/lib/metrics/stage-rollup-read-model";
import { getSurface } from "@/lib/metrics/surfaces";
import {
  DashboardDataStateBanner,
  buildChannelRows,
  buildFunnelModel,
  buildSalesEngineConversion,
  buildSalesEngineMatrix,
  ChannelMatrix,
  salesEngineWindow,
  CustomMetricPanel,
  deltaTone,
  displayKpiValue,
  dropoffLabel,
  healthErrorSources,
  MetricQualityBadge,
  metricQualityCopy,
  northStarTarget,
  observedMetricLineageSources,
  OutboundSurface,
  partnershipReportDataState,
  partnershipReportHasCompleteFinancials,
  partnershipReportHasTrackedData,
  percentOfTarget,
  resolveMetricsDashboardLoadState,
  resolveVisibleDashboardTabs,
  resolveVisibleSurfaceOrder,
  selectDashboardCustomMetrics,
  selectDashboardNorthStarKpi,
  stageRateToFraction,
  stateLabel,
  summarizeDashboardMetricQuality,
  surfaceState,
  surfaceStateWithKpiQuality,
  UnifiedFunnel,
  WebSeoSurface,
} from "../MockupMetricsDashboard";

function dashboardDefinition(
  overrides: Partial<DashboardDefinition> = {},
): DashboardDefinition {
  return {
    archetype: "lead-to-sale",
    northStar: {},
    tabs: [],
    surfaces: [],
    plan: { funnel: [], kpis: [] },
    customSurfaces: [],
    customMetrics: [],
    ...overrides,
  };
}

function kpiWithSentiment(
  sentiment: "positive" | "negative" | "neutral" | null,
): MetricKpiValue {
  return {
    comparison: {
      displayDelta: "-5%",
      direction: "down",
      sentiment,
    },
  } as unknown as MetricKpiValue;
}

function qualityKpi(input: {
  kpiId: string;
  label: string;
  source: string;
  metricName: string;
  qualityStatus: MetricKpiValue["qualityStatus"];
  value?: number | null;
  dashboardBlock?: string;
  surface?: MetricKpiValue["surface"];
}): MetricKpiValue {
  const value = input.value ?? null;
  return {
    id: input.kpiId,
    kpiId: input.kpiId,
    label: input.label,
    dashboardBlock: input.dashboardBlock ?? "surface",
    surface: input.surface === undefined ? "paid" : input.surface,
    source: input.source,
    metricName: input.metricName,
    value,
    valueText: null,
    displayValue: value == null ? "-" : String(value),
    unit: null,
    qualityStatus: input.qualityStatus,
    provenanceLabel: `${input.source} · ${input.metricName}`,
    inputRefs: [],
    sourceCoverage: value == null ? 0 : 1,
    rangeFrom: "2026-07-01",
    rangeTo: "2026-07-15",
    definitionVersion: 2,
    computedAt: "2026-07-16T00:00:00.000Z",
    comparison: null,
  };
}

test("North Star usa el target versionado exacto y distingue cero de ausencia", () => {
  const definition = dashboardDefinition({ northStar: { target: 240 } });
  assert.equal(northStarTarget(definition), 240);
  assert.equal(percentOfTarget(72, northStarTarget(definition)), 30);
  assert.equal(percentOfTarget(0, northStarTarget(definition)), 0);
  assert.equal(percentOfTarget(72, null), null);
  assert.equal(northStarTarget(dashboardDefinition()), null);
});

test("North Star UI no presenta appointments genéricos como reuniones cualificadas", () => {
  const appointments = {
    id: "appointments",
    kpiId: "pipeline.ghl.appointments",
    label: "Reuniones GHL",
    source: "ghl",
    metricName: "appointments",
    value: 10,
  } as MetricKpiValue;
  const data = { values: [appointments], northStar: null } as MetricKpiResult;

  assert.equal(
    selectDashboardNorthStarKpi(
      data,
      dashboardDefinition({ northStar: { label: "Reuniones" } }),
    )?.kpiId,
    "pipeline.ghl.appointments",
  );
  assert.equal(
    selectDashboardNorthStarKpi(
      data,
      dashboardDefinition({ northStar: { label: "Reuniones cualificadas" } }),
    ),
    null,
  );
  assert.equal(
    selectDashboardNorthStarKpi(
      data,
      dashboardDefinition({
        northStar: {
          label: "Reuniones cualificadas",
          kpiRef: "pipeline.ghl.appointments",
        },
      }),
    )?.kpiId,
    "pipeline.ghl.appointments",
  );
});

test("tasas del stage rollup pasan de porcentaje API a fracción UI", () => {
  assert.equal(stageRateToFraction(4), 0.04);
  assert.equal(stageRateToFraction(100), 1);
  assert.equal(stageRateToFraction(null), null);
  assert.equal(dropoffLabel(stageRateToFraction(4)), "−96%");
});

test("UI separa el mismo lead de GA4, Meta y GHL y no publica total, tasa ni fuga global", () => {
  const stageRow = (
    overrides: Partial<MetricStageRollupReadInput>,
  ): MetricStageRollupReadInput => ({
    id: "stage-row",
    stageId: "leads",
    stageLabel: "Leads",
    stageOrder: 1,
    stageDate: "2026-07-15",
    channel: "web",
    surface: "web",
    source: "ga4",
    metricName: "conversions",
    value: 1,
    qualityStatus: "ok",
    provenanceLabel: "provider observation",
    inputRefs: [{ identity: "same-lead" }],
    rangeFrom: "2026-07-01",
    rangeTo: "2026-07-15",
    definitionVersion: 5,
    computedAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  });
  const stageRollups = buildMetricStageRollupReadModel({
    configured: true,
    range: { from: "2026-07-01", to: "2026-07-15" },
    rows: [
      stageRow({
        id: "same-lead-ga4",
        source: "ga4",
        metricName: "conversions",
        channel: "web",
      }),
      stageRow({
        id: "same-lead-meta",
        source: "meta_ads",
        metricName: "leads",
        channel: "paid",
        surface: "paid",
      }),
      stageRow({
        id: "same-lead-ghl",
        source: "ghl",
        metricName: "newContacts",
        channel: "crm",
        surface: "pipeline",
      }),
    ],
  });
  const data = { values: [], stageRollups } as unknown as MetricKpiResult;
  const funnel = buildFunnelModel(data);
  const providerRows = buildChannelRows(data.stageRollups, funnel.stages);

  assert.equal(funnel.stages.find((stage) => stage.id === "leads")?.value, null);
  assert.equal(
    funnel.stages.find((stage) => stage.id === "leads")?.displayValue,
    "3 series separadas",
  );
  assert.ok(funnel.rates.every((rate) => rate.value == null));
  assert.equal(funnel.totalConversion, "-");
  assert.deepEqual(
    providerRows.map((row) =>
      row.stages.find((stage) => stage.stageId === "leads")?.value,
    ),
    [1, 1, 1],
  );

  // Las filas por proveedor siguen siendo series separadas (las consumen
  // ContributionTable y ConversionMatrix; la matriz principal ahora es GHL-only).
  const labels = providerRows.map((row) => row.label).join(" | ");
  assert.match(labels, /Pipeline\/CRM · GHL/);
  assert.match(labels, /Paid · Meta Ads/);
  assert.match(labels, /Web\/SEO · GA4/);

  const markup = renderToStaticMarkup(createElement(UnifiedFunnel, { funnel }));
  assert.match(markup, /3 series separadas/);
  assert.match(markup, /No se suman ni se convierten en tasas/);
  assert.doesNotMatch(markup, /Conversión total/);
  assert.doesNotMatch(markup, /caída relativa/);
  assert.doesNotMatch(markup, /% del total/);
});

function salesEngineDetail(
  metrics: Array<{
    metric: string;
    value: number;
    quality?: string;
    dimensions?: Record<string, string> | null;
  }>,
): SurfaceDetailResult {
  return {
    configured: true,
    surface: "pipeline",
    from: "2026-07-01",
    to: "2026-07-15",
    sources: [{
      source: "ghl",
      metrics: metrics.map((metric) => ({
        aggregation: "sum",
        quality: "ok",
        dimensions: null,
        ...metric,
      })),
    }],
  } as unknown as SurfaceDetailResult;
}

test("Motor de ventas agrupa canales GHL en buckets y distingue ausencia de cero", () => {
  const model = buildSalesEngineMatrix(salesEngineDetail([
    { metric: "newContacts", value: 10 },
    { metric: "newContacts", value: 4, dimensions: { channel: "LinkedIn Outreach" } },
    { metric: "newContacts", value: 3, dimensions: { channel: "Explee AutoGTM" } },
    { metric: "newContacts", value: 2, dimensions: { channel: "google / cpc" } },
    { metric: "newContacts", value: 1, dimensions: { channel: "Reunión demo" } },
    { metric: "appointmentsByChannel", value: 0 },
    { metric: "wonOpportunities", value: 0 },
    { metric: "wonValue", value: 0 },
    // opportunitiesByChannel ausente adrede → etapa sin métrica recolectada
  ]));
  assert.equal(model.available, true);

  const stage = (key: string) => {
    const found = model.stages.find((item) => item.key === key);
    assert.ok(found, key);
    return found;
  };
  const cell = (key: string, bucket: string) =>
    stage(key).cells.find((item) => item.bucket === bucket)?.value;

  assert.equal(stage("leads").total, 10);
  assert.equal(cell("leads", "linkedin"), 4);
  assert.equal(cell("leads", "email"), 3);
  assert.equal(cell("leads", "paid"), 2);
  assert.equal(cell("leads", "web"), 1);
  assert.equal(cell("leads", "trust"), 0);
  assert.equal(cell("leads", "otros"), 0);

  // Cero real observado (métrica recolectada) se conserva como 0.
  assert.equal(stage("reuniones").present, true);
  assert.equal(stage("reuniones").total, 0);
  assert.equal(cell("reuniones", "web"), 0);

  // Métrica no recolectada → ausencia honesta, nunca un 0 fabricado.
  assert.equal(stage("oportunidades").present, false);
  assert.equal(stage("oportunidades").total, null);
  assert.equal(cell("oportunidades", "web"), null);

  // Ganadas y € ganado usan los snapshots agregados como total honesto.
  assert.equal(stage("ganadas").present, true);
  assert.equal(stage("ganadas").total, 0);
  assert.equal(stage("valor").present, true);
  assert.equal(stage("valor").total, 0);

  const markup = renderToStaticMarkup(createElement(ChannelMatrix, { model }));
  assert.match(markup, /Email\/Outbound/);
  assert.match(markup, /LinkedIn/);
  assert.match(markup, /Trust Score/);
  assert.match(markup, /Ganadas/);
  assert.match(markup, /€ ganado/);
  assert.match(markup, /—/);
  assert.match(markup, /SIN DATO/);
  assert.match(markup, /origen del contacto/);
  assert.doesNotMatch(markup, /Proveedor · canal/);
});

test("Motor de ventas: el total nunca contradice las celdas visibles (SAN-326)", () => {
  // Réplica del bug de staging: rollup sin dimensiones desincronizado (7)
  // frente a filas por canal que suman 43 → el total ES la suma de las celdas.
  const model = buildSalesEngineMatrix(salesEngineDetail([
    { metric: "newContacts", value: 7 },
    { metric: "newContacts", value: 35, dimensions: { channel: "Explee" } },
    { metric: "newContacts", value: 1, dimensions: { channel: "Facebook" } },
    { metric: "newContacts", value: 2, dimensions: { channel: "GROWTH4U |  Llamada Estratégica" } },
    { metric: "newContacts", value: 1, dimensions: { channel: "Growth4U | Demo Sancho" } },
    { metric: "newContacts", value: 1, dimensions: { channel: "Growth4U | Reunión virtual" } },
    { metric: "newContacts", value: 3, dimensions: { channel: "Trust Score Analyzer" } },
    // Solo rollup, sin split por canal → el rollup sigue siendo el total.
    { metric: "appointmentsByChannel", value: 5 },
  ]));
  const stage = (key: string) => model.stages.find((item) => item.key === key);
  const leads = stage("leads");
  assert.ok(leads);
  assert.equal(leads.total, 43);
  assert.equal(
    leads.cells.reduce((sum, cell) => sum + (cell.value ?? 0), 0),
    leads.total,
  );
  assert.equal(stage("reuniones")?.total, 5);
});

test("Motor de ventas: la ventana del rango termina HOY (parcial), no ayer", () => {
  const now = new Date("2026-07-20T15:30:00.000Z");
  assert.deepEqual(salesEngineWindow("30d", now), { from: "2026-06-20", to: "2026-07-20" });
  assert.deepEqual(salesEngineWindow("7d", now), { from: "2026-07-13", to: "2026-07-20" });
  assert.deepEqual(salesEngineWindow("1d", now), { from: "2026-07-19", to: "2026-07-20" });
});

test("Conversión del período: tasas solo con base real; sin base → — con aviso", () => {
  const conversion = buildSalesEngineConversion(buildSalesEngineMatrix(salesEngineDetail([
    { metric: "newContacts", value: 10 },
    { metric: "appointmentsByChannel", value: 4 },
    { metric: "opportunitiesByChannel", value: 2 },
    { metric: "wonByChannel", value: 1, dimensions: { channel: "Explee AutoGTM" } },
    { metric: "wonOpportunities", value: 1 },
    { metric: "wonValue", value: 5000 },
  ])));
  assert.equal(conversion.available, true);
  const step = (key: string) => {
    const found = conversion.steps.find((item) => item.key === key);
    assert.ok(found, key);
    return found;
  };
  assert.equal(step("leads-reuniones").value, 0.4);
  assert.equal(step("reuniones-oportunidades").value, 0.5);
  assert.equal(step("oportunidades-ganadas").value, 0.5);
  assert.equal(step("leads-reuniones").hint, null);
  assert.match(conversion.wonValueDisplay, /5\.?000/u);

  // Denominador 0 (reuniones recolectadas en 0) y numerador ausente
  // (oportunidades sin recolectar) → nunca una tasa fabricada.
  const gapped = buildSalesEngineConversion(buildSalesEngineMatrix(salesEngineDetail([
    { metric: "newContacts", value: 10 },
    { metric: "appointmentsByChannel", value: 0 },
  ])));
  const gappedStep = (key: string) => gapped.steps.find((item) => item.key === key);
  assert.equal(gappedStep("leads-reuniones")?.value, 0);
  assert.equal(gappedStep("reuniones-oportunidades")?.value, null);
  assert.equal(gappedStep("reuniones-oportunidades")?.display, "—");
  assert.equal(gappedStep("reuniones-oportunidades")?.hint, "sin base");
  assert.equal(gappedStep("oportunidades-ganadas")?.value, null);
  assert.equal(gapped.wonValueDisplay, "—");
});

test("Motor de ventas: celdas con datos abren drill-down; ceros y ausencias no", () => {
  const model = buildSalesEngineMatrix(salesEngineDetail([
    { metric: "newContacts", value: 5 },
    { metric: "newContacts", value: 5, dimensions: { channel: "Explee AutoGTM" } },
    { metric: "appointmentsByChannel", value: 0 },
  ]));
  const withDrill = renderToStaticMarkup(createElement(ChannelMatrix, {
    model,
    drilldown: { slug: "acme", from: "2026-06-20", to: "2026-07-20" },
  }));
  // Solo celdas con valor > 0 son botones (Leads: bucket email + Total).
  assert.equal(withDrill.match(/m-mcell-btn/g)?.length, 2);
  assert.match(withDrill, /Conversión del período/);
  assert.match(withDrill, /sin base/);
  assert.match(withDrill, /Toca una celda con datos/);

  // Sin contexto de drill-down (tests/consumidores legacy) la matriz es estática.
  const withoutDrill = renderToStaticMarkup(createElement(ChannelMatrix, { model }));
  assert.doesNotMatch(withoutDrill, /m-mcell-btn/);
});

test("Motor de ventas sin datos GHL muestra vacío honesto, no una matriz de ceros", () => {
  const model = buildSalesEngineMatrix(salesEngineDetail([]));
  assert.equal(model.available, false);
  const markup = renderToStaticMarkup(createElement(ChannelMatrix, { model }));
  assert.match(markup, /Sin datos de GHL/);
  assert.doesNotMatch(markup, />0</);

  const loading = renderToStaticMarkup(createElement(ChannelMatrix, { model, isLoading: true }));
  assert.match(loading, /Cargando el funnel por canal/);
  const failed = renderToStaticMarkup(createElement(ChannelMatrix, { model, hasError: true }));
  assert.match(failed, /No se pudo cargar el detalle de GHL/);
});

test("Partnerships distingue conexión, demo, tracking real y fees incompletos", () => {
  const report = (
    status: PartnershipReport["tracking"]["status"],
    recordCount: number,
    financialsComplete = true,
  ) => ({
    tracking: {
      status,
      sources: status === "real" ? ["impact"] : status === "demo" ? ["seed"] : [],
      recordCount,
    },
    creators: recordCount > 0 ? [{}] : [],
    totals: {
      investedEur: financialsComplete ? 100 : null,
      totalCostEur: financialsComplete ? 100 : null,
    },
  } as unknown as PartnershipReport);

  assert.equal(partnershipReportDataState(undefined, "PARCIAL"), "PARCIAL");
  assert.equal(partnershipReportDataState(report("unavailable", 0), "ON"), "CONECTADO SIN SNAPSHOTS");
  assert.equal(partnershipReportDataState(report("demo", 1), "OFF"), "PARCIAL");
  assert.equal(partnershipReportDataState(report("real", 1), "OFF"), "ON");
  assert.equal(partnershipReportDataState(report("real", 1, false), "OFF"), "PARCIAL");
  assert.equal(partnershipReportHasTrackedData(report("real", 0)), false);
  assert.equal(partnershipReportHasTrackedData(report("real", 1)), true);
  assert.equal(partnershipReportHasCompleteFinancials(report("real", 1)), true);
  assert.equal(partnershipReportHasCompleteFinancials(report("real", 1, false)), false);
});

test("estado global no afirma que hay datos durante carga, error o vacío", () => {
  assert.equal(resolveMetricsDashboardLoadState({ loading: true, errorCount: 0, hasData: false }), "loading");
  assert.equal(resolveMetricsDashboardLoadState({ loading: false, errorCount: 1, hasData: false }), "error");
  assert.equal(resolveMetricsDashboardLoadState({ loading: false, errorCount: 0, hasData: false }), "empty");
  assert.equal(resolveMetricsDashboardLoadState({ loading: false, errorCount: 1, hasData: true }), "partial");
  assert.equal(resolveMetricsDashboardLoadState({ loading: false, errorCount: 0, hasData: true }), "ready");

  const errorMarkup = renderToStaticMarkup(createElement(DashboardDataStateBanner, {
    state: "error",
    slug: "demo",
    errorCount: 1,
  }));
  assert.match(errorMarkup, /No se pudieron cargar las métricas/);
  assert.doesNotMatch(errorMarkup, />Con datos</);
});

test("calidad global separa demo, avisos y missing de datos reales", () => {
  const metric = (
    qualityStatus: MetricKpiValue["qualityStatus"],
    value: number | null,
  ) => ({
    id: qualityStatus,
    qualityStatus,
    value,
    valueText: null,
    displayValue: value == null ? "-" : String(value),
    source: "ga4",
    metricName: "sessions",
    provenanceLabel: "GA4 · sessions",
  } as MetricKpiValue);

  const demoOnly = summarizeDashboardMetricQuality({
    values: [metric("demo", 42), metric("missing", 0)],
    stageRollups: { available: false },
  } as MetricKpiResult);
  assert.deepEqual(demoOnly, {
    demo: 1,
    warning: 0,
    missing: 1,
    hasDisplayData: true,
    hasRealData: false,
  });
  assert.equal(resolveMetricsDashboardLoadState({
    loading: false,
    errorCount: 0,
    hasData: demoOnly.hasDisplayData,
    hasRealData: demoOnly.hasRealData,
    hasDemoData: true,
    qualityWarningCount: demoOnly.missing,
  }), "demo");

  const mixed = summarizeDashboardMetricQuality({
    values: [metric("ok", 10), metric("demo", 42), metric("stale", 8)],
    stageRollups: { available: false },
  } as MetricKpiResult);
  assert.equal(resolveMetricsDashboardLoadState({
    loading: false,
    errorCount: 0,
    hasData: mixed.hasDisplayData,
    hasRealData: mixed.hasRealData,
    hasDemoData: mixed.demo > 0,
    qualityWarningCount: mixed.warning,
  }), "partial");
});

test("calidad global ignora proveedores no observados y bloques placeholder", () => {
  const googleSpend = qualityKpi({
    kpiId: "paid.google.spend",
    label: "Google Ads spend",
    source: "google_ads",
    metricName: "spend",
    qualityStatus: "ok",
    value: 120,
  });
  const metaMissing = qualityKpi({
    kpiId: "paid.meta.spend",
    label: "Meta spend",
    source: "meta_ads",
    metricName: "spend",
    qualityStatus: "missing",
  });
  const futurePlaceholder = qualityKpi({
    kpiId: "trends.annotations",
    label: "Trend annotations",
    source: "semantic",
    metricName: "metric_annotations",
    qualityStatus: "missing",
    dashboardBlock: "trends",
    surface: null,
  });
  const paidSurface: SurfaceSummaryEntry = {
    surface: "paid",
    name: "Paid",
    emoji: "💰",
    connected: true,
    sources: ["google_ads"],
    metrics: [{ source: "google_ads", metric: "spend", value: 120, date: "2026-07-15" }],
  };

  const summary = summarizeDashboardMetricQuality({
    values: [googleSpend, metaMissing, futurePlaceholder],
    stageRollups: { available: false },
  } as MetricKpiResult, { surfaces: [paidSurface] });

  assert.equal(summary.missing, 0);
  assert.equal(summary.warning, 0);
  assert.equal(resolveMetricsDashboardLoadState({
    loading: false,
    errorCount: 0,
    hasData: summary.hasDisplayData,
    hasRealData: summary.hasRealData,
    qualityWarningCount: summary.warning + summary.missing,
  }), "ready");
});

test("calidad conserva avisos y ausencias del proveedor realmente observado", () => {
  const staleGoogle = qualityKpi({
    kpiId: "paid.google.spend",
    label: "Google Ads spend",
    source: "google_ads",
    metricName: "spend",
    qualityStatus: "stale",
    value: 120,
  });
  const missingGoogle = qualityKpi({
    kpiId: "paid.google.roas",
    label: "Google Ads ROAS",
    source: "google_ads",
    metricName: "roas",
    qualityStatus: "missing",
  });
  const summary = summarizeDashboardMetricQuality({
    values: [staleGoogle, missingGoogle],
    stageRollups: { available: false },
  } as MetricKpiResult);

  assert.equal(summary.warning, 1);
  assert.equal(summary.missing, 1);
  assert.equal(surfaceStateWithKpiQuality("ON", [
    { ...staleGoogle, qualityStatus: "ok" },
    qualityKpi({
      kpiId: "paid.meta.spend",
      label: "Meta spend",
      source: "meta_ads",
      metricName: "spend",
      qualityStatus: "missing",
    }),
  ], ["google_ads"]), "ON");
  assert.equal(surfaceStateWithKpiQuality("ON", [staleGoogle, missingGoogle], ["google_ads"]), "PARCIAL");
});

test("evidencia autoritativa sin datos no se promociona a ON por KPIs históricos", () => {
  const historical = qualityKpi({
    kpiId: "partnerships.clicks",
    label: "Clicks",
    source: "yalc",
    metricName: "clicksDaily",
    qualityStatus: "ok",
    value: 1200,
  });
  assert.equal(
    surfaceStateWithKpiQuality(
      "CONECTADO SIN SNAPSHOTS",
      [historical],
      ["yalc"],
      true,
    ),
    "CONECTADO SIN SNAPSHOTS",
  );
});

test("Web queda parcial con solo GSC y solo enciende con GSC más GA4", () => {
  const web = getSurface("web");
  assert.ok(web);
  const entry = (sources: string[]): SurfaceSummaryEntry => ({
    surface: "web",
    name: "Web & SEO",
    emoji: "🌐",
    connected: true,
    sources,
    metrics: [{ source: sources[0] ?? "gsc", metric: "clicks", value: 1, date: "2026-07-16" }],
  });

  assert.equal(surfaceState(web, entry(["gsc"]), true), "PARCIAL");
  assert.equal(surfaceState(web, entry(["ga4"]), true), "PARCIAL");
  assert.equal(surfaceState(web, entry(["gsc", "ga4"]), true), "ON");
});

test("Web & SEO destaca el primer KPI disponible cuando sessions no tiene dato", () => {
  const sessionsMissing = qualityKpi({
    kpiId: "web.sessions",
    label: "Visitas web",
    source: "ga4",
    metricName: "sessions",
    qualityStatus: "missing",
    surface: "web",
  });
  const gscMissing = qualityKpi({
    kpiId: "web.gsc_clicks",
    label: "Clicks GSC",
    source: "gsc",
    metricName: "clicks",
    qualityStatus: "missing",
    surface: "web",
  });
  const lcpMobile = qualityKpi({
    kpiId: "web.lcp_mobile",
    label: "LCP mobile",
    source: "pagespeed",
    metricName: "lcp_mobile",
    qualityStatus: "ok",
    value: 2.1,
    surface: "web",
  });
  const markup = renderToStaticMarkup(createElement(WebSeoSurface, {
    kpis: [sessionsMissing, gscMissing, lcpMobile],
    state: "ON",
  }));
  const hero = markup.slice(markup.indexOf("m-surface-hero"), markup.indexOf("m-small-grid"));

  assert.match(hero, />2.1</);
  assert.match(hero, /LCP mobile/);
  assert.doesNotMatch(hero, /Visitas web/);
});

test("Outbound separa proveedores y nunca presenta contadores independientes como funnel", () => {
  const values = [
    ["outbound.instantly.sent", "Instantly · envíos", "instantly", "sent", 100],
    ["outbound.instantly.unique_opens", "Instantly · aperturas únicas", "instantly", "uniqueOpens", 50],
    ["outbound.instantly.unique_replies", "Instantly · replies únicos", "instantly", "uniqueReplies", 5],
    ["outbound.instantly.opportunities", "Instantly · oportunidades", "instantly", "opportunities", 3],
    ["outbound.lemlist.sent", "Lemlist · mensajes enviados", "lemlist", "sent", 20],
    ["outbound.lemlist.delivered", "Lemlist · mensajes entregados", "lemlist", "delivered", 18],
    ["outbound.lemlist.opens", "Lemlist · aperturas", "lemlist", "opens", 60],
    ["outbound.lemlist.replies", "Lemlist · replies", "lemlist", "replies", 10],
    ["outbound.lemlist.positive_replies", "Lemlist · interesados", "lemlist", "interested", 3],
    ["outbound.lemlist.meetings", "Lemlist · reuniones", "lemlist", "meetings", 1],
    ["outbound.lemlist.bounced", "Lemlist · rebotes", "lemlist", "bounced", 2],
    ["outbound.lemlist.unsubscribed", "Lemlist · desuscritos", "lemlist", "unsubscribed", 1],
    ["outbound.explee.campaigns_current", "Explee · campañas no archivadas", "explee", "campaignsCurrent", 2],
    ["outbound.explee.emails_sent_lifetime", "Explee · emails enviados acumulados", "explee", "emailsSentLifetime", 100],
    ["outbound.explee.replies_lifetime", "Explee · respuestas acumuladas", "explee", "repliesLifetime", 8],
    ["outbound.explee.reply_rate_lifetime", "Explee · tasa acumulada", "explee", "replyRatePctLifetime", 8],
    ["outbound.explee.hot_leads_lifetime", "Explee · hot leads acumulados", "explee", "hotLeadsLifetime", 4],
    ["outbound.explee.spend_lifetime", "Explee · gasto acumulado", "explee", "spendUsdLifetime", 20],
    ["outbound.explee.cpl_lifetime", "Explee · CPL acumulado", "explee", "costPerHotLeadUsdLifetime", 5],
  ].map(([kpiId, label, source, metricName, value]) => qualityKpi({
    kpiId: String(kpiId),
    label: String(label),
    source: String(source),
    metricName: String(metricName),
    qualityStatus: "ok",
    value: Number(value),
    surface: "email",
  }));

  const markup = renderToStaticMarkup(createElement(OutboundSurface, {
    kpis: values,
    state: "ON",
    sources: ["instantly", "lemlist", "explee"],
  }));

  assert.match(markup, /Explee AutoGTM/);
  assert.match(markup, /snapshot acumulado del proyecto/);
  assert.match(markup, /independiente del selector de fechas/);
  assert.match(markup, /Hot leads acumulados/);
  assert.match(markup, /No se infiere continuidad entre pasos/);
  assert.match(markup, /Ratios de cohorte del rango:/);
  assert.match(markup, /se necesita un join por campaña\/destinatario/);
  const trendMarkup = markup.slice(
    markup.indexOf("Tendencia observada"),
    markup.indexOf("Lectura de los contadores"),
  );
  assert.doesNotMatch(trendMarkup, /Explee/);
  assert.doesNotMatch(markup, /Funnel de secuencia/);
  assert.doesNotMatch(markup, /333/);
});

test("Outbound no declara Explee como fuente observada cuando sus KPIs están missing", () => {
  const instantly = qualityKpi({
    kpiId: "outbound.instantly.sent",
    label: "Instantly · envíos",
    source: "instantly",
    metricName: "sent",
    qualityStatus: "ok",
    value: 10,
    surface: "email",
  });
  const expleeMissing = qualityKpi({
    kpiId: "outbound.explee.hot_leads_lifetime",
    label: "Explee · hot leads acumulados",
    source: "explee",
    metricName: "hotLeadsLifetime",
    qualityStatus: "missing",
    value: null,
    surface: "email",
  });

  assert.deepEqual(observedMetricLineageSources([instantly, expleeMissing]), ["instantly"]);
});

test("badge KPI explicita provenance y missing nunca muestra el cero placeholder", () => {
  const demo = {
    qualityStatus: "demo",
    value: 12,
    valueText: null,
    displayValue: "12",
    source: "ga4",
    metricName: "sessions",
    provenanceLabel: "GA4 · sessions",
  } as MetricKpiValue;
  const missing = { ...demo, qualityStatus: "missing", value: 0, displayValue: "0" } as MetricKpiValue;

  assert.equal(displayKpiValue(missing), "-");
  assert.equal(metricQualityCopy("dirty").label, "REVISAR");
  const badge = renderToStaticMarkup(createElement(MetricQualityBadge, { kpi: demo }));
  assert.match(badge, />DEMO</);
  assert.match(badge, /Origen: GA4 · sessions/);

  const banner = renderToStaticMarkup(createElement(DashboardDataStateBanner, {
    state: "demo",
    slug: "cliente",
    demoCount: 1,
  }));
  assert.match(banner, />DEMO</);
  assert.match(banner, /no proceden de integraciones reales/);
  assert.doesNotMatch(banner, />Con datos</);
});

test("sentiment del backend decide el color sin una segunda inversión", () => {
  assert.equal(deltaTone(kpiWithSentiment("positive")), "up");
  assert.equal(deltaTone(kpiWithSentiment("negative")), "down");
  assert.equal(deltaTone(kpiWithSentiment("neutral")), "flat");
});

test("tabs y surfaces respetan visible y order de la definición activa", () => {
  const definition = dashboardDefinition({
    tabs: [
      { key: "overview", label: "Overview", visible: false, order: 0 },
      { key: "surfaces", label: "Sistemas", visible: true, order: 2 },
      { key: "trends", label: "Evolución", visible: true, order: 1 },
      { key: "conexiones", label: "Setup", visible: true, order: 3 },
    ],
    surfaces: [
      { surface: "web", visible: false, order: 0 },
      { surface: "email", visible: true, order: 2 },
      { surface: "paid", visible: true, order: 1 },
    ],
  });
  assert.deepEqual(
    resolveVisibleDashboardTabs(definition).map(({ key, label }) => ({ key, label })),
    [
      { key: "trends", label: "Evolución" },
      { key: "surfaces", label: "Sistemas" },
    ],
  );
  assert.deepEqual(resolveVisibleSurfaceOrder(definition), ["paid", "email"]);
});

test("estado de surface describe datos observados, no credenciales inferidas", () => {
  assert.equal(stateLabel("ON"), "Datos recibidos");
  assert.equal(stateLabel("OFF"), "Sin datos recientes");
  assert.doesNotMatch(stateLabel("ON"), /conectad/i);
});

test("alerta de health solo enumera proveedores fallidos y no expone lastError", () => {
  const health = {
    sources: [
      { source: "ga4", lastStatus: "error", lastError: "secret-token=abc" },
      { source: "gsc", lastStatus: "ok", lastError: null },
    ],
  } as unknown as MetricsHealthResult;
  assert.deepEqual(healthErrorSources(health), ["GA4"]);
  assert.doesNotMatch(healthErrorSources(health).join(" "), /secret|token|abc/i);
});

test("métricas custom se seleccionan por id estable y surface de la definición activa", () => {
  const definition = dashboardDefinition({
    customMetrics: [
      { id: "cpl", label: "Coste por lead", formula: "meta-ads.spend / ghl.newContacts", format: "currency", tier: "diagnostic", surface: "paid" },
      { id: "activation", label: "Activation", formula: "posthog.activation_events / posthog.pageviews * 100", format: "percent", tier: "leading" },
      { id: "legacy", label: "Legacy", formula: "ga4.sessions", surface: "unknown-surface" },
    ],
  });
  const cpl = {
    id: "value_cpl",
    kpiId: "custom.cpl",
    label: "Coste por lead",
    dashboardBlock: "surface",
    surface: "paid",
    source: "custom",
    metricName: "cpl",
    value: 10,
    valueText: null,
    displayValue: "10 moneda cuenta",
    unit: "account_currency",
    qualityStatus: "partial",
    provenanceLabel: "Formula: meta-ads.spend / ghl.newContacts",
    inputRefs: [{ source: "meta_ads" }, { source: "ghl" }],
    sourceCoverage: 0.8,
    rangeFrom: "2026-06-01",
    rangeTo: "2026-06-30",
    definitionVersion: 2_097_153,
    computedAt: "2026-06-30T01:00:00.000Z",
    comparison: null,
  } as MetricKpiValue;
  const data = { values: [cpl] } as MetricKpiResult;

  const paid = selectDashboardCustomMetrics(data, definition, "paid");
  assert.deepEqual(paid.map((item) => item.definition.id), ["cpl"]);
  assert.equal(paid[0]?.kpi?.kpiId, "custom.cpl");
  assert.deepEqual(
    selectDashboardCustomMetrics(data, definition, null).map((item) => item.definition.id),
    ["activation", "legacy"],
  );

  const markup = renderToStaticMarkup(createElement(CustomMetricPanel, { metrics: paid }));
  assert.match(markup, /Métricas personalizadas/);
  assert.match(markup, /10 moneda cuenta/);
  assert.match(markup, /Diagnóstico · currency/);
  assert.match(markup, /meta-ads\.spend \/ ghl\.newContacts/);
  assert.match(markup, />PARCIAL</);
});

test("panel custom muestra ausencia honesta cuando la versión aún no fue calculada", () => {
  const definition = dashboardDefinition({
    customMetrics: [
      { id: "cpl", label: "Coste por lead", formula: "meta-ads.spend / ghl.newContacts", format: "currency", tier: "diagnostic", surface: "paid" },
    ],
  });
  const metrics = selectDashboardCustomMetrics({ values: [] } as unknown as MetricKpiResult, definition, "paid");
  const markup = renderToStaticMarkup(createElement(CustomMetricPanel, { metrics }));
  assert.match(markup, />-</);
  assert.match(markup, /SIN DATO/);
  assert.doesNotMatch(markup, />0</);
});
