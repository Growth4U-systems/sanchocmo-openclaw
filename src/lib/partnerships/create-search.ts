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
import { getEffectiveModelConfig } from "./model-config";
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
  /** Hilo MC Chat donde se construyó el plan (SAN-328) — para retomar la sesión desde la tarjeta. */
  threadId?: string | null;
}): Promise<CreateSearchResult> {
  const { slug } = options;
  // SAN-76: el modo/umbral de cualificación por defecto sale de la config
  // EFECTIVA (Yalc model-config + defaults) — un umbral editado en Settings
  // aplica a las búsquedas NUEVAS (nunca retro-aplica a campañas existentes).
  const effective = await getEffectiveModelConfig(slug);
  const plan = parseDiscoveryPlan(options.plan, effective.config);

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
    threadId: options.threadId ?? null,
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

  // 3 · Proyecto de campaña (SAN-195) — al generar una nueva búsqueda se siembra
  //     el task-set `outreach-campaign` (búsqueda+scoring → enriquecer →
  //     secuencias → lanzar) reutilizando el creador genérico (seedFromTaskSet).
  //     La tarea madre = T01 del proyecto (el runner); el detalle del estado vive
  //     en el JSON de la búsqueda, referenciado en la tarea.
  let taskId: string | null = null;
  let projectId: string | null = null;
  try {
    const project = await createTask(slug, {
      type: "project",
      name: `Campaña · ${plan.title}`,
      category: "outreach-campaign",
      status: "in-progress",
      owner: "Sancho",
      description:
        `Campaña de outreach a partir de la búsqueda de creators (discovery-plan-builder).\n\n${describePlan(plan)}\n\n` +
        `Campaign Yalc: ${campaignId}\nBúsqueda: ${searchId} (${searchRelativePath(searchId)})`,
      seedFromTaskSet: "outreach-campaign",
    });
    projectId = (project as { id?: string })?.id ?? null;
    // T01 del set es el runner (discovery-search-runner) → tarea madre de la búsqueda.
    taskId = projectId ? `${projectId}-T01` : null;
  } catch (err) {
    // La búsqueda sigue siendo operable sin proyecto (p.ej. workspace sin tasks);
    // se registra y se continúa — el runner no depende de la tarea.
    console.error(`[partnerships] seed campaign project failed for search ${searchId} (${slug}):`, err);
  }

  record.projectId = projectId;
  record.taskId = taskId;
  let search = saveSearch(record);

  // 4 · Fila "Plantillas" del plan (SAN-79 la emite, SAN-80 la materializa):
  //     instancia copias de la biblioteca que coincidan por nombre/id.
  //     Tolerante: nombres desconocidos quedan en el plan para crearlos luego.
  try {
    const { assignTemplatesFromPlan } = await import("./template-store");
    const { assigned, missing } = assignTemplatesFromPlan(slug, search);
    if (assigned.length > 0) {
      const refreshed = (await import("./discovery-store")).getSearch(slug, search.id);
      if (refreshed) search = refreshed;
    }
    if (missing.length > 0) {
      console.warn(
        `[partnerships] plan templates without library match for ${searchId} (${slug}): ${missing.join(", ")}`,
      );
    }
  } catch (err) {
    console.error(`[partnerships] assignTemplatesFromPlan failed for ${searchId} (${slug}):`, err);
  }

  return { search, campaignId, taskId, plan };
}
