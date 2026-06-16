/**
 * Performance fake del programa Monzo (SAN-81) — espejo de reporting.html.
 *
 * Posts de los 3 creators con deal (@money_pau · @elinversorprudente ·
 * @finanzasconlucia) calibrados para que `buildCreatorReport` reproduzca los
 * KPIs del mockup a 90 días:
 *
 *   Invertido 11.300€ · 9 posts live · 24.800 clicks · 1.984 signups ·
 *   1.190 KYC · 833 first_tx · CPA real 13,6€ (< CAC 80€) · ROI 5,9×
 *
 * Por creator (90d):
 *   @money_pau          4 posts · 12.400 · 992 · 595 · 417 → CPA 12,0€ · ROI 6,7×
 *   @elinversorprudente 3 posts ·  7.600 · 608 · 365 · 255 → CPA 11,0€ · ROI 7,3×
 *   @finanzasconlucia   2 posts ·  4.800 · 384 · 230 · 161 → CPA 21,7€ · ROI 3,7×
 *
 * A 30 días (posts con daysAgo ≤ 30):
 *   TOTAL 4 posts · 10.400 · 832 · 499 · 349 → CPA 32,4€ · ROI 2,5×
 *
 * Funnel coherente con la nota del mockup: click→signup 8% · signup→KYC 60%
 * · KYC→first_tx 70% (redondeos por post).
 *
 * Divergencia documentada vs mockup: el mockup hardcodea DOS datasets (30/90)
 * con clicks parciales por ventana; el modelo real es por-post con métricas
 * acumuladas y la ventana filtra por FECHA de publicación (lo que hará
 * Impact en Fase 2). Los agregados de cabecera del mockup se reproducen
 * exactos; el reparto por post de la vista 30d difiere por diseño.
 *
 * Las fechas son RELATIVAS (daysAgo) y se materializan al sembrar/testear,
 * así la demo cae siempre en las ventanas correctas. daysAgo negativo =
 * post programado (futuro).
 *
 * CLIENT-SAFE: datos + materialización pura.
 */

import type { CreatorPerformancePost, CreatorPerformanceRecord } from "./creator-report";

export interface SeedPerformancePost {
  /** Días hacia atrás desde `now` (negativo = programado a futuro). */
  daysAgo: number;
  format: string;
  title: string;
  status?: "live" | "scheduled";
  clicks: number;
  signups: number;
  kyc: number;
  conversions: number;
}

export interface SeedPerformanceCreator {
  handle: string;
  posts: SeedPerformancePost[];
}

export const SEED_PERFORMANCE: readonly SeedPerformanceCreator[] = [
  {
    handle: "@money_pau",
    posts: [
      {
        daysAgo: 62,
        format: "Video TikTok",
        title: "“Mi banco me cobra 0€ — te explico el truco”",
        clicks: 4100,
        signups: 328,
        kyc: 196,
        conversions: 138,
      },
      {
        daysAgo: 38,
        format: "Video TikTok",
        title: "“Cuánto pierdes al año en comisiones bancarias”",
        clicks: 3100,
        signups: 248,
        kyc: 149,
        conversions: 104,
      },
      {
        daysAgo: 9,
        format: "Video TikTok",
        title: "“3 apps que uso para no fundirme el sueldo”",
        clicks: 3100,
        signups: 248,
        kyc: 150,
        conversions: 104,
      },
      {
        daysAgo: 2,
        format: "Live + clip",
        title: "“Pregúntame sobre bancos sin comisiones”",
        clicks: 2100,
        signups: 168,
        kyc: 100,
        conversions: 71,
      },
      {
        daysAgo: -9,
        format: "Video TikTok",
        title: "Siguiente entrega",
        status: "scheduled",
        clicks: 0,
        signups: 0,
        kyc: 0,
        conversions: 0,
      },
    ],
  },
  {
    handle: "@elinversorprudente",
    posts: [
      {
        daysAgo: 44,
        format: "Integración 90s",
        title: "“Cómo organizo mis cuentas en 2026”",
        clicks: 3400,
        signups: 272,
        kyc: 163,
        conversions: 114,
      },
      {
        daysAgo: 34,
        format: "Short",
        title: "“El KYC más rápido que he hecho”",
        clicks: 1300,
        signups: 104,
        kyc: 63,
        conversions: 44,
      },
      {
        daysAgo: 5,
        format: "Video dedicado",
        title: "“Probé Monzo 30 días — opinión honesta”",
        clicks: 2900,
        signups: 232,
        kyc: 139,
        conversions: 97,
      },
      {
        daysAgo: -14,
        format: "Integración",
        title: "Siguiente integración",
        status: "scheduled",
        clicks: 0,
        signups: 0,
        kyc: 0,
        conversions: 0,
      },
    ],
  },
  {
    handle: "@finanzasconlucia",
    posts: [
      {
        daysAgo: 36,
        format: "Reel",
        title: "“Lo que nadie te cuenta de las comisiones”",
        clicks: 2500,
        signups: 200,
        kyc: 120,
        conversions: 84,
      },
      {
        daysAgo: 6,
        format: "Carrusel",
        title: "“Mi setup de finanzas personales (5 slides)”",
        clicks: 2300,
        signups: 184,
        kyc: 110,
        conversions: 77,
      },
      {
        daysAgo: -7,
        format: "Stories (pack 3)",
        title: "Pack de stories",
        status: "scheduled",
        clicks: 0,
        signups: 0,
        kyc: 0,
        conversions: 0,
      },
    ],
  },
];

function slugifyHandle(handle: string): string {
  return handle.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]+/g, "-");
}

/** Materializa los seeds relativos en registros con fechas ISO absolutas. */
export function materializePerformanceSeeds(now: Date = new Date()): CreatorPerformanceRecord[] {
  const nowMs = now.getTime();
  return SEED_PERFORMANCE.map((creator) => ({
    handle: creator.handle,
    source: "seed" as const,
    updatedAt: now.toISOString(),
    posts: creator.posts.map((post, index): CreatorPerformancePost => ({
      id: `${slugifyHandle(creator.handle)}-${index + 1}`,
      date: new Date(nowMs - post.daysAgo * 86_400_000).toISOString().slice(0, 10),
      format: post.format,
      title: post.title,
      status: post.status ?? "live",
      clicks: post.clicks,
      signups: post.signups,
      kyc: post.kyc,
      conversions: post.conversions,
    })),
  }));
}
