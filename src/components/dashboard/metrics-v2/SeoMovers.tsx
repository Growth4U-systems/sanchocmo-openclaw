/**
 * Discoverability · SEO movers (SAN-319 · PR6, slot ⑤).
 *
 * Pure/presentational. Two columns of ranking movement (GSC, period-over-period):
 * queries climbing / newly appearing vs declining / dropped out of the top 100.
 * Own-source, Real. The "why" (Intelligence) is the ⑧ bridge, not here.
 */
import { PILL_BASE } from "./rigor";

export type SeoMover = {
  query: string;
  from?: number; // previous position (omit for a brand-new ranking)
  to: number; // current position
  tag?: "new" | "lost";
};

function Move({ m, kind }: { m: SeoMover; kind: "up" | "down" }) {
  const delta = m.from != null ? m.from - m.to : null; // >0 = improved (moved up the SERP)
  const up = kind === "up";
  return (
    <li className="flex items-center justify-between gap-2 border-b border-border py-1.5 last:border-b-0 text-[12px]">
      <span className="flex min-w-0 items-center gap-1.5">
        {m.tag === "new" && <span className={PILL_BASE + " bg-[var(--sc-sage-100)] text-sage"}>nueva</span>}
        {m.tag === "lost" && <span className={PILL_BASE + " bg-[var(--sc-brick-bg)] text-destructive"}>perdida</span>}
        <span className="truncate font-medium" title={m.query}>{m.query}</span>
      </span>
      <span className={"shrink-0 font-semibold " + (up ? "text-sage" : "text-destructive")}>
        {m.tag === "lost" ? (
          "salió top 100"
        ) : m.from == null ? (
          <>#{m.to}</>
        ) : (
          <>
            #{m.from} → #{m.to}{" "}
            <span aria-hidden="true">{up ? "▲" : "▼"}</span>
            {delta != null ? Math.abs(delta) : null}
          </>
        )}
      </span>
    </li>
  );
}

export function SeoMovers({ up, down }: { up: SeoMover[]; down: SeoMover[] }) {
  return (
    <section aria-label="Movimientos SEO" className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
        <h4 className="mb-1.5 font-heading text-[13px] font-bold text-sage"><span aria-hidden="true">{"📈"}</span> Suben · nuevas</h4>
        <ul>{up.map((m) => <Move key={m.query} m={m} kind="up" />)}</ul>
      </div>
      <div className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
        <h4 className="mb-1.5 font-heading text-[13px] font-bold text-destructive"><span aria-hidden="true">{"📉"}</span> Bajan · perdidas</h4>
        <ul>{down.map((m) => <Move key={m.query} m={m} kind="down" />)}</ul>
      </div>
    </section>
  );
}
