/**
 * AttributionFunnel (SAN-319 · PR7 component) — the cross-source channel→cita→pago
 * table for the *Atribución* view.
 *
 * Presentational only. It renders the rows it's handed; the cross-source JOIN
 * (Paid channel/UTM × Koibox cita × Stripe pago) and the dedup-by-`koibox_appointment_id`
 * happen in the data layer, never here. Surfaces stay pure — this is the ONE place the
 * sources cross, so it makes the Koibox truth-source + dedup provenance explicit.
 * Style matches `./index.tsx`.
 */
import { DataChip } from "./rigor";
import { DataTable, Panel } from "./index";
import { fmtInt, eur, pct } from "@/lib/metrics/format";

export interface AttributionRow {
  /** Acquisition channel (e.g. "Meta Ads", "Google Ads", "Orgánico"). */
  channel: string;
  /** Sessions/visits attributed to the channel. */
  visits: number;
  /** Citas — deduped by `koibox_appointment_id` (the truth-source). */
  conversions: number;
  /** Conversion ratio (0..1) — visit→cita. */
  convRate: number;
  /** Ad spend for the channel (€). */
  spend: number;
  /** Cost per cita (€) = spend / conversions; non-finite when conversions = 0. */
  cpa: number;
}

/** One interpretation layer under the table (Bruto / Corregido / Lectura / Decisión). */
export interface AttributionLayer {
  label: string;
  text: string;
}

export function AttributionFunnel({
  rows,
  truthSource,
  rawVsCorrected,
  layers,
  representative,
  total,
}: {
  rows: AttributionRow[];
  truthSource: "koibox";
  /** Headline raw→corrected story, e.g. `100 "bookings"` → `7 citas Koibox` · `14× inflado`. */
  rawVsCorrected?: { raw: string; corrected: string; factor: string };
  /** Interpretation cards under the table (Bruto/Corregido/Lectura/Decisión). */
  layers?: AttributionLayer[];
  /** Mark the figures as illustrative (no live Koibox citas yet). */
  representative?: boolean;
  /** Append a bold TOTAL row (finite-only sums; rate/CPA recomputed on the totals). */
  total?: boolean;
}) {
  if (!rows.length) {
    return (
      <Panel>
        <p className="font-heading text-[13px] font-bold text-navy">Sin datos de atribución todavía</p>
        <p className="mt-1 text-[12px] text-[var(--sc-fg-muted)]">
          El cruce canal→cita→pago aparece cuando <b className="text-[var(--sc-ink-soft)]">{truthSource}</b> tiene
          citas recolectadas y se unen con el canal de origen.
        </p>
      </Panel>
    );
  }

  const columns = ["Canal", "Visitas", "Citas", "% conv", "Gasto", "CPA"];
  const tableRows = rows.map((row) => ({
    key: row.channel,
    cells: [row.channel, fmtInt(row.visits), fmtInt(row.conversions), pct(row.convRate), eur(row.spend), eur(row.cpa)],
  }));

  // Optional TOTAL row — finite-only sums (a "Sin UTM" row with NaN visits/spend is skipped),
  // with rate and CPA recomputed on the totals (not summed).
  const fin = (n: number) => (Number.isFinite(n) ? n : 0);
  const tVisits = rows.reduce((acc, r) => acc + fin(r.visits), 0);
  const tCitas = rows.reduce((acc, r) => acc + fin(r.conversions), 0);
  const tSpend = rows.reduce((acc, r) => acc + fin(r.spend), 0);
  const totalRow = {
    key: "__total__",
    cells: [
      <strong key="c">TOTAL</strong>,
      <strong key="v">{fmtInt(tVisits)}</strong>,
      <strong key="ci">{fmtInt(tCitas)}</strong>,
      <strong key="cr">{pct(tVisits > 0 ? tCitas / tVisits : NaN)}</strong>,
      <strong key="sp">{eur(tSpend)}</strong>,
      <strong key="cp">{eur(tCitas > 0 ? tSpend / tCitas : NaN)}</strong>,
    ],
  };
  const allRows = total ? [...tableRows, totalRow] : tableRows;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--sc-fg-muted)]">
        <DataChip type="dedup" source={truthSource} confidence="alta" />
        <span>
          Citas = <b className="text-[var(--sc-ink-soft)]">{truthSource}</b> · dedup por{" "}
          <code className="font-mono">koibox_appointment_id</code>
        </span>
        {representative && (
          <span className="rounded-sc-pill border-[1.5px] border-ink bg-[var(--yellow)] px-2 py-0.5 font-heading text-[10px] font-bold text-ink">
            datos representativos · ejemplo
          </span>
        )}
      </div>

      {rawVsCorrected && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] px-3 py-2 text-[12px] shadow-pop-xs">
          <span className="text-[var(--sc-fg-muted)]">Citas (conv. de plataforma):</span>
          <span className="font-heading font-bold text-destructive line-through">{rawVsCorrected.raw}</span>
          <span aria-hidden="true" className="text-[var(--sc-fg-muted)]">{"->"}</span>
          <span className="font-heading font-bold text-sage">{rawVsCorrected.corrected}</span>
          <span className="rounded-sc-pill border-[1.5px] border-ink bg-[var(--sc-brick-bg)] px-2 py-0.5 font-heading text-[10px] font-bold text-destructive">
            {rawVsCorrected.factor}
          </span>
        </div>
      )}

      <DataTable columns={columns} rows={allRows} />

      {layers && layers.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {layers.map((layer) => (
            <div key={layer.label} className="rounded-sc-md border-2 border-ink bg-card p-2.5 shadow-pop-xs">
              <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-rust">{layer.label}</div>
              <div className="mt-1 text-[11.5px] text-[var(--sc-ink-soft)]">{layer.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
