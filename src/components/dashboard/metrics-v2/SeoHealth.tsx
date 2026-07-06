/**
 * Discoverability · SEO health (SAN-319 · PR6, slot ⑥ — the surface-specific slot).
 *
 * Pure/presentational. Two own-source panels:
 *  - Core Web Vitals (PageSpeed): LCP / CLS / INP as good→needs-improvement→poor
 *    threshold bars with a marker at the current value + the PageSpeed score chips.
 *  - Position distribution (GSC): how many keywords rank in Top 1-3 / 4-10 / 11-50 /
 *    51-100 — the leading "am I climbing?" signal.
 * Both are observed own-source panels. No cross-source here.
 */
import { DataChip } from "./rigor";

export type SeoCwv = { lcp: number; cls: number; inp: number };
export type SeoScores = { mobile: number; desktop: number; seo: number };
export type SeoPositionBucket = { bucket: string; count: number };

const CWV = [
  { key: "lcp" as const, label: "LCP", good: 2.5, ni: 4.0, max: 5.0, fmt: (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}s` },
  { key: "cls" as const, label: "CLS", good: 0.1, ni: 0.25, max: 0.4, fmt: (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 }) },
  { key: "inp" as const, label: "INP", good: 200, ni: 500, max: 700, fmt: (v: number) => `${Math.round(v)}ms` },
];
const DIST_COLORS = ["bg-sage", "bg-[var(--cyan)]", "bg-[var(--yellow)]", "bg-aged"];

function scoreCls(v: number) {
  return v >= 90 ? "text-sage" : v >= 50 ? "text-ink" : "text-destructive";
}

export function SeoHealth({
  cwv,
  scores,
  positionDist,
  totalKeywords,
}: {
  cwv: SeoCwv;
  scores: SeoScores;
  positionDist: SeoPositionBucket[];
  totalKeywords?: number;
}) {
  const passes = CWV.every((m) => cwv[m.key] <= m.good);
  const distMax = Math.max(...positionDist.map((b) => b.count), 1);
  const total = totalKeywords ?? positionDist.reduce((s, b) => s + b.count, 0);

  return (
    <section aria-label="Salud SEO" className="mt-4 grid gap-4 sm:grid-cols-2">
      {/* Core Web Vitals */}
      <div className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-heading text-[13px] font-bold text-navy">Core Web Vitals · móvil</h4>
          <span className={"font-heading text-[11px] font-bold " + (passes ? "text-sage" : "text-destructive")}>
            {passes ? "✓ Pasa" : "✗ Mejorar"}
          </span>
        </div>
        <div className="space-y-2.5">
          {CWV.map((m) => {
            const v = cwv[m.key];
            const pct = (x: number) => Math.max(0, Math.min(100, (x / m.max) * 100));
            const pass = v <= m.good;
            return (
              <div key={m.key}>
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold">{m.label}</span>
                  <span className={pass ? "text-sage" : "text-destructive"}>{m.fmt(v)}</span>
                </div>
                <div className="relative mt-1 h-2.5 overflow-hidden rounded-sc-pill border border-ink bg-aged">
                  <span className="absolute inset-y-0 left-0 bg-sage" style={{ width: `${pct(m.good)}%` }} />
                  <span className="absolute inset-y-0 bg-[var(--yellow)]" style={{ left: `${pct(m.good)}%`, width: `${pct(m.ni) - pct(m.good)}%` }} />
                  <span className="absolute inset-y-0 right-0 bg-destructive" style={{ left: `${pct(m.ni)}%` }} />
                  <span aria-hidden="true" className="absolute inset-y-[-2px] w-[2px] bg-ink" style={{ left: `${pct(v)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-2 text-[12px]">
          {([["móvil", scores.mobile], ["escritorio", scores.desktop], ["SEO", scores.seo]] as const).map(([label, v]) => (
            <span key={label} className="inline-flex items-baseline gap-1">
              <b className={"font-heading text-[16px] " + scoreCls(v)}>{v}</b>
              <span className="text-[10px] uppercase text-[var(--sc-fg-muted)]">{label}</span>
            </span>
          ))}
          <span className="ml-auto"><DataChip type="real" source="PageSpeed" confidence="alta" /></span>
        </div>
      </div>

      {/* Position distribution */}
      <div className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-heading text-[13px] font-bold text-navy">Distribución de posiciones</h4>
          <span className="text-[10px] uppercase text-[var(--sc-fg-muted)]">{total.toLocaleString("es-ES")} keywords</span>
        </div>
        <div className="space-y-2">
          {positionDist.map((b, i) => (
            <div key={b.bucket} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] font-semibold">{b.bucket}</span>
              <span className="h-3.5 flex-1 overflow-hidden rounded-sc-pill border border-ink bg-aged">
                <i className={"block h-full border-r border-ink " + DIST_COLORS[i % DIST_COLORS.length]} style={{ width: `${Math.round((b.count / distMax) * 100)}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right text-[12px] font-bold">{b.count}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-border pt-2 text-right">
          <DataChip type="real" source="GSC" confidence="alta" />
        </div>
      </div>
    </section>
  );
}
