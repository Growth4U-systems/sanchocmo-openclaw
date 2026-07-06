/**
 * Discoverability · SEO sub-tab — breakdowns (SAN-319 · PR6, slot ④).
 *
 * Pure/presentational. The exploration core of the surface ("indagar"): a sortable
 * table per dimension (Queries from GSC · Pages from GA4×GSC) with an inline bar in
 * the lead metric (Plausible-style), a Δposition chip, and a position-history
 * sparkline. The summary view (top rows); "Ver las N →" opens the full Explorador
 * (search · sort · filter · export) in the wired surface. Row click cross-filters
 * the whole surface (callback, wired later). Channels/Devices/Países = same table,
 * other dimension.
 */
import { useMemo, useState, type ReactNode } from "react";
import { DataChip } from "./rigor";

export type SeoQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  deltaPos: number; // >0 = moved up (improved), <0 = declined
  history?: number[]; // recent positions, oldest→newest (lower = better)
  intent?: string;
};
export type SeoPageRow = {
  page: string;
  visits: number;
  position: number | null;
  clicks: number | null;
  ctr: number | null;
  conversions: number;
  type?: string;
};

const fmtInt = (n: number) => n.toLocaleString("es-ES");
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k` : fmtInt(n));
const fmtDec = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;

/** Δposition chip: improving (moved up the SERP) is good → green. */
function DeltaPos({ delta }: { delta: number }) {
  if (!delta) return <span className="text-[var(--sc-fg-muted)]">•</span>;
  const up = delta > 0;
  return (
    <span className={"font-semibold " + (up ? "text-sage" : "text-destructive")}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {Math.abs(delta)}
    </span>
  );
}

/** Inverted position sparkline: a lower position = a taller bar (rank improving rises). */
function PosSparkline({ history }: { history?: number[] }) {
  if (!history || history.length < 2) return <span className="text-[var(--sc-fg-muted)]">—</span>;
  const max = Math.max(...history);
  const min = Math.min(...history);
  const span = max - min || 1;
  return (
    <span className="inline-flex h-5 items-end gap-[2px]" aria-hidden="true">
      {history.map((p, i) => (
        <i key={i} className="inline-block w-[3px] rounded-t-sm border border-b-0 border-ink bg-cyan" style={{ height: `${20 + ((max - p) / span) * 80}%` }} />
      ))}
    </span>
  );
}

type Col<T> = {
  key: string;
  label: string;
  align?: "right";
  render: (r: T) => ReactNode;
  sortVal: (r: T) => number | string;
  bar?: (r: T) => number; // 0..max → inline bar behind the value
};

function SortableTable<T>({
  cols,
  rows,
  rowKey,
  defaultSort,
  onRowClick,
}: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  defaultSort: { key: string; dir: 1 | -1 };
  onRowClick?: (r: T) => void;
}) {
  const [sort, setSort] = useState(defaultSort);
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortVal(a);
      const vb = col.sortVal(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb)) * sort.dir;
    });
  }, [rows, sort, cols]);
  const barCol = cols.find((c) => c.bar);
  const barMax = barCol ? Math.max(...rows.map((r) => barCol.bar!(r)), 1) : 1;

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          {cols.map((c) => (
            <th
              key={c.key}
              onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}
              className={"cursor-pointer select-none border-b-2 border-ink px-2 py-1.5 font-heading text-[10px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)] " + (c.align === "right" ? "text-right" : "text-left")}
            >
              {c.label}
              {sort.key === c.key && <span aria-hidden="true">{sort.dir === 1 ? " ↑" : " ↓"}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr
            key={rowKey(r)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={"border-b border-border " + (onRowClick ? "cursor-pointer hover:bg-[#fff7ea]" : "")}
          >
            {cols.map((c) => {
              const barPct = c.bar ? Math.round((c.bar(r) / barMax) * 100) : null;
              return (
                <td key={c.key} className={"relative px-2 py-2 align-middle " + (c.align === "right" ? "text-right" : "")}>
                  {barPct != null && <span aria-hidden="true" className="absolute inset-y-1 left-1 rounded-sm bg-[var(--sc-sage-100)]" style={{ width: `${barPct}%` }} />}
                  <span className="relative">{c.render(r)}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SeoBreakdown({
  queries,
  pages,
  totalQueries,
  totalPages,
  onRowClick,
  onSeeAll,
}: {
  queries: SeoQueryRow[];
  pages: SeoPageRow[];
  totalQueries?: number;
  totalPages?: number;
  onRowClick?: (dim: "queries" | "pages", key: string) => void;
  onSeeAll?: (dim: "queries" | "pages") => void;
}) {
  const [dim, setDim] = useState<"queries" | "pages">("queries");

  const queryCols: Col<SeoQueryRow>[] = [
    { key: "query", label: "Query", render: (r) => <span className="font-medium">{r.query}</span>, sortVal: (r) => r.query },
    { key: "clicks", label: "Clicks", align: "right", render: (r) => fmtInt(r.clicks), sortVal: (r) => r.clicks, bar: (r) => r.clicks },
    { key: "impressions", label: "Impr.", align: "right", render: (r) => fmtK(r.impressions), sortVal: (r) => r.impressions },
    { key: "ctr", label: "CTR", align: "right", render: (r) => fmtPct(r.ctr), sortVal: (r) => r.ctr },
    { key: "position", label: "Pos.", align: "right", render: (r) => fmtDec(r.position), sortVal: (r) => r.position },
    { key: "deltaPos", label: "Δ pos", align: "right", render: (r) => <DeltaPos delta={r.deltaPos} />, sortVal: (r) => r.deltaPos },
    { key: "history", label: "Histórico", align: "right", render: (r) => <PosSparkline history={r.history} />, sortVal: (r) => (r.history?.at(-1) ?? 0) },
  ];
  const pageCols: Col<SeoPageRow>[] = [
    { key: "page", label: "Página · blog post", render: (r) => <span className="font-medium">{r.page}</span>, sortVal: (r) => r.page },
    { key: "visits", label: "Visitas", align: "right", render: (r) => fmtInt(r.visits), sortVal: (r) => r.visits, bar: (r) => r.visits },
    { key: "position", label: "Posición", align: "right", render: (r) => (r.position == null ? "—" : fmtDec(r.position)), sortVal: (r) => r.position ?? 999 },
    { key: "clicks", label: "Clicks", align: "right", render: (r) => (r.clicks == null ? "—" : fmtInt(r.clicks)), sortVal: (r) => r.clicks ?? 0 },
    { key: "ctr", label: "CTR", align: "right", render: (r) => (r.ctr == null ? "—" : fmtPct(r.ctr)), sortVal: (r) => r.ctr ?? 0 },
    { key: "conversions", label: "Conv.", align: "right", render: (r) => fmtInt(r.conversions), sortVal: (r) => r.conversions },
  ];

  const total = dim === "queries" ? (totalQueries ?? queries.length) : (totalPages ?? pages.length);
  const tabBtn = (k: "queries" | "pages", label: string) => (
    <button
      type="button"
      onClick={() => setDim(k)}
      className={"rounded-sc-md border-2 border-ink px-2.5 py-1 font-heading text-[12px] font-bold shadow-pop-xs " + (dim === k ? "bg-rust text-white" : "bg-card text-[var(--sc-ink-soft)]")}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="Desgloses SEO" className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {tabBtn("queries", "🔎 Queries")}
          {tabBtn("pages", "📄 Páginas")}
        </div>
        <DataChip type="real" source={dim === "queries" ? "GSC" : "GA4 × GSC"} confidence="alta" />
      </div>

      <div className="overflow-x-auto rounded-sc-md border-2 border-ink bg-card shadow-pop-xs">
        {dim === "queries" ? (
          <SortableTable
            cols={queryCols}
            rows={queries}
            rowKey={(r) => r.query}
            defaultSort={{ key: "clicks", dir: -1 }}
            onRowClick={onRowClick ? (r) => onRowClick("queries", r.query) : undefined}
          />
        ) : (
          <SortableTable
            cols={pageCols}
            rows={pages}
            rowKey={(r) => r.page}
            defaultSort={{ key: "visits", dir: -1 }}
            onRowClick={onRowClick ? (r) => onRowClick("pages", r.page) : undefined}
          />
        )}
      </div>

      <button
        type="button"
        onClick={onSeeAll ? () => onSeeAll(dim) : undefined}
        className="mt-2 font-heading text-[12px] font-bold text-rust underline"
      >
        Ver las {fmtInt(total)} {dim === "queries" ? "queries" : "páginas"} → buscar · ordenar · filtrar · exportar
      </button>
      <p className="mt-1 text-[11px] text-[var(--sc-fg-muted)]">
        Cada fila filtra toda la surface · ↗ abre el detalle · «Canales / Dispositivos / Países» = misma tabla, otra dimensión.
      </p>
    </section>
  );
}
