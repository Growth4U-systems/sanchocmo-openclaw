/**
 * Discoverability · AI sub-tab — readiness + evidence (SAN-319 · PR6, slot ⑥).
 *
 * Pure/presentational, the surface-specific AI health slot:
 *  - AI-readiness checklist (crawlers allowed, schema, llms.txt, citable content).
 *  - Evidence card: a real AI answer with your citation (the "prueba real", Peec-style).
 * All `seed` (no AEO source yet).
 */
import { DataChip } from "./rigor";

export type AiCheck = { check: string; status: "ok" | "fail" | "partial" };
export type AiEvidence = { prompt: string; engine: string; answer: string; cited?: boolean; position?: number; sources?: string[] };

const MARK = {
  ok: { glyph: "✓", cls: "text-sage" },
  fail: { glyph: "✗", cls: "text-destructive" },
  partial: { glyph: "◐", cls: "text-[var(--sc-fg-muted)]" },
} as const;

export function AiReadiness({ checklist, evidence }: { checklist: AiCheck[]; evidence?: AiEvidence }) {
  const passed = checklist.filter((c) => c.status === "ok").length;

  return (
    <section aria-label="AI-readiness" className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-heading text-[13px] font-bold text-navy">AI-readiness</h4>
          <span className="font-heading text-[12px] font-bold">{passed} / {checklist.length}</span>
        </div>
        <ul className="space-y-1">
          {checklist.map((c) => {
            const m = MARK[c.status];
            return (
              <li key={c.check} className="flex items-center gap-2 border-b border-border py-1.5 text-[12px] last:border-b-0">
                <span aria-hidden="true" className={"font-bold " + m.cls}>{m.glyph}</span>
                <span className={c.status === "fail" ? "text-destructive" : ""}>{c.check}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 text-right"><DataChip type="seed" source="IA" /></div>
      </div>

      {evidence && (
        <div className="rounded-sc-md border-2 border-ink bg-card p-4 shadow-pop-xs">
          <h4 className="mb-2 font-heading text-[13px] font-bold text-navy">Respuesta reciente · evidencia</h4>
          <div className="rounded-sc-md border-2 border-dashed border-ink bg-[var(--sc-paper-3)] p-3">
            <p className="text-[11px] text-[var(--sc-fg-muted)]">
              <span aria-hidden="true">{"💬"}</span> «{evidence.prompt}» · {evidence.engine}
            </p>
            <p className="mt-1.5 text-[12px] leading-snug">{evidence.answer}</p>
            {evidence.cited && (
              <span className="mt-2 inline-block font-semibold text-sage">
                {evidence.position ? `#${evidence.position} · citado` : "citado"}
              </span>
            )}
            {evidence.sources && evidence.sources.length > 0 && (
              <p className="mt-2 text-[10px] text-[var(--sc-fg-muted)]">Fuentes citadas: {evidence.sources.join(" · ")}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
