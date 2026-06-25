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
