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

import { createHash, randomUUID } from "node:crypto";
import { createTask } from "@/lib/data/tasks";
import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";
import { buildCampaignPayload, describePlan, parseDiscoveryPlan } from "./discovery-plan";
import { observeDiscoveryExecutionCreated } from "./discovery-execution-observer";
import { getEffectiveModelConfig } from "./model-config";
import { getSearch, saveSearch, searchRelativePath } from "./discovery-store";
import type { DiscoveryPlan, DiscoverySearchRecord } from "./discovery-types";

export const DISCOVERY_RUNNER_SKILL = "discovery-search-runner";
export const DISCOVERY_TASK_TYPE = "outreach";

export class DiscoveryCommandError extends Error {
  constructor(message: string, public readonly status: 400 | 409) {
    super(message);
    this.name = "DiscoveryCommandError";
  }
}

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
  replayed: boolean;
}

const creationInFlight = new Map<
  string,
  { fingerprint: string; promise: Promise<CreateSearchResult> }
>();

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeCommandId(value: string): string {
  const commandId = value.trim();
  if (!commandId || commandId.length > 200) {
    throw new DiscoveryCommandError("commandId must contain between 1 and 200 characters", 400);
  }
  return commandId;
}

function resultFromExisting(search: DiscoverySearchRecord): CreateSearchResult {
  return {
    search,
    campaignId: search.campaignId,
    taskId: search.taskId,
    plan: search.plan,
    replayed: true,
  };
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
  /** Stable caller command. Reusing it with the same plan returns the original search. */
  commandId?: string | null;
  /** Frozen launch behavior; part of the command receipt. */
  executionIntent?: "auto" | "live" | "agent" | "fixtures" | "none";
}): Promise<CreateSearchResult> {
  const { slug } = options;
  // The command receipt is based on the caller's frozen request, not mutable
  // model defaults. A retry must still resolve if Settings changed meanwhile.
  const executionIntent = options.executionIntent ?? "auto";
  const commandFingerprint = sha256(canonicalJson({ plan: options.plan, executionIntent }));
  const commandId = normalizeCommandId(
    options.commandId ||
      (options.threadId
        ? `chat:${sha256(`${slug}\u0000${options.threadId}\u0000${commandFingerprint}`).slice(0, 32)}`
        : `request:${randomUUID()}`),
  );
  const commandHash = sha256(`${slug}\u0000${commandId}`);
  const searchId = `ds-${commandHash.slice(0, 20)}`;
  const existing = getSearch(slug, searchId);
  if (existing) {
    if (existing.commandFingerprint && existing.commandFingerprint !== commandFingerprint) {
      throw new DiscoveryCommandError("commandId was already used with a different discovery plan", 409);
    }
    return resultFromExisting(existing);
  }

  const inFlightKey = `${slug}:${commandId}`;
  const pending = creationInFlight.get(inFlightKey);
  if (pending) {
    if (pending.fingerprint !== commandFingerprint) {
      throw new DiscoveryCommandError("commandId was already used with a different discovery plan", 409);
    }
    const result = await pending.promise;
    return { ...result, replayed: true };
  }

  const creation = createDiscoverySearchOnce({
    slug,
    rawPlan: options.plan,
    threadId: options.threadId ?? null,
    commandId,
    commandFingerprint,
    commandHash,
    searchId,
    executionIntent,
  });
  creationInFlight.set(inFlightKey, { fingerprint: commandFingerprint, promise: creation });
  try {
    return await creation;
  } finally {
    if (creationInFlight.get(inFlightKey)?.promise === creation) creationInFlight.delete(inFlightKey);
  }
}

async function createDiscoverySearchOnce(options: {
  slug: string;
  rawPlan: unknown;
  threadId: string | null;
  commandId: string;
  commandFingerprint: string;
  commandHash: string;
  searchId: string;
  executionIntent: "auto" | "live" | "agent" | "fixtures" | "none";
}): Promise<CreateSearchResult> {
  const { slug, commandId, commandFingerprint, commandHash, searchId } = options;
  // SAN-76: defaults are resolved exactly once for a new command and then
  // frozen in the persisted search record.
  const effective = await getEffectiveModelConfig(slug);
  const plan = parseDiscoveryPlan(options.rawPlan, effective.config);

  // 1 · Campaign Partnerships en Yalc (modo de cualificación del plan).
  const config = resolveYalcConfig(slug);
  const created = await yalcFetch<YalcCampaignCreated>(config, "/api/campaigns", {
    method: "POST",
    body: buildCampaignPayload(plan),
    // Hashing keeps Unicode/PII out of HTTP headers and provider/proxy logs.
    headers: { "Idempotency-Key": `partnerships.discovery:${commandHash}` },
  });
  const campaignId = created.campaignId ?? created.campaign?.id;
  if (!campaignId) {
    throw new Error("YALC did not return a campaignId when creating the Partnerships campaign");
  }

  // 2 · Registro de la búsqueda (runner queued) — fuente de verdad del estado.
  const now = new Date();
  const record: DiscoverySearchRecord = {
    id: searchId,
    slug,
    commandId,
    commandFingerprint,
    executionIntent: options.executionIntent,
    title: plan.title,
    plan,
    campaignId,
    taskId: null,
    threadId: options.threadId,
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
      id: `P-Discovery-${commandHash.slice(0, 12)}`,
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

  // Shadow-observe at the shared creation boundary so UI/API, chat/MCP and
  // scripts all produce the same durable command. The observer is fail-open
  // and disabled by default, so it cannot make legacy creation fail.
  await observeDiscoveryExecutionCreated(search);

  return { search, campaignId, taskId, plan, replayed: false };
}
