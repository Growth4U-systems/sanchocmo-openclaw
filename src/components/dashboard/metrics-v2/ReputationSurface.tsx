/**
 * Reputation surface (SAN-319) — trust intelligence from the Trust Engine.
 *
 * Pure/presentational. Reads the real `/api/trust-score` compare report
 * (`CompareResult`: primary + competitors + comparison) — the same contract the
 * canonical mockup is grounded in (declarando 56 vs 4 competitors). Trust-pure: its
 * own source (trust_score), no economics. "Ahora (automático)" sections are real;
 * Listening (reviews/sentiment) is phase-2, shown faded until scraping lands.
 */
import { useState } from "react";
import { TRUST_PILLAR_KEYS, type CompareResult, type BrandScore, type TrustPillarKey } from "@/lib/trust-score/client";
import { DataChip } from "./rigor";
import { IntelBridge } from "./IntelBridge";

const PILLAR_LABEL: Record<TrustPillarKey, string> = {
  borrowed_trust: "Borrowed Trust",
  serp_trust: "SERP Trust",
  brand_assets: "Brand Assets",
  geo_presence: "Geo Presence",
  outbound_readiness: "Outbound Readiness",
  demand_engine: "Demand Engine",
};
const tsColor = (s: number | null | undefined) => (s == null ? "#C9C4BA" : s >= 70 ? "#4A5D23" : s >= 40 ? "#B8860B" : "#C45D35");
const gapColor = (g: number) => (g >= 0 ? "#4A5D23" : g >= -12 ? "#B8860B" : "#C45D35");

function geoCount(b?: BrandScore) {
  const r = b?.geo_llm_results || {};
  const tested = b?.geo_llms_tested ?? Object.keys(r).length;
  return { hits: Object.values(r).filter((x) => x?.mentions).length, tested };
}

function Kpi({ label, value, hint, color, faded }: { label: string; value: string; hint?: string; color?: string; faded?: boolean }) {
  return (
    <div className={"rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-3 shadow-pop-xs" + (faded ? " opacity-50" : "")}>
      <div className="font-heading text-[10px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">{label}</div>
      <div className="mt-1 font-heading text-[22px] font-bold leading-none" style={{ color: color || "var(--navy)" }}>{value}</div>
      {hint && <div className="mt-1 text-[10px] text-[var(--sc-fg-muted)]">{hint}</div>}
    </div>
  );
}

function ReputationEmpty() {
  return (
    <section aria-label="Reputation sin datos" className="rounded-sc-lg border-[2.5px] border-ink bg-card p-8 text-center shadow-pop-sm">
      <div className="text-[42px]" aria-hidden="true">{"🛡️"}</div>
      <h3 className="mt-2 font-heading text-[18px] font-bold text-navy">Reputation — el Trust Engine aún no ha corrido</h3>
      <p className="mx-auto mt-2 max-w-[460px] text-[13px] text-[var(--sc-fg-muted)]">
        Es automático: se enciende solo al aprobar el Company Brief en el kickoff (tarda unos minutos). Nada que conectar.
      </p>
    </section>
  );
}

export function ReputationSurface({ data, onRerun, measuredAt }: { data: CompareResult | null; onRerun?: () => void; measuredAt?: string }) {
  const [tab, setTab] = useState<"confianza" | "listening">("confianza");
  const [openPillar, setOpenPillar] = useState<TrustPillarKey | null>(null);

  if (!data?.primary) return <ReputationEmpty />;
  const { primary, competitors, comparison } = data;
  const leader = [...competitors].sort((a, b) => b.trust_score - a.trust_score)[0];
  const gapVsLeader = leader ? primary.trust_score - leader.trust_score : 0;
  const geo = geoCount(primary);
  const rows = [primary, ...competitors];
  // GEO matrix columns = union of tested LLMs
  const llms = [...new Set(rows.flatMap((b) => Object.keys(b.geo_llm_results || {})))];

  const subTab = (k: "confianza" | "listening", label: string) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={"rounded-sc-md border-2 border-ink px-3 py-1.5 font-heading text-[13px] font-bold shadow-pop-xs " + (tab === k ? "bg-navy text-white" : "bg-card text-[var(--sc-ink-soft)]")}
    >
      {label}{k === "listening" && <span className="ml-1 text-[9px] opacity-70">fase 2</span>}
    </button>
  );

  return (
    <div>
      {/* ① header */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-navy"><span aria-hidden="true">{"🛡️"}</span> Reputation · {primary.brand_name}</h3>
          <p className="mt-0.5 text-[11px] text-[var(--sc-fg-muted)]">{primary.domain} · {primary.sector} · {primary.region}</p>
        </div>
        <div className="flex items-center gap-2">
          <DataChip type="real" source="Trust Engine" confidence="alta" />
          {measuredAt && <span className="text-[10px] text-[var(--sc-fg-muted)]">medido {measuredAt.slice(0, 10)}</span>}
          {onRerun && (
            <button type="button" onClick={onRerun} className="rounded-sc-md border-2 border-ink bg-card px-2.5 py-1 font-heading text-[11px] font-bold shadow-pop-xs">↻ Volver a pasar</button>
          )}
        </div>
      </header>

      {/* ② KPI scoreboard */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Trust Score" value={String(primary.trust_score)} color={tsColor(primary.trust_score)} hint="0-100" />
        <Kpi label="Gap vs líder" value={(gapVsLeader > 0 ? "+" : "") + gapVsLeader} color={gapColor(gapVsLeader)} hint={leader ? leader.brand_name + " " + leader.trust_score : "—"} />
        <Kpi label="Presencia IA" value={`${geo.hits}/${geo.tested}`} color={geo.hits === 0 ? "#C45D35" : geo.hits < geo.tested ? "#B8860B" : "#4A5D23"} hint="te mencionan los LLMs" />
        <Kpi label="Competidores" value={String(competitors.length)} hint="benchmark" />
      </div>

      <div className="mt-4 flex gap-2">
        {subTab("confianza", "🛡️ Confianza")}
        {subTab("listening", "📣 Listening")}
      </div>

      {tab === "confianza" && (
        <div className="mt-3 space-y-4">
          {/* ④ 6 pilares vs líder */}
          <section className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
            <h4 className="mb-2 font-heading text-[13px] font-bold text-navy">6 pilares · {primary.brand_name} vs {leader?.brand_name || "líder"}</h4>
            <div className="space-y-2.5">
              {TRUST_PILLAR_KEYS.map((k) => {
                const me = primary.pillars?.[k]?.score ?? 0;
                const them = leader?.pillars?.[k]?.score ?? 0;
                const gap = me - them;
                const open = openPillar === k;
                return (
                  <div key={k}>
                    <button type="button" onClick={() => setOpenPillar(open ? null : k)} className="flex w-full items-center gap-2 text-left">
                      <span className="w-32 shrink-0 text-[11px] font-semibold">{PILLAR_LABEL[k]}</span>
                      <span className="relative h-3 flex-1 overflow-visible rounded-sc-pill border border-ink bg-aged">
                        <i className="block h-full rounded-sc-pill" style={{ width: `${me}%`, background: gapColor(gap) }} />
                        {leader && <span className="absolute top-1/2 -translate-y-1/2 text-[10px]" style={{ left: `calc(${them}% - 4px)`, color: "var(--navy)" }} aria-hidden="true">◆</span>}
                      </span>
                      <span className="w-7 shrink-0 text-right text-[12px] font-bold" style={{ color: tsColor(me) }}>{me}</span>
                      <span className="w-9 shrink-0 text-right text-[11px] font-semibold" style={{ color: gapColor(gap) }}>{gap >= 0 ? "+" : ""}{gap}</span>
                    </button>
                    {open && (primary.pillars?.[k]?.findings || []).length > 0 && (
                      <ul className="mt-1 ml-32 space-y-0.5 border-l-2 border-border pl-2 text-[11px] text-[var(--sc-fg-muted)]">
                        {(primary.pillars[k].findings || []).slice(0, 3).map((f, i) => <li key={i}>• {f}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-[var(--sc-fg-muted)]">◆ = {leader?.brand_name || "líder"} · clic en un pilar para ver los hallazgos del Trust Engine</p>
          </section>

          {/* ⑤ benchmark scoreboard */}
          <section className="overflow-x-auto rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
            <h4 className="mb-2 font-heading text-[13px] font-bold text-navy">Scoreboard · marca × pilares</h4>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  {["Marca", "Trust", ...TRUST_PILLAR_KEYS.map((k) => PILLAR_LABEL[k].split(" ")[0])].map((h, i) => (
                    <th key={h + i} className={"border-b-2 border-ink px-2 py-1.5 font-heading text-[9.5px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)] " + (i ? "text-center" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => b.trust_score - a.trust_score).map((b) => {
                  const you = b === primary;
                  return (
                    <tr key={b.domain} className={"border-b border-border " + (you ? "bg-[var(--sc-sage-100)]" : "")}>
                      <td className="px-2 py-2 font-medium">{b.brand_name}{you && <span className="ml-1 text-[10px] text-rust">tú</span>}</td>
                      <td className="px-2 py-2 text-center font-bold" style={{ color: tsColor(b.trust_score) }}>{b.trust_score}</td>
                      {TRUST_PILLAR_KEYS.map((k) => {
                        const s = b.pillars?.[k]?.score ?? null;
                        return <td key={k} className="px-2 py-2 text-center font-semibold" style={{ color: tsColor(s) }}>{s ?? "—"}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* ④ GEO / AI-mention matrix */}
          {llms.length > 0 && (
            <section className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
              <h4 className="mb-2 font-heading text-[13px] font-bold text-navy">Presencia en IA · ¿te citan los LLMs?</h4>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["Marca", ...llms, "Visibilidad"].map((h, i) => (
                      <th key={h + i} className={"border-b-2 border-ink px-2 py-1.5 font-heading text-[9.5px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)] " + (i ? "text-center" : "text-left")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => {
                    const g = geoCount(b);
                    const you = b === primary;
                    return (
                      <tr key={b.domain} className={"border-b border-border " + (you ? "bg-[var(--sc-sage-100)]" : "")}>
                        <td className="px-2 py-2 font-medium">{b.brand_name}{you && <span className="ml-1 text-[10px] text-rust">tú</span>}</td>
                        {llms.map((l) => {
                          const r = b.geo_llm_results?.[l];
                          return <td key={l} className="px-2 py-2 text-center">{r == null ? <span className="text-[var(--sc-fg-muted)]">—</span> : r.mentions ? <span className="text-sage">✓</span> : <span className="text-destructive">✗</span>}</td>;
                        })}
                        <td className="px-2 py-2 text-center font-bold" style={{ color: g.hits === 0 ? "#C45D35" : g.hits < g.tested ? "#B8860B" : "#4A5D23" }}>{g.hits}/{g.tested}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {/* 🧭 diagnóstico */}
          <section className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
            <h4 className="mb-2 font-heading text-[13px] font-bold text-navy">Diagnóstico</h4>
            {(comparison.verdict || primary.verdict) && (
              <p className="rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-3 text-[12px] leading-snug">{comparison.verdict || primary.verdict}</p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-sc-md border-2 border-sage bg-[var(--sc-sage-100)] p-3">
                <div className="font-heading text-[11px] font-bold text-sage">✅ Dónde ganas</div>
                <ul className="mt-1 space-y-1 text-[11px]">{(comparison.primary_advantages || []).slice(0, 4).map((a, i) => <li key={i}>• {a}</li>)}</ul>
              </div>
              <div className="rounded-sc-md border-2 border-destructive bg-[var(--sc-brick-bg)] p-3">
                <div className="font-heading text-[11px] font-bold text-destructive">⚠️ Dónde pierdes</div>
                <ul className="mt-1 space-y-1 text-[11px]">{(comparison.primary_gaps || []).slice(0, 4).map((g, i) => <li key={i}>• {g}</li>)}</ul>
              </div>
            </div>
            {(comparison.insights || []).length > 0 && (
              <div className="mt-3">
                <div className="font-heading text-[11px] font-bold text-navy">💡 Insights</div>
                <ul className="mt-1 space-y-1 text-[11px] text-[var(--sc-fg-muted)]">{(comparison.insights || []).slice(0, 5).map((s, i) => <li key={i}>• {s}</li>)}</ul>
              </div>
            )}
          </section>

          {/* ⑧ intelligence bridge — fed by the top gaps */}
          <IntelBridge surface="Reputation" signals={(primary.top_gaps || []).slice(0, 3)} />

          {/* faded phase 2/3 */}
          <p className="rounded-sc-md border border-dashed border-border bg-[var(--sc-paper-3)] p-3 text-[11px] text-[var(--sc-fg-muted)]">
            🔒 Tendencia · movers · funnel de confianza = fase 3 (se llenan al re-correr periódicamente). Sentimiento · share-of-voice · NPS = fase 2 (scraping de reviews). Esta es la 1ª medición.
          </p>
        </div>
      )}

      {tab === "listening" && (
        <div className="mt-3 rounded-sc-md border-2 border-dashed border-ink bg-card p-6 text-center opacity-70 shadow-pop-xs">
          <div className="text-[28px]" aria-hidden="true">{"📣"}</div>
          <h4 className="mt-1 font-heading text-[14px] font-bold text-navy">Listening & Reseñas — fase 2</h4>
          <p className="mx-auto mt-1 max-w-[440px] text-[11px] text-[var(--sc-fg-muted)]">
            Reseñas por plataforma (Trustpilot/G2/Capterra), sentimiento, share-of-voice y distribución de estrellas se encienden al conectar el scraping de reviews (nuestras + competidores).
          </p>
        </div>
      )}
    </div>
  );
}
