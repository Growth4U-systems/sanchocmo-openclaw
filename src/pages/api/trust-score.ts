/**
 * Trust Score de un cliente dentro de Sancho (SAN-194).
 *
 * Espeja el patrón de pagespeed.ts: resuelve la URL del cliente, cachea en
 * brand/{slug}/metrics/trust-score.json (TTL 24h, ?refresh=1) y persiste a la
 * métrica diaria bajo sources.trust_score.
 *
 * Diferencia con pagespeed: el upstream es el Trust Score Analyzer, que corre
 * el modo COMPARE (self-score standalone + gap vs competidores). El set de
 * competidores se FIJA en el kickoff y las corridas siguientes lo reutilizan,
 * para que el gap sea comparable en el tiempo.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withMethod, withSlugAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { serializeFrontmatter } from "@/lib/data/markdown-frontmatter";
import { loadClient } from "@/lib/data/clients";
import {
  discoverCompetitors,
  runCompare,
  TRUST_PILLAR_KEYS,
  type CompareResult,
  type CompetitorInput,
} from "@/lib/trust-score/client";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface PinnedCompetitors {
  competitors: CompetitorInput[];
  pinnedAt: string;
}

interface TrustScoreCache extends CompareResult {
  url: string;
  fetchedAt: string;
  _stale?: boolean;
}

function resolveClientUrl(slug: string, queryUrl: string | null): string | null {
  // clients.json es { clients: [...] } (no un Record por slug): usar el cargador canónico.
  return loadClient(slug)?.url ?? queryUrl;
}

function persistDailyMetric(slug: string, metricsDir: string, result: CompareResult) {
  const today = new Date().toISOString().slice(0, 10);
  const dailyFile = path.join(metricsDir, today + ".json");
  const daily = readJSON<{
    slug?: string;
    collectedAt?: string;
    sources?: Record<string, unknown>;
  }>(dailyFile, {});
  daily.sources = daily.sources || {};
  const p = result.primary.pillars;
  daily.sources.trust_score = {
    status: "ok",
    metrics: [
      { name: "trust_score", value: result.primary.trust_score, date: today },
      ...TRUST_PILLAR_KEYS.map((k) => ({ name: k, value: p?.[k]?.score ?? null, date: today })),
    ],
    gap: {
      competitors: result.competitors.map((c) => ({
        brand: c.brand_name,
        trust_score: c.trust_score,
      })),
      primary_gaps: result.comparison?.primary_gaps ?? [],
    },
  };
  daily.slug = daily.slug || slug;
  daily.collectedAt = daily.collectedAt || new Date().toISOString();
  writeJSON(dailyFile, daily);
}

const TRUST_PILLAR_LABELS: Record<string, string> = {
  borrowed_trust: "Borrowed Trust",
  serp_trust: "SERP Trust",
  brand_assets: "Brand Assets",
  geo_presence: "GEO Presence",
  outbound_readiness: "Outbound Readiness",
  demand_engine: "Demand Engine",
};

/**
 * Render determinista del doc del pilar (site-audit/trust-score/trust-score.current.md).
 * Frontmatter con los scores (machine-orderable, lo lee el Strategic Plan) + cuerpo
 * markdown con pilares ordenados de menor a mayor, brechas, competidores y verdict.
 */
// Normaliza un valor LLM free-text a una sola línea y escapa pipes, para que
// nunca rompa una celda de tabla ni inyecte estructura markdown.
const cell = (s: unknown): string => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|").trim();

export function renderTrustScoreDoc(result: CompareResult, url: string, fetchedAt: string): string {
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
    lines.push("## Competidores", "", "| Marca | Trust Score |", "| -- | -- |");
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

// Best-effort: una falla escribiendo el doc no debe abortar la corrida ni
// hacer que se devuelva el cache fresco etiquetado como stale.
function writeTrustScoreDoc(slug: string, result: CompareResult, url: string, fetchedAt: string) {
  try {
    const docPath = path.join(BASE, "brand", slug, "site-audit", "trust-score", "trust-score.current.md");
    fs.mkdirSync(path.dirname(docPath), { recursive: true });
    fs.writeFileSync(docPath, renderTrustScoreDoc(result, url, fetchedAt));
  } catch (err) {
    console.warn("Trust Score doc write failed:", err);
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = (req.query.slug as string) || (req.method === "POST" ? req.body?.slug : null);
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const refresh = req.query.refresh === "1" || req.body?.refresh === true;
  const queryUrl = (req.query.url as string) || req.body?.url || null;
  // Una corrida es cara (discovery + compare, 1-4 min, gasta créditos). Solo corremos en
  // un kickoff explícito (POST) o un refresh (cron con ?refresh=1). Un GET del dashboard
  // es solo lectura de cache: nunca dispara una corrida.
  const run = req.method === "POST" || refresh;

  // Las corridas (POST kickoff / GET refresh) son caras y mutan estado (pin, doc, métrica):
  // solo admin. El GET de solo-cache sigue con withSlugAuth (sirve al portal del cliente).
  if (run && !req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only para correr el Trust Score" });
  }

  const metricsDir = path.join(BASE, "brand", slug, "metrics");
  const cacheFile = path.join(metricsDir, "trust-score.json");
  const pinnedFile = path.join(metricsDir, "trust-score-competitors.json");

  // GET del dashboard: devolver el cache (fresco o viejo) sin correr nada.
  if (!run) {
    const cached = readJSON<TrustScoreCache | null>(cacheFile, null);
    return res.status(200).json(cached ?? { primary: null });
  }

  // Set explícito del body (kickoff). Se calcula antes del cache: un set explícito es un
  // kickoff intencional y NO debe ser secuestrado por un cache fresco (de un cron previo).
  const provided: CompetitorInput[] | undefined = Array.isArray(req.body?.competitors)
    ? (req.body.competitors as CompetitorInput[]).filter((c) => c?.url)
    : undefined;

  // Camino de corrida. Si no es refresh y NO se mandó un set explícito, y hay cache fresco, servirlo.
  if (!refresh && !provided?.length) {
    const cached = readJSON<TrustScoreCache | null>(cacheFile, null);
    if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
      return res.status(200).json(cached);
    }
  }

  let clientUrl = resolveClientUrl(slug, queryUrl);
  if (!clientUrl) {
    return res.status(404).json({
      error: "No URL para el cliente. Pasá ?url= o configurá url en clients.json",
    });
  }
  if (!clientUrl.startsWith("http")) clientUrl = "https://" + clientUrl;

  // Orden de resolución del set: body (kickoff explícito) > pinned (reutilizado).
  // Si no hay ninguno, auto-descubrir vía el analyzer y tratarlo como kickoff.
  const pinned = readJSON<PinnedCompetitors | null>(pinnedFile, null);
  let competitors = provided?.length ? provided : pinned?.competitors;
  let autoDiscovered = false;

  if (!competitors?.length) {
    try {
      competitors = await discoverCompetitors(clientUrl, { limit: 4 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "discover failed";
      return res.status(502).json({
        error: `Auto-descubrimiento de competidores falló: ${message}. Pasá { competitors: [{ url, name }] } a mano para fijar el set.`,
      });
    }
    if (!competitors.length) {
      return res.status(409).json({
        error:
          "No se descubrieron competidores automáticamente. Pasá { competitors: [{ url, name }] } a mano para fijar el set.",
      });
    }
    autoDiscovered = true;
  }

  // Normalizar urls de competidores igual que la primaria (el analyzer espera protocolo).
  competitors = competitors.map((c) => ({ ...c, url: c.url.startsWith("http") ? c.url : "https://" + c.url }));

  try {
    const result = await runCompare(clientUrl, competitors);

    // Fijar el set: un set explícito del operador SIEMPRE re-fija (decisión deliberada);
    // el auto-descubierto solo fija si no había uno previo. Así el gap queda comparable
    // y no se mezclan dos sets distintos en la serie temporal.
    if (provided?.length || (autoDiscovered && !pinned)) {
      const toPin: PinnedCompetitors = { competitors, pinnedAt: new Date().toISOString() };
      writeJSON(pinnedFile, toPin);
    }

    const cache: TrustScoreCache = {
      ...result,
      url: clientUrl,
      fetchedAt: new Date().toISOString(),
    };
    writeJSON(cacheFile, cache);
    persistDailyMetric(slug, metricsDir, result);
    // Doc del pilar Foundation (lo consume el Brand Brain y el Strategic Plan).
    writeTrustScoreDoc(slug, result, cache.url, cache.fetchedAt);

    return res.status(200).json(cache);
  } catch (err) {
    const stale = readJSON<TrustScoreCache | null>(cacheFile, null);
    if (stale) return res.status(200).json({ ...stale, _stale: true });
    const message = err instanceof Error ? err.message : "Trust Score fetch failed";
    return res.status(500).json({ error: message });
  }
}

export default compose(withErrorHandler, withSlugAuth)(withMethod(["GET", "POST"], handler));
