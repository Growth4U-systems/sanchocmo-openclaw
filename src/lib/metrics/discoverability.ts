/**
 * Discoverability (Web & SEO) — wiring parser (SAN-319 · PR6).
 *
 * Maps the daily `metric_snapshots` entries (sources ga4 · gsc · pagespeed · aeo)
 * into the presentational `DiscoverabilityData` the surface renders. Lives in a lib
 * file (not metrics.tsx) so the surface wiring is a one-line mount.
 *
 * Aggregation is computed HERE from the daily entries (so it's correct regardless of
 * any UI-side source rollup): additive metrics (clicks/impressions/sessions/conv)
 * are summed; ratios (ctr/position/engagement) averaged; pagespeed/aeo state read as
 * the latest day. Surfaces stay pure — only own sources, no cross-source.
 */
import type { DiscoverabilityData, DiscoverabilitySeo, DiscoverabilityAi } from "@/components/dashboard/metrics-v2/DiscoverabilitySurface";
import type { WebSeoKpi } from "@/components/dashboard/metrics-v2/WebSeoKpis";
import type { SeoQueryRow, SeoPageRow } from "@/components/dashboard/metrics-v2/SeoBreakdown";
import type { SeoMover } from "@/components/dashboard/metrics-v2/SeoMovers";
import type { AiKpi } from "@/components/dashboard/metrics-v2/AiKpis";
import type { AiCompetitor, AiEngine, AiPrompt } from "@/components/dashboard/metrics-v2/AiBreakdown";

type Metric = { name: string; value?: number | string | null; dimensions?: Record<string, unknown> | null };
type Src = { status?: string; metrics?: Metric[] } | undefined;
export type DiscoverabilityEntry = { date: string; sources: Record<string, Src> };

const N = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) || 0 : 0);
const intES = (n: number) => Math.round(n).toLocaleString("es-ES");
const kES = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k` : intES(n));
const decES = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctES = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;

const srcOf = (e: DiscoverabilityEntry, keys: string[]): Src => {
  for (const k of keys) if (e.sources?.[k]?.metrics?.length) return e.sources[k];
  return undefined;
};
const isRollup = (m: Metric) => !m.dimensions || Object.keys(m.dimensions).length === 0;
const rollup = (s: Src, name: string): number | null => {
  const m = s?.metrics?.find((x) => x.name === name && isRollup(x));
  return m ? N(m.value) : null;
};
/** Sum / avg / last of a metric's per-day rollup across the range. */
function series(entries: DiscoverabilityEntry[], keys: string[], name: string): number[] {
  return entries.map((e) => rollup(srcOf(e, keys), name)).filter((v): v is number => v != null);
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const last = (xs: number[]) => (xs.length ? xs[xs.length - 1] : 0);

const GA4 = ["ga4", "google-analytics"];
const GSC = ["gsc", "google-search-console"];
const PS = ["pagespeed"];
const AEO = ["aeo"];

function aggDim(entries: DiscoverabilityEntry[], keys: string[], dim: string) {
  // group dimensioned rows by their dim value across all days
  const map = new Map<string, { clicks: number; impressions: number; visits: number; ctr: number[]; pos: { date: string; v: number }[]; conv: number; dims: Record<string, unknown> }>();
  for (const e of entries) {
    const s = srcOf(e, keys);
    for (const m of s?.metrics || []) {
      const d = m.dimensions as Record<string, unknown> | undefined;
      const key = d?.[dim];
      if (key == null) continue;
      const k = String(key);
      const row = map.get(k) || { clicks: 0, impressions: 0, visits: 0, ctr: [], pos: [], conv: 0, dims: d! };
      if (m.name === "clicks") row.clicks += N(m.value);
      else if (m.name === "impressions") row.impressions += N(m.value);
      else if (m.name === "topPage") { row.visits += N(m.value); row.conv += N(d?.conversions); }
      else if (m.name === "ctr") row.ctr.push(N(m.value));
      else if (m.name === "position") row.pos.push({ date: e.date, v: N(m.value) });
      map.set(k, row);
    }
  }
  return map;
}

function buildSeo(entries: DiscoverabilityEntry[]): DiscoverabilitySeo | undefined {
  const hasGsc = entries.some((e) => srcOf(e, GSC));
  const hasGa4 = entries.some((e) => srcOf(e, GA4));
  if (!hasGsc && !hasGa4) return undefined;

  const clicks = sum(series(entries, GSC, "clicks"));
  const impressions = sum(series(entries, GSC, "impressions"));
  const position = avg(series(entries, GSC, "position"));
  const ctr = avg(series(entries, GSC, "ctr"));
  const sessions = sum(series(entries, GA4, "sessions"));
  const engagement = avg(series(entries, GA4, "engagementRate"));
  const conversions = sum(series(entries, GA4, "conversions"));
  const perfMobile = last(series(entries, PS, "performance_mobile"));
  const cwvPass = last(series(entries, PS, "lcp_mobile")) <= 2.5 && last(series(entries, PS, "cls_mobile")) <= 0.1 && last(series(entries, PS, "inp_mobile")) <= 200;

  const kpis: WebSeoKpi[] = [
    { label: "Clicks", value: intES(clicks), source: "GSC" },
    { label: "Impresiones", value: kES(impressions), source: "GSC" },
    { label: "Posición media", value: decES(position), source: "GSC" },
    { label: "CTR", value: pctES(ctr), source: "GSC" },
    { label: "Sessions", value: kES(sessions), source: "GA4" },
    { label: "Engagement", value: pctES(engagement), source: "GA4" },
    { label: "Conversiones", value: intES(conversions), source: "GA4" },
    { label: "Core Web Vitals", value: cwvPass ? "✓ Pasa" : "Mejorar", hint: `${Math.round(perfMobile)} móvil`, source: "PageSpeed", health: true },
  ];

  const trend = entries.map((e) => ({ date: e.date, clicks: rollup(srcOf(e, GSC), "clicks") ?? 0, impressions: rollup(srcOf(e, GSC), "impressions") ?? 0 }));

  const qMap = aggDim(entries, GSC, "query");
  const queries: SeoQueryRow[] = [...qMap.entries()].map(([query, r]) => {
    const pos = r.pos.slice().sort((a, b) => a.date.localeCompare(b.date));
    const cur = pos.length ? pos[pos.length - 1].v : 0;
    const first = pos.length ? pos[0].v : cur;
    return {
      query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: +avg(r.ctr).toFixed(2),
      position: +cur.toFixed(1),
      deltaPos: +(first - cur).toFixed(1),
      history: pos.map((p) => p.v),
      intent: r.dims.intent ? String(r.dims.intent) : undefined,
    };
  }).sort((a, b) => b.clicks - a.clicks);

  // pages: GA4 visits (topPage) joined with GSC position/clicks/ctr by page
  const pMapGa = aggDim(entries, GA4, "page");
  const pMapGsc = aggDim(entries, GSC, "page");
  const pageKeys = new Set([...pMapGa.keys(), ...pMapGsc.keys()]);
  const pages: SeoPageRow[] = [...pageKeys].map((page) => {
    const ga = pMapGa.get(page);
    const gs = pMapGsc.get(page);
    return {
      page,
      visits: ga?.visits ?? 0,
      position: gs?.pos.length ? +avg(gs.pos.map((p) => p.v)).toFixed(1) : null,
      clicks: gs ? gs.clicks : null,
      ctr: gs?.ctr.length ? +avg(gs.ctr).toFixed(2) : null,
      conversions: ga?.conv ?? 0,
    };
  }).sort((a, b) => b.visits - a.visits);

  const up: SeoMover[] = queries.filter((q) => q.deltaPos > 0).sort((a, b) => b.deltaPos - a.deltaPos).slice(0, 4)
    .map((q) => ({ query: q.query, from: Math.round(q.position + q.deltaPos), to: Math.round(q.position) }));
  const down: SeoMover[] = queries.filter((q) => q.deltaPos < 0).sort((a, b) => a.deltaPos - b.deltaPos).slice(0, 4)
    .map((q) => ({ query: q.query, from: Math.round(q.position + q.deltaPos), to: Math.round(q.position) }));

  const buckets = [
    { bucket: "Top 1-3", lo: 0, hi: 3 },
    { bucket: "4-10", lo: 3, hi: 10 },
    { bucket: "11-50", lo: 10, hi: 50 },
    { bucket: "51-100", lo: 50, hi: 100 },
  ];
  const positionDist = buckets.map((b) => ({ bucket: b.bucket, count: queries.filter((q) => q.position > b.lo && q.position <= b.hi).length }));

  const leads = conversions; // own-source proxy (the real attribution lives in Atribución)
  return {
    kpis,
    trend,
    queries,
    pages,
    totalQueries: queries.length,
    totalPages: pages.length,
    movers: { up, down },
    health: {
      cwv: { lcp: last(series(entries, PS, "lcp_mobile")), cls: last(series(entries, PS, "cls_mobile")), inp: last(series(entries, PS, "inp_mobile")) },
      scores: { mobile: Math.round(perfMobile), desktop: Math.round(last(series(entries, PS, "performance_desktop"))), seo: Math.round(last(series(entries, PS, "seo_mobile"))) },
      positionDist,
      totalKeywords: queries.length,
    },
    funnel: {
      steps: [
        { label: "Impresiones", value: kES(impressions) },
        { label: "Clicks", value: intES(clicks) },
        { label: "Sessions", value: kES(sessions) },
        { label: "Conversiones", value: intES(conversions) },
        { label: "Leads (web)", value: intES(leads) },
      ],
      note: `Web aporta ${intES(leads)} leads`,
    },
    state: "collecting",
  };
}

function buildAi(entries: DiscoverabilityEntry[]): DiscoverabilityAi | undefined {
  if (!entries.some((e) => srcOf(e, AEO))) return undefined;
  const lastEntry = [...entries].reverse().find((e) => srcOf(e, AEO));
  const aeo = lastEntry ? srcOf(lastEntry, AEO) : undefined;

  const kpis: AiKpi[] = [
    { label: "AI Visibility", value: pctES(rollup(aeo, "ai_visibility") ?? 0), health: false },
    { label: "Share of Voice", value: pctES(rollup(aeo, "share_of_voice") ?? 0) },
    { label: "Menciones", value: intES(rollup(aeo, "mentions") ?? 0) },
    { label: "Citas · dominio", value: intES(rollup(aeo, "citations") ?? 0) },
    { label: "Posición media", value: decES(rollup(aeo, "ai_position") ?? 0) },
    { label: "Sentimiento", value: `${Math.round(rollup(aeo, "sentiment") ?? 0)} · Bueno`, health: true },
    { label: "Motores citado", value: `${Math.round(rollup(aeo, "engines_cited") ?? 0)} / 6` },
  ];

  // SoV trend per brand (top 3 by latest SoV), colored deterministically
  const brandSov = new Map<string, { date: string; v: number }[]>();
  for (const e of entries) {
    for (const m of srcOf(e, AEO)?.metrics || []) {
      if (m.name !== "share_of_voice") continue;
      const brand = (m.dimensions as Record<string, unknown> | undefined)?.brand;
      if (brand == null) continue;
      const arr = brandSov.get(String(brand)) || [];
      arr.push({ date: e.date, v: N(m.value) });
      brandSov.set(String(brand), arr);
    }
  }
  const colors = ["rust", "navy", "cyan"] as const;
  const sov = [...brandSov.entries()]
    .sort((a, b) => (b[1].at(-1)?.v ?? 0) - (a[1].at(-1)?.v ?? 0))
    .slice(0, 3)
    .map(([label, pts], i) => ({ label, color: colors[i], points: pts.sort((a, b) => a.date.localeCompare(b.date)).map((p) => Math.round(p.v)) }));

  const competitors: AiCompetitor[] = (aeo?.metrics || [])
    .filter((m) => m.name === "share_of_voice" && (m.dimensions as Record<string, unknown> | undefined)?.brand)
    .map((m, i) => {
      const brand = String((m.dimensions as Record<string, unknown>).brand);
      const byBrand = (name: string) => N(aeo?.metrics?.find((x) => x.name === name && (x.dimensions as Record<string, unknown> | undefined)?.brand === brand)?.value);
      return { brand, sov: N(m.value), visibility: byBrand("ai_visibility"), mentions: byBrand("mentions"), position: byBrand("ai_position"), sentiment: byBrand("sentiment"), you: i === 0 };
    });

  const engines: AiEngine[] = (aeo?.metrics || [])
    .filter((m) => m.name === "ai_visibility" && (m.dimensions as Record<string, unknown> | undefined)?.engine)
    .map((m) => ({ engine: String((m.dimensions as Record<string, unknown>).engine), visibility: N(m.value) }));

  const prompts: AiPrompt[] = (aeo?.metrics || [])
    .filter((m) => m.name === "ai_prompt" && (m.dimensions as Record<string, unknown> | undefined)?.prompt)
    .map((m) => {
      const d = m.dimensions as Record<string, unknown>;
      return { prompt: String(d.prompt), engine: String(d.engine ?? ""), position: N(m.value) };
    });

  const checklist = (aeo?.metrics || [])
    .filter((m) => m.name === "ai_readiness" && (m.dimensions as Record<string, unknown> | undefined)?.check)
    .map((m) => {
      const v = N(m.value);
      return { check: String((m.dimensions as Record<string, unknown>).check), status: (v >= 1 ? "ok" : v <= 0 ? "fail" : "partial") as "ok" | "fail" | "partial" };
    });

  return {
    kpis,
    sov,
    competitors,
    engines,
    prompts,
    totalPrompts: prompts.length,
    movers: { up: [], down: [] },
    readiness: { checklist },
    funnel: {
      steps: [
        { label: "Visibilidad", value: pctES(rollup(aeo, "ai_visibility") ?? 0) },
        { label: "Citas IA", value: intES(rollup(aeo, "citations") ?? 0) },
        { label: "Menciones", value: intES(rollup(aeo, "mentions") ?? 0) },
      ],
      note: "Visibilidad en respuestas IA",
    },
    state: "connected_pending",
  };
}

export function buildDiscoverabilityData(entries: DiscoverabilityEntry[]): DiscoverabilityData {
  if (!entries?.length) return {};
  return { seo: buildSeo(entries), ai: buildAi(entries) };
}
