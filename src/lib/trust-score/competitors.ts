/**
 * Set de competidores del Trust Score con procedencia (SAN-309).
 *
 * El analyzer compara la marca contra un set de competidores CON URL. Ese set se
 * FIJA en brand/{slug}/metrics/trust-score-competitors.json y las corridas lo
 * reutilizan, para que el gap sea comparable en el tiempo. La procedencia
 * (`source`) distingue los DEFINIDOS por humano (kickoff / operador) de los
 * AUTO-descubiertos por el analyzer, para poder marcar el dato como "revisar"
 * cuando no son los del cliente.
 */
import path from "path";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import type { CompetitorInput } from "@/lib/trust-score/client";

export type CompetitorSource = "defined" | "auto";

export interface PinnedCompetitors {
  competitors: CompetitorInput[];
  pinnedAt: string;
  /** "defined" = humano (kickoff/operador); "auto" = auto-descubierto por el analyzer. */
  source: CompetitorSource;
}

export function pinnedCompetitorsFile(slug: string): string {
  return path.join(BASE, "brand", slug, "metrics", "trust-score-competitors.json");
}

export function readPinnedCompetitors(slug: string): PinnedCompetitors | null {
  return readJSON<PinnedCompetitors | null>(pinnedCompetitorsFile(slug), null);
}

/** Añade protocolo si falta y limpia puntuación colgante. */
export function normalizeCompetitorUrl(url: string): string {
  const u = url.trim().replace(/[).,;]+$/, "");
  return u.startsWith("http") ? u : "https://" + u;
}

/**
 * Puro: normaliza URLs (añade protocolo) y deduplica por URL, descartando los que
 * no traen URL. Extraído para test sin disco.
 */
export function dedupeNormalizeCompetitors(competitors: CompetitorInput[]): CompetitorInput[] {
  const seen = new Set<string>();
  const out: CompetitorInput[] = [];
  for (const c of competitors) {
    if (!c?.url) continue;
    const url = normalizeCompetitorUrl(c.url);
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.name?.trim() ? { url, name: c.name.trim() } : { url });
  }
  return out;
}

/**
 * Fija el set de competidores con su procedencia (escribe a disco). `now` es
 * inyectable para test (Date.now no es determinista). Devuelve lo fijado.
 */
export function pinCompetitors(
  slug: string,
  competitors: CompetitorInput[],
  source: CompetitorSource,
  now: string = new Date().toISOString(),
): PinnedCompetitors {
  const pinned: PinnedCompetitors = {
    competitors: dedupeNormalizeCompetitors(competitors),
    pinnedAt: now,
    source,
  };
  writeJSON(pinnedCompetitorsFile(slug), pinned);
  return pinned;
}

// Reconoce una URL http(s) o un dominio desnudo (foo.com, foo.bar.io/ruta).
const URL_TOKEN =
  /(https?:\/\/[^\s,;|)]+|(?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,}(?:\/[^\s,;|)]*)?)/i;

/**
 * Parser tolerante: de texto libre (una línea por competidor — "Nombre — URL",
 * "Nombre: URL", "Nombre (url)", o solo URL) extrae {name, url}. Solo devuelve los
 * que traen URL reconocible (el analyzer la exige); los de solo-nombre se descartan
 * sin romper. No fija nada — el llamante decide. Útil para el campo de texto del
 * formulario de intake y para el modo conversacional del kickoff.
 */
export function parseCompetitors(raw: string): CompetitorInput[] {
  if (!raw) return [];
  const out: CompetitorInput[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(URL_TOKEN);
    if (!m) continue; // sin URL → no usable para el compare
    const url = m[0];
    const name = trimmed
      .replace(url, "")
      .replace(/[—–\-:|()]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    out.push(name ? { url, name } : { url });
  }
  return out;
}
