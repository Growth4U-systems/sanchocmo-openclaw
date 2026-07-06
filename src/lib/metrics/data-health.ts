/**
 * Salud de dato — insight mapper (SAN-319 · PR8).
 *
 * Turns getMetricsHealth() output into the callout list the *Salud de dato* view
 * renders (via `DataQualityInsight`). The cross-cutting quality story lives ONLY here;
 * each surface merely links in via its `DataHealthBadge`. Pure — no DB, no source
 * mutation. The input is a structural subset of `MetricsHealthResult` (kept local so
 * the lib doesn't depend on the server `data/metrics.ts`).
 */

/** Matches `DataQualityInsight`'s props (kept structural to avoid a lib→component dep). */
export interface DataQualityInsightData {
  title: string;
  body: string;
  severity: "high" | "warn";
  owner?: string;
}

export interface HealthSource {
  source: string;
  enabled: boolean;
  knownDirty: boolean;
  dirtyReason?: string;
  lastMetricDate: string | null;
  overdue: boolean;
}

export interface HealthInput {
  configured: boolean;
  sources: HealthSource[];
  cron: { degraded: boolean; reasons: string[] };
}

export function buildDataQualityInsights(health: HealthInput | null | undefined): DataQualityInsightData[] {
  if (!health || !health.configured) return [];
  const out: DataQualityInsightData[] = [];

  // 1. Known-dirty sources (source-specific provider anomalies) → critical.
  for (const s of health.sources) {
    if (s.knownDirty) {
      out.push({
        severity: "high",
        title: `${s.source.toUpperCase()} — dato inflado / poco fiable`,
        body: s.dirtyReason || "Fuente conocida-sucia: no usar como cifra exacta.",
        owner: s.source,
      });
    }
  }

  // 2. Connected ≠ collected — configured but never/stale-collected.
  const notCollected = health.sources
    .filter((s) => s.enabled && (s.lastMetricDate === null || s.overdue))
    .map((s) => s.source);
  if (notCollected.length) {
    out.push({
      severity: "warn",
      title: "Conectado ≠ recolectado",
      body: `Conectadas pero sin filas recientes en metric_snapshots: ${notCollected.join(", ")}. Desbloquear el colector.`,
      owner: "colector · pipeline",
    });
  }

  // 3. Collector cron degraded.
  if (health.cron?.degraded) {
    out.push({
      severity: "warn",
      title: "Colector degradado",
      body: `El cron de recolección está degradado: ${health.cron.reasons?.join("; ") || "sin detalle"}.`,
      owner: "colector · pipeline",
    });
  }

  return out;
}

/** A known audit finding, optionally gated to clients that use a given source. */
export interface KnownAuditInsight extends DataQualityInsightData {
  /** Only surface when this source is connected for the client (omit = always). */
  appliesToSource?: string;
}

/**
 * Known instrumentation-audit findings NOT derivable from getMetricsHealth() (webhook /
 * instrumentation gaps). Gated by `appliesToSource` so a client only sees a finding for a
 * source it actually uses (SAN-324) — appended to the derived insights in Salud de dato.
 */
export const KNOWN_AUDIT_INSIGHTS: KnownAuditInsight[] = [
  {
    severity: "high",
    title: "appointment_attended no se emite",
    body: "El webhook de check-in de Koibox no manda el evento → el funnel cita→paciente es inmedible. Fix: instrumentar el evento.",
    owner: "Koibox · instrumentación",
    appliesToSource: "koibox",
  },
];
