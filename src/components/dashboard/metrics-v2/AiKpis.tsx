/**
 * Discoverability · AI sub-tab — KPI scorecards (SAN-319 · PR6, slots ①②).
 *
 * Pure/presentational. The AI (GEO/AEO) sub-tab measures visibility in AI answers
 * (share of voice, citations, engines). There is NO real source yet → every number
 * is `seed` and the header shows `connected_pending` ("conecta Profound / Peec /
 * scraper interno"). Defines the shape a future AEO adapter will fill (source=aeo).
 */
import { ConnectionState, DataChip } from "./rigor";

export type AiKpi = {
  label: string;
  value: string;
  hint?: string;
  delta?: string;
  dir?: "up" | "down" | "flat";
  health?: boolean;
};

const DIR = {
  up: { glyph: "▲", cls: "text-sage" },
  down: { glyph: "▼", cls: "text-destructive" },
  flat: { glyph: "•", cls: "text-[var(--sc-fg-muted)]" },
} as const;

export function AiKpis({
  kpis,
  state = "connected_pending",
}: {
  kpis: AiKpi[];
  state?: "off" | "partial" | "connected_pending" | "collecting";
}) {
  return (
    <section aria-label="Discoverability · AI">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-navy">
            <span aria-hidden="true">{"🔍"}</span> Discoverability
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--sc-fg-muted)]">AI</span>
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--sc-fg-muted)]">Visibilidad en respuestas IA — conecta Profound / Peec / scraper interno</p>
        </div>
        <ConnectionState state={state} />
      </header>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => {
          const dir = k.dir ? DIR[k.dir] : null;
          return (
            <div
              key={k.label}
              className={"rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-3 shadow-pop-xs" + (k.health ? " border-l-[5px] border-l-[var(--cyan)]" : "")}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">{k.label}</span>
                <DataChip type="seed" source="IA" />
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
    </section>
  );
}
