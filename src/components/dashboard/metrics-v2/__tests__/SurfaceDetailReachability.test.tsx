/**
 * P0 · Métricas — reachability de las vistas de detalle por superficie.
 *
 * Este test monta el dashboard real en la ruta `tab=surfaces&surface=...` y
 * siembra exactamente las respuestas de sus hooks en React Query. Así evita
 * que un componente rico vuelva a quedar exportado pero inalcanzable desde la
 * UI, que fue la regresión de #880.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import type {
  MetricKpiResult,
  MetricKpiValue,
  MetricsHealthResult,
  SurfaceDetailMetric,
  SurfaceDetailResult,
  SurfaceSummaryResult,
} from "@/hooks/useMetrics";
import type { DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import type { SurfaceKey } from "@/lib/metrics/surfaces";
import { MockupMetricsDashboard } from "../MockupMetricsDashboard";

const SLUG = "cliente-fiable";
const RANGE = "30d";
const FROM = "2026-06-18";
const TO = "2026-07-17";

const SURFACE_CASES: Array<{
  surface: Extract<SurfaceKey, "paid" | "pipeline" | "product" | "social" | "web">;
  source: string;
  expectedDimension: string;
  metric: SurfaceDetailMetric;
}> = [
  {
    surface: "paid",
    source: "meta_ads",
    expectedDimension: "Brand ES",
    metric: { metric: "spend", value: 1250, aggregation: "sum", quality: "ok", dimensions: { campaign: "Brand ES" } },
  },
  {
    surface: "pipeline",
    source: "go-high-level",
    expectedDimension: "Paid",
    metric: { metric: "newContacts", value: 34, aggregation: "sum", quality: "ok", dimensions: { channel: "Paid" } },
  },
  {
    surface: "product",
    source: "posthog",
    expectedDimension: "signup",
    metric: { metric: "funnel_step_reached", value: 19, aggregation: "sum", quality: "ok", dimensions: { step: "signup", order: "1" } },
  },
  {
    surface: "social",
    source: "metricool",
    expectedDimension: "linkedin",
    metric: { metric: "postDetail", value: 740, aggregation: "latest", quality: "ok", dimensions: { network: "linkedin", url: "https://example.test/post/1" } },
  },
  {
    surface: "web",
    source: "google-analytics",
    expectedDimension: "Organic Search",
    metric: { metric: "sessions", value: 918, aggregation: "sum", quality: "ok", dimensions: { channel: "Organic Search" } },
  },
];

function dashboardDefinition(): DashboardDefinition {
  return {
    archetype: "lead-to-sale",
    northStar: {},
    tabs: [],
    surfaces: [],
    plan: { funnel: [], kpis: [] },
    customSurfaces: [],
    customMetrics: [],
  };
}

function routerFor(surface: SurfaceKey): NextRouter {
  const noop = () => undefined;
  const truthy = async () => true;
  return {
    basePath: "",
    pathname: "/dashboard/[slug]/metrics",
    route: "/dashboard/[slug]/metrics",
    asPath: `/dashboard/${SLUG}/metrics?tab=surfaces&surface=${surface}`,
    query: { slug: SLUG, tab: "surfaces", surface },
    push: truthy,
    replace: truthy,
    reload: noop,
    back: noop,
    forward: noop,
    prefetch: async () => undefined,
    beforePopState: noop,
    events: { on: noop, off: noop, emit: noop },
    isFallback: false,
    isLocaleDomain: false,
    isReady: true,
    isPreview: false,
  } as NextRouter;
}

function semanticKpi(
  surface: SurfaceKey,
  source: string,
  qualityStatus: MetricKpiValue["qualityStatus"] = "ok",
): MetricKpiValue {
  const hasValue = qualityStatus !== "missing";
  return {
    id: `${surface}.${source}.headline`,
    kpiId: `${surface}.${source}.headline`,
    label: `KPI ${surface}`,
    dashboardBlock: "surface",
    surface,
    source,
    metricName: "headline",
    value: hasValue ? 1 : null,
    valueText: null,
    displayValue: hasValue ? "1" : "-",
    unit: null,
    qualityStatus,
    provenanceLabel: `${source} · headline`,
    inputRefs: [],
    sourceCoverage: hasValue ? 1 : 0,
    rangeFrom: FROM,
    rangeTo: TO,
    definitionVersion: 1,
    computedAt: `${TO}T12:00:00.000Z`,
    comparison: null,
  };
}

function kpiResult(values: MetricKpiValue[]): MetricKpiResult {
  const counts = {
    ok: values.filter((value) => value.qualityStatus === "ok").length,
    partial: values.filter((value) => value.qualityStatus === "partial").length,
    missing: values.filter((value) => value.qualityStatus === "missing").length,
    dirty: values.filter((value) => value.qualityStatus === "dirty").length,
    stale: values.filter((value) => value.qualityStatus === "stale").length,
    demo: values.filter((value) => value.qualityStatus === "demo").length,
  };
  return {
    configured: true,
    slug: SLUG,
    requestedRange: { key: RANGE, from: FROM, to: TO },
    run: null,
    summary: {
      ...counts,
      total: values.length,
      qualityStatus: values[0]?.qualityStatus ?? "missing",
    },
    values,
    northStar: null,
    stageRollups: {
      configured: true,
      available: false,
      range: null,
      summary: {
        qualityStatus: "missing",
        totalRows: 0,
        stageCount: 0,
        channelCount: 0,
        inputRefsCount: 0,
        lastComputedAt: null,
        source: "metric_stage_rollups",
        emptyState: "missing_stage_rollups",
        nextAction: "Collect stage data",
      },
      stages: [],
      rates: [],
      channels: [],
    },
  };
}

function surfaceSummary(
  surface: SurfaceKey,
  source: string,
  hasData = true,
): SurfaceSummaryResult {
  return {
    configured: true,
    surfaces: [{
      surface,
      name: surface,
      emoji: "📊",
      connected: true,
      sources: [source],
      metrics: hasData
        ? [{ source, metric: "headline", value: 1, date: TO }]
        : [],
      ...(hasData ? {} : { dataStatus: "connected_no_data" as const }),
    }],
  };
}

function renderSurface({
  surface,
  source,
  detail,
  kpis = [semanticKpi(surface, source)],
  hasSummaryData = true,
}: {
  surface: SurfaceKey;
  source: string;
  detail: SurfaceDetailResult;
  kpis?: MetricKpiValue[];
  hasSummaryData?: boolean;
}): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const health: MetricsHealthResult = {
    configured: true,
    slug: SLUG,
    generatedAt: `${TO}T12:00:00.000Z`,
    sources: [],
    cron: { degraded: false, reasons: [] },
    overall: "ok",
  };

  queryClient.setQueryData(["metrics-surfaces", SLUG, RANGE], surfaceSummary(surface, source, hasSummaryData));
  queryClient.setQueryData(["metrics-dashboard", SLUG], {
    configured: true,
    slug: SLUG,
    version: 1,
    definition: dashboardDefinition(),
    versions: [],
  });
  queryClient.setQueryData(["metrics-health", SLUG], health);
  queryClient.setQueryData(["metrics-kpis", SLUG, RANGE], kpiResult(kpis));
  queryClient.setQueryData(["metrics-surface-detail", SLUG, surface, RANGE], detail);

  const tree: ReactElement = createElement(
    RouterContext.Provider,
    { value: routerFor(surface) },
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MockupMetricsDashboard, { slug: SLUG }),
    ),
  );
  return renderToStaticMarkup(tree);
}

test("cada surface P0 alcanza su renderer dedicado con datos del endpoint", async (t) => {
  for (const fixture of SURFACE_CASES) {
    await t.test(fixture.surface, () => {
      const markup = renderSurface({
        surface: fixture.surface,
        source: fixture.source,
        detail: {
          configured: true,
          surface: fixture.surface,
          from: FROM,
          to: TO,
          sources: [{ source: fixture.source, metrics: [fixture.metric] }],
        },
      });

      assert.match(markup, new RegExp(`data-surface-renderer="${fixture.surface}"`));
      assert.match(markup, /data-surface-detail-state="ready"/);
      assert.ok(
        markup.includes(fixture.expectedDimension),
        `${fixture.surface} debe mostrar la dimensión observada ${fixture.expectedDimension}`,
      );
      if (fixture.surface === "web") {
        assert.match(markup, /top 10 diario/);
        assert.match(markup, /no representan un total exhaustivo del rango/);
        assert.match(markup, /Queries \(muestra top del rango\)/);
      }
    });
  }
});

test("Web consume sessions aunque el KPI semántico pertenezca a overview", () => {
  const sessions = {
    ...semanticKpi("web", "ga4"),
    id: "web.sessions",
    kpiId: "web.sessions",
    label: "Visitas web",
    dashboardBlock: "overview",
    metricName: "sessions",
    value: 918,
    displayValue: "918",
  };
  const markup = renderSurface({
    surface: "web",
    source: "google-analytics",
    detail: {
      configured: true,
      surface: "web",
      from: FROM,
      to: TO,
      sources: [{
        source: "google-analytics",
        metrics: [{
          metric: "sessions",
          value: 918,
          aggregation: "sum",
          quality: "ok",
          dimensions: { channel: "Organic Search" },
        }],
      }],
    },
    kpis: [sessions],
  });

  assert.match(markup, /data-kpi-id="web.sessions"[^>]*>[\s\S]*?m-detail-kpi-value">918</);
});

test("Paid reserva alcance para campaña, ad set, creatividad, placement y audiencia", () => {
  const metric = (dimensions: Record<string, string>, value: number): SurfaceDetailMetric => ({
    metric: "spend",
    value,
    aggregation: "sum",
    quality: "ok",
    dimensions,
  });
  const markup = renderSurface({
    surface: "paid",
    source: "meta_ads",
    detail: {
      configured: true,
      surface: "paid",
      from: FROM,
      to: TO,
      sources: [{
        source: "meta_ads",
        metrics: [
          ...Array.from({ length: 31 }, (_, index) =>
            metric({ campaign: `Campaña ${index}` }, 100 - index)),
          metric({ campaign: "Campaña 0", adset: "Ad set alcanzable" }, 80),
          metric({ campaign: "Campaña 0", adset: "Ad set alcanzable", ad: "Creatividad alcanzable" }, 70),
          ...Array.from({ length: 25 }, (_, index) =>
            metric({ placement: `Placement ${index}` }, 60 - index)),
          metric({ audience: "Audiencia alcanzable" }, 50),
        ],
      }],
    },
  });

  assert.match(markup, /Ad set alcanzable/);
  assert.match(markup, /Creatividad alcanzable/);
  assert.match(markup, /Placement 0/);
  assert.match(markup, /Audiencia alcanzable/);
});

test("surface-detail vacío conserva el renderer y no fabrica un cero", () => {
  const markup = renderSurface({
    surface: "social",
    source: "metricool",
    detail: {
      configured: true,
      surface: "social",
      from: FROM,
      to: TO,
      sources: [],
    },
    kpis: [],
    hasSummaryData: false,
  });

  assert.match(markup, /data-surface-renderer="social"/);
  assert.match(markup, /data-surface-detail-state="empty"/);
  assert.match(markup, /(?:>\s*-\s*<|Sin dato)/i);
  assert.doesNotMatch(markup, /data-surface-detail-state="ready"/);
});

test("un cero observado por el proveedor se conserva como cero", () => {
  const markup = renderSurface({
    surface: "product",
    source: "posthog",
    detail: {
      configured: true,
      surface: "product",
      from: FROM,
      to: TO,
      sources: [{
        source: "posthog",
        metrics: [{
          metric: "funnel_step_reached",
          value: 0,
          aggregation: "sum",
          quality: "ok",
          dimensions: { step: "signup", order: "1" },
        }],
      }],
    },
    kpis: [],
    hasSummaryData: false,
  });

  assert.match(markup, /data-surface-detail-state="ready"/);
  assert.match(markup, /signup[\s\S]*?<strong>0<\/strong>/);
});

test("Product no infiere continuidad ni dropoff desde conteos independientes de PostHog", () => {
  const markup = renderSurface({
    surface: "product",
    source: "posthog",
    detail: {
      configured: true,
      surface: "product",
      from: FROM,
      to: TO,
      sources: [{
        source: "posthog",
        metrics: [
          {
            metric: "funnel_step_reached",
            value: 100,
            aggregation: "sum",
            quality: "ok",
            dimensions: { step: "signup", order: "1" },
          },
          {
            metric: "funnel_step_reached",
            value: 40,
            aggregation: "sum",
            quality: "ok",
            dimensions: { step: "activated", order: "2" },
          },
        ],
      }],
    },
    kpis: [],
    hasSummaryData: false,
  });

  assert.match(markup, /conteo independiente/i);
  assert.match(markup, /permiten inferir conversión/i);
  assert.doesNotMatch(markup, /continúan|dropoff|−60 eventos/i);
});

test("Social agrupa métricas hermanas por identidad estable del post", () => {
  const dimensions = { network: "linkedin", postId: "post-1", url: "https://example.test/post/normalizado", text: "Post normalizado" };
  const metric = (
    name: string,
    value: number,
    aggregation: SurfaceDetailMetric["aggregation"] = "latest",
  ): SurfaceDetailMetric => ({
    metric: name,
    value,
    aggregation,
    quality: "ok",
    dimensions,
  });
  const markup = renderSurface({
    surface: "social",
    source: "metricool",
    detail: {
      configured: true,
      surface: "social",
      from: FROM,
      to: TO,
      sources: [{
        source: "metricool",
        metrics: [
          {
            metric: "posts",
            value: 1,
            aggregation: "sum",
            quality: "ok",
            dimensions: { network: "linkedin" },
          },
          {
            metric: "impressions",
            value: 740,
            aggregation: "sum",
            quality: "ok",
            dimensions: { network: "linkedin" },
          },
          metric("postDetail", 740),
          metric("postLikes", 12),
          metric("postClicks", 4),
          metric("postReach", 530),
          metric("postEngagement", 2.5, "avg"),
        ],
      }],
    },
  });

  assert.match(markup, /Post normalizado/);
  assert.match(markup, /<dt>Likes<\/dt><dd>12<\/dd>/);
  assert.match(markup, /<dt>Clicks<\/dt><dd>4<\/dd>/);
  assert.match(markup, /<dt>Engagement<\/dt><dd>2,5<\/dd>/);
  assert.match(markup, /publicaciones creadas en el rango[\s\S]*contadores acumulados/i);
  const networkTable = markup.match(/<table class="m-detail-table" aria-label="Rendimiento Social por red">([\s\S]*?)<\/table>/)?.[1] ?? "";
  assert.equal((networkTable.match(/<tr>/g) ?? []).length, 2, "header + exactly one network row");
  assert.match(networkTable, /<b>linkedin<\/b>[\s\S]*?<td class="num">1<\/td>[\s\S]*?<td class="num">740<\/td>/);
});

test("Web agrupa las métricas hermanas de topPage sin depender de counters en dimensions", () => {
  const dimensions = { page: "/pricing" };
  const markup = renderSurface({
    surface: "web",
    source: "google-analytics",
    detail: {
      configured: true,
      surface: "web",
      from: FROM,
      to: TO,
      sources: [{
        source: "google-analytics",
        metrics: [
          { metric: "topPage", value: 320, aggregation: "sum", quality: "ok", dimensions },
          { metric: "topPageSessions", value: 180, aggregation: "sum", quality: "ok", dimensions },
          { metric: "topPageDuration", value: 42, aggregation: "avg", quality: "ok", dimensions },
          { metric: "topPageEngagementRate", value: 61, aggregation: "avg", quality: "ok", dimensions },
        ],
      }],
    },
  });

  assert.match(markup, /\/pricing/);
  assert.match(markup, />180</);
  assert.match(markup, />42s</);
  assert.match(markup, />61%</);
});

test("Web usa columnas reales de device y convierte ratios GA4 0..1 a porcentaje", () => {
  const dimensions = { device: "mobile" };
  const markup = renderSurface({
    surface: "web",
    source: "ga4",
    detail: {
      configured: true,
      surface: "web",
      from: FROM,
      to: TO,
      sources: [{
        source: "ga4",
        metrics: [
          { metric: "sessions", value: 120, aggregation: "sum", quality: "ok", dimensions },
          { metric: "engagementRate", value: 0.625, aggregation: "avg", quality: "ok", dimensions },
          { metric: "bounceRate", value: 0.375, aggregation: "avg", quality: "ok", dimensions },
        ],
      }],
    },
  });

  const deviceTable = markup.match(/<table class="m-detail-table" aria-label="Dispositivos GA4">([\s\S]*?)<\/table>/)?.[1] ?? "";
  assert.match(deviceTable, /<b>mobile<\/b>/);
  assert.match(deviceTable, />120</);
  assert.match(deviceTable, />62,5%</);
  assert.match(deviceTable, />37,5%</);
  assert.doesNotMatch(deviceTable, />Usuarios</);
});

test("una lectura limitada o con cobertura incompleta nunca se presenta como completa", () => {
  const markup = renderSurface({
    surface: "paid",
    source: "meta_ads",
    detail: {
      configured: true,
      surface: "paid",
      from: FROM,
      to: TO,
      complete: false,
      completeness: {
        rowsRead: 250_000,
        groups: 9_900,
        rowLimit: 250_000,
        groupLimit: 10_000,
        reason: "row_limit",
      },
      sources: [{
        source: "meta_ads",
        metrics: [{
          metric: "spend",
          value: 1250,
          aggregation: "sum",
          quality: "ok",
          dimensions: { campaign: "Brand ES" },
        }],
        coverage: {
          cadence: "daily",
          enabled: true,
          expectedDates: [FROM, TO],
          observedDates: [FROM],
          missingDates: [TO],
          failedDates: [],
          ratio: 0.5,
          lastObservedDate: FROM,
          latestExpectedDate: TO,
        },
      }],
    },
  });

  assert.match(markup, /data-surface-detail-complete="false"/);
  assert.match(markup, /data-surface-detail-state="partial"/);
  assert.match(markup, /LECTURA INCOMPLETA/);
  assert.doesNotMatch(markup, /DETALLE REAL/);
});

test("coverage con fechas ausentes degrada un payload completo a parcial", () => {
  const markup = renderSurface({
    surface: "web",
    source: "ga4",
    detail: {
      configured: true,
      surface: "web",
      from: FROM,
      to: TO,
      complete: true,
      completeness: { rowsRead: 1, groups: 1, rowLimit: 250_000, groupLimit: 10_000, reason: null },
      sources: [{
        source: "ga4",
        metrics: [{
          metric: "sessions",
          value: 918,
          aggregation: "sum",
          quality: "ok",
          dimensions: { channel: "Organic Search" },
        }],
        coverage: {
          cadence: "daily",
          enabled: true,
          expectedDates: [FROM, TO],
          observedDates: [FROM],
          missingDates: [TO],
          failedDates: [],
          ratio: 0.5,
          lastObservedDate: FROM,
          latestExpectedDate: TO,
        },
      }],
    },
  });

  assert.match(markup, /data-surface-detail-complete="true"/);
  assert.match(markup, /data-surface-detail-state="partial"/);
  assert.match(markup, /COBERTURA PARCIAL/);
  assert.match(markup, /GA4/);
});

test("surface-detail parcial lo etiqueta explícitamente", () => {
  const markup = renderSurface({
    surface: "paid",
    source: "meta_ads",
    detail: {
      configured: true,
      surface: "paid",
      from: FROM,
      to: TO,
      sources: [{
        source: "meta_ads",
        metrics: [{
          metric: "spend",
          value: 1250,
          aggregation: "sum",
          quality: "partial",
          dimensions: { campaign: "Brand ES" },
        }],
      }],
    },
    kpis: [semanticKpi("paid", "meta_ads", "partial")],
  });

  assert.match(markup, /data-surface-renderer="paid"/);
  assert.match(markup, /data-surface-detail-state="partial"/);
  assert.match(markup, />[^<]*(?:PARCIAL|Parcial)[^<]*</);
});

test("los datos demo siguen identificados como demo al alcanzar una vista dedicada", () => {
  const markup = renderSurface({
    surface: "product",
    source: "posthog",
    detail: {
      configured: true,
      surface: "product",
      from: FROM,
      to: TO,
      sources: [{
        source: "posthog",
        metrics: [{
          metric: "funnel_step_reached",
          value: 19,
          aggregation: "sum",
          quality: "ok",
          dimensions: { step: "signup", order: "1" },
        }],
      }],
    },
    kpis: [semanticKpi("product", "posthog", "demo")],
  });

  assert.match(markup, /data-surface-renderer="product"/);
  assert.match(markup, />DEMO</);
  assert.match(markup, /no proceden de integraciones reales/i);
});
