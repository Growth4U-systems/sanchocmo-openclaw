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
import type { ExecutionControlRepository } from "@/lib/execution-control";
import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";
import {
  buildCampaignPayload,
  describePlan,
  parseDiscoveryPlan,
} from "./discovery-plan";
import { observeDiscoveryExecutionCreated } from "./discovery-execution-observer";
import { wakeCanaryDiscoveryWorker } from "./discovery-durable-worker";
import {
  isDiscoveryLedgerAuthoritative,
  isPartnershipsDurableWorkerBootEnabled,
  resolveDiscoveryExecutionPolicy,
  type DiscoveryExecutionEnvironment,
  type DiscoveryExecutionPolicy,
} from "./discovery-execution-policy";
import { getEffectiveModelConfig } from "./model-config";
import {
  bindSearchExecutionRun,
  getSearch,
  saveSearch,
  searchExecutionGeneration,
  searchRelativePath,
} from "./discovery-store";
import { supportsLiveDiscovery } from "./scrapecreators-live";
import type { DiscoveryPlan, DiscoverySearchRecord } from "./discovery-types";
import {
  admitCanaryDiscoverySetup,
  assertDiscoverySetupRawPlanBounds,
  DiscoverySetupCommandError,
  resumeExistingCanaryDiscoverySetup,
  type DiscoverySetupWorkerDependencies,
  type DiscoverySetupPendingResult,
} from "./discovery-setup-worker";

export const DISCOVERY_RUNNER_SKILL = "discovery-search-runner";
export const DISCOVERY_TASK_TYPE = "outreach";

export class DiscoveryCommandError extends Error {
  readonly code: string;

  constructor(
    message: string,
    public readonly status: 400 | 409 | 503,
    code?: string,
  ) {
    super(message);
    this.name = "DiscoveryCommandError";
    this.code =
      code ??
      (status === 409
        ? "DISCOVERY_COMMAND_CONFLICT"
        : status === 503
          ? "DISCOVERY_DURABLE_CAPABILITY_UNAVAILABLE"
          : "DISCOVERY_COMMAND_INVALID");
  }
}

interface YalcCampaignCreated {
  ok?: boolean;
  campaignId?: string;
  campaign?: {
    id?: string;
    type?: string;
    qualificationMode?: string;
    disqualifyThreshold?: number;
  };
}

export interface CreateSearchResult {
  search: DiscoverySearchRecord;
  campaignId: string;
  taskId: string | null;
  plan: DiscoveryPlan;
  replayed: boolean;
}

export type CreateDiscoverySearchResult =
  CreateSearchResult | DiscoverySetupPendingResult;

export interface CreateDiscoverySearchDependencies {
  repository?: ExecutionControlRepository;
  env?: DiscoveryExecutionEnvironment;
  getModelConfig?: typeof getEffectiveModelConfig;
  /** Optional latency hint for an injected durable runtime. */
  wakeDiscovery?: (slug: string) => Promise<void> | void;
  setup?: Omit<DiscoverySetupWorkerDependencies, "repository" | "env">;
}

export function isDiscoverySetupPending(
  result: CreateDiscoverySearchResult,
): result is DiscoverySetupPendingResult {
  return "kind" in result && result.kind === "pending";
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
    throw new DiscoveryCommandError(
      "commandId must contain between 1 and 200 characters",
      400,
    );
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

function canUseInjectedDurableExecutor(
  dependencies: CreateDiscoverySearchDependencies,
): boolean {
  return Boolean(dependencies.repository || dependencies.setup?.createCampaign);
}

function durableWorkerBootAvailable(
  dependencies: CreateDiscoverySearchDependencies,
): boolean {
  return (
    canUseInjectedDurableExecutor(dependencies) ||
    isPartnershipsDurableWorkerBootEnabled(
      process.env as DiscoveryExecutionEnvironment,
    )
  );
}

function durableWorkerBootDisabledError(): DiscoveryCommandError {
  return new DiscoveryCommandError(
    "Durable Partnerships discovery is configured but its worker boot flag is disabled",
    503,
    "DISCOVERY_DURABLE_WORKER_BOOT_DISABLED",
  );
}

async function wakeDiscoveryRuntime(
  slug: string,
  dependencies: CreateDiscoverySearchDependencies,
): Promise<void> {
  if (dependencies.wakeDiscovery) {
    await dependencies.wakeDiscovery(slug);
  } else if (!dependencies.repository) {
    wakeCanaryDiscoveryWorker(slug);
  }
}

async function replayExistingDiscoverySearch(
  existing: DiscoverySearchRecord,
  input: {
    commandFingerprint: string;
    executionIntent: "auto" | "live" | "agent" | "fixtures" | "none";
    policy: DiscoveryExecutionPolicy;
    bootAvailable: boolean;
    dependencies: CreateDiscoverySearchDependencies;
  },
): Promise<CreateSearchResult> {
  const {
    commandFingerprint,
    executionIntent,
    policy,
    bootAvailable,
    dependencies,
  } = input;
  if (
    existing.commandFingerprint &&
    existing.commandFingerprint !== commandFingerprint
  ) {
    throw new DiscoveryCommandError(
      "commandId was already used with a different discovery plan",
      409,
    );
  }
  const canary =
    isDiscoveryLedgerAuthoritative(existing) ||
    (policy.enabled && policy.mode === "canary");
  if (
    canary &&
    (executionIntent === "none" ||
      executionIntent === "agent" ||
      (executionIntent !== "fixtures" && !supportsLiveDiscovery(existing.plan)))
  ) {
    throw new DiscoveryCommandError(
      "This command is not supported by the Instagram-only durable discovery canary",
      400,
    );
  }

  const observerDependencies = {
    ...(dependencies.repository ? { repository: dependencies.repository } : {}),
    ...(dependencies.env ? { env: dependencies.env } : {}),
  };
  if (isDiscoveryLedgerAuthoritative(existing) && !bootAvailable) {
    if (!existing.executionControl?.runId) {
      throw durableWorkerBootDisabledError();
    }
    await observeDiscoveryExecutionCreated(existing, observerDependencies);
    return resultFromExisting(existing);
  }
  // A sticky Ledger projection must be validated before any compatibility
  // mutation (including resolving mutable model defaults) is persisted.
  let observation = isDiscoveryLedgerAuthoritative(existing)
    ? await observeDiscoveryExecutionCreated(existing, observerDependencies)
    : null;

  let admitted = existing;
  if (canary && !admitted.executionModelConfig) {
    const effective = await (
      dependencies.getModelConfig ?? getEffectiveModelConfig
    )(admitted.slug);
    admitted = saveSearch({
      ...admitted,
      executionModelConfig: JSON.parse(JSON.stringify(effective.config)),
    });
  }
  if (canary && admitted.executionControl?.mode !== "canary") {
    admitted = saveSearch({
      ...admitted,
      executionControl: {
        mode: "canary",
        admittedAt: new Date().toISOString(),
        generation: 1,
      },
    });
  } else if (
    canary &&
    admitted.executionControl &&
    !admitted.executionControl.generation
  ) {
    admitted = saveSearch({
      ...admitted,
      executionControl: {
        ...admitted.executionControl,
        generation: searchExecutionGeneration(admitted),
      },
    });
  }
  observation ??= await observeDiscoveryExecutionCreated(
    admitted,
    observerDependencies,
  );
  if (
    canary &&
    observation.runId &&
    (admitted.executionControl?.runId !== observation.runId ||
      (observation.commandFingerprint &&
        admitted.executionControl?.commandFingerprint !==
          observation.commandFingerprint))
  ) {
    admitted = bindSearchExecutionRun(admitted.slug, admitted.id, {
      generation: searchExecutionGeneration(admitted),
      runId: observation.runId,
      commandFingerprint: observation.commandFingerprint,
    }).search;
  }
  if (canary) await wakeDiscoveryRuntime(admitted.slug, dependencies);
  return resultFromExisting(admitted);
}

/**
 * Crea la búsqueda completa. `plan` puede venir crudo (JSON de la skill/MCP);
 * se valida con `parseDiscoveryPlan` (lanza `DiscoveryPlanError` si es inválido).
 */
export async function createDiscoverySearch(
  options: {
    slug: string;
    plan: unknown;
    /** Hilo MC Chat donde se construyó el plan (SAN-328) — para retomar la sesión desde la tarjeta. */
    threadId?: string | null;
    /** Stable caller command. Reusing it with the same plan returns the original search. */
    commandId?: string | null;
    /** Frozen launch behavior; part of the command receipt. */
    executionIntent?: "auto" | "live" | "agent" | "fixtures" | "none";
  },
  dependencies: CreateDiscoverySearchDependencies = {},
): Promise<CreateDiscoverySearchResult> {
  const { slug } = options;
  const executionEnvironment =
    dependencies.env ?? (process.env as DiscoveryExecutionEnvironment);
  const executionPolicy = resolveDiscoveryExecutionPolicy(
    slug,
    executionEnvironment,
  );
  const bootAvailable = durableWorkerBootAvailable(dependencies);
  const threadId = options.threadId?.trim() || null;
  if (threadId && threadId.length > 512) {
    throw new DiscoveryCommandError(
      "threadId cannot exceed 512 characters",
      400,
    );
  }
  const hasStableCallerCommand = Boolean(options.commandId?.trim() || threadId);
  if (
    executionPolicy.enabled &&
    executionPolicy.mode === "canary" &&
    !options.commandId?.trim() &&
    !threadId
  ) {
    throw new DiscoveryCommandError(
      "A stable commandId (or stable chat threadId) is required for canary discovery creation",
      400,
    );
  }
  // The command receipt is based on the caller's frozen request, not mutable
  // model defaults. A retry must still resolve if Settings changed meanwhile.
  const executionIntent = options.executionIntent ?? "auto";
  assertDiscoverySetupRawPlanBounds(options.plan);
  const commandFingerprint = sha256(
    canonicalJson({ plan: options.plan, executionIntent }),
  );
  const commandId = normalizeCommandId(
    options.commandId ||
      (threadId
        ? `chat:${sha256(`${slug}\u0000${threadId}\u0000${commandFingerprint}`).slice(0, 32)}`
        : `request:${randomUUID()}`),
  );
  const commandHash = sha256(`${slug}\u0000${commandId}`);
  const searchId = `ds-${commandHash.slice(0, 20)}`;
  const setupDependencies: DiscoverySetupWorkerDependencies = {
    ...dependencies.setup,
    ...(dependencies.repository ? { repository: dependencies.repository } : {}),
    ...(dependencies.env ? { env: dependencies.env } : {}),
    ...(dependencies.getModelConfig
      ? { getModelConfig: dependencies.getModelConfig }
      : {}),
    ...(dependencies.wakeDiscovery
      ? { wakeDiscovery: dependencies.wakeDiscovery }
      : {}),
  };
  const existing = getSearch(slug, searchId);
  const durableReceiptLookupAvailable = Boolean(
    dependencies.repository || process.env.DATABASE_URL,
  );
  if (
    hasStableCallerCommand &&
    (!executionPolicy.enabled ||
      executionPolicy.mode !== "canary" ||
      !bootAvailable) &&
    durableReceiptLookupAvailable
  ) {
    // Pre-setup JSON canary receipts predate the setup operation. Validate or
    // repair their exact child directly; probing setup first would require a
    // database lookup that can neither exist nor add authority for this case.
    if (existing && !existing.executionControl?.setupRunId) {
      if (!bootAvailable && !isDiscoveryLedgerAuthoritative(existing)) {
        throw durableWorkerBootDisabledError();
      }
      return replayExistingDiscoverySearch(existing, {
        commandFingerprint,
        executionIntent,
        policy: executionPolicy,
        bootAvailable,
        dependencies,
      });
    }
    try {
      // Rollout and artifact-store flags govern new admission only. Whenever
      // a durable store exists, consult the exact Ledger receipt before legacy
      // routing; an existing command must fail closed if its executor is
      // unavailable, never fall through and duplicate external effects. With
      // no injected/default database there cannot be a durable receipt, so the
      // historical standalone/off path remains usable.
      const resumed = await resumeExistingCanaryDiscoverySetup(
        {
          slug,
          commandId,
          commandHash,
          requestFingerprint: commandFingerprint,
          searchId,
        },
        setupDependencies,
      );
      if (resumed) {
        if (resumed.kind === "pending") return resumed;
        return {
          search: resumed.search,
          campaignId: resumed.campaignId,
          taskId: resumed.taskId,
          plan: resumed.plan,
          replayed: true,
        };
      }
    } catch (error) {
      if (
        error instanceof DiscoverySetupCommandError &&
        (error.status === 400 || error.status === 409)
      ) {
        throw new DiscoveryCommandError(error.message, error.status);
      }
      // Exact-scope lookup failures are intentionally fail-closed: falling
      // through to legacy here could duplicate an already-admitted setup.
      throw error;
    }
  }
  if (
    executionPolicy.enabled &&
    executionPolicy.mode === "canary" &&
    !bootAvailable
  ) {
    throw durableWorkerBootDisabledError();
  }
  if (
    executionPolicy.mode === "canary" &&
    executionPolicy.reason === "artifact_store_not_acknowledged"
  ) {
    throw new DiscoveryCommandError(
      "Durable discovery is configured for this tenant but its persistent single-host artifact store is not acknowledged",
      503,
      "DISCOVERY_DURABLE_CAPABILITY_UNAVAILABLE",
    );
  }
  // Compatibility bridge for JSON receipts created by the original canary
  // before pre-effect setup existed. Its exact child is reused/repaired; a
  // new setup campaign must never be admitted for the same command.
  if (
    existing &&
    executionPolicy.enabled &&
    executionPolicy.mode === "canary" &&
    !existing.executionControl?.setupRunId
  ) {
    return replayExistingDiscoverySearch(existing, {
      commandFingerprint,
      executionIntent,
      policy: executionPolicy,
      bootAvailable,
      dependencies,
    });
  }
  if (executionPolicy.enabled && executionPolicy.mode === "canary") {
    if (executionIntent === "none" || executionIntent === "agent") {
      throw new DiscoveryCommandError(
        "The durable discovery canary accepts confirmed server-side execution only",
        400,
      );
    }
    try {
      const admitted = await admitCanaryDiscoverySetup(
        {
          slug,
          rawPlan: options.plan,
          threadId,
          commandId,
          commandHash,
          requestFingerprint: commandFingerprint,
          searchId,
          executionIntent,
        },
        setupDependencies,
      );
      if (admitted.kind === "pending") return admitted;
      return {
        search: admitted.search,
        campaignId: admitted.campaignId,
        taskId: admitted.taskId,
        plan: admitted.plan,
        replayed: admitted.replayed,
      };
    } catch (error) {
      if (
        error instanceof DiscoverySetupCommandError &&
        (error.status === 400 || error.status === 409)
      ) {
        throw new DiscoveryCommandError(error.message, error.status);
      }
      throw error;
    }
  }
  if (existing) {
    return replayExistingDiscoverySearch(existing, {
      commandFingerprint,
      executionIntent,
      policy: executionPolicy,
      bootAvailable,
      dependencies,
    });
  }

  const inFlightKey = `${slug}:${commandId}`;
  const pending = creationInFlight.get(inFlightKey);
  if (pending) {
    if (pending.fingerprint !== commandFingerprint) {
      throw new DiscoveryCommandError(
        "commandId was already used with a different discovery plan",
        409,
      );
    }
    const result = await pending.promise;
    return { ...result, replayed: true };
  }

  const creation = createDiscoverySearchOnce(
    {
      slug,
      rawPlan: options.plan,
      threadId,
      commandId,
      commandFingerprint,
      commandHash,
      searchId,
      executionIntent,
    },
    dependencies,
  );
  creationInFlight.set(inFlightKey, {
    fingerprint: commandFingerprint,
    promise: creation,
  });
  try {
    return await creation;
  } finally {
    if (creationInFlight.get(inFlightKey)?.promise === creation)
      creationInFlight.delete(inFlightKey);
  }
}

async function createDiscoverySearchOnce(
  options: {
    slug: string;
    rawPlan: unknown;
    threadId: string | null;
    commandId: string;
    commandFingerprint: string;
    commandHash: string;
    searchId: string;
    executionIntent: "auto" | "live" | "agent" | "fixtures" | "none";
  },
  dependencies: CreateDiscoverySearchDependencies = {},
): Promise<CreateSearchResult> {
  const { slug, commandId, commandFingerprint, commandHash, searchId } =
    options;
  const executionPolicy = resolveDiscoveryExecutionPolicy(
    slug,
    dependencies.env,
  );
  // SAN-76: defaults are resolved exactly once for a new command and then
  // frozen in the persisted search record.
  const effective = await (
    dependencies.getModelConfig ?? getEffectiveModelConfig
  )(slug);
  const plan = parseDiscoveryPlan(options.rawPlan, effective.config);
  if (executionPolicy.enabled && executionPolicy.mode === "canary") {
    if (
      options.executionIntent === "none" ||
      options.executionIntent === "agent"
    ) {
      throw new DiscoveryCommandError(
        "The durable discovery canary accepts confirmed server-side execution only",
        400,
      );
    }
    if (
      options.executionIntent !== "fixtures" &&
      !supportsLiveDiscovery(plan)
    ) {
      throw new DiscoveryCommandError(
        "The durable discovery canary currently supports Instagram-only searches",
        400,
      );
    }
  }

  // 1 · Campaign Partnerships en Yalc (modo de cualificación del plan).
  const config = resolveYalcConfig(slug);
  const created = await yalcFetch<YalcCampaignCreated>(
    config,
    "/api/campaigns",
    {
      method: "POST",
      body: buildCampaignPayload(plan),
      // Hashing keeps Unicode/PII out of HTTP headers and provider/proxy logs.
      headers: { "Idempotency-Key": `partnerships.discovery:${commandHash}` },
    },
  );
  const campaignId = created.campaignId ?? created.campaign?.id;
  if (!campaignId) {
    throw new Error(
      "YALC did not return a campaignId when creating the Partnerships campaign",
    );
  }

  // 2 · Registro de la búsqueda (runner queued) — fuente de verdad del estado.
  const now = new Date();
  const record: DiscoverySearchRecord = {
    id: searchId,
    slug,
    commandId,
    commandFingerprint,
    executionIntent: options.executionIntent,
    ...(executionPolicy.enabled && executionPolicy.mode === "canary"
      ? {
          executionControl: {
            mode: "canary" as const,
            admittedAt: now.toISOString(),
            generation: 1,
          },
        }
      : {}),
    title: plan.title,
    plan,
    executionModelConfig: JSON.parse(JSON.stringify(effective.config)),
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
    console.error(
      `[partnerships] seed campaign project failed for search ${searchId} (${slug}):`,
      err,
    );
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
      const refreshed = (await import("./discovery-store")).getSearch(
        slug,
        search.id,
      );
      if (refreshed) search = refreshed;
    }
    if (missing.length > 0) {
      console.warn(
        `[partnerships] plan templates without library match for ${searchId} (${slug}): ${missing.join(", ")}`,
      );
    }
  } catch (err) {
    console.error(
      `[partnerships] assignTemplatesFromPlan failed for ${searchId} (${slug}):`,
      err,
    );
  }

  // Observe at the shared creation boundary so UI/API, chat/MCP and scripts
  // produce the same command. Shadow is fail-open; an explicitly gated canary
  // is fail-closed once the product receipt exists.
  const observation = await observeDiscoveryExecutionCreated(search, {
    ...(dependencies.repository ? { repository: dependencies.repository } : {}),
    ...(dependencies.env ? { env: dependencies.env } : {}),
  });
  if (
    executionPolicy.enabled &&
    executionPolicy.mode === "canary" &&
    observation.runId
  ) {
    search = bindSearchExecutionRun(slug, search.id, {
      generation: searchExecutionGeneration(search),
      runId: observation.runId,
      commandFingerprint: observation.commandFingerprint,
    }).search;
  }
  await wakeDiscoveryRuntime(search.slug, dependencies);

  return { search, campaignId, taskId, plan, replayed: false };
}
