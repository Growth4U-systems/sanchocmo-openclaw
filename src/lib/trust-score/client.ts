/**
 * Cliente del Trust Score Analyzer (Growth4U-systems/trust-score-analyzer).
 *
 * El analyzer expone endpoints SSE (text/event-stream): emite frames
 * `data: {"type": "...", ...}\n\n`. El payload final es el frame con
 * type === "result" (lleva { data }). Ver SAN-194.
 *
 * La URL base es configurable por env (TRUST_SCORE_API_BASE) a propósito: el
 * analyzer se deploya por CLI y cambió de basePath (/trust-score -> /herramientas).
 * No se hardcodea para no atarse a una URL que se mueve.
 */

const API_BASE =
  process.env.TRUST_SCORE_API_BASE?.replace(/\/$/, "") ||
  "https://trust.growth4u.io/herramientas";

export const TRUST_PILLAR_KEYS = [
  "borrowed_trust",
  "serp_trust",
  "brand_assets",
  "geo_presence",
  "outbound_readiness",
  "demand_engine",
] as const;

export type TrustPillarKey = (typeof TRUST_PILLAR_KEYS)[number];

export interface TrustPillar {
  score: number;
  findings: string[];
}

export type TrustPillars = Record<TrustPillarKey, TrustPillar>;

export interface BrandScore {
  url: string;
  domain: string;
  brand_name: string;
  sector: string;
  region: string;
  trust_score: number;
  pillars: TrustPillars;
  top_gaps: string[];
  serp_highlight: string;
  geo_highlight: string;
  verdict: string;
  geo_llm_results?: Record<string, { mentions: boolean }>;
  geo_llms_tested?: number;
}

export interface TrustComparison {
  pillar_winners: Record<string, string>;
  primary_advantages: string[];
  primary_gaps: string[];
  insights: string[];
  verdict: string;
}

export interface CompareResult {
  primary: BrandScore;
  competitors: BrandScore[];
  comparison: TrustComparison;
}

export interface CompetitorInput {
  url: string;
  name?: string;
}

interface SseEvent {
  type?: string;
  data?: unknown;
  message?: string;
}

/** Lee un stream SSE del analyzer y devuelve el `data` del evento `result`. */
async function consumeSse(resp: Response): Promise<unknown> {
  if (!resp.ok) throw new Error(`Trust Score analyzer: HTTP ${resp.status}`);
  if (!resp.body) throw new Error("Trust Score analyzer: respuesta sin body");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: unknown = null;

  // El body de fetch en Node 18+ es async-iterable; el lib DOM no lo tipa así.
  const stream = resp.body as unknown as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (!frame.startsWith("data:")) continue;
      let evt: SseEvent;
      try {
        evt = JSON.parse(frame.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "result") result = evt.data;
      else if (evt.type === "error") {
        throw new Error(`Trust Score analyzer: ${evt.message || "error en el stream"}`);
      }
    }
  }

  // Flush final: un proxy puede entregar el último frame sin "\n\n" de cierre.
  const tail = (buffer + decoder.decode()).trim();
  if (result == null && tail.startsWith("data:")) {
    try {
      const evt = JSON.parse(tail.slice(5).trim()) as SseEvent;
      if (evt.type === "result") result = evt.data;
      else if (evt.type === "error") {
        throw new Error(`Trust Score analyzer: ${evt.message || "error en el stream"}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Trust Score")) throw err;
    }
  }

  if (result == null) {
    throw new Error("Trust Score analyzer: el stream terminó sin evento result");
  }
  return result;
}

/**
 * Corre el análisis de competidores: puntúa la marca propia STANDALONE
 * (includeCompetitor:false) + cada competidor, y genera el gap. Devuelve el
 * self-score limpio (primary) y la comparación. Ese es el camino para que
 * baseline y tracking coincidan (ver SAN-194); no usar el modo individual,
 * que contamina el self-score con un competidor inyectado en el prompt.
 */
export async function runCompare(
  primaryUrl: string,
  competitors: CompetitorInput[],
  opts: { timeoutMs?: number } = {},
): Promise<CompareResult> {
  // El tope real es el maxDuration del analyzer (compare = 180s en Vercel); abortamos un
  // poco antes para dar un error claro en vez de un corte opaco del server.
  const timeoutMs = opts.timeoutMs ?? 170_000;
  try {
    const resp = await fetch(`${API_BASE}/api/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primary: { url: primaryUrl }, competitors }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return (await consumeSse(resp)) as CompareResult;
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`Trust Score analyzer: timeout tras ${timeoutMs}ms`);
    }
    throw err;
  }
}

interface DiscoveredCompetitor {
  name: string;
  website: string; // dominio sin protocolo ni www (ej "competidor.com")
  reason?: string;
  region_match?: boolean;
  relevance_score?: number;
  source?: string;
}

/**
 * Lee un stream SSE de discover-competitors y devuelve el `data` del evento
 * terminal `competitors` (a diferencia de compare, no emite `result`).
 */
async function consumeDiscoverSse(resp: Response): Promise<DiscoveredCompetitor[]> {
  if (!resp.ok) throw new Error(`Trust Score discover: HTTP ${resp.status}`);
  if (!resp.body) throw new Error("Trust Score discover: respuesta sin body");

  const decoder = new TextDecoder();
  let buffer = "";
  let competitors: DiscoveredCompetitor[] = [];
  let sawCompetitors = false;

  const apply = (evt: SseEvent) => {
    if (evt.type === "competitors" && Array.isArray(evt.data)) {
      competitors = evt.data as DiscoveredCompetitor[];
      sawCompetitors = true;
    } else if (evt.type === "error") {
      throw new Error(`Trust Score discover: ${evt.message || "error en el stream"}`);
    }
  };

  const stream = resp.body as unknown as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (!frame.startsWith("data:")) continue;
      try {
        apply(JSON.parse(frame.slice(5).trim()) as SseEvent);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Trust Score")) throw err;
      }
    }
  }

  // Flush final: el frame terminal puede llegar sin "\n\n" de cierre.
  const tail = (buffer + decoder.decode()).trim();
  if (tail.startsWith("data:")) {
    try {
      apply(JSON.parse(tail.slice(5).trim()) as SseEvent);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Trust Score")) throw err;
    }
  }

  // Una corrida limpia SIEMPRE emite el evento competitors. Si no lo vimos, el stream se
  // cortó antes (server caído, kill de Vercel): es un fallo upstream, no "0 resultados".
  if (!sawCompetitors) {
    throw new Error("Trust Score discover: el stream terminó sin evento competitors");
  }
  return competitors;
}

/**
 * Auto-descubre competidores directos de `primaryUrl` vía el analyzer
 * (Gemini + Perplexity con web search, fallback SERP). Devuelve hasta `limit`
 * ya rankeados, en shape CompetitorInput ({ url, name }) listo para runCompare.
 */
export async function discoverCompetitors(
  primaryUrl: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<CompetitorInput[]> {
  // El tope real es el maxDuration del analyzer (discover = 60s en Vercel); abortamos antes.
  const timeoutMs = opts.timeoutMs ?? 55_000;
  let discovered: DiscoveredCompetitor[];
  try {
    const resp = await fetch(`${API_BASE}/api/discover-competitors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: primaryUrl }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    discovered = await consumeDiscoverSse(resp);
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`Trust Score discover: timeout tras ${timeoutMs}ms`);
    }
    throw err;
  }
  return discovered
    .filter((c) => c?.website)
    .slice(0, opts.limit ?? 4)
    .map((c) => ({ url: c.website, name: c.name }));
}

export { API_BASE as TRUST_SCORE_API_BASE };
