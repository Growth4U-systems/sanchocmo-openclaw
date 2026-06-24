#!/usr/bin/env tsx
/**
 * Seed rich, representative Paid (ads) data into `metric_snapshots` so the Paid
 * surface (SAN-319 · PR3) can be built/seen against a realistic data SHAPE while
 * the real Meta collector runs only on staging (needs the client's token) and the
 * Google Ads adapter doesn't exist yet (invented for now, "será muy similar").
 *
 * Idempotent (upserts by stable id). Run with a DB connection:
 *   DATABASE_URL=... npx tsx scripts/metrics/seed-paid-ads.ts [slug] [days]
 *
 * Provenance: every number here is `seed` (NOT real). The surface flags
 * platform-reported conversions/CPA/ROAS as `dedup`; real revenue/CPA-por-cita is
 * NOT seeded here — that lives in Conversión/Atribución.
 */
import { hasDatabase } from "@/db/drizzle";
import { ensureMetricsStorage, ingestDailySnapshot, type RawMetric } from "@/lib/data/metrics-snapshots";

const SLUG = process.argv[2] || "hospital-capilar";
const DAYS = Number(process.argv[3]) || 30;

// Deterministic per-day wiggle so re-runs are stable (no Math.random).
const wiggle = (dayIndex: number, phase: number) => 1 + 0.12 * Math.sin((dayIndex + phase) * 0.5);

type Campaign = { name: string; platform: "Meta" | "Google"; spend: number; conv: number; roas: number; ctr: number };

// --- Meta: campaigns → adsets → ads, placements, audiences ---
const META_CAMPAIGNS: Campaign[] = [
  { name: "¿Qué me pasa?", platform: "Meta", spend: 486, conv: 9, roas: 4.2, ctr: 3.3 },
  { name: "Injerto capilar", platform: "Meta", spend: 419, conv: 5, roas: 3.1, ctr: 2.7 },
  { name: "Retargeting web", platform: "Meta", spend: 240, conv: 7, roas: 5.8, ctr: 2.4 },
];
const META_ADSETS = ["Lookalike 1%", "Intereses dermatología", "Retargeting 30d"];
const META_ADS = [
  { name: "Founder POV", thumb: "🎬", hook: 38 },
  { name: "Testimonio paciente", thumb: "🎬", hook: 32 },
  { name: "Carrusel injerto", thumb: "🖼️", hook: 0 },
];
const META_PLACEMENTS = ["facebook · feed", "instagram · stories", "instagram · reels", "audience_network"];
const META_AUDIENCES = ["25-34 · F", "35-44 · F", "35-44 · M", "45-54 · M"];

// --- Google Search (invented for now) ---
const GOOGLE_CAMPAIGNS: Campaign[] = [
  { name: "Brand search", platform: "Google", spend: 135, conv: 4, roas: 6.1, ctr: 5.8 },
  { name: "Non-brand injerto", platform: "Google", spend: 210, conv: 3, roas: 1.9, ctr: 3.1 },
];
const GOOGLE_KEYWORDS = [
  { kw: "injerto capilar precio", is: 0.48, lostIs: 0.22, conv: 3 },
  { kw: "clínica capilar madrid", is: 0.61, lostIs: 0.12, conv: 2 },
  { kw: "tratamiento alopecia", is: 0.33, lostIs: 0.41, conv: 1 },
];

/** Build the metric rows for one source for one day. */
function metricsForDay(platform: "Meta" | "Google", dayIndex: number): RawMetric[] {
  const m: RawMetric[] = [];
  const campaigns = platform === "Meta" ? META_CAMPAIGNS : GOOGLE_CAMPAIGNS;
  const w = wiggle(dayIndex, platform === "Meta" ? 0 : 3);

  // derive medium + platform-attributed metrics from a campaign base
  const rows = (c: Campaign) => {
    const spend = +(c.spend * w / DAYS * 7).toFixed(2); // ~weekly-scaled daily
    const clicks = Math.round((spend / (0.3 + (c.ctr > 4 ? 0.2 : 0))) * w);
    const impressions = Math.round(clicks / (c.ctr / 100));
    const conv = Math.max(0, Math.round((c.conv / DAYS) * w));
    const revenue = +(spend * c.roas).toFixed(2);
    return {
      spend,
      impressions,
      clicks,
      ctr: +(c.ctr * w).toFixed(2),
      cpc: clicks ? +(spend / clicks).toFixed(2) : 0,
      frequency: +(1.8 + 0.4 * Math.sin(dayIndex * 0.3)).toFixed(2),
      conversions: conv,
      revenue,
      roas: +c.roas.toFixed(2), // platform-reported ROAS (flagged dedup in the UI)
      leads: conv,
    };
  };

  const pushAll = (vals: ReturnType<typeof rows>, dims?: Record<string, string>) => {
    for (const [name, value] of Object.entries(vals)) m.push({ name, value, dimensions: dims });
  };

  // account totals
  const totals = campaigns.reduce(
    (acc, c) => {
      const r = rows(c);
      (Object.keys(r) as (keyof typeof r)[]).forEach((k) => (acc[k] = +(((acc[k] as number) || 0) + (r[k] as number)).toFixed(2)));
      return acc;
    },
    {} as ReturnType<typeof rows>,
  );
  totals.ctr = +(campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length).toFixed(2);
  totals.roas = +(campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length).toFixed(2);
  pushAll(totals);

  // by campaign (+ adset + ad for Meta)
  for (const c of campaigns) {
    pushAll(rows(c), { campaign: c.name, platform });
    if (platform === "Meta") {
      META_ADSETS.forEach((adset, i) =>
        pushAll(rows({ ...c, spend: c.spend / 3 }), { campaign: c.name, adset, platform }),
      );
      META_ADS.forEach((ad) => {
        const r = rows({ ...c, spend: c.spend / 4 });
        pushAll(r, { campaign: c.name, ad: ad.name, platform });
        m.push({ name: "hookRate", value: ad.hook, dimensions: { campaign: c.name, ad: ad.name, platform } });
      });
    }
  }

  // placement (Meta) / keyword (Google) + audience (Meta) + Impression Share (Google)
  if (platform === "Meta") {
    META_PLACEMENTS.forEach((placement, i) => pushAll(rows({ ...META_CAMPAIGNS[0], spend: 120 - i * 20 }), { placement, platform }));
    META_AUDIENCES.forEach((audience, i) => pushAll(rows({ ...META_CAMPAIGNS[0], spend: 130 - i * 25 }), { audience, platform }));
  } else {
    for (const k of GOOGLE_KEYWORDS) {
      const r = rows({ ...GOOGLE_CAMPAIGNS[0], spend: 40, conv: k.conv });
      pushAll(r, { keyword: k.kw, platform });
      m.push({ name: "impressionShare", value: k.is, dimensions: { keyword: k.kw, platform } });
      m.push({ name: "lostImpressionShare", value: k.lostIs, dimensions: { keyword: k.kw, platform } });
    }
  }
  return m;
}

async function main() {
  if (process.argv.includes("--dry")) {
    const meta = metricsForDay("Meta", 0);
    const google = metricsForDay("Google", 0);
    const dims = new Set(meta.concat(google).flatMap((r) => Object.keys(r.dimensions || {})));
    console.log(`dry-run · meta_ads ${meta.length} rows · google_ads ${google.length} rows · dims: ${[...dims].join(", ")}`);
    const bad = meta.concat(google).filter((r) => typeof r.value !== "number" || !Number.isFinite(r.value));
    console.log(bad.length ? `⚠️  ${bad.length} non-finite values: ${JSON.stringify(bad.slice(0, 3))}` : "✓ all values finite");
    console.log("sample:", JSON.stringify(meta.slice(0, 5)));
    return;
  }
  if (!hasDatabase) {
    console.error("DATABASE_URL is not set — cannot seed. Run with DATABASE_URL=... (staging/dev DB).");
    process.exit(1);
  }
  await ensureMetricsStorage();

  const today = new Date();
  let total = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const dateKey = date.toISOString().slice(0, 10);
    const dayIndex = DAYS - 1 - d;
    const daily = {
      slug: SLUG,
      collectedAt: new Date().toISOString(),
      sources: {
        meta_ads: { status: "ok", metrics: metricsForDay("Meta", dayIndex) },
        google_ads: { status: "ok", metrics: metricsForDay("Google", dayIndex) },
      },
    };
    const res = await ingestDailySnapshot(SLUG, dateKey, daily);
    total += res.rows;
  }
  console.log(`✅ Seeded ${total} Paid metric rows for ${SLUG} across ${DAYS} days (meta_ads + google_ads, all type=seed).`);
}

main().catch((err) => {
  console.error("seed-paid-ads failed:", err);
  process.exit(1);
});
