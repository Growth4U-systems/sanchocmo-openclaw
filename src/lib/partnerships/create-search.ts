/**
 * Partnerships discovery · crear búsqueda (SAN-79)
 *
 * UNA sola lógica para las tres superficies (UI · chat · MCP):
 *   plan confirmado → campaign `type=Partnerships` en Yalc (vía yalcFetch)
 *                   + tarea Outreach madre en el sistema de tasks de Sancho
 *                   + registro de búsqueda con el runner encolado.
 *
 * Consumidores: `POST /api/partnerships/searches`, tool MCP `yalc_create_search`
 * y la skill `discovery-plan-builder` (que llama al endpoint).
 */

import { createTask } from "@/lib/data/tasks";
import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";
import { buildCampaignPayload, describePlan, parseDiscoveryPlan } from "./discovery-plan";
import { newSearchId, saveSearch, searchRelativePath } from "./discovery-store";
import type { DiscoveryPlan, DiscoverySearchRecord } from "./discovery-types";

export const DISCOVERY_RUNNER_SKILL = "discovery-search-runner";
export const DISCOVERY_TASK_TYPE = "outreach";

interface YalcCampaignCreated {
  ok?: boolean;
  campaignId?: string;
  campaign?: { id?: string; type?: string; qualificationMode?: string; disqualifyThreshold?: number };
}

export interface CreateSearchResult {
  search: DiscoverySearchRecord;
  campaignId: string;
  taskId: string | null;
  plan: DiscoveryPlan;
}

/**
 * Crea la búsqueda completa. `plan` puede venir crudo (JSON de la skill/MCP);
 * se valida con `parseDiscoveryPlan` (lanza `DiscoveryPlanError` si es inválido).
 */
export async function createDiscoverySearch(options: {
  slug: string;
  plan: unknown;
}): Promise<CreateSearchResult> {
  const { slug } = options;
  const plan = parseDiscoveryPlan(options.plan);

  // 1 · Campaign Partnerships en Yalc (modo de cualificación del plan).
  const config = resolveYalcConfig(slug);
  const created = await yalcFetch<YalcCampaignCreated>(config, "/api/campaigns", {
    method: "POST",
    body: buildCampaignPayload(plan),
  });
  const campaignId = created.campaignId ?? created.campaign?.id;
  if (!campaignId) {
    throw new Error("YALC did not return a campaignId when creating the Partnerships campaign");
  }

  // 2 · Registro de la búsqueda (runner queued) — fuente de verdad del estado.
  const now = new Date();
  const searchId = newSearchId(now);
  const record: DiscoverySearchRecord = {
    id: searchId,
    slug,
    title: plan.title,
    plan,
    campaignId,
    taskId: null,
    runner: {
      status: "queued",
      mode: null,
      queuedAt: now.toISOString(),
      startedAt: null,
      finishedAt: null,
      error: null,
      stats: null,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // 3 · Tarea Outreach madre — guarda plan + campaignId + estado del runner
  //     (el detalle vive en el JSON de la búsqueda, referenciado en la tarea).
  let taskId: string | null = null;
  try {
    const task = await createTask(slug, {
      name: `Búsqueda · ${plan.title}`,
      type: DISCOVERY_TASK_TYPE,
      channel: "outreach",
      status: "in-progress",
      owner: "Sancho",
      agent: "rocinante",
      skill: DISCOVERY_RUNNER_SKILL,
      description:
        `Búsqueda de creators (discovery-plan-builder).\n\n${describePlan(plan)}\n\n` +
        `Campaign Yalc: ${campaignId}\nBúsqueda: ${searchId} (outreach/searches/${searchId}.json)`,
      brief: `Descubrir ~${plan.targetVolume ?? 40} creators de ${plan.sectors.join(", ")} en ${plan.networks.join("+")} y puntuarlos con quality score.`,
      completion:
        "Runner completado: candidatos insertados en la campaign de Yalc con quality score (5 componentes); " +
        "los < umbral entran Disqualified con nota auto y el resto Sourced para triaje humano.",
      deliverable: `Leads scoreados en la campaign ${campaignId} (Outreach · Encuentra)`,
      output_files: [searchRelativePath(searchId)],
    });
    taskId = (task as { id?: string })?.id ?? null;
  } catch (err) {
    // La búsqueda sigue siendo operable sin tarea (p.ej. workspace sin tasks);
    // se registra y se continúa — el runner no depende de la tarea.
    console.error(`[partnerships] createTask failed for search ${searchId} (${slug}):`, err);
  }

  record.taskId = taskId;
  const search = saveSearch(record);

  return { search, campaignId, taskId, plan };
}
