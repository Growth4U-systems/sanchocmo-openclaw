/**
 * Render determinista del doc del pilar Trust Score
 * (site-audit/trust-score/trust-score.current.md).
 *
 * Extraído de la ruta API (SAN-309) para que la lib de corrida (run.ts) y los
 * tests compartan exactamente el mismo render. Frontmatter con los scores
 * (machine-orderable, lo lee el Strategic Plan) + cuerpo markdown con pilares
 * ordenados de menor a mayor, brechas, competidores y verdict.
 */
import { serializeFrontmatter } from "@/lib/data/markdown-frontmatter";
import { TRUST_PILLAR_KEYS, type CompareResult } from "@/lib/trust-score/client";
import type { CompetitorSource } from "@/lib/trust-score/competitors";

const TRUST_PILLAR_LABELS: Record<string, string> = {
  borrowed_trust: "Borrowed Trust",
  serp_trust: "SERP Trust",
  brand_assets: "Brand Assets",
  geo_presence: "GEO Presence",
  outbound_readiness: "Outbound Readiness",
  demand_engine: "Demand Engine",
};

// Normaliza un valor LLM free-text a una sola línea y escapa pipes, para que
// nunca rompa una celda de tabla ni inyecte estructura markdown.
const cell = (s: unknown): string => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|").trim();

export function renderTrustScoreDoc(
  result: CompareResult,
  url: string,
  fetchedAt: string,
  competitorsSource?: CompetitorSource,
): string {
  const p = result.primary;
  const pillars = p.pillars;
  // Sin dato (null) = prioridad MÁXIMA (incertidumbre = riesgo): va primero, no último.
  const ranked = TRUST_PILLAR_KEYS.map((k) => ({
    key: k,
    score: pillars?.[k]?.score ?? null,
    findings: pillars?.[k]?.findings ?? [],
  })).sort((a, b) => (a.score ?? -1) - (b.score ?? -1));

  // Frontmatter machine-readable vía el serializador YAML canónico del repo
  // (quotea urls/strings con caracteres especiales → round-trip siempre parseable).
  const data = {
    doc: "trust-score",
    generated: fetchedAt,
    url,
    trust_score: p.trust_score ?? null,
    pillars: Object.fromEntries(TRUST_PILLAR_KEYS.map((k) => [k, pillars?.[k]?.score ?? null])),
  };

  const lines: string[] = [
    `# Trust Score: ${cell(p.brand_name || p.domain || "")}`,
    "",
    `**Score global: ${p.trust_score ?? "n/d"}/100.** ${cell(p.verdict || "")}`,
    "",
    "## Pilares (de menor a mayor score)",
    "",
    "| Pilar | Score | Hallazgos |",
    "| -- | -- | -- |",
    ...ranked.map((r) => {
      const f = r.findings.length ? r.findings.map(cell).join("; ") : "sin datos";
      return `| ${TRUST_PILLAR_LABELS[r.key]} | ${r.score ?? "sin dato"} | ${f} |`;
    }),
    "",
    "> El pilar de menor score es el primer candidato a proyecto en el Strategic Plan. Un pilar sin dato es prioridad máxima.",
    "",
  ];
  const gaps = (result.comparison?.primary_gaps ?? p.top_gaps ?? []).slice(0, 5);
  if (gaps.length) lines.push("## Brechas vs competidores", "", ...gaps.map((g) => `- ${cell(g)}`), "");
  const comp = result.competitors ?? [];
  if (comp.length) {
    lines.push("## Competidores", "");
    if (competitorsSource === "auto") {
      lines.push(
        "> ⚠️ Competidores **auto-descubiertos** (no confirmados): el kickoff no fijó un set. Revisá y fijá los reales del cliente.",
        "",
      );
    }
    lines.push("| Marca | Trust Score |", "| -- | -- |");
    lines.push(...comp.map((c) => `| ${cell(c.brand_name || "?")} | ${c.trust_score ?? "n/d"} |`), "");
  }
  lines.push(
    "## Presencia",
    "",
    `- SERP: ${cell(p.serp_highlight || "sin datos")}`,
    `- GEO (IA): ${cell(p.geo_highlight || "sin datos")}`,
    "",
  );
  return serializeFrontmatter(data, lines.join("\n"));
}
