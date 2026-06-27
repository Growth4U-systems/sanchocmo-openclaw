#!/usr/bin/env tsx
/**
 * Seed rich, representative Product (PostHog) data into `metric_snapshots` so the
 * Product surface (SAN-319 · PR5) can be built/seen against a realistic data SHAPE
 * while the real PostHog collector runs only on staging (needs the client's key)
 * and the windowed-distinct queries (DAU/WAU/MAU, retention cohorts, feature
 * adoption) are a follow-up adapter PR — those MUST be verified against live
 * PostHog (a distinct-person count can't be reasoned about blind).
 *
 * Idempotent (upserts by stable id). Run with a DB connection:
 *   DATABASE_URL=... npx tsx scripts/metrics/seed-product.ts [slug] [days]
 *
 * Provenance: every number here is `seed` (NOT real). PostHog is a CLEAN source
 * (no knownDirty, unlike GHL). Cita/pago are NOT here → Conversión/Atribución.
 *
 * Additivity (matches the collector's daily-snapshot model — see posthog.js):
 *  - ADDITIVE (the surface SUMS over the range): `pageviews`, `activation_events`,
 *    `funnel_step_reached` (event counts, shape-preserving; dims STABLE {step,order}).
 *  - WINDOWED (the surface reads the LATEST day, never sums — a distinct-person
 *    count isn't additive across days): `active_users`{window}, `retention`
 *    {cohort,week}, `feature_adoption`/`feature_depth`{feature}, and the scalar
 *    KPIs (`activation_rate`, `stickiness`, `retention_d30`, `time_to_value`,
 *    `returning`, `north_star_weekly`). Each day stores the as-of-that-day value.
 */
import { hasDatabase } from "@/db/drizzle";
import { ensureMetricsStorage, ingestDailySnapshot, type RawMetric } from "@/lib/data/metrics-snapshots";
import { assertMetricSeedTargetSafe } from "./seed-safety";

const SLUG = process.argv[2] || "hospital-capilar";
const DAYS = Number(process.argv[3]) || 30;
const SEED_METADATA = { provenance: "seed", quality: "demo" } as const;

// Deterministic per-day wiggle + linear trend so re-runs are stable (no Math.random).
const wiggle = (i: number, phase = 0) => 1 + 0.08 * Math.sin((i + phase) * 0.6);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- Activation funnel (event counts, ADDITIVE) — totals across the whole range ---
const FUNNEL: { step: string; order: number; total: number }[] = [
  { step: "signup", order: 1, total: 1000 },
  { step: "onboarding_completed", order: 2, total: 820 },
  { step: "first_key_action", order: 3, total: 500 },
  { step: "activated", order: 4, total: 380 },
];

// --- Cohort retention "triangle" (WINDOWED, read latest). cohortAge: 1 = last week … 8 = 8 weeks ago ---
const COHORTS = 8;
const RET_WEEKS = 8; // S0..S7
const retentionPct = (cohortAge: number, week: number): number => {
  if (week === 0) return 100;
  // newer cohorts retain slightly better (a flattening tail = product-market-fit)
  const base = 56 + (COHORTS - cohortAge) * 0.6;
  return Math.round(base * Math.pow(0.86, week - 1));
};

// --- Feature adoption (WINDOWED, read latest): breadth % of active users + depth uses/user ---
const FEATURES: { feature: string; breadth: number; depth: number }[] = [
  { feature: "Dashboard", breadth: 78, depth: 12.4 },
  { feature: "Export", breadth: 56, depth: 3.1 },
  { feature: "Colaboración", breadth: 42, depth: 5.8 },
  { feature: "Integraciones", breadth: 34, depth: 2.2 },
  { feature: "API", breadth: 18, depth: 9.0 },
];

// --- Scalar KPIs [start → end] across the range (WINDOWED, read latest; trend drives the delta chip) ---
const KPI: Record<string, [number, number]> = {
  activation_rate: [35, 38], // %
  stickiness: [21, 22], // % DAU/MAU
  retention_d30: [39, 41], // %
  time_to_value: [2.7, 2.4], // days (down = good)
  returning: [61, 64], // %
  north_star_weekly: [1080, 1240], // activations / week
};

// --- Active users [start → end] (WINDOWED, read latest for the KPI; per-day series for the trend) ---
const ACTIVE: Record<"dau" | "wau" | "mau", [number, number]> = {
  dau: [850, 920],
  wau: [3900, 4200],
  mau: [13200, 14300],
};

/** Build the PostHog metric rows for one day. */
function metricsForDay(dayIndex: number): RawMetric[] {
  const m: RawMetric[] = [];
  const t = DAYS > 1 ? dayIndex / (DAYS - 1) : 1;
  const w = wiggle(dayIndex);

  // ADDITIVE
  m.push({ name: "pageviews", value: Math.round(lerp(440, 560, t) * w) });
  m.push({ name: "activation_events", value: Math.max(1, Math.round((FUNNEL[3].total / DAYS) * w)) });
  for (const s of FUNNEL) {
    m.push({ name: "funnel_step_reached", value: Math.max(0, Math.round((s.total / DAYS) * w)), dimensions: { step: s.step, order: s.order } });
  }

  // WINDOWED — active users DAU/WAU/MAU
  (Object.keys(ACTIVE) as ("dau" | "wau" | "mau")[]).forEach((win) => {
    const [a, b] = ACTIVE[win];
    m.push({ name: "active_users", value: Math.round(lerp(a, b, t)), dimensions: { window: win } });
  });

  // WINDOWED — scalar KPIs
  for (const [name, [a, b]] of Object.entries(KPI)) {
    m.push({ name, value: +lerp(a, b, t).toFixed(name === "time_to_value" ? 1 : 0) });
  }

  // WINDOWED — retention triangle (older cohorts have more weeks of data)
  for (let age = 1; age <= COHORTS; age++) {
    for (let week = 0; week <= Math.min(age, RET_WEEKS - 1); week++) {
      m.push({ name: "retention", value: retentionPct(age, week), dimensions: { cohort: `w-${age}`, week } });
    }
  }
  m.push({ name: "retention", value: 100, dimensions: { cohort: "w-0", week: 0 } }); // "Esta sem"

  // WINDOWED — feature adoption breadth + depth
  for (const f of FEATURES) {
    m.push({ name: "feature_adoption", value: f.breadth, dimensions: { feature: f.feature } });
    m.push({ name: "feature_depth", value: f.depth, dimensions: { feature: f.feature } });
  }

  return m;
}

async function main() {
  if (process.argv.includes("--dry")) {
    const rows = metricsForDay(DAYS - 1);
    const names = [...new Set(rows.map((r) => r.name))];
    const dims = new Set(rows.flatMap((r) => Object.keys(r.dimensions || {})));
    console.log(`dry-run · posthog ${rows.length} rows · metrics: ${names.join(", ")} · dims: ${[...dims].join(", ")}`);
    const bad = rows.filter((r) => typeof r.value !== "number" || !Number.isFinite(r.value));
    console.log(bad.length ? `⚠️  ${bad.length} non-finite values: ${JSON.stringify(bad.slice(0, 3))}` : "✓ all values finite");
    console.log("sample:", JSON.stringify(rows.slice(0, 6)));
    return;
  }
  if (!hasDatabase) {
    console.error("DATABASE_URL is not set — cannot seed. Run with DATABASE_URL=... (staging/dev DB).");
    process.exit(1);
  }
  assertMetricSeedTargetSafe("seed-product");
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
      ...SEED_METADATA,
      sources: {
        posthog: { status: "ok", metrics: metricsForDay(dayIndex) },
      },
    };
    const res = await ingestDailySnapshot(SLUG, dateKey, daily);
    total += res.rows;
  }
  console.log(`✅ Seeded ${total} Product metric rows for ${SLUG} across ${DAYS} days (posthog, all type=seed).`);
}

main().catch((err) => {
  console.error("seed-product failed:", err);
  process.exit(1);
});
