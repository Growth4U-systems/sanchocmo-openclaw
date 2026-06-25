/**
 * Attribution cross-source join (SAN-319 · PR7).
 *
 * The ONE place metric sources cross. Surfaces stay pure (each reads its own source);
 * here we join acquisition channels (Paid spend + GA4 visits) to Koibox citas to get
 * the real CPA-per-cita. Citas are deduped by `koibox_appointment_id` — the
 * truth-source primary key — because GHL events inflate a single cita into 100+ raw
 * events, so we count unique appointment ids, never raw events. No source is mutated
 * and nothing is invented: a channel with no citas yields a non-finite CPA (rendered
 * as "—" by `AttributionFunnel`).
 *
 * The shape mirrors `AttributionRow` in
 * `@/components/dashboard/metrics-v2/AttributionFunnel` (kept structural to avoid a
 * lib→component dependency).
 */

/** A channel's acquisition input, from the (pure) Paid/Web surfaces. */
export interface ChannelSpend {
  channel: string;
  visits: number;
  spend: number;
}

/** A single Koibox cita with its acquisition channel; `appointmentId` is the dedup PK. */
export interface KoiboxCita {
  appointmentId: string;
  channel: string;
}

/** One attribution row — channel → cita → CPA. Matches `AttributionFunnel`'s prop. */
export interface AttributionRow {
  channel: string;
  visits: number;
  conversions: number;
  convRate: number;
  spend: number;
  cpa: number;
}

export function buildAttributionRows(channels: ChannelSpend[], citas: KoiboxCita[]): AttributionRow[] {
  // Dedup by koibox_appointment_id (truth-source PK); tally unique citas per channel.
  const seen = new Set<string>();
  const citasByChannel: Record<string, number> = {};
  for (const cita of citas) {
    if (!cita.appointmentId || seen.has(cita.appointmentId)) continue;
    seen.add(cita.appointmentId);
    citasByChannel[cita.channel] = (citasByChannel[cita.channel] || 0) + 1;
  }

  return channels.map((ch) => {
    const conversions = citasByChannel[ch.channel] || 0;
    return {
      channel: ch.channel,
      visits: ch.visits,
      conversions,
      convRate: ch.visits > 0 ? conversions / ch.visits : 0,
      spend: ch.spend,
      cpa: conversions > 0 ? ch.spend / conversions : Number.POSITIVE_INFINITY,
    };
  });
}

/**
 * Illustrative Atribución example (Hospital Capilar) — rendered flagged
 * `representative` until live Koibox citas land, so the cross-source story is legible
 * without ever presenting invented numbers as real.
 */
export const REPRESENTATIVE_ATTRIBUTION: {
  rows: AttributionRow[];
  rawVsCorrected: { raw: string; corrected: string; factor: string };
  layers: { label: string; text: string }[];
} = {
  rows: [
    { channel: "Meta Ads", visits: 2476, conversions: 3, convRate: 3 / 2476, spend: 770, cpa: 770 / 3 },
    { channel: "Google Ads", visits: 250, conversions: 2, convRate: 2 / 250, spend: 135, cpa: 135 / 2 },
    { channel: "Sin UTM", visits: NaN, conversions: 2, convRate: NaN, spend: NaN, cpa: NaN },
  ],
  rawVsCorrected: { raw: '100 "bookings"', corrected: "7 citas Koibox", factor: "14× inflado" },
  layers: [
    { label: "Bruto", text: 'Plataforma: 100 bookings, 13 "conversions" Meta.' },
    { label: "Corregido", text: "Koibox: 7 citas (Meta 3 · Google 2 · sin-UTM 2)." },
    { label: "Lectura", text: "Google 6,7× más eficiente por visita; Meta gasta 85% al 0,12%." },
    { label: "Decisión", text: "Reasignar a Google · CAC €905 insostenible (N=1)." },
  ],
};
