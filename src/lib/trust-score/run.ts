/**
 * Corrida del Trust Score (SAN-194 / SAN-309).
 *
 * La lógica de corrida —resolver la URL del cliente, resolver/auto-descubrir y
 * fijar el set de competidores, correr el modo COMPARE, cachear, persistir la
 * métrica diaria y escribir el doc del pilar— vive acá como función-lib
 * reutilizable (espejo de provisionYalcBrain). Así la disparan por igual:
 *   - la ruta /api/trust-score (POST kickoff / GET ?refresh=1 del cron), y
 *   - el hook fire-and-forget del kickoff (pillar-status, al completar el
 *     company-brief) — resucitando el auto-arranque que el foundation-orchestrator
 *     prometía pero nunca ejecutaba.
 *
 * Una corrida es CARA (discovery + compare, 1-4 min, gasta créditos): el llamante
 * decide cuándo correr. El GET de solo-lectura del dashboard usa readTrustScoreCache.
 */
import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import {
  recomputeMetricKpisAfterIngest,
  type MetricKpiAutoRecomputeResult,
} from "@/lib/data/metric-kpi-autorecompute";
import { ingestSourceMetrics } from "@/lib/data/metrics-snapshots";
import { loadClient } from "@/lib/data/clients";
import {
  discoverCompetitors,
  runCompare,
  TRUST_PILLAR_KEYS,
  type CompareResult,
  type CompetitorInput,
} from "@/lib/trust-score/client";
import { renderTrustScoreDoc } from "@/lib/trust-score/doc";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface PinnedCompetitors {
  competitors: CompetitorInput[];
  pinnedAt: string;
}

export interface TrustScoreCache extends CompareResult {
  url: string;
  fetchedAt: string;
  _stale?: boolean;
}

export interface RunTrustScoreOptions {
  /** Override de la URL del cliente (si no, se resuelve de clients.json). */
  url?: string | null;
  /** Set explícito de competidores (kickoff intencional): re-fija y nunca lo secuestra el cache. */
  competitors?: CompetitorInput[];
  /** Forzar recálculo saltando el cache de 24h (cron con ?refresh=1). */
  refresh?: boolean;
}

export type RunTrustScoreOutcome =
  | { ok: true; cache: TrustScoreCache; ran: boolean; metricsRecompute?: MetricKpiAutoRecomputeResult }
  | { ok: false; status: number; error: string };

function metricsDirFor(slug: string): string {
  return path.join(BASE, "brand", slug, "metrics");
}
function cacheFileFor(slug: string): string {
  return path.join(metricsDirFor(slug), "trust-score.json");
}

/** Lee el cache (fresco o viejo) sin correr nada — para el GET del dashboard/portal. */
export function readTrustScoreCache(slug: string): TrustScoreCache | null {
  return readJSON<TrustScoreCache | null>(cacheFileFor(slug), null);
}

/** True si ya existe una corrida cacheada — guard del auto-arranque en el kickoff. */
export function hasTrustScoreCache(slug: string): boolean {
  return fs.existsSync(cacheFileFor(slug));
}

// Sección/pilar del Company Brief: completarlo = kickoff hecho (ya hay URL) y es
// el momento que enciende el Trust Score.
const COMPANY_BRIEF_SECTION = "company-brief";
const COMPANY_BRIEF_PILLAR = "company-brief";

/**
 * ¿Este cambio de estado de pilar es la finalización del Company Brief? Es el
 * disparador del auto-arranque del Trust Score en el kickoff. Puro (sin disco)
 * para test directo; el guard de "una sola vez" (sin cache previo) se evalúa
 * aparte en el llamante con hasTrustScoreCache, para no tocar disco salvo en
 * este momento concreto.
 */
export function isCompanyBriefCompletion(
  section: string,
  pillar: string,
  canonicalStatus: string,
  pillarChanged: boolean,
): boolean {
  return (
    canonicalStatus === "completed" &&
    pillarChanged === true &&
    section === COMPANY_BRIEF_SECTION &&
    pillar === COMPANY_BRIEF_PILLAR
  );
}

function resolveClientUrl(slug: string, queryUrl: string | null): string | null {
  // clients.json es { clients: [...] } (no un Record por slug): usar el cargador canónico.
  return loadClient(slug)?.url ?? queryUrl;
}

async function persistDailyMetric(slug: string, result: CompareResult) {
  const today = new Date().toISOString().slice(0, 10);
  const p = result.primary.pillars;
  const metrics = [
    { name: "trust_score", value: result.primary.trust_score, date: today },
    ...TRUST_PILLAR_KEYS.map((k) => ({ name: k, value: p?.[k]?.score ?? null, date: today })),
  ];
  const ingest = await ingestSourceMetrics(slug, "trust_score", metrics, today, { collectedAt: new Date().toISOString() });
  if (!ingest.ok) {
    throw new Error("metric_snapshots storage is not configured for Trust Score metrics");
  }
  return recomputeMetricKpisAfterIngest({
    slug,
    date: today,
    ingest,
    metricDates: [today],
    trigger: "trust-score:auto",
  });
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

/**
 * Corre el Trust Score en modo COMPARE y persiste todo. Devuelve un outcome
 * discriminado (la ruta API lo mapea a códigos HTTP; el hook fire-and-forget
 * solo loguea si !ok). No lanza por fallos esperables (URL/competidores/analyzer):
 * los devuelve como { ok: false, status }.
 */
export async function runTrustScore(
  slug: string,
  opts: RunTrustScoreOptions = {},
): Promise<RunTrustScoreOutcome> {
  const refresh = opts.refresh === true;
  // Set explícito (kickoff). Un set explícito es intencional y NO debe ser
  // secuestrado por un cache fresco (de un cron previo): por eso se evalúa antes.
  const provided: CompetitorInput[] | undefined = Array.isArray(opts.competitors)
    ? opts.competitors.filter((c) => c?.url)
    : undefined;

  const metricsDir = metricsDirFor(slug);
  const cacheFile = cacheFileFor(slug);
  const pinnedFile = path.join(metricsDir, "trust-score-competitors.json");

  // Si no es refresh y NO se mandó un set explícito, y hay cache fresco, servirlo.
  if (!refresh && !provided?.length) {
    const cached = readJSON<TrustScoreCache | null>(cacheFile, null);
    if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
      return { ok: true, cache: cached, ran: false };
    }
  }

  let clientUrl = resolveClientUrl(slug, opts.url ?? null);
  if (!clientUrl) {
    return { ok: false, status: 404, error: "No URL para el cliente. Pasá url o configurá url en clients.json" };
  }
  if (!clientUrl.startsWith("http")) clientUrl = "https://" + clientUrl;

  // Orden de resolución del set: explícito (kickoff) > pinned (reutilizado).
  // Si no hay ninguno, auto-descubrir vía el analyzer y tratarlo como kickoff.
  const pinned = readJSON<PinnedCompetitors | null>(pinnedFile, null);
  let competitors = provided?.length ? provided : pinned?.competitors;
  let autoDiscovered = false;

  if (!competitors?.length) {
    try {
      competitors = await discoverCompetitors(clientUrl, { limit: 4 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "discover failed";
      return {
        ok: false,
        status: 502,
        error: `Auto-descubrimiento de competidores falló: ${message}. Pasá { competitors: [{ url, name }] } a mano para fijar el set.`,
      };
    }
    if (!competitors.length) {
      return {
        ok: false,
        status: 409,
        error:
          "No se descubrieron competidores automáticamente. Pasá { competitors: [{ url, name }] } a mano para fijar el set.",
      };
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
    const metricsRecompute = await persistDailyMetric(slug, result);
    writeJSON(cacheFile, cache);
    // Doc del pilar Foundation (lo consume el Brand Brain y el Strategic Plan).
    writeTrustScoreDoc(slug, result, cache.url, cache.fetchedAt);

    return { ok: true, cache, ran: true, metricsRecompute };
  } catch (err) {
    const stale = readJSON<TrustScoreCache | null>(cacheFile, null);
    if (stale) return { ok: true, cache: { ...stale, _stale: true }, ran: false };
    const message = err instanceof Error ? err.message : "Trust Score fetch failed";
    return { ok: false, status: 500, error: message };
  }
}
