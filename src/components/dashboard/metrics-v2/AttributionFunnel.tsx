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

const fmtInt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("es-ES") : "—");
const eur = (n: number) => (Number.isFinite(n) ? `€${Math.round(n).toLocaleString("es-ES")}` : "—");
const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—");

export function AttributionFunnel({
  rows,
  truthSource,
}: {
  rows: AttributionRow[];
  truthSource: "koibox";
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--sc-fg-muted)]">
        <DataChip type="dedup" source={truthSource} confidence="alta" />
        <span>
          Citas = <b className="text-[var(--sc-ink-soft)]">{truthSource}</b> · dedup por{" "}
          <code className="font-mono">koibox_appointment_id</code>
        </span>
      </div>
      <DataTable columns={columns} rows={tableRows} />
    </div>
  );
}
