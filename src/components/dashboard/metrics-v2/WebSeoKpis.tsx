/**
 * Discoverability · SEO sub-tab — KPI scorecards (SAN-319 · PR6).
 *
 * Pure/presentational: the parent (`metrics.tsx` wiring) reads the surface's OWN
 * sources — GA4 (traffic) · GSC (rankings) · PageSpeed (Core Web Vitals) — and
 * passes the scorecards in. These are observed metrics, not attributed. The
 * cross-source story (web → cita → pago) is NOT here — it lives in Atribución
 * (PR7). When a credential is present but no rows have landed yet, the surface
 * shows the connected-without-data state until a fresh collect lands.
 */
import { ConnectionState, DataChip, ProvenanceFooter } from "./rigor";

export type WebSeoKpi = {
  label: string;
  /** Pre-formatted display value (locale-formatted by the caller), e.g. "4.820", "11,8", "2,5%". */
  value: string;
  /** Optional secondary line under the value, e.g. "74 móvil" for Core Web Vitals. */
  hint?: string;
  /** Pre-formatted delta vs the previous period, e.g. "+19%", "−1,2", "+0,3pp". */
  delta?: string;
  /** GOOD/BAD direction of the delta (decided by the caller — e.g. a falling avg position is `up`). */
  dir?: "up" | "down" | "flat";
  /** Which own-source the number comes from. */
  source: "GSC" | "GA4" | "PageSpeed";
  /** Highlight the health KPI (Core Web Vitals) with a leading accent. */
  health?: boolean;
};

const DIR = {
  up: { glyph: "▲", cls: "text-sage" },
  down: { glyph: "▼", cls: "text-destructive" },
  flat: { glyph: "•", cls: "text-[var(--sc-fg-muted)]" },
} as const;

export function WebSeoKpis({
  kpis,
  state = "collecting",
  sources = ["GA4", "GSC", "PageSpeed"],
  client,
  period,
  lastCollected,
}: {
  kpis: WebSeoKpi[];
  state?: "off" | "partial" | "connected_pending" | "collecting";
  sources?: string[];
  client?: string;
  period?: string;
  lastCollected?: string;
}) {
  return (
    <section aria-label="Discoverability · SEO">
      {/* ① header — sources + connection state */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-navy">
            <span aria-hidden="true">{"🔍"}</span> Discoverability
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-fg-muted)]">SEO</span>
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--sc-fg-muted)]">Search · ¿me encuentran? — {sources.join(" · ")}</p>
        </div>
        <ConnectionState state={state} />
      </header>

      {/* ② KPI scorecards */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => {
          const dir = k.dir ? DIR[k.dir] : null;
          return (
            <div
              key={k.label}
              className={
                "rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-3 shadow-pop-xs" +
                (k.health ? " border-l-[5px] border-l-[var(--cyan)]" : "")
              }
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">{k.label}</span>
                <DataChip type="real" source={k.source} confidence="alta" />
              </div>
              <div className="mt-1.5 font-heading text-[22px] font-bold leading-none text-navy">{k.value}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                {dir && (
                  <span className={"font-semibold " + dir.cls}>
                    <span aria-hidden="true">{dir.glyph}</span> {k.delta}
                  </span>
                )}
                {k.hint && <span className="text-[var(--sc-fg-muted)]">{k.hint}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <ProvenanceFooter source={sources.join(" · ")} client={client} period={period} lastCollected={lastCollected} />
    </section>
  );
}
