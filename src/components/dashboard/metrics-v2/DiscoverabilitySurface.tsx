/**
 * Discoverability / Web & SEO surface (SAN-319 · PR6) — the composed surface.
 *
 * Pure/presentational shell: a SEO | AI sub-tab toggle that lays out the 8-slot
 * template for each mode from the leaf components. The `metrics.tsx` wiring parses
 * `metric_snapshots` (ga4 · gsc · pagespeed · aeo) into `DiscoverabilityData` and
 * mounts this; the surface itself never reads data or crosses sources.
 *
 * Imports each leaf from its own file (not the barrel) so the barrel's re-export of
 * this component stays acyclic.
 */
import { useState } from "react";
import { WebSeoKpis, type WebSeoKpi } from "./WebSeoKpis";
import { SeoTrend } from "./SeoTrend";
import { SeoBreakdown, type SeoQueryRow, type SeoPageRow } from "./SeoBreakdown";
import { SeoMovers, type SeoMover } from "./SeoMovers";
import { SeoHealth, type SeoCwv, type SeoScores, type SeoPositionBucket } from "./SeoHealth";
import { FunnelContribution } from "./FunnelContribution";
import { IntelBridge } from "./IntelBridge";
import { AiKpis, type AiKpi } from "./AiKpis";
import { SovTrend, type SovLine } from "./SovTrend";
import { AiBreakdown, type AiCompetitor, type AiEngine, type AiPrompt } from "./AiBreakdown";
import { AiReadiness, type AiCheck, type AiEvidence } from "./AiReadiness";

type Conn = "off" | "partial" | "connected_pending" | "collecting";
type FunnelStep = { label: string; value: string };

export type DiscoverabilitySeo = {
  kpis: WebSeoKpi[];
  trend: { date: string; clicks: number; impressions: number }[];
  queries: SeoQueryRow[];
  pages: SeoPageRow[];
  totalQueries?: number;
  totalPages?: number;
  movers: { up: SeoMover[]; down: SeoMover[] };
  health: { cwv: SeoCwv; scores: SeoScores; positionDist: SeoPositionBucket[]; totalKeywords?: number };
  funnel: { steps: FunnelStep[]; note?: string };
  state?: Conn;
  signals?: string[];
};
export type DiscoverabilityAi = {
  kpis: AiKpi[];
  sov: SovLine[];
  competitors: AiCompetitor[];
  engines: AiEngine[];
  prompts: AiPrompt[];
  totalPrompts?: number;
  movers: { up: SeoMover[]; down: SeoMover[] };
  readiness: { checklist: AiCheck[]; evidence?: AiEvidence };
  funnel: { steps: FunnelStep[]; note?: string };
  state?: Conn;
  signals?: string[];
};
export type DiscoverabilityData = { seo?: DiscoverabilitySeo; ai?: DiscoverabilityAi };

const SEO_SIGNALS = [
  "«onboarding clientes b2b» cae 3 posiciones (11→14) — revisar contenido",
  "«qué es growth marketing» sube a #18 pero CTR 0,7% — oportunidad de title/meta",
  "PageSpeed móvil 74 · LCP 2,1s cerca del umbral — vigilar",
];
const AI_SIGNALS = [
  "Un competidor te cita en 5 prompts donde no apareces — el gap accionable",
  "Te mencionan pero no te citan en «mejor clínica» — falta autoridad (contenido/enlaces)",
  "3 prompts con demanda alta sin cubrir — añadir al tracking",
];

function DiscoverabilityEmpty() {
  return (
    <section aria-label="Discoverability sin conectar" className="rounded-sc-lg border-[2.5px] border-ink bg-card p-8 text-center shadow-pop-sm">
      <div className="text-[42px]" aria-hidden="true">{"🔍"}</div>
      <h3 className="mt-2 font-heading text-[18px] font-bold text-navy">Discoverability — sin conectar</h3>
      <p className="mx-auto mt-2 max-w-[460px] text-[13px] text-[var(--sc-fg-muted)]">
        Conecta las fuentes para encender Discoverability. <b>SEO</b>: GA4 + Google Search Console (+ PageSpeed).
        <b> AI</b>: una herramienta de visibilidad IA (Profound/Peec) o el scraper interno.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <a href="#settings-apis" className="rounded-sc-md border-2 border-ink bg-navy px-3 py-1.5 font-heading text-[12px] font-bold text-white shadow-pop-xs">🔌 Conectar GA4 + GSC</a>
        <a href="#settings-apis" className="rounded-sc-md border-2 border-ink bg-card px-3 py-1.5 font-heading text-[12px] font-bold text-[var(--sc-ink-soft)] shadow-pop-xs">🤖 Conectar visibilidad IA</a>
      </div>
      <p className="mt-3 text-[11px] text-[var(--sc-fg-muted)]">Al conectar verás las dos pestañas: SEO (queries, páginas con visitas+ranking, Core Web Vitals) y AI (share of voice, citas por motor, prompts).</p>
    </section>
  );
}

export function DiscoverabilitySurface({
  data,
  onRowClick,
  onSeeAll,
}: {
  data: DiscoverabilityData;
  onRowClick?: (tab: "seo" | "ai", dim: string, key: string) => void;
  onSeeAll?: (tab: "seo" | "ai", dim: string) => void;
}) {
  const hasSeo = !!data.seo;
  const hasAi = !!data.ai;
  const [tab, setTab] = useState<"seo" | "ai">(hasSeo ? "seo" : "ai");

  if (!hasSeo && !hasAi) return <DiscoverabilityEmpty />;
  const active = tab === "seo" && hasSeo ? "seo" : tab === "ai" && hasAi ? "ai" : hasSeo ? "seo" : "ai";

  const subTab = (k: "seo" | "ai", label: string, glyph: string) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={"rounded-sc-md border-2 border-ink px-3 py-1.5 font-heading text-[13px] font-bold shadow-pop-xs " + (active === k ? "bg-navy text-white" : "bg-card text-[var(--sc-ink-soft)]")}
    >
      <span aria-hidden="true" className="mr-1">{glyph}</span>{label}
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {subTab("seo", "SEO", "🔎")}
        {subTab("ai", "AI", "🤖")}
      </div>

      {active === "seo" && data.seo && (
        <div className="space-y-1">
          <WebSeoKpis kpis={data.seo.kpis} state={data.seo.state} />
          <SeoTrend series={data.seo.trend} />
          <SeoBreakdown
            queries={data.seo.queries}
            pages={data.seo.pages}
            totalQueries={data.seo.totalQueries}
            totalPages={data.seo.totalPages}
            onRowClick={onRowClick ? (dim, key) => onRowClick("seo", dim, key) : undefined}
            onSeeAll={onSeeAll ? (dim) => onSeeAll("seo", dim) : undefined}
          />
          <SeoMovers up={data.seo.movers.up} down={data.seo.movers.down} />
          <SeoHealth cwv={data.seo.health.cwv} scores={data.seo.health.scores} positionDist={data.seo.health.positionDist} totalKeywords={data.seo.health.totalKeywords} />
          <FunnelContribution steps={data.seo.funnel.steps} note={data.seo.funnel.note} />
          <IntelBridge surface="Web & SEO" signals={data.seo.signals ?? SEO_SIGNALS} />
        </div>
      )}

      {active === "ai" && data.ai && (
        <div className="space-y-1">
          <AiKpis kpis={data.ai.kpis} state={data.ai.state} />
          <SovTrend lines={data.ai.sov} />
          <AiBreakdown
            competitors={data.ai.competitors}
            engines={data.ai.engines}
            prompts={data.ai.prompts}
            totalPrompts={data.ai.totalPrompts}
            onSeeAll={onSeeAll ? () => onSeeAll("ai", "prompts") : undefined}
          />
          <SeoMovers up={data.ai.movers.up} down={data.ai.movers.down} />
          <AiReadiness checklist={data.ai.readiness.checklist} evidence={data.ai.readiness.evidence} />
          <FunnelContribution steps={data.ai.funnel.steps} note={data.ai.funnel.note} />
          <IntelBridge surface="AI Search" signals={data.ai.signals ?? AI_SIGNALS} />
        </div>
      )}
    </div>
  );
}
