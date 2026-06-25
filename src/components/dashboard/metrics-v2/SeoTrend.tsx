/**
 * Discoverability · SEO sub-tab — hero trend (SAN-319 · PR6, slot ③).
 *
 * Pure/presentational dual-axis SVG (mirrors the Paid `PaidTrend` house pattern):
 * clicks = bars (rust, left axis), impressions = line (navy, right axis). Both come
 * from GSC — the surface's own source. CTR / position toggles live in the wired
 * surface (activated from the KPI cards), so this component keeps the two default
 * series. Inline SVG — no chart lib (visx is reserved for later complex charts).
 */
export function SeoTrend({ series }: { series: { date: string; clicks: number; impressions: number }[] }) {
  if (series.length < 2) return null;
  const W = 720;
  const H = 150;
  const pad = 14;
  const n = series.length;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const bottom = H - pad;
  const cmax = Math.max(...series.map((d) => d.clicks), 1) * 1.1;
  const imps = series.map((d) => d.impressions).filter((v) => v > 0);
  const imin = imps.length ? Math.min(...imps) * 0.9 : 0;
  const imax = imps.length ? Math.max(...imps) * 1.1 : 1;
  const cx = (i: number) => pad + innerW * ((i + 0.5) / n);
  const yImp = (v: number) => bottom - (imax > imin ? (v - imin) / (imax - imin) : 0.5) * innerH;
  const bw = (innerW / n) * 0.55;
  const pts = series.map((d, i) => ({ x: cx(i), y: yImp(d.impressions), ok: d.impressions > 0 })).filter((p) => p.ok);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-3 text-[10.5px] font-bold text-[var(--sc-fg-muted)]">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2 rounded-sm border border-ink bg-rust" />Clicks</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-[3px] w-4 rounded-full bg-navy" />Impresiones</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Tendencia de clicks e impresiones">
        {series.map((d, i) => {
          const h = (d.clicks / cmax) * innerH;
          return <rect key={i} x={cx(i) - bw / 2} y={bottom - h} width={bw} height={h} fill="var(--rust)" stroke="var(--ink)" strokeWidth={1} />;
        })}
        {line && <path d={line} fill="none" stroke="var(--navy)" strokeWidth={2.2} strokeLinejoin="round" />}
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="#FDF8EF" stroke="var(--navy)" strokeWidth={1.6} />)}
      </svg>
    </div>
  );
}
