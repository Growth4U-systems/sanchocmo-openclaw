/**
 * Discoverability · AI sub-tab — breakdowns (SAN-319 · PR6, slot ④).
 *
 * Pure/presentational, dimension-toggled (Competidores · Motores · Prompts):
 *  - Competidores: a 100%-stacked Share-of-Voice bar + a scoreboard table.
 *  - Motores: AI-visibility per engine (ChatGPT / Perplexity / Gemini / …).
 *  - Prompts: the tracked prompts and whether you're cited.
 * All `seed` (no AEO source yet). "Ver los N prompts →" opens the same Explorador.
 */
import { useState } from "react";
import { DataChip } from "./rigor";

export type AiCompetitor = { brand: string; sov: number; visibility: number; mentions: number; position: number; sentiment: number; you?: boolean };
export type AiEngine = { engine: string; visibility: number };
export type AiPrompt = { prompt: string; engine: string; position: number }; // 0 = not cited

const SEG = ["bg-rust", "bg-navy", "bg-[var(--cyan)]", "bg-sage", "bg-aged"];

const fmtPct = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;
const fmtDec = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function AiBreakdown({
  competitors,
  engines,
  prompts,
  totalPrompts,
  onSeeAll,
}: {
  competitors: AiCompetitor[];
  engines: AiEngine[];
  prompts: AiPrompt[];
  totalPrompts?: number;
  onSeeAll?: () => void;
}) {
  const [dim, setDim] = useState<"competitors" | "engines" | "prompts">("competitors");
  const sovTotal = competitors.reduce((s, c) => s + c.sov, 0) || 1;
  const engMax = Math.max(...engines.map((e) => e.visibility), 1);

  const tab = (k: typeof dim, label: string) => (
    <button
      type="button"
      onClick={() => setDim(k)}
      className={"rounded-sc-md border-2 border-ink px-2.5 py-1 font-heading text-[12px] font-bold shadow-pop-xs " + (dim === k ? "bg-rust text-white" : "bg-card text-[var(--sc-ink-soft)]")}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="Desgloses AI" className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {tab("competitors", "🏆 Competidores")}
          {tab("engines", "🤖 Motores")}
          {tab("prompts", "💬 Prompts")}
        </div>
        <DataChip type="seed" source="IA" />
      </div>

      {dim === "competitors" && (
        <div className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
          <div className="flex h-5 w-full overflow-hidden rounded-sc-pill border-2 border-ink" role="img" aria-label="Share of Voice 100% apilado">
            {competitors.map((c, i) => (
              <span key={c.brand} className={SEG[i % SEG.length] + " h-full border-r border-ink last:border-r-0"} style={{ width: `${(c.sov / sovTotal) * 100}%` }} title={`${c.brand} ${fmtPct(c.sov)}`} />
            ))}
          </div>
          <table className="mt-3 w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["Marca", "SoV", "Visibility", "Menciones", "Pos.", "Sentim."].map((h, i) => (
                  <th key={h} className={"border-b-2 border-ink px-2 py-1.5 font-heading text-[10px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)] " + (i ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <tr key={c.brand} className={"border-b border-border " + (c.you ? "bg-[var(--sc-sage-100)] font-semibold" : "")}>
                  <td className="px-2 py-2">{c.brand}{c.you && <span className="ml-1 text-[10px] text-sage">(tú)</span>}</td>
                  <td className="px-2 py-2 text-right">{fmtPct(c.sov)}</td>
                  <td className="px-2 py-2 text-right">{fmtPct(c.visibility)}</td>
                  <td className="px-2 py-2 text-right">{c.mentions}</td>
                  <td className="px-2 py-2 text-right">{fmtDec(c.position)}</td>
                  <td className="px-2 py-2 text-right">{c.sentiment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dim === "engines" && (
        <div className="space-y-2 rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
          {engines.map((e) => (
            <div key={e.engine} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[12px] font-semibold">{e.engine}</span>
              <span className="h-3.5 flex-1 overflow-hidden rounded-sc-pill border border-ink bg-aged">
                <i className="block h-full border-r border-ink bg-[var(--cyan)]" style={{ width: `${Math.round((e.visibility / engMax) * 100)}%` }} />
              </span>
              <span className="w-10 shrink-0 text-right text-[12px] font-bold">{fmtPct(e.visibility)}</span>
            </div>
          ))}
        </div>
      )}

      {dim === "prompts" && (
        <div className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["Prompt", "Motor", "Estado"].map((h, i) => (
                  <th key={h} className={"border-b-2 border-ink px-2 py-1.5 font-heading text-[10px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)] " + (i === 2 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.prompt + p.engine} className="border-b border-border">
                  <td className="px-2 py-2 font-medium">{p.prompt}</td>
                  <td className="px-2 py-2 text-[var(--sc-fg-muted)]">{p.engine}</td>
                  <td className="px-2 py-2 text-right">
                    {p.position > 0 ? <span className="font-semibold text-sage">#{p.position} · citado</span> : <span className="font-semibold text-destructive">no cita</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={onSeeAll} className="mt-2 font-heading text-[12px] font-bold text-rust underline">
            Ver los {(totalPrompts ?? prompts.length).toLocaleString("es-ES")} prompts → mismo Explorador que SEO
          </button>
        </div>
      )}
    </section>
  );
}
