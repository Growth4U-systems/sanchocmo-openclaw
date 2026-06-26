import { addMessage, getChatSecret, getGatewayUrl } from "@/lib/data/mc-chat";

/**
 * Discovery-runner trigger (SAN-328).
 *
 * Al lanzar una búsqueda, despacha a Rocinante (skill `discovery-search-runner`)
 * en SU PROPIO hilo vía el gateway (`/mc-chat/inbound`) para que ejecute el
 * discovery REAL: scrapea creators con las tools ScrapeCreators según el plan e
 * ingesta candidatos vía `/run`. Sin esto, la búsqueda quedaba `queued` para
 * siempre porque NADIE la recogía (no hay cron; el runner es manual).
 *
 * Best-effort, calcado de `triggerWriter` (src/lib/data/writer-trigger.ts): si
 * el gateway está caído, la búsqueda sigue `queued` (recuperable a mano) y se
 * deja un marcador local con lo que se pidió.
 */

export interface TriggerDiscoveryRunnerInput {
  slug: string;
  searchId: string;
  /** Título de la búsqueda — solo para el nombre del hilo del runner. */
  title?: string;
}

export interface TriggerDiscoveryRunnerResult {
  forwardedToGateway: boolean;
  threadId: string;
  error?: string;
}

const RUNNER_SKILL = "discovery-search-runner";
const RUNNER_AGENT = "rocinante";

/** Hilo dedicado del runner — separado del chat del plan (discovery-plan-builder).
 *  Dash-shaped para casar con la sanitización `:`→`-` de mc-chat.threadFile(). */
function buildRunnerThreadId(slug: string, searchId: string): string {
  return `${slug}:discovery-run-${searchId.toLowerCase()}`;
}

function buildRunnerMessage(input: TriggerDiscoveryRunnerInput): string {
  const label = input.title ? `"${input.title}" ` : "";
  return [
    `Ejecuta el discovery de la búsqueda ${label}(searchId \`${input.searchId}\`, slug \`${input.slug}\`).`,
    `1) GET /api/partnerships/searches?slug=${input.slug}&status=queued y localiza ${input.searchId} (trae plan + campaignId).`,
    `2) Scrapea candidatos por red con las tools mcp__scrapecreators__* según el plan (sectores/redes/tiers/volumen) y comprueba el repeat de competidores en ad-library.`,
    `3) POST /api/partnerships/searches/${input.searchId}/run con los candidatos normalizados (el endpoint hace qualify-enrich + ingesta en Yalc).`,
    `Sigue la skill ${RUNNER_SKILL}. Publica el progreso en este hilo.`,
  ].join("\n");
}

/**
 * Despacha el runner de discovery a Rocinante. Devuelve si el gateway aceptó el
 * inbound (fire-and-forget) y el hilo donde corre.
 */
export async function triggerDiscoveryRunner(
  input: TriggerDiscoveryRunnerInput,
): Promise<TriggerDiscoveryRunnerResult> {
  const threadId = buildRunnerThreadId(input.slug, input.searchId);
  const message = buildRunnerMessage(input);

  // Marcador local: aunque el gateway esté caído, el humano ve qué se pidió.
  addMessage(threadId, "system", "🐴 Pidiendo a Rocinante que ejecute el discovery (scraping real)…");
  addMessage(threadId, "user", message);

  const secret = getChatSecret();
  const payload = {
    slug: input.slug,
    threadId,
    threadName: input.title ? `Discovery: ${input.title}` : `Discovery ${input.searchId}`,
    text: message,
    userId: "mc-partnerships-trigger",
    userName: "Mission Control",
    linkedTo: "rocinante",
    skill: RUNNER_SKILL,
    skills: [RUNNER_SKILL],
    agent: RUNNER_AGENT,
    threadState: "continue",
    isAdmin: true,
    senderRole: "admin",
  };

  try {
    const res = await fetch(`${getGatewayUrl()}/mc-chat/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-MC-Secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { forwardedToGateway: false, threadId, error: `gateway ${res.status}: ${text}` };
    }
    return { forwardedToGateway: true, threadId };
  } catch (e) {
    return {
      forwardedToGateway: false,
      threadId,
      error: e instanceof Error ? e.message : "Gateway unreachable",
    };
  }
}
