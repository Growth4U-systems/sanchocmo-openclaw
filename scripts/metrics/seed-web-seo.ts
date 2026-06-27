#!/usr/bin/env tsx
/**
 * Seed rich, representative Discoverability (Web & SEO) data into `metric_snapshots`
 * so the surface (SAN-319 · PR6) can be built/seen against a realistic data SHAPE
 * while real GA4/GSC are `connected_pending` for the ref client (SAN-228) and the
 * AI/GEO source doesn't exist yet.
 *
 * Idempotent (upserts by stable id). Run with a DB connection:
 *   DATABASE_URL=... npx tsx scripts/metrics/seed-web-seo.ts [slug] [days]
 *
 * Two measurement modes (the surface has SEO | AI sub-tabs):
 *  - SEO  = ga4 (traffic) + gsc (rankings) + pagespeed (Core Web Vitals). These
 *    metric SHAPES match the real adapters (ga4.js/gsc.js//api/pagespeed) exactly;
 *    every row is still tagged seed/demo so semantic KPIs never publish it as OK.
 *    ADDITIVE: sessions/users/clicks/impressions/conversions.
 *    AVG (aggregation.ts already avgs): ctr/position/bounceRate/engagementRate.
 *    LATEST: pagespeed.*.
 *  - AI   = `source=aeo` (GEO/AEO visibility in AI answers). NO real source yet →
 *    the surface flags these `pending`/`seed`. Defines the contract for a future
 *    Profound/Peec/scraper adapter. State metrics (read latest): share_of_voice,
 *    ai_visibility, sentiment, ai_position, engines_cited.
 *
 * Cross-source (web → cita → pago) is NOT here → Conversión/Atribución.
 */
import { hasDatabase } from "@/db/drizzle";
import { ensureMetricsStorage, ingestDailySnapshot, type RawMetric } from "@/lib/data/metrics-snapshots";
import { assertMetricSeedTargetSafe } from "./seed-safety";

const SLUG = process.argv[2] || "hospital-capilar";
const DAYS = Number(process.argv[3]) || 30;
const SEED_METADATA = { provenance: "seed", quality: "demo" } as const;

const wiggle = (i: number, phase = 0) => 1 + 0.08 * Math.sin((i + phase) * 0.6);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const dailySum = (total: number, i: number, phase = 0) => Math.max(0, Math.round((total / DAYS) * wiggle(i, phase)));

// ─────────────────────────── GSC (rankings) ───────────────────────────
// pos+delta → pos across the range so the UI derives the right movers (▲ improved / ▼ declined).
const GSC_QUERIES: { q: string; clicks: number; impr: number; ctr: number; pos: number; delta: number; intent: string }[] = [
  { q: "hospital capilar", clicks: 320, impr: 4200, ctr: 7.6, pos: 1.3, delta: 0, intent: "Marca" },
  { q: "injerto capilar precio", clicks: 210, impr: 6400, ctr: 3.3, pos: 8.1, delta: 2, intent: "Comercial" },
  { q: "precio injerto capilar turquía", clicks: 120, impr: 9800, ctr: 1.2, pos: 9.4, delta: 1, intent: "Comercial" },
  { q: "clínica capilar madrid", clicks: 96, impr: 1400, ctr: 6.9, pos: 6.2, delta: 0, intent: "Comercial" },
  { q: "tratamiento alopecia mujer", clicks: 88, impr: 3100, ctr: 2.8, pos: 11.4, delta: -1, intent: "Info" },
  { q: "qué es la alopecia", clicks: 64, impr: 8900, ctr: 0.7, pos: 18.5, delta: 5, intent: "Info" },
  { q: "trasplante capilar antes y después", clicks: 58, impr: 6200, ctr: 0.9, pos: 15.7, delta: 4, intent: "Info" },
  { q: "mejor clínica injerto capilar", clicks: 52, impr: 5100, ctr: 1.0, pos: 12.8, delta: 3, intent: "Comercial" },
  { q: "injerto barba", clicks: 47, impr: 1900, ctr: 2.5, pos: 10.3, delta: 1, intent: "Comercial" },
  { q: "injerto capilar opiniones", clicks: 41, impr: 2000, ctr: 2.1, pos: 14.2, delta: -3, intent: "Comercial" },
  { q: "alopecia areata tratamiento", clicks: 33, impr: 2700, ctr: 1.2, pos: 16.1, delta: -2, intent: "Info" },
  { q: "financiación injerto capilar", clicks: 29, impr: 1100, ctr: 2.6, pos: 13.5, delta: 0, intent: "Trans." },
];

// ─────────────────────────── GA4 (traffic) ───────────────────────────
const GA4_PAGES: { page: string; visits: number; pos: number | null; clicks: number | null; ctr: number | null; conv: number; type: string }[] = [
  { page: "/", visits: 3100, pos: null, clicks: 240, ctr: null, conv: 18, type: "Home" },
  { page: "/blog/que-es-la-alopecia", visits: 2400, pos: 18.5, clicks: 64, ctr: 0.7, conv: 8, type: "Blog" },
  { page: "/blog/injerto-capilar-precio", visits: 1900, pos: 8.1, clicks: 210, ctr: 3.3, conv: 22, type: "Blog" },
  { page: "/precios", visits: 1200, pos: null, clicks: null, ctr: null, conv: 31, type: "Comercial" },
  { page: "/blog/injerto-opiniones", visits: 980, pos: 14.2, clicks: 41, ctr: 2.1, conv: 5, type: "Blog" },
  { page: "/casos/antes-despues", visits: 760, pos: 11.4, clicks: 38, ctr: 1.9, conv: 12, type: "Caso" },
];
const GA4_CHANNELS: { channel: string; sessions: number; engagementRate: number }[] = [
  { channel: "Organic Search", sessions: 6800, engagementRate: 61 },
  { channel: "Direct", sessions: 2900, engagementRate: 57 },
  { channel: "Referral", sessions: 1200, engagementRate: 54 },
  { channel: "Organic Social", sessions: 900, engagementRate: 49 },
  { channel: "Paid Search", sessions: 800, engagementRate: 52 },
  { channel: "Email", sessions: 400, engagementRate: 66 },
];
const GA4_DEVICES: { device: string; sessions: number; bounceRate: number; engagementRate: number }[] = [
  { device: "mobile", sessions: 8200, bounceRate: 48, engagementRate: 55 },
  { device: "desktop", sessions: 4100, bounceRate: 38, engagementRate: 64 },
  { device: "tablet", sessions: 700, bounceRate: 52, engagementRate: 50 },
];

// ─────────────────────────── AEO (AI visibility, all seed) ───────────────────────────
const AEO_BRANDS: { brand: string; sov: number; visibility: number; mentions: number; position: number; sentiment: number }[] = [
  { brand: "Hospital Capilar", sov: 28, visibility: 43.8, mentions: 195, position: 2.4, sentiment: 72 },
  { brand: "Insparya", sov: 32, visibility: 50, mentions: 240, position: 1.9, sentiment: 70 },
  { brand: "Clínica X", sov: 20, visibility: 33, mentions: 130, position: 3.1, sentiment: 68 },
  { brand: "Capilar Y", sov: 12, visibility: 22, mentions: 80, position: 3.8, sentiment: 65 },
];
const AEO_ENGINES: { engine: string; visibility: number }[] = [
  { engine: "ChatGPT", visibility: 52 },
  { engine: "Perplexity", visibility: 61 },
  { engine: "Gemini", visibility: 38 },
  { engine: "Copilot", visibility: 30 },
  { engine: "AI Overviews", visibility: 44 },
  { engine: "Bing", visibility: 35 },
];
const AEO_READINESS: { check: string; ok: number }[] = [
  { check: "GPTBot permitido", ok: 1 },
  { check: "PerplexityBot permitido", ok: 1 },
  { check: "Schema Organization / FAQ", ok: 1 },
  { check: "llms.txt publicado", ok: 0 },
  { check: "Contenido citable", ok: 0.5 },
];
const AEO_PROMPTS: { prompt: string; engine: string; position: number }[] = [
  { prompt: "mejor clínica injerto capilar", engine: "Perplexity", position: 2 },
  { prompt: "precio injerto capilar", engine: "ChatGPT", position: 5 },
  { prompt: "injerto capilar madrid", engine: "Gemini", position: 3 },
  { prompt: "alopecia tratamiento", engine: "ChatGPT", position: 0 },
  { prompt: "clínica capilar opiniones", engine: "AI Overviews", position: 0 },
];

function ga4ForDay(i: number): RawMetric[] {
  const m: RawMetric[] = [];
  const t = DAYS > 1 ? i / (DAYS - 1) : 1;
  // aggregate (ADDITIVE sessions/users/conversions/pageviews; AVG engagement/bounce/duration)
  m.push({ name: "sessions", value: dailySum(Math.round(lerp(11900, 13000, t)), i) });
  m.push({ name: "totalUsers", value: dailySum(9000, i, 1) });
  m.push({ name: "newUsers", value: dailySum(6000, i, 2) });
  m.push({ name: "screenPageViews", value: dailySum(31000, i) });
  m.push({ name: "conversions", value: dailySum(Math.round(lerp(128, 142, t)), i) });
  m.push({ name: "engagementRate", value: +lerp(56, 58, t).toFixed(1) });
  m.push({ name: "bounceRate", value: 43 });
  m.push({ name: "averageSessionDuration", value: 96 });
  // by channel
  for (const c of GA4_CHANNELS) {
    m.push({ name: "sessions", value: dailySum(c.sessions, i), dimensions: { channel: c.channel } });
    m.push({ name: "engagementRate", value: c.engagementRate, dimensions: { channel: c.channel } });
  }
  // top pages (value = pageviews; dims carry page/duration/engagementRate)
  for (const p of GA4_PAGES) {
    m.push({ name: "topPage", value: dailySum(p.visits, i), dimensions: { page: p.page, duration: 92, engagementRate: 57, conversions: p.conv } });
  }
  // by device
  for (const d of GA4_DEVICES) {
    m.push({ name: "sessions", value: dailySum(d.sessions, i), dimensions: { device: d.device } });
    m.push({ name: "bounceRate", value: d.bounceRate, dimensions: { device: d.device } });
    m.push({ name: "engagementRate", value: d.engagementRate, dimensions: { device: d.device } });
  }
  return m;
}

function gscForDay(i: number): RawMetric[] {
  const m: RawMetric[] = [];
  const t = DAYS > 1 ? i / (DAYS - 1) : 1;
  // aggregate (clicks/impr ADDITIVE; ctr/position AVG)
  m.push({ name: "clicks", value: dailySum(Math.round(lerp(4200, 4820, t)), i) });
  m.push({ name: "impressions", value: dailySum(Math.round(lerp(178000, 192000, t)), i) });
  m.push({ name: "ctr", value: +lerp(2.3, 2.5, t).toFixed(2) });
  m.push({ name: "position", value: +lerp(13.0, 11.8, t).toFixed(1) });
  // by query — position drifts pos+delta → pos so movers (period Δ) are derivable
  for (const q of GSC_QUERIES) {
    const pos = +lerp(q.pos + q.delta, q.pos, t).toFixed(1);
    const dims = { query: q.q, intent: q.intent };
    m.push({ name: "clicks", value: dailySum(q.clicks, i), dimensions: dims });
    m.push({ name: "impressions", value: dailySum(q.impr, i), dimensions: dims });
    m.push({ name: "ctr", value: q.ctr, dimensions: dims });
    m.push({ name: "position", value: pos, dimensions: dims });
  }
  // by page
  for (const p of GA4_PAGES) {
    if (p.pos == null) continue;
    const dims = { page: p.page };
    m.push({ name: "clicks", value: dailySum(p.clicks ?? 0, i), dimensions: dims });
    m.push({ name: "ctr", value: p.ctr ?? 0, dimensions: dims });
    m.push({ name: "position", value: p.pos, dimensions: dims });
  }
  return m;
}

function pagespeedForDay(_i: number): RawMetric[] {
  // LATEST-aggregated state (same metric names as /api/pagespeed)
  return [
    { name: "performance_mobile", value: 74 },
    { name: "performance_desktop", value: 96 },
    { name: "seo_mobile", value: 98 },
    { name: "seo_desktop", value: 98 },
    { name: "lcp_mobile", value: 2.1 },
    { name: "cls_mobile", value: 0.06 },
    { name: "inp_mobile", value: 180 },
    { name: "tbt_mobile", value: 210 },
  ];
}

function aeoForDay(i: number): RawMetric[] {
  const m: RawMetric[] = [];
  const t = DAYS > 1 ? i / (DAYS - 1) : 1;
  // scalar KPIs (state, read latest; gentle uptrend for the delta chips)
  m.push({ name: "ai_visibility", value: +lerp(37.8, 43.8, t).toFixed(1) });
  m.push({ name: "share_of_voice", value: +lerp(24, 28, t).toFixed(0) });
  m.push({ name: "mentions", value: Math.round(lerp(173, 195, t)) });
  m.push({ name: "citations", value: Math.round(lerp(69, 84, t)) });
  m.push({ name: "ai_position", value: +lerp(2.7, 2.4, t).toFixed(1) });
  m.push({ name: "sentiment", value: Math.round(lerp(67, 72, t)) });
  m.push({ name: "engines_cited", value: 4 });
  // share of voice by competitor
  for (const b of AEO_BRANDS) {
    const dims = { brand: b.brand };
    m.push({ name: "share_of_voice", value: b.sov, dimensions: dims });
    m.push({ name: "ai_visibility", value: b.visibility, dimensions: dims });
    m.push({ name: "mentions", value: b.mentions, dimensions: dims });
    m.push({ name: "ai_position", value: b.position, dimensions: dims });
    m.push({ name: "sentiment", value: b.sentiment, dimensions: dims });
  }
  // visibility by engine
  for (const e of AEO_ENGINES) m.push({ name: "ai_visibility", value: e.visibility, dimensions: { engine: e.engine } });
  // AI-readiness checklist
  for (const r of AEO_READINESS) m.push({ name: "ai_readiness", value: r.ok, dimensions: { check: r.check } });
  // tracked prompts (value = cited position, 0 = not cited)
  for (const p of AEO_PROMPTS) m.push({ name: "ai_prompt", value: p.position, dimensions: { prompt: p.prompt, engine: p.engine } });
  return m;
}

async function main() {
  if (process.argv.includes("--dry")) {
    const i = DAYS - 1;
    const bySource = { ga4: ga4ForDay(i), gsc: gscForDay(i), pagespeed: pagespeedForDay(i), aeo: aeoForDay(i) };
    const all = Object.values(bySource).flat();
    const bad = all.filter((r) => typeof r.value !== "number" || !Number.isFinite(r.value));
    for (const [src, rows] of Object.entries(bySource)) {
      const names = [...new Set(rows.map((r) => r.name))];
      console.log(`  ${src}: ${rows.length} rows · ${names.join(", ")}`);
    }
    console.log(`dry-run · ${all.length} rows total · ${bad.length ? `⚠️  ${bad.length} non-finite: ${JSON.stringify(bad.slice(0, 3))}` : "✓ all values finite"}`);
    return;
  }
  if (!hasDatabase) {
    console.error("DATABASE_URL is not set — cannot seed. Run with DATABASE_URL=... (staging/dev DB).");
    process.exit(1);
  }
  assertMetricSeedTargetSafe("seed-web-seo");
  await ensureMetricsStorage();

  const today = new Date();
  let total = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const dateKey = date.toISOString().slice(0, 10);
    const i = DAYS - 1 - d;
    const daily = {
      slug: SLUG,
      collectedAt: new Date().toISOString(),
      ...SEED_METADATA,
      sources: {
        ga4: { status: "ok", metrics: ga4ForDay(i) },
        gsc: { status: "ok", metrics: gscForDay(i) },
        pagespeed: { status: "ok", metrics: pagespeedForDay(i) },
        aeo: { status: "ok", metrics: aeoForDay(i) },
      },
    };
    const res = await ingestDailySnapshot(SLUG, dateKey, daily);
    total += res.rows;
  }
  console.log(`✅ Seeded ${total} Discoverability metric rows for ${SLUG} across ${DAYS} days (ga4 + gsc + pagespeed + aeo, all type=seed).`);
}

main().catch((err) => {
  console.error("seed-web-seo failed:", err);
  process.exit(1);
});
