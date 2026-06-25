/**
 * Discoverability · AI sub-tab — Share-of-Voice trend (SAN-319 · PR6, slot ③).
 *
 * Pure/presentational multi-line SVG: your SoV vs competitors over time (0–100%).
 * All `seed` (no AEO source yet). Inline SVG — no chart lib.
 */
const STROKE = { rust: "var(--rust)", navy: "var(--navy)", cyan: "var(--cyan)" } as const;
const DOT = { rust: "bg-rust", navy: "bg-navy", cyan: "bg-[var(--cyan)]" } as const;

export type SovLine = { label: string; color: keyof typeof STROKE; points: number[] };

export function SovTrend({ lines }: { lines: SovLine[] }) {
  const n = Math.max(...lines.map((l) => l.points.length), 0);
  if (n < 2) return null;
  const W = 720;
  const H = 150;
  const pad = 14;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const bottom = H - pad;
  const max = Math.max(...lines.flatMap((l) => l.points), 1) * 1.15;
  const cx = (i: number) => pad + (innerW * i) / (n - 1);
  const cy = (v: number) => bottom - (v / max) * innerH;

  return (
    <div className="mt-3">
      <div className="mb-1 flex flex-wrap items-center gap-3 text-[10.5px] font-bold text-[var(--sc-fg-muted)]">
        {lines.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1">
            <i className={"inline-block h-[3px] w-4 rounded-full " + DOT[l.color]} />
            {l.label} {l.points.at(-1)}%
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Tendencia de Share of Voice">
        {lines.map((l) => {
          const d = l.points.map((p, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${cy(p).toFixed(1)}`).join(" ");
          return (
            <g key={l.label}>
              <path d={d} fill="none" stroke={STROKE[l.color]} strokeWidth={2.2} strokeLinejoin="round" />
              {l.points.map((p, i) => <circle key={i} cx={cx(i)} cy={cy(p)} r={2.4} fill="#FDF8EF" stroke={STROKE[l.color]} strokeWidth={1.5} />)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
