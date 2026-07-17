import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MetricKpiValue, MetricsHealthResult } from "@/hooks/useMetrics";
import {
  buildSemanticMetricSources,
  compactMetricQualityState,
  compactMetricQualitySummary,
  compactSourceHealthState,
  CompactMetricQualityBadge,
  HealthScoreCard,
  healthScoreValue,
  PageSpeedSection,
  worstMetricQualityStatus,
} from "../../metrics-column";

function semanticKpi(input: {
  source: string;
  metricName: string;
  value: number | null;
  previousValue?: number | null;
  qualityStatus?: MetricKpiValue["qualityStatus"];
}): MetricKpiValue {
  return {
    source: input.source,
    metricName: input.metricName,
    value: input.value,
    qualityStatus: input.qualityStatus ?? "ok",
    comparison: input.previousValue === undefined ? null : { previousValue: input.previousValue },
  } as unknown as MetricKpiValue;
}

test("compact metrics consume el valor semántico actual y su periodo anterior exacto", () => {
  const values = [
    semanticKpi({ source: "ga4", metricName: "totalUsers", value: 42, previousValue: 31 }),
    semanticKpi({ source: "meta_ads", metricName: "spend", value: 120, previousValue: null }),
  ];
  const current = buildSemanticMetricSources(values, "current");
  const previous = buildSemanticMetricSources(values, "previous");

  assert.equal(current.ga4.metrics.find((metric) => metric.name === "totalUsers")?.value, 42);
  assert.equal(current["google-analytics"], current.ga4);
  assert.equal(current["meta-ads"].metrics.find((metric) => metric.name === "spend")?.value, 120);
  assert.equal(previous.ga4.metrics.find((metric) => metric.name === "totalUsers")?.value, 31);
  assert.equal(previous["meta-ads"], undefined, "no reutiliza el periodo actual cuando falta el anterior");
});

test("fuente compacta conserva la peor calidad y nunca materializa missing como cero", () => {
  const values = [
    semanticKpi({ source: "ga4", metricName: "sessions", value: 100, qualityStatus: "ok" }),
    semanticKpi({ source: "ga4", metricName: "totalUsers", value: 0, qualityStatus: "missing" }),
    semanticKpi({ source: "gsc", metricName: "clicks", value: 20, qualityStatus: "stale" }),
    semanticKpi({ source: "gsc", metricName: "impressions", value: 200, qualityStatus: "partial" }),
  ];
  const sources = buildSemanticMetricSources(values);

  assert.equal(sources.ga4.status, "missing");
  assert.equal(sources.ga4.metrics.find((metric) => metric.name === "totalUsers"), undefined);
  assert.equal(sources.ga4.metrics.find((metric) => metric.name === "sessions")?.value, 100);
  assert.equal(sources.gsc.status, "stale");
  assert.equal(sources.gsc.metrics.find((metric) => metric.name === "clicks")?.qualityStatus, "stale");
  assert.equal(sources.gsc.metrics.find((metric) => metric.name === "impressions")?.qualityStatus, "partial");
  assert.equal(worstMetricQualityStatus("demo", "missing"), "missing");
});

test("badges compactos distinguen demo, datos degradados y ausencia", () => {
  assert.equal(compactMetricQualityState("ok"), null);
  assert.equal(compactMetricQualityState("demo")?.label, "DEMO");
  assert.equal(compactMetricQualityState("dirty")?.label, "REVISAR");
  assert.equal(compactMetricQualityState("stale")?.label, "ATRASADO");
  assert.equal(compactMetricQualityState("partial")?.label, "PARCIAL");
  assert.equal(compactMetricQualityState("missing")?.label, "INCOMPLETO");

  const markup = renderToStaticMarkup(createElement(CompactMetricQualityBadge, { status: "demo" }));
  assert.match(markup, />DEMO</);
  assert.match(markup, /no procede de una integración real/);

  assert.deepEqual(compactMetricQualitySummary([
    semanticKpi({ source: "ga4", metricName: "sessions", value: 12, qualityStatus: "demo" }),
    semanticKpi({ source: "gsc", metricName: "clicks", value: 8, qualityStatus: "dirty" }),
    semanticKpi({ source: "gsc", metricName: "ctr", value: 0, qualityStatus: "missing" }),
  ]), { demo: 1, warning: 1, missing: 1 });
});

test("PageSpeed no convierte scores faltantes en cero", () => {
  const markup = renderToStaticMarkup(createElement(PageSpeedSection, {
    data: { mobile: { performance: 91 } },
  }));
  assert.match(markup, />91</);
  assert.ok((markup.match(/>—</g) ?? []).length >= 3);
  assert.doesNotMatch(markup, />0</);
});

test("métricas Lighthouse faltantes quedan sin dato, no pasan como cero", () => {
  const markup = renderToStaticMarkup(createElement(PageSpeedSection, {
    data: { mobile: { lcp: 2.1 } },
  }));
  assert.match(markup, /LCP/);
  assert.match(markup, /CLS/);
  assert.match(markup, /TBT/);
  assert.ok((markup.match(/>—</g) ?? []).length >= 2);
  assert.doesNotMatch(markup, /0ms/);
});

test("Health Score ausente se representa como ausencia; cero explícito se conserva", () => {
  assert.equal(healthScoreValue({}), null);
  assert.equal(healthScoreValue({ overall: 0 }), 0);
  const markup = renderToStaticMarkup(createElement(HealthScoreCard, { hs: {}, recCount: 0 }));
  assert.match(markup, />—</);
  assert.doesNotMatch(markup, />0</);
});

test("badge compacto de fuente procede de health, no de haber reconstruido filas", () => {
  assert.equal(compactSourceHealthState(["ga4"], undefined), null);
  const health = {
    sources: [{ source: "ga4", lastStatus: "ok", overdue: true, knownDirty: false }],
  } as unknown as MetricsHealthResult;
  assert.deepEqual(compactSourceHealthState(["ga4"], health), { label: "ATRASADO", tone: "warn" });

  health.sources[0].overdue = false;
  health.sources[0].lastStatus = "error";
  assert.deepEqual(compactSourceHealthState(["ga4"], health), { label: "ERROR", tone: "error" });
});
