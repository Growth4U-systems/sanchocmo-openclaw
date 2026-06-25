/**
 * Shared number formatters for the metrics-v2 surfaces (SAN-324).
 *
 * Centralizes the formatters that were copy-pasted across surface components
 * (`AttributionFunnel`, `PipelineKpis`, `ProductFunnel`). Non-finite inputs render as
 * an em dash so `Infinity`/`NaN` never leak into the UI.
 */

/** Locale-grouped integer (default locale). */
export const fmt = (v: number) => v.toLocaleString();

/** Rounded integer in es-ES; non-finite → "—". */
export const fmtInt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("es-ES") : "—");

/** Rounded € in es-ES; non-finite → "—". */
export const eur = (n: number) => (Number.isFinite(n) ? `€${Math.round(n).toLocaleString("es-ES")}` : "—");

/** Percentage with 1 decimal; non-finite → "—". */
export const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—");
