/**
 * Surface model for Métricas v2 (SAN-264).
 *
 * Maps the metric sources collected into `metric_snapshots` onto the 8 canonical
 * "surfaces" (systems / assets) shown in the dashboard, plus each surface's
 * connection requirements. This is SYSTEM knowledge — stable across clients;
 * what a client actually MEASURES comes from its metrics-plan / dashboard
 * definition, not from here. A surface is "live" once it has ≥1 connected
 * source; otherwise the UI renders a "Conectar →" CTA (graceful degradation).
 */

export type SurfaceKey =
  | "reputation"
  | "web"
  | "product"
  | "pipeline"
  | "paid"
  | "email"
  | "social"
  | "partnerships";

export interface SurfaceRequirements {
  /** All of these must be connected. */
  mandatory: string[];
  /** At least one of these must be connected. */
  oneOf: string[];
  /** Optional — improves the surface but not required to light it up. */
  optional: string[];
}

export interface SurfaceDef {
  key: SurfaceKey;
  name: string;
  emoji: string;
  /** PRJ_CHANNELS value this surface relates to. */
  channel: string;
  what: string;
  /** `metric_snapshots.source` values that feed this surface. */
  sources: string[];
  /** Metric name that carries spend, when applicable (for CPL/CPA). */
  spendMetric: string | null;
  requires: SurfaceRequirements;
  how: string;
}

export const SURFACES: SurfaceDef[] = [
  {
    key: "reputation",
    name: "Reputation",
    emoji: "🛡️",
    channel: "intelligence",
    what: "Reputación y confianza: Trust Score, 6 pilares, gap vs competidores.",
    sources: ["trust_score"],
    spendMetric: null,
    requires: { mandatory: ["Trust Engine corre sobre el dominio"], oneOf: [], optional: ["Competidores fijados"] },
    how: "Automático — se enciende cuando el Trust Engine corre en el kickoff. Nada que conectar.",
  },
  {
    key: "web",
    name: "Web & SEO",
    emoji: "🌐",
    channel: "web",
    what: "Visitas, qué queries rankean, velocidad del sitio.",
    sources: ["ga4", "gsc", "pagespeed"],
    spendMetric: null,
    requires: { mandatory: ["Google Search Console"], oneOf: ["Google Analytics 4", "PostHog"], optional: ["PageSpeed (auto, solo URL)"] },
    how: "Ajustes › APIs: autoriza el Service Account del sistema en GSC + GA4. PageSpeed solo necesita la URL.",
  },
  {
    key: "product",
    name: "Product",
    emoji: "🧪",
    channel: "web",
    what: "Activación, dropoff por paso, heatmaps, grabaciones de sesión.",
    sources: ["posthog"],
    spendMetric: null,
    requires: { mandatory: [], oneOf: ["PostHog", "Eventos GA4 (fallback)"], optional: ["Session recordings", "Feature flags"] },
    how: "Ajustes › APIs: PostHog project id + API key.",
  },
  {
    key: "pipeline",
    name: "Pipeline / CRM",
    emoji: "📇",
    channel: "prospecting",
    what: "Leads, citas, etapas de pipeline y valor.",
    sources: ["ghl", "hubspot", "pipedrive"],
    spendMetric: null,
    requires: { mandatory: [], oneOf: ["GoHighLevel", "HubSpot", "Pipedrive"], optional: ["Mapping de etapas"] },
    how: "Ajustes › APIs: API key del CRM + locationId; mapear etapas.",
  },
  {
    key: "paid",
    name: "Paid",
    emoji: "💰",
    channel: "paid-ads",
    what: "Inversión, CTR, CPC, CPL por campaña.",
    sources: ["meta-ads", "google_ads", "linkedin_ads"],
    spendMetric: "spend",
    requires: { mandatory: [], oneOf: ["Meta Ads", "Google Ads", "LinkedIn Ads"], optional: [] },
    how: "Ajustes › APIs: token + accountId de cada plataforma de ads.",
  },
  {
    key: "email",
    name: "Email / Outbound",
    emoji: "📧",
    channel: "email",
    what: "Enviados, aperturas, replies, reuniones agendadas.",
    sources: ["instantly", "lemlist"],
    spendMetric: null,
    requires: { mandatory: [], oneOf: ["Instantly", "Lemlist"], optional: [] },
    how: "Ajustes › APIs: API key de la herramienta de cold email.",
  },
  {
    key: "social",
    name: "Social",
    emoji: "📱",
    channel: "social",
    what: "Posts, impresiones y engagement por red.",
    sources: ["metricool"],
    spendMetric: null,
    requires: { mandatory: ["Metricool"], oneOf: [], optional: ["Multi-cuenta por marca (SAN-162)"] },
    how: "Ajustes › APIs: token de Metricool + blogId.",
  },
  {
    key: "partnerships",
    name: "Partnerships",
    emoji: "🤝",
    channel: "partnerships",
    what: "Creators, clicks, signups, CPA vs target, ROI.",
    sources: ["yalc", "creators"],
    spendMetric: "invested",
    requires: { mandatory: ["Reporting de creators activo"], oneOf: [], optional: [] },
    how: "Se alimenta del módulo de Partnerships/Yalc ya existente — sin conexión externa.",
  },
];

/** Source ids that MUST be connected for a surface to be fully "on" (drives the
 *  3-state Conexiones badge). Surfaces absent here are "on" as soon as they have
 *  any connected source (they are oneOf / single-source). */
export const SURFACE_MANDATORY_SOURCES: Partial<Record<SurfaceKey, string[]>> = {
  reputation: ["trust_score"],
  web: ["gsc"],
  social: ["metricool"],
  partnerships: ["yalc", "creators"], // any one of these counts (see surfaceConnState)
};

export const SURFACE_BY_SOURCE: Record<string, SurfaceKey> = (() => {
  const map: Record<string, SurfaceKey> = {};
  for (const surface of SURFACES) {
    for (const source of surface.sources) map[source] = surface.key;
  }
  return map;
})();

export function surfaceForSource(source: string): SurfaceKey | null {
  return SURFACE_BY_SOURCE[source] ?? null;
}

export function getSurface(key: SurfaceKey): SurfaceDef | undefined {
  return SURFACES.find((surface) => surface.key === key);
}
