/**
 * SAN-81 · Reporting por creator (Metrics · Partnerships):
 *  - los seeds de performance + los 3 deals del mockup reproducen los KPIs
 *    de reporting.html a 90 días (11.300€ · 9 posts · 24.800 clicks ·
 *    1.984 signups · 1.190 KYC · 833 first_tx · CPA 13,6€ · ROI 5,9×);
 *  - CPA real vs break-even por creator + necesarias de la calc
 *    (fijo: ceil(fee/CAC) → 63/35/44);
 *  - la ventana 30d re-agrega por fecha de post;
 *  - feedback sugerido al quality score (delta por ROI relativo);
 *  - edges: sin lead se omite · sin fee no hay CPA · deal mixto suma el
 *    variable · CPA > CAC sale en rojo · scheduled no computa.
 *
 *   npx tsx --test src/lib/partnerships/__tests__/creator-report.test.mts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as reportModule from "../creator-report";
import * as seedsModule from "../performance-seeds";
import type { CreatorPerformancePost, CreatorPerformanceRecord } from "../creator-report";
import type { PartnershipLead } from "../types";

// Interop CJS↔ESM de tsx (mismo patrón que inbox-negotiation.test.mts).
const reportLib =
  (reportModule as unknown as { default: typeof reportModule }).default ?? reportModule;
const seedsLib =
  (seedsModule as unknown as { default: typeof seedsModule }).default ?? seedsModule;

const { buildCreatorReport, REPORT_SPARKLINE_BUCKETS } = reportLib;
const { materializePerformanceSeeds, SEED_PERFORMANCE } = seedsLib;

// ── Fixtures: los 3 creators con deal del mockup (datos del seed SAN-78) ────

const NOW = new Date("2026-06-11T12:00:00Z");

function lead(partial: Partial<PartnershipLead> & { id: string }): PartnershipLead {
  return { campaignId: "c1", ...partial } as PartnershipLead;
}

const DEAL_LEADS: PartnershipLead[] = [
  lead({
    id: "lead-pau",
    handle: "@money_pau",
    network: "TikTok",
    followers: 510_000,
    engagementRate: 4.0,
    offeredPrice: 5000,
    qualityScore: 88,
    lifecycleStatus: "Closed_Won",
  }),
  lead({
    id: "lead-inversor",
    handle: "@elinversorprudente",
    network: "YouTube",
    followers: 89_000,
    engagementRate: 6.2,
    offeredPrice: 2800,
    qualityScore: 91,
    lifecycleStatus: "Deal_Created",
  }),
  lead({
    id: "lead-lucia",
    handle: "@finanzasconlucia",
    network: "Instagram",
    followers: 142_000,
    engagementRate: 4.8,
    offeredPrice: 3500,
    qualityScore: 87,
    lifecycleStatus: "Negotiating",
  }),
];

const SEED_RECORDS = materializePerformanceSeeds(NOW);

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function record(
  handle: string,
  posts: Array<Partial<CreatorPerformancePost> & { daysAgo: number }>,
): CreatorPerformanceRecord {
  return {
    handle,
    source: "seed",
    posts: posts.map((post, index) => ({
      id: `${handle}-${index}`,
      date: daysAgoIso(post.daysAgo),
      format: post.format ?? "Reel",
      title: post.title ?? "Post",
      status: post.status ?? "live",
      clicks: post.clicks ?? 0,
      signups: post.signups ?? 0,
      kyc: post.kyc ?? 0,
      conversions: post.conversions ?? 0,
    })),
  };
}

function near(actual: number | null, expected: number, eps = 0.01): void {
  assert.ok(actual !== null, `esperaba ~${expected}, llegó null`);
  assert.ok(
    Math.abs((actual as number) - expected) < eps,
    `esperaba ~${expected}, llegó ${actual}`,
  );
}

describe("creator report · exact UTC collector day", () => {
  it("includes only the requested calendar day, independent of job time", () => {
    const records = [
      record("@money_pau", [
        { daysAgo: 2, clicks: 11, conversions: 2 },
        { daysAgo: 3, clicks: 99, conversions: 9 },
      ]),
    ];
    const report = buildCreatorReport(DEAL_LEADS, records, {
      periodDays: 1,
      now: new Date("2026-06-11T23:59:00Z"),
      exactRange: {
        from: new Date("2026-06-09T00:00:00.000Z"),
        to: new Date("2026-06-09T23:59:59.999Z"),
      },
    });

    assert.equal(report.from, "2026-06-09T00:00:00.000Z");
    assert.equal(report.to, "2026-06-09T23:59:59.999Z");
    assert.equal(report.totals.clicks, 11);
    assert.equal(report.totals.conversions, 2);
  });
});

// ── KPIs del programa (90d = mockup) ────────────────────────────────────────

describe("creator report · 90 días = KPIs del mockup", () => {
  const report = buildCreatorReport(DEAL_LEADS, SEED_RECORDS, { periodDays: 90, now: NOW });

  it("agrega los totales del programa exactos", () => {
    assert.deepEqual(report.tracking, {
      status: "demo",
      sources: ["seed"],
      recordCount: 3,
    });
    assert.equal(report.targetCacEur, 80);
    assert.equal(report.totals.investedEur, 11_300);
    assert.equal(report.totals.postsLive, 9);
    assert.equal(report.totals.clicks, 24_800);
    assert.equal(report.totals.signups, 1_984);
    assert.equal(report.totals.kyc, 1_190);
    assert.equal(report.totals.conversions, 833);
  });

  it("CPA real 13,6€ (< CAC 80€) y ROI 5,9× a valor de CAC objetivo", () => {
    near(report.totals.cpaRealEur, 11_300 / 833); // 13.565…
    assert.equal((report.totals.cpaRealEur as number).toFixed(1), "13.6");
    assert.equal(report.totals.belowBreakEven, true);
    near(report.totals.roi, (833 * 80) / 11_300); // 5.897…
    assert.equal((report.totals.roi as number).toFixed(1), "5.9");
  });

  it("ordena por clicks y calcula CPA real vs break-even + necesarias por creator", () => {
    assert.deepEqual(
      report.creators.map((c) => c.handle),
      ["@money_pau", "@elinversorprudente", "@finanzasconlucia"],
    );

    const [pau, inversor, lucia] = report.creators;

    // @money_pau · fee 5.000€ → necesita ceil(5000/80) = 63 · CPA 12,0€
    assert.equal(pau.postsLive, 4);
    assert.equal(pau.clicks, 12_400);
    assert.equal(pau.signups, 992);
    assert.equal(pau.kyc, 595);
    assert.equal(pau.conversions, 417);
    assert.equal(pau.conversionsNeeded, 63);
    assert.equal(pau.breakEvenCpaEur, 80);
    near(pau.cpaRealEur, 5000 / 417); // 11.99…
    assert.equal(pau.belowBreakEven, true);
    near(pau.roi, (417 * 80) / 5000); // 6.672

    // @elinversorprudente · fee 2.800€ → 35 necesarias · CPA 11,0€
    assert.equal(inversor.postsLive, 3);
    assert.equal(inversor.clicks, 7_600);
    assert.equal(inversor.conversions, 255);
    assert.equal(inversor.conversionsNeeded, 35);
    near(inversor.cpaRealEur, 2800 / 255); // 10.98…
    assert.equal(inversor.belowBreakEven, true);
    near(inversor.roi, (255 * 80) / 2800); // 7.286

    // @finanzasconlucia · fee 3.500€ → 44 necesarias (paridad drawer SAN-80) · CPA 21,7€
    assert.equal(lucia.postsLive, 2);
    assert.equal(lucia.clicks, 4_800);
    assert.equal(lucia.conversions, 161);
    assert.equal(lucia.conversionsNeeded, 44);
    near(lucia.cpaRealEur, 3500 / 161); // 21.74…
    assert.equal(lucia.belowBreakEven, true);
    near(lucia.roi, (161 * 80) / 3500); // 3.68
  });

  it("detalle de posts: live de la ventana + programados; sparkline suma los clicks", () => {
    const pau = report.creators[0];
    assert.equal(pau.posts.length, 5); // 4 live + 1 programado
    assert.equal(pau.posts.filter((p) => p.status === "scheduled").length, 1);
    assert.equal(pau.sparkline.length, REPORT_SPARKLINE_BUCKETS);
    assert.equal(
      pau.sparkline.reduce((sum, v) => sum + v, 0),
      12_400,
    );
  });

  it("feedback: deltas sugeridos por ROI relativo al programa (ajuste real = Fase 2)", () => {
    assert.deepEqual(
      report.feedback.deltas.map((d) => [d.handle, d.current, d.delta, d.next]),
      [
        ["@money_pau", 88, 2, 90],
        ["@elinversorprudente", 91, 3, 94],
        ["@finanzasconlucia", 87, -4, 83],
      ],
    );
    // La observación señala el mejor CPA del programa (@elinversorprudente · 11,0€).
    assert.ok(report.feedback.note?.includes("@elinversorprudente"));
    assert.ok(report.feedback.note?.includes("11,0€"));
    assert.ok(report.feedback.note?.includes("13,6€"));
  });
});

// ── Toggle 30 días ──────────────────────────────────────────────────────────

describe("creator report · ventana de 30 días", () => {
  const report = buildCreatorReport(DEAL_LEADS, SEED_RECORDS, { periodDays: 30, now: NOW });

  it("re-agrega solo los posts publicados en la ventana", () => {
    assert.equal(report.totals.postsLive, 4);
    assert.equal(report.totals.clicks, 10_400);
    assert.equal(report.totals.signups, 832);
    assert.equal(report.totals.kyc, 499);
    assert.equal(report.totals.conversions, 349);
    assert.equal(report.totals.investedEur, 11_300); // el fee del deal no se trocea
    near(report.totals.cpaRealEur, 11_300 / 349); // 32.38…
    assert.equal(report.totals.belowBreakEven, true);
    near(report.totals.roi, (349 * 80) / 11_300); // 2.47…
  });

  it("cambia los números por creator (lucia: 1 post · 2.300 clicks · 77 conv)", () => {
    const lucia = report.creators.find((c) => c.handle === "@finanzasconlucia");
    assert.ok(lucia);
    assert.equal(lucia.postsLive, 1);
    assert.equal(lucia.clicks, 2_300);
    assert.equal(lucia.signups, 184);
    assert.equal(lucia.kyc, 110);
    assert.equal(lucia.conversions, 77);
    near(lucia.cpaRealEur, 3500 / 77); // 45.45… — sigue < 80 → verde
    assert.equal(lucia.belowBreakEven, true);
    // Las necesarias no dependen de la ventana (fee/CAC del deal).
    assert.equal(lucia.conversionsNeeded, 44);
  });
});

// ── Edges ───────────────────────────────────────────────────────────────────

describe("creator report · reglas y edges", () => {
  it("declara tracking real, demo o ausente según los registros que sí emparejan con Yalc", () => {
    const unavailable = buildCreatorReport(DEAL_LEADS, [], { periodDays: 30, now: NOW });
    assert.deepEqual(unavailable.tracking, {
      status: "unavailable",
      sources: [],
      recordCount: 0,
    });

    const impact = {
      ...record("@money_pau", [{ daysAgo: 2, clicks: 0 }]),
      source: "impact" as const,
    };
    const real = buildCreatorReport(DEAL_LEADS, [impact], { periodDays: 30, now: NOW });
    assert.deepEqual(real.tracking, {
      status: "real",
      sources: ["impact"],
      recordCount: 1,
    });
  });

  it("omite registros sin lead en Yalc (el roster manda)", () => {
    const report = buildCreatorReport(
      [DEAL_LEADS[0]],
      [...SEED_RECORDS, record("@fantasma", [{ daysAgo: 3, clicks: 999, conversions: 9 }])],
      { periodDays: 90, now: NOW },
    );
    assert.deepEqual(
      report.creators.map((c) => c.handle),
      ["@money_pau"],
    );
  });

  it("un fee desconocido mantiene incompletos los totales; sin conversiones tampoco hay CPA", () => {
    const leads = [
      lead({ id: "l1", handle: "@sinfee", followers: 10_000, qualityScore: 70 }),
      lead({ id: "l2", handle: "@sintx", followers: 10_000, offeredPrice: 1000 }),
    ];
    const records = [
      record("@sinfee", [{ daysAgo: 2, clicks: 100, signups: 8, kyc: 5, conversions: 3 }]),
      record("@sintx", [{ daysAgo: 2, clicks: 50 }]),
    ];
    const report = buildCreatorReport(leads, records, { periodDays: 30, now: NOW });
    const sinFee = report.creators.find((c) => c.handle === "@sinfee");
    const sinTx = report.creators.find((c) => c.handle === "@sintx");
    assert.ok(sinFee && sinTx);
    assert.equal(sinFee.cpaRealEur, null);
    assert.equal(sinFee.belowBreakEven, null);
    assert.equal(sinFee.roi, null);
    assert.equal(sinFee.conversionsNeeded, null);
    assert.equal(sinTx.cpaRealEur, null); // 0 conversiones
    assert.equal(report.totals.investedEur, null);
    assert.equal(report.totals.totalCostEur, null);
    assert.equal(report.totals.cpaRealEur, null);
    assert.equal(report.totals.roi, null);
  });

  it("deal mixto: el CPA variable entra al coste real y a las necesarias", () => {
    const leads = [
      lead({
        id: "l-mixto",
        handle: "@mixto",
        followers: 50_000,
        offeredPrice: 2800,
        dealTerms: { structure: "mixto", variableCpaEur: 10 },
      }),
    ];
    const records = [record("@mixto", [{ daysAgo: 4, clicks: 4000, conversions: 100 }])];
    const report = buildCreatorReport(leads, records, { periodDays: 30, now: NOW });
    const row = report.creators[0];
    assert.equal(row.totalCostEur, 2800 + 10 * 100); // 3.800€
    near(row.cpaRealEur, 38);
    assert.equal(row.belowBreakEven, true);
    // necesarias = ceil(2800 / (80 − 10)) = 40 (calc-creator-core)
    assert.equal(row.conversionsNeeded, 40);
    near(row.roi, (100 * 80) / 3800); // 2.105…
  });

  it("CPA real por encima del CAC objetivo sale en rojo", () => {
    const leads = [lead({ id: "l-caro", handle: "@caro", followers: 5000, offeredPrice: 5000 })];
    const records = [record("@caro", [{ daysAgo: 1, clicks: 300, conversions: 10 }])];
    const report = buildCreatorReport(leads, records, { periodDays: 30, now: NOW });
    near(report.creators[0].cpaRealEur, 500);
    assert.equal(report.creators[0].belowBreakEven, false);
    assert.equal(report.totals.belowBreakEven, false);
  });

  it("los programados no computan en agregados pero sí aparecen en el detalle", () => {
    const leads = [lead({ id: "l-prog", handle: "@prog", followers: 5000, offeredPrice: 100 })];
    const records = [
      record("@prog", [
        { daysAgo: -5, status: "scheduled", clicks: 0 },
        { daysAgo: 40, clicks: 700, conversions: 7 }, // fuera de la ventana 30d
      ]),
    ];
    const report = buildCreatorReport(leads, records, { periodDays: 30, now: NOW });
    const row = report.creators[0];
    assert.equal(row.postsLive, 0);
    assert.equal(row.clicks, 0);
    assert.equal(row.cpaRealEur, null);
    assert.deepEqual(
      row.posts.map((p) => p.status),
      ["scheduled"],
    );
  });

  it("los seeds declaran el funnel coherente (signup 8% · KYC 60% · first_tx 70%)", () => {
    // Tolerancia ±2: los redondeos por post están calibrados para que los
    // TOTALES por creator cuadren exactos con el mockup en ambas ventanas.
    for (const creator of SEED_PERFORMANCE) {
      for (const post of creator.posts) {
        if (post.status === "scheduled") continue;
        assert.ok(
          Math.abs(post.signups - post.clicks * 0.08) <= 2,
          `${creator.handle}: signups ${post.signups} ≉ 8% de ${post.clicks}`,
        );
        assert.ok(
          Math.abs(post.kyc - post.signups * 0.6) <= 2,
          `${creator.handle}: kyc ${post.kyc} ≉ 60% de ${post.signups}`,
        );
        assert.ok(
          Math.abs(post.conversions - post.kyc * 0.7) <= 2,
          `${creator.handle}: conv ${post.conversions} ≉ 70% de ${post.kyc}`,
        );
      }
    }
  });
});
