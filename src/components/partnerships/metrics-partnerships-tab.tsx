/**
 * Metrics · Partnerships — reporting por creator (SAN-81).
 *
 * Sub-tab de la página Metrics (espejo de `reporting.html`, estilo producto):
 *  1. KPIs agregados del programa (invertido · posts · clicks · signups ·
 *     KYC · first_tx · CPA real vs objetivo · ROI).
 *  2. Tabla por creator con CPA real vs break-even lado a lado (verde si
 *     queda por debajo) + ROI; click en fila expande el detalle de posts
 *     con la evolución de clicks.
 *  3. Gráfico de barras CSS: CPA real por creator vs CAC objetivo.
 *  4. Panel "realimenta el quality score" (informativo — el ajuste real del
 *     componente Sector fit & track record llega con Fase 2/SAN-82).
 *  5. Toggle 30/90 días (re-agrega server-side).
 *
 * Datos: GET /api/partnerships/report (misma agregación que la tool MCP
 * `yalc_creator_report` — paridad UI = chat = MCP).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "@/components/shared/kpi-card";
import { cn } from "@/lib/utils";
import type {
  CreatorReport,
  CreatorReportRow,
  ReportPeriodDays,
} from "@/lib/partnerships/creator-report";

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

const nf = (n: number) => n.toLocaleString("es-ES");

function eur1(n: number): string {
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}€`;
}

function eur0(n: number): string {
  return `${nf(Math.round(n))}€`;
}

function kfmt(n: number): string {
  return n >= 10_000
    ? `${(n / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}K`
    : nf(n);
}

function roiFmt(roi: number | null): string {
  if (roi === null) return "—";
  return `${roi.toLocaleString("es-ES", { maximumFractionDigits: 1 })}×`;
}

/** "2026-06-09" → "9 jun". */
function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t)
    .toLocaleDateString("es-ES", { day: "numeric", month: "short" })
    .replace(".", "");
}

// ── subcomponentes ───────────────────────────────────────────────────────────

function PeriodToggle({
  period,
  onChange,
}: {
  period: ReportPeriodDays;
  onChange: (p: ReportPeriodDays) => void;
}) {
  return (
    <div className="inline-flex border-2 border-border rounded-lg overflow-hidden" role="tablist" aria-label="Periodo">
      {([30, 90] as ReportPeriodDays[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "px-4 py-1.5 text-[13px] font-semibold transition-colors",
            period === p ? "bg-rust text-white" : "bg-background hover:bg-muted",
          )}
          data-testid={`pr-period-${p}`}
        >
          {p} días
        </button>
      ))}
    </div>
  );
}

function CpaPair({ cpa, breakEven, ok }: { cpa: number | null; breakEven: number; ok: boolean | null }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          "font-heading font-bold text-[16px]",
          ok === null ? "text-muted-foreground" : ok ? "text-sage" : "text-destructive",
        )}
      >
        {cpa === null ? "—" : eur1(cpa)}
      </span>
      <span className="text-[11px] text-muted-foreground">vs {eur1(breakEven)}</span>
    </span>
  );
}

function Sparkline({ buckets, periodDays }: { buckets: number[]; periodDays: ReportPeriodDays }) {
  const max = Math.max(...buckets, 1);
  const maxIdx = buckets.indexOf(max);
  return (
    <div className="w-[220px] shrink-0 border-2 border-border rounded-lg bg-card p-3">
      <div className="text-[12px] font-bold mb-2">{"📈"} Clicks · evolución</div>
      <div className="flex items-end gap-1 h-14">
        {buckets.map((v, i) => (
          <div
            key={i}
            className={cn("flex-1 rounded-t-sm border border-border", i === maxIdx && v > 0 ? "bg-rust" : "bg-cyan-600/70")}
            style={{ height: `${Math.max(6, Math.round((v / max) * 100))}%`, opacity: v === 0 ? 0.25 : 1 }}
            title={nf(v)}
          />
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        {periodDays === 90 ? "últimos 90 días en 12 tramos" : "últimos 30 días en 12 tramos"} · pico en naranja
      </div>
    </div>
  );
}

function CreatorDetail({ row, periodDays }: { row: CreatorReportRow; periodDays: ReportPeriodDays }) {
  return (
    <div className="flex gap-4 flex-wrap items-start bg-muted/60 border-t-2 border-border px-4 py-4">
      <div className="flex-1 min-w-[340px]">
        <div className="text-[12.5px] font-bold mb-2">
          {"📬"} Posts de {row.handle} · {periodDays} días
        </div>
        {row.posts.length === 0 && (
          <p className="text-[13px] text-muted-foreground">Sin posts en la ventana.</p>
        )}
        {row.posts.map((post) => (
          <div
            key={post.id}
            className="flex items-center gap-2.5 bg-card border border-border rounded-lg px-3 py-2 mb-1.5 text-[13px]"
          >
            <span className="text-[11.5px] text-muted-foreground min-w-[48px]">
              {post.status === "scheduled" ? `${shortDate(post.date)} · prog.` : shortDate(post.date)}
            </span>
            <span className="text-[10.5px] font-semibold border border-border rounded-full px-2 py-0.5 bg-background whitespace-nowrap">
              {post.format}
            </span>
            <span className="font-semibold flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={post.title}>
              {post.title}
            </span>
            <span className="text-[11.5px] text-muted-foreground whitespace-nowrap">
              {post.status === "scheduled" || (post.clicks === 0 && post.conversions === 0)
                ? "⏳ pendiente"
                : `🖱 ${nf(post.clicks)} · ✅ ${nf(post.conversions)} conv`}
            </span>
          </div>
        ))}
      </div>
      <Sparkline buckets={row.sparkline} periodDays={periodDays} />
    </div>
  );
}

function CpaChart({ creators, targetCac }: { creators: CreatorReportRow[]; targetCac: number }) {
  const withCpa = creators.filter((c) => c.cpaRealEur !== null);
  if (withCpa.length === 0) return null;
  const maxCpa = Math.max(...withCpa.map((c) => c.cpaRealEur as number));
  const scaleMax = Math.max(targetCac * 1.125, maxCpa * 1.15);
  return (
    <div className="border-[3px] border-ink rounded-lg shadow-comic bg-card p-5">
      <div
        className="relative h-[200px] mx-2 flex items-end justify-around gap-8 border-l-2 border-b-2 border-ink"
        data-testid="pr-chart"
      >
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-destructive z-10"
          style={{ bottom: `${(targetCac / scaleMax) * 100}%` }}
        >
          <span className="absolute right-1 -top-[22px] text-[11px] font-semibold text-destructive bg-card border border-destructive rounded px-1.5">
            CAC objetivo · {eur0(targetCac)}
          </span>
        </div>
        {withCpa.map((c) => {
          const cpa = c.cpaRealEur as number;
          const h = Math.min((cpa / scaleMax) * 100, 100);
          return (
            <div key={c.handle} className="flex flex-col items-center justify-end h-full w-[110px] z-20">
              <span className="font-heading font-bold text-[14px] mb-1">{eur1(cpa)}</span>
              <div
                className={cn(
                  "w-14 rounded-t-md border-2 border-b-0 border-ink",
                  c.belowBreakEven ? "bg-sage" : "bg-destructive",
                )}
                style={{ height: `${h.toFixed(1)}%`, minHeight: 4 }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-around gap-8 mx-2 mt-2">
        {withCpa.map((c) => (
          <span key={c.handle} className="w-[110px] text-center text-[12.5px] font-semibold">
            {c.handle}
          </span>
        ))}
      </div>
    </div>
  );
}

function FeedbackPanel({ report }: { report: CreatorReport }) {
  const deltas = report.feedback.deltas;
  return (
    <div className="border-[3px] border-ink rounded-lg shadow-comic bg-card p-5 flex gap-5 flex-wrap items-start">
      <div className="flex-1 min-w-[300px]">
        <h3 className="font-heading text-[16px] text-navy mb-2">{"🔁"} Realimenta el quality score</h3>
        <p className="text-[13.5px] max-w-[560px]">
          El histórico de performance ajusta el componente <b>Sector fit &amp; track record</b> del
          quality score de cada creator: los próximos rankings de <b>Encuentra</b> salen con estos
          ajustes aplicados.
        </p>
        {report.feedback.note && (
          <p className="text-[12.5px] italic mt-3 px-3 py-2 bg-yellow-50 border-2 border-yellow-400 rounded-lg max-w-[540px]">
            {"🧠"} {report.feedback.note}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Deltas sugeridos por el ROI relativo al programa — el ajuste automático llega con el
          tracking real (Fase 2).
        </p>
      </div>
      <div className="min-w-[280px]">
        {deltas.length === 0 && <p className="text-[13px] text-muted-foreground">Sin datos suficientes.</p>}
        {deltas.map((d) => (
          <div
            key={d.handle}
            className="flex items-center gap-2.5 border-2 border-border rounded-lg bg-background px-3 py-2 mb-2"
            data-testid={`pr-delta-${d.handle.replace(/^@/, "")}`}
          >
            <span className="font-semibold flex-1 text-[13.5px]">{d.handle}</span>
            <span className="text-[12px] text-muted-foreground whitespace-nowrap">
              {d.current === null ? "—" : d.current} → {d.next === null ? "—" : d.next}
            </span>
            <span
              className={cn(
                "font-heading font-bold text-[13px] border rounded px-1.5 whitespace-nowrap",
                d.delta >= 0
                  ? "text-sage border-sage bg-green-50"
                  : "text-rust border-rust bg-yellow-50",
              )}
            >
              {d.delta >= 0 ? `+${d.delta}` : `−${Math.abs(d.delta)}`} {Math.abs(d.delta) === 1 ? "pt" : "pts"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── componente principal ─────────────────────────────────────────────────────

export function MetricsPartnershipsTab({ slug }: { slug: string }) {
  const [period, setPeriod] = useState<ReportPeriodDays>(90);
  const [openHandle, setOpenHandle] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ["partnerships-report", slug, period],
    queryFn: () =>
      fetchJson<CreatorReport>(
        `/api/partnerships/report?slug=${encodeURIComponent(slug)}&period=${period}`,
      ),
    enabled: !!slug,
    staleTime: 60_000,
  });

  const report = reportQuery.data;
  const totals = report?.totals;
  const creators = report?.creators ?? [];

  return (
    <div>
      {/* Cabecera del tab: claim + toggle de periodo */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <p className="text-[13px] text-muted-foreground italic">
          Cierra el loop: CPA real vs break-even predicho por la calc — y realimenta el quality score.
        </p>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      {reportQuery.isLoading && <p className="text-muted-foreground">Cargando reporting de creators…</p>}

      {reportQuery.isError && (
        <div className="border-2 border-destructive rounded-lg bg-red-50 p-4 text-[13.5px]">
          <b>No se pudo cargar el reporting.</b>{" "}
          {reportQuery.error instanceof Error ? reportQuery.error.message : "Error de red"} — ¿está
          Yalc levantado y configurado para este cliente?
        </div>
      )}

      {report && creators.length === 0 && (
        <div className="border-[3px] border-ink rounded-lg bg-card p-10 shadow-comic text-center">
          <p className="font-semibold mb-1">Sin performance de creators todavía.</p>
          <p className="text-[13px] text-muted-foreground">
            El reporting se enciende cuando hay creators con deal y posts publicados (seed de demo:{" "}
            <code>scripts/seed-partnerships-demo.ts</code>). El tracking real llega con Fase 2 (Impact).
          </p>
        </div>
      )}

      {report && totals && creators.length > 0 && (
        <>
          {/* (1) KPIs agregados del programa */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
            <KpiCard value={eur0(totals.investedEur)} label="Invertido" status="neutral" />
            <KpiCard value={totals.postsLive} label="Posts live" status="neutral" />
            <KpiCard value={kfmt(totals.clicks)} label="Clicks" status="neutral" />
            <KpiCard value={nf(totals.signups)} label="Signups" status="neutral" />
            <KpiCard value={nf(totals.kyc)} label="KYC" status="neutral" />
            <KpiCard value={nf(totals.conversions)} label="First TX" status="neutral" />
            <KpiCard
              value={totals.cpaRealEur === null ? "—" : eur1(totals.cpaRealEur)}
              label={`CPA real · obj. ${eur0(report.targetCacEur)}`}
              status={totals.belowBreakEven === null ? "neutral" : totals.belowBreakEven ? "good" : "bad"}
            />
            <KpiCard
              value={roiFmt(totals.roi)}
              label="ROI estimado"
              delta={{ value: "valor a CAC objetivo", direction: "flat" }}
              status={totals.roi !== null && totals.roi >= 1 ? "good" : "warn"}
            />
          </div>

          {/* (2) Tabla por creator */}
          <h2 className="font-heading text-lg text-navy mb-3">
            Rendimiento <span className="text-rust">por creator</span>
          </h2>
          <div className="border-[3px] border-ink rounded-lg shadow-comic bg-card overflow-x-auto mb-2">
            <table className="w-full border-collapse text-[13.5px]" data-testid="pr-table">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left text-[10.5px] uppercase tracking-wide text-muted-foreground p-2.5 border-b-2 border-border">Creator</th>
                  <th className="text-right text-[10.5px] uppercase tracking-wide text-muted-foreground p-2.5 border-b-2 border-border">Posts live</th>
                  <th className="text-right text-[10.5px] uppercase tracking-wide text-muted-foreground p-2.5 border-b-2 border-border">Clicks</th>
                  <th className="text-right text-[10.5px] uppercase tracking-wide text-muted-foreground p-2.5 border-b-2 border-border">Signups</th>
                  <th className="text-right text-[10.5px] uppercase tracking-wide text-muted-foreground p-2.5 border-b-2 border-border">KYC</th>
                  <th className="text-right text-[10.5px] uppercase tracking-wide text-muted-foreground p-2.5 border-b-2 border-border">Conv (first tx)</th>
                  <th className="text-right text-[10.5px] uppercase tracking-wide text-muted-foreground p-2.5 border-b-2 border-border">CPA real · break-even</th>
                  <th className="text-right text-[10.5px] uppercase tracking-wide text-muted-foreground p-2.5 border-b-2 border-border">ROI</th>
                </tr>
              </thead>
              <tbody>
                {creators.map((c) => {
                  const open = openHandle === c.handle;
                  return [
                    <tr
                      key={c.handle}
                      onClick={() => setOpenHandle(open ? null : c.handle)}
                      className={cn(
                        "cursor-pointer transition-colors border-b border-border",
                        open ? "bg-yellow-50" : "hover:bg-muted/60",
                      )}
                      data-testid={`pr-row-${c.handle.replace(/^@/, "")}`}
                    >
                      <td className="p-2.5 whitespace-nowrap">
                        <span className={cn("inline-block mr-2 text-[10px] transition-transform", open && "rotate-90")}>
                          {"▶"}
                        </span>
                        <span className="font-bold">{c.handle}</span>
                        {c.network && (
                          <span className="ml-2 text-[10.5px] font-semibold border border-border rounded-full px-2 py-0.5 bg-background">
                            {c.network}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right">{c.postsLive}</td>
                      <td className="p-2.5 text-right">{nf(c.clicks)}</td>
                      <td className="p-2.5 text-right">{nf(c.signups)}</td>
                      <td className="p-2.5 text-right">{nf(c.kyc)}</td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        {nf(c.conversions)}
                        {c.conversionsNeeded !== null && (
                          <span className="text-[11px] text-muted-foreground"> / {nf(c.conversionsNeeded)} nec.</span>
                        )}
                      </td>
                      <td className="p-2.5 text-right">
                        <CpaPair cpa={c.cpaRealEur} breakEven={c.breakEvenCpaEur} ok={c.belowBreakEven} />
                      </td>
                      <td className="p-2.5 text-right">
                        <span className="inline-block font-semibold text-[12px] border border-border rounded-full px-2.5 py-0.5 bg-green-50">
                          {roiFmt(c.roi)}
                        </span>
                      </td>
                    </tr>,
                    open ? (
                      <tr key={`${c.handle}-detail`} className="border-b border-border">
                        <td colSpan={8} className="p-0">
                          <CreatorDetail row={c} periodDays={report.periodDays} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold border-t-2 border-ink">
                  <td className="p-2.5">TOTAL programa</td>
                  <td className="p-2.5 text-right">{totals.postsLive}</td>
                  <td className="p-2.5 text-right">{nf(totals.clicks)}</td>
                  <td className="p-2.5 text-right">{nf(totals.signups)}</td>
                  <td className="p-2.5 text-right">{nf(totals.kyc)}</td>
                  <td className="p-2.5 text-right" data-testid="pr-total-conv">{nf(totals.conversions)}</td>
                  <td className="p-2.5 text-right" data-testid="pr-total-cpa">
                    <CpaPair cpa={totals.cpaRealEur} breakEven={report.targetCacEur} ok={totals.belowBreakEven} />
                  </td>
                  <td className="p-2.5 text-right">
                    <span className="inline-block font-semibold text-[12px] border border-border rounded-full px-2.5 py-0.5 bg-green-50">
                      {roiFmt(totals.roi)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11.5px] text-muted-foreground mb-6">
            * Click en una fila para expandir el detalle de posts. Deals con fee fijo: break-even CPA
            = CAC objetivo ({eur0(report.targetCacEur)}); “nec.” = conversiones necesarias según la calc.
          </p>

          {/* (3) Bar chart CPA vs CAC objetivo */}
          <h2 className="font-heading text-lg text-navy mb-3">
            CPA real <span className="text-rust">vs CAC objetivo ({eur0(report.targetCacEur)})</span>
          </h2>
          <CpaChart creators={creators} targetCac={report.targetCacEur} />

          {/* (4) Feedback al quality score */}
          <div className="mt-6">
            <FeedbackPanel report={report} />
          </div>

          <p className="text-[11px] text-muted-foreground italic mt-4">
            * Performance del seed de demo hasta que el tracking real (Impact) llegue en Fase 2.
            Funnel de referencia: click→signup 8% · signup→KYC 60% · KYC→first tx 70%.
          </p>
        </>
      )}
    </div>
  );
}
