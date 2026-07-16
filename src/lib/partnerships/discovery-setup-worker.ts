import { createHash, randomUUID } from "node:crypto";
import {
  ensureProjectInsertOnly,
  getTask,
  taskHasIdempotencyMarker,
} from "@/lib/data/tasks";
import {
  PostgresExecutionControlRepository,
  type CreateExecutionRunInput,
  type ExecutionControlRepository,
  type ExecutionOriginControlRepository,
  type ExecutionLeaseScope,
  type ExecutionRun,
} from "@/lib/execution-control";
import { ExecutionCommandConflictError } from "@/lib/execution-control/types";
import {
  DurableExecutionEngine,
  DurableExecutionRegistry,
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  durableExecutionMcChatOrigin,
  type DurableExecutionErrorDecision,
  type DurableExecutionHandler,
} from "@/lib/durable-execution";
import { sanitizeSupportBundle } from "@/lib/support/redaction";
import { isValidTenantSlug } from "@/lib/thread-id";
import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";
import type { YalcRuntimeConfig } from "@/lib/yalc/client";
import {
  DEFAULT_CREATOR_MODEL_CONFIG,
  type CreatorModelConfig,
} from "@/lib/calc-creator-core";
import {
  buildCampaignPayload,
  describePlan,
  parseDiscoveryPlan,
} from "./discovery-plan";
import {
  buildDiscoveryExecutionSnapshot,
  DISCOVERY_EXECUTION_AGGREGATE,
  DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
  DISCOVERY_SETUP_HANDLER_VERSION,
  DISCOVERY_SETUP_OPERATION,
  discoveryCanaryExecutionIdempotencyKey,
  discoveryExecutionAggregateId,
  isPartnershipsDurableWorkerBootEnabled,
  isDiscoverySingleHostStoreAcknowledged,
  resolveDiscoveryExecutionPolicy,
  type DiscoveryCampaignRequest,
  type DiscoveryExecutionEnvironment,
  type DiscoveryExecutionSnapshot,
  type DiscoveryModelConfigEvidence,
  type DiscoverySetupCommandV1,
  type DiscoverySetupPreparedV1,
  type DiscoverySetupProgressV1,
} from "./discovery-execution-policy";
import {
  admitPartnershipsDiscoveryV2,
  partnershipsDiscoveryEffectsV2Requested,
  type PartnershipsDiscoveryV2Environment,
  type PartnershipsYalcAssignCapabilityReceipt,
} from "./discovery-admission-v2";
import {
  bindSearchExecutionRunForSetup,
  getSearch,
  saveSearchForSetup,
  searchRelativePath,
} from "./discovery-store";
import { getEffectiveModelConfig } from "./model-config";
import { supportsLiveDiscovery } from "./scrapecreators-live";
import type { DiscoveryPlan, DiscoverySearchRecord } from "./discovery-types";

const DEFAULT_SETUP_INLINE_TIMEOUT_MS = 7_000;
const DEFAULT_SETUP_LEASE_MS = 60_000;
const DEFAULT_SETUP_MAX_ATTEMPTS = 3;
const DEFAULT_MODEL_CONFIG_TIMEOUT_MS = 2_000;
const DEFAULT_YALC_WRITE_TIMEOUT_MS = 15_000;
const SETUP_POLL_MS = 50;
const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_RAW_PLAN_BYTES = 64 * 1024;
const MAX_RAW_PLAN_DEPTH = 24;
const MAX_RAW_PLAN_NODES = 5_000;
const MAX_THREAD_ID_LENGTH = 512;

export interface DiscoverySetupEnvironment
  extends DiscoveryExecutionEnvironment, PartnershipsDiscoveryV2Environment {
  PARTNERSHIPS_DISCOVERY_SETUP_INLINE_TIMEOUT_MS?: string;
  PARTNERSHIPS_DISCOVERY_MODEL_CONFIG_TIMEOUT_MS?: string;
  PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS?: string;
}

interface YalcCampaignCreated {
  campaignId?: string;
  campaign?: { id?: string };
}

export interface DiscoverySetupWorkerDependencies {
  repository?: ExecutionControlRepository;
  env?: DiscoverySetupEnvironment;
  now?: () => Date;
  workerId?: string;
  inlineTimeoutMs?: number;
  createCampaign?: (
    slug: string,
    body: DiscoveryCampaignRequest,
    idempotencyKey: string,
    options?: { signal?: AbortSignal },
  ) => Promise<YalcCampaignCreated>;
  createWorkspace?: (
    slug: string,
    command: DiscoverySetupCommandV1,
    prepared: DiscoverySetupPreparedV1,
    campaignId: string,
  ) => Promise<{
    projectId: string | null;
    taskId: string | null;
    taskSetup?: "created" | "unavailable";
  }>;
  assignTemplates?: (
    slug: string,
    search: DiscoverySearchRecord,
  ) => Promise<void>;
  getModelConfig?: (
    slug: string,
    options?: { signal?: AbortSignal },
  ) => ReturnType<typeof getEffectiveModelConfig>;
  logError?: (message: string) => void;
  wakeDiscovery?: (slug: string) => Promise<void> | void;
  resolveYalcForV2?: (slug: string) => YalcRuntimeConfig;
  verifyYalcCapability?: (
    config: YalcRuntimeConfig,
    targetBindingFingerprint: string,
  ) => Promise<PartnershipsYalcAssignCapabilityReceipt>;
}

function setupRuntimeMayExecute(
  dependencies: DiscoverySetupWorkerDependencies,
): boolean {
  return Boolean(
    dependencies.repository ||
    dependencies.createCampaign ||
    isPartnershipsDurableWorkerBootEnabled(
      process.env as DiscoverySetupEnvironment,
    ),
  );
}

export interface DiscoverySetupPendingResult {
  kind: "pending";
  accepted: true;
  ready: false;
  setupRunId: string;
  searchId: string;
  status: "queued" | "running";
  statusUrl: string;
  replayed: boolean;
}

export interface DiscoverySetupReadyResult {
  kind: "ready";
  search: DiscoverySearchRecord;
  campaignId: string;
  taskId: string | null;
  plan: DiscoveryPlan;
  replayed: boolean;
}

export type DiscoverySetupAdmissionResult =
  DiscoverySetupPendingResult | DiscoverySetupReadyResult;

export interface DiscoverySetupPublicStatus {
  ok: true;
  accepted: true;
  ready: boolean;
  setupRunId: string;
  searchId: string;
  status: ExecutionRun["status"];
  step: string | null;
  campaignId?: string;
  taskId?: string | null;
  discoveryRunId?: string;
  error?: string;
  result?: DiscoverySetupReadyResult;
}

export class DiscoverySetupCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 409 | 503 = 409,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "DiscoverySetupCommandError";
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite command value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Invalid command value");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedText(value: string, name: string, maximum: number): void {
  if (!value.trim() || value.length > maximum) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      `${name} must contain between 1 and ${maximum} characters`,
      400,
    );
  }
}

function boundedList(
  values: readonly string[] | undefined,
  name: string,
  maximumItems: number,
  maximumLength: number,
): void {
  if (!values) return;
  if (values.length > maximumItems) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      `${name} cannot contain more than ${maximumItems} items`,
      400,
    );
  }
  for (const value of values) boundedText(value, name, maximumLength);
}

function validateBoundedPlan(plan: DiscoveryPlan): void {
  boundedText(plan.title, "plan.title", 240);
  boundedList(plan.sectors, "plan.sectors", 50, 160);
  boundedList(plan.hashtags, "plan.hashtags", 100, 100);
  boundedList(plan.networks, "plan.networks", 12, 40);
  boundedList(plan.tiers, "plan.tiers", 4, 20);
  boundedList(
    plan.signals?.competitorBrands,
    "plan.signals.competitorBrands",
    50,
    160,
  );
  boundedList(plan.templates, "plan.templates", 50, 200);
  if (plan.notes) boundedText(plan.notes, "plan.notes", 4_000);
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!isValidTenantSlug(slug)) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      "slug is not a valid tenant identifier",
      400,
    );
  }
  return slug;
}

function setupScope(slug: string): ExecutionLeaseScope {
  return {
    tenantKey: normalizeSlug(slug),
    operation: DISCOVERY_SETUP_OPERATION,
    mode: "canary",
  };
}

function setupAggregateId(slug: string, searchId: string): string {
  return discoveryExecutionAggregateId(slug, searchId);
}

export function discoverySetupIdempotencyKey(
  slug: string,
  commandHash: string,
): string {
  return `partnerships.discovery.setup:${normalizeSlug(slug)}:${commandHash}:v${DISCOVERY_SETUP_HANDLER_VERSION}`;
}

function setupStatusUrl(runId: string, slug: string): string {
  return `/api/partnerships/searches/admissions/${encodeURIComponent(runId)}?slug=${encodeURIComponent(slug)}`;
}

function commandHashFor(slug: string, commandId: string): string {
  return sha256(`${normalizeSlug(slug)}\u0000${commandId}`);
}

function modelConfigEvidence(input: {
  config: CreatorModelConfig;
  source: "yalc" | "defaults";
  updatedAt: string | null;
  fallbackReason?: DiscoveryModelConfigEvidence["fallbackReason"];
}): DiscoveryModelConfigEvidence {
  return {
    source: input.source,
    updatedAt: input.updatedAt,
    hash: sha256(canonicalJson(input.config)),
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
  };
}

function preparedFingerprint(input: {
  plan: DiscoveryPlan;
  campaignRequest: DiscoveryCampaignRequest;
  modelConfig: CreatorModelConfig;
  modelConfigEvidence: DiscoveryModelConfigEvidence;
  executionIntent: DiscoverySetupCommandV1["executionIntent"];
}): string {
  return sha256(canonicalJson(input));
}

export function assertDiscoverySetupRawPlanBounds(rawPlan: unknown): string {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: rawPlan, depth: 0 },
  ];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > MAX_RAW_PLAN_NODES || current.depth > MAX_RAW_PLAN_DEPTH) {
      throw new DiscoverySetupCommandError(
        "invalid_setup_command",
        `plan cannot exceed depth ${MAX_RAW_PLAN_DEPTH} or ${MAX_RAW_PLAN_NODES} values`,
        400,
      );
    }
    const value = current.value;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }
    if (value && typeof value === "object") {
      for (const child of Object.values(value as Record<string, unknown>)) {
        if (child !== undefined) {
          pending.push({ value: child, depth: current.depth + 1 });
        }
      }
      continue;
    }
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      "plan must be a JSON-serializable value",
      400,
    );
  }
  let serialized: string;
  try {
    serialized = canonicalJson(rawPlan);
  } catch {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      "plan must be a JSON-serializable value",
      400,
    );
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_RAW_PLAN_BYTES) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      `plan cannot exceed ${MAX_RAW_PLAN_BYTES} serialized bytes`,
      400,
    );
  }
  return serialized;
}

function normalizedThreadId(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > MAX_THREAD_ID_LENGTH) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      `threadId cannot exceed ${MAX_THREAD_ID_LENGTH} characters`,
      400,
    );
  }
  return normalized;
}

function validatePrepared(
  value: unknown,
  command: DiscoverySetupCommandV1,
): DiscoverySetupPreparedV1 | null {
  if (
    !isRecord(value) ||
    typeof value.preparedFingerprint !== "string" ||
    !isRecord(value.plan) ||
    !isRecord(value.campaignRequest) ||
    !isRecord(value.modelConfig) ||
    !isRecord(value.modelConfigEvidence)
  ) {
    return null;
  }
  const prepared = value as unknown as DiscoverySetupPreparedV1;
  let expectedPlan: DiscoveryPlan;
  try {
    expectedPlan = parseDiscoveryPlan(command.rawPlan, prepared.modelConfig);
  } catch {
    return null;
  }
  if (
    !HASH_RE.test(prepared.preparedFingerprint) ||
    (prepared.modelConfigEvidence.source !== "yalc" &&
      prepared.modelConfigEvidence.source !== "defaults") ||
    (prepared.modelConfigEvidence.updatedAt !== null &&
      typeof prepared.modelConfigEvidence.updatedAt !== "string") ||
    (prepared.modelConfigEvidence.fallbackReason !== undefined &&
      prepared.modelConfigEvidence.fallbackReason !== "model_config_timeout" &&
      prepared.modelConfigEvidence.fallbackReason !==
        "model_config_unavailable") ||
    prepared.modelConfigEvidence.hash !==
      sha256(canonicalJson(prepared.modelConfig)) ||
    canonicalJson(prepared.plan) !== canonicalJson(expectedPlan) ||
    canonicalJson(prepared.campaignRequest) !==
      canonicalJson(buildCampaignPayload(expectedPlan)) ||
    prepared.preparedFingerprint !==
      preparedFingerprint({
        plan: prepared.plan,
        campaignRequest: prepared.campaignRequest,
        modelConfig: prepared.modelConfig,
        modelConfigEvidence: prepared.modelConfigEvidence,
        executionIntent: command.executionIntent,
      })
  ) {
    return null;
  }
  validateBoundedPlan(prepared.plan);
  return prepared;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function decodeSetupProgress(
  value: unknown,
  command: DiscoverySetupCommandV1,
): DiscoverySetupProgressV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return { schemaVersion: 1 };
  }
  const progress: DiscoverySetupProgressV1 = { schemaVersion: 1 };
  if (value.prepared !== undefined) {
    const prepared = validatePrepared(value.prepared, command);
    if (!prepared) {
      throw new DiscoverySetupCommandError(
        "prepared_checkpoint_invalid",
        "Durable discovery preparation checkpoint failed integrity checks",
      );
    }
    progress.prepared = prepared;
  }
  if (
    isRecord(value.campaign) &&
    typeof value.campaign.id === "string" &&
    HASH_RE.test(String(value.campaign.payloadHash))
  ) {
    progress.campaign = {
      id: value.campaign.id,
      payloadHash: String(value.campaign.payloadHash),
    };
  }
  if (
    isRecord(value.workspace) &&
    (value.workspace.projectId === null ||
      typeof value.workspace.projectId === "string") &&
    (value.workspace.taskId === null ||
      typeof value.workspace.taskId === "string") &&
    (value.workspace.taskSetup === "created" ||
      value.workspace.taskSetup === "unavailable")
  ) {
    progress.workspace = {
      projectId: value.workspace.projectId,
      taskId: value.workspace.taskId,
      taskSetup: value.workspace.taskSetup,
    };
  }
  if (typeof value.searchProjectedAt === "string") {
    progress.searchProjectedAt = value.searchProjectedAt;
  }
  if (typeof value.discoveryRunId === "string") {
    progress.discoveryRunId = value.discoveryRunId;
  }
  return progress;
}

export function decodeDiscoverySetupCommand(
  run: ExecutionRun,
): DiscoverySetupCommandV1 {
  if (!isRecord(run.input)) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      "Durable discovery setup command is missing",
    );
  }
  const value = run.input as Partial<DiscoverySetupCommandV1>;
  if (
    value.schemaVersion !== DISCOVERY_SETUP_HANDLER_VERSION ||
    typeof value.slug !== "string" ||
    typeof value.searchId !== "string" ||
    typeof value.commandId !== "string" ||
    typeof value.commandHash !== "string" ||
    typeof value.requestFingerprint !== "string" ||
    !("rawPlan" in value) ||
    (value.threadId !== null && typeof value.threadId !== "string") ||
    (value.executionIntent !== "auto" &&
      value.executionIntent !== "live" &&
      value.executionIntent !== "fixtures") ||
    typeof value.createdAt !== "string"
  ) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      "Durable discovery setup command is invalid",
    );
  }
  const command = value as DiscoverySetupCommandV1;
  const slug = normalizeSlug(command.slug);
  boundedText(command.searchId, "searchId", 100);
  boundedText(command.commandId, "commandId", 200);
  const rawPlan = assertDiscoverySetupRawPlanBounds(command.rawPlan);
  const threadId = normalizedThreadId(command.threadId);
  if (
    run.tenantKey.trim().toLowerCase() !== slug ||
    run.operation !== DISCOVERY_SETUP_OPERATION ||
    run.mode !== "canary" ||
    run.aggregateType !== DISCOVERY_EXECUTION_AGGREGATE ||
    run.aggregateId !== setupAggregateId(slug, command.searchId) ||
    command.commandHash !== commandHashFor(slug, command.commandId) ||
    command.searchId !== `ds-${command.commandHash.slice(0, 20)}` ||
    !HASH_RE.test(command.requestFingerprint) ||
    command.requestFingerprint !==
      sha256(
        canonicalJson({
          plan: JSON.parse(rawPlan) as unknown,
          executionIntent: command.executionIntent,
        }),
      ) ||
    command.threadId !== threadId
  ) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      "Durable discovery setup command failed its integrity checks",
    );
  }
  return command;
}

async function defaultCreateCampaign(
  slug: string,
  body: DiscoveryCampaignRequest,
  idempotencyKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<YalcCampaignCreated> {
  return yalcFetch<YalcCampaignCreated>(
    resolveYalcConfig(slug),
    "/api/campaigns",
    {
      method: "POST",
      body,
      headers: { "Idempotency-Key": idempotencyKey },
      signal: options.signal,
    },
  );
}

export async function ensureDiscoverySetupWorkspace(
  slug: string,
  command: DiscoverySetupCommandV1,
  prepared: DiscoverySetupPreparedV1,
  campaignId: string,
): Promise<{
  projectId: string | null;
  taskId: string | null;
  taskSetup: "created" | "unavailable";
}> {
  const deterministicProjectId = `P-Discovery-${command.commandHash.slice(0, 12)}`;
  const deterministicTaskId = `${deterministicProjectId}-T01`;
  const idempotencyMarker = `partnerships.discovery.setup:${command.commandHash}:${prepared.preparedFingerprint}`;
  const ensured = await ensureProjectInsertOnly(slug, {
    id: deterministicProjectId,
    name: `Campaña · ${prepared.plan.title}`,
    category: "outreach-campaign",
    status: "in-progress",
    owner: "Sancho",
    description:
      `Campaña de outreach a partir de la búsqueda de creators (discovery-plan-builder).\n\n${describePlan(prepared.plan)}\n\n` +
      `Campaign Yalc: ${campaignId}\nBúsqueda: ${command.searchId} (${searchRelativePath(command.searchId)})`,
    seedFromTaskSet: "outreach-campaign",
    idempotencyMarker,
  });
  const projectId = ensured.project.id ?? null;
  if (projectId !== deterministicProjectId) {
    throw new DiscoverySetupCommandError(
      "workspace_identity_conflict",
      "Task backend returned another deterministic discovery project",
    );
  }
  const task = await getTask(slug, deterministicTaskId);
  const taskReady = taskHasIdempotencyMarker(task, idempotencyMarker);
  return {
    projectId,
    taskId: taskReady ? deterministicTaskId : null,
    taskSetup: taskReady ? "created" : "unavailable",
  };
}

async function defaultAssignTemplates(
  slug: string,
  search: DiscoverySearchRecord,
): Promise<void> {
  const { assignTemplatesFromPlan } = await import("./template-store");
  assignTemplatesFromPlan(slug, search);
}

function setupSearchRecord(
  run: ExecutionRun,
  command: DiscoverySetupCommandV1,
  prepared: DiscoverySetupPreparedV1,
  progress: DiscoverySetupProgressV1,
): DiscoverySearchRecord {
  if (!progress.campaign || !progress.workspace) {
    throw new DiscoverySetupCommandError(
      "setup_progress_incomplete",
      "Discovery setup cannot project a search before its dependencies are ready",
    );
  }
  return {
    id: command.searchId,
    slug: command.slug,
    commandId: command.commandId,
    commandFingerprint: command.requestFingerprint,
    executionIntent: command.executionIntent,
    executionControl: {
      mode: "canary",
      admittedAt: run.createdAt,
      generation: 1,
      setupRunId: run.id,
      preparedFingerprint: prepared.preparedFingerprint,
    },
    executionModelConfig: JSON.parse(
      JSON.stringify(prepared.modelConfig),
    ) as CreatorModelConfig,
    title: prepared.plan.title,
    plan: JSON.parse(JSON.stringify(prepared.plan)) as DiscoveryPlan,
    campaignId: progress.campaign.id,
    projectId: progress.workspace.projectId,
    taskId: progress.workspace.taskId,
    threadId: command.threadId,
    runner: {
      status: "queued",
      mode: null,
      attempts: 1,
      queuedAt: run.createdAt,
      startedAt: null,
      finishedAt: null,
      retryable: false,
      errorCode: null,
      error: null,
      stats: null,
    },
    createdAt: command.createdAt,
    updatedAt: run.updatedAt,
  };
}

function childSnapshot(
  search: DiscoverySearchRecord,
  prepared: DiscoverySetupPreparedV1,
  setupRunId: string,
): DiscoveryExecutionSnapshot {
  return {
    ...buildDiscoveryExecutionSnapshot(search),
    schemaVersion: DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
    setupRunId,
    preparedFingerprint: prepared.preparedFingerprint,
    modelConfigEvidence: prepared.modelConfigEvidence,
  };
}

function validateChildReceipt(
  child: ExecutionRun,
  command: DiscoverySetupCommandV1,
  prepared: DiscoverySetupPreparedV1,
  setupRunId: string,
): void {
  const input = isRecord(child.input) ? child.input : {};
  if (
    child.tenantKey !== command.slug ||
    child.operation !== "partnerships.discovery" ||
    child.mode !== "canary" ||
    child.aggregateType !== DISCOVERY_EXECUTION_AGGREGATE ||
    child.aggregateId !==
      discoveryExecutionAggregateId(command.slug, command.searchId) ||
    input.setupRunId !== setupRunId ||
    input.preparedFingerprint !== prepared.preparedFingerprint
  ) {
    throw new DiscoverySetupCommandError(
      "child_command_conflict",
      "Durable discovery child receipt belongs to another setup command",
    );
  }
}

function safeLog(
  dependencies: DiscoverySetupWorkerDependencies,
  message: string,
): void {
  try {
    (dependencies.logError ?? console.error)(message);
  } catch {
    // Product recovery must not depend on logging.
  }
}

function classifySetupError(error: unknown): DurableExecutionErrorDecision {
  if (error instanceof DiscoverySetupCommandError) {
    return {
      code: error.code,
      retryable: error.retryable,
      ...(error.retryable
        ? { exhaustion: "retry_until_cancelled" as const }
        : {}),
      message: error.message,
      eventData: { errorCode: error.code },
    };
  }
  return {
    code: "setup_dependency_unavailable",
    retryable: true,
    exhaustion: "retry_until_cancelled",
    message:
      error instanceof Error
        ? error.message
        : "Discovery setup dependency is unavailable",
    eventData: { errorCode: "setup_dependency_unavailable" },
  };
}

export function createDiscoverySetupHandler(
  repository: ExecutionControlRepository,
  dependencies: DiscoverySetupWorkerDependencies = {},
): DurableExecutionHandler<DiscoverySetupCommandV1, DiscoverySetupProgressV1> {
  const createCampaign = dependencies.createCampaign ?? defaultCreateCampaign;
  const createWorkspace =
    dependencies.createWorkspace ?? ensureDiscoverySetupWorkspace;
  const assignTemplates =
    dependencies.assignTemplates ?? defaultAssignTemplates;
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
    operation: DISCOVERY_SETUP_OPERATION,
    version: DISCOVERY_SETUP_HANDLER_VERSION,
    decode: decodeDiscoverySetupCommand,
    execute: async (command, context) => {
      let progress = decodeSetupProgress(context.run.output, command);
      if (!progress.prepared) {
        const prepared = await prepareDiscoverySetup(
          command,
          dependencies,
          context.signal,
        );
        await context.assertLease();
        progress = { ...progress, prepared };
        await context.checkpoint("prepared", {
          output: progress,
          eventType: "partnerships.discovery.setup.prepared",
          eventData: {
            searchId: command.searchId,
            configSource: prepared.modelConfigEvidence.source,
            ...(prepared.modelConfigEvidence.fallbackReason
              ? {
                  fallbackReason: prepared.modelConfigEvidence.fallbackReason,
                }
              : {}),
          },
        });
      }
      const prepared = progress.prepared;
      if (!prepared) {
        throw new DiscoverySetupCommandError(
          "prepared_checkpoint_invalid",
          "Durable discovery preparation checkpoint is unavailable",
        );
      }
      const payloadHash = sha256(canonicalJson(prepared.campaignRequest));

      if (!progress.campaign) {
        await context.checkpoint("campaign", {
          output: progress,
          eventType: "partnerships.discovery.setup.campaign_started",
          eventData: { searchId: command.searchId },
        });
        const created = await createCampaignBounded(
          createCampaign,
          command,
          prepared,
          dependencies,
          context.signal,
        );
        await context.assertLease();
        const campaignId = created.campaignId ?? created.campaign?.id;
        if (!campaignId) {
          throw new DiscoverySetupCommandError(
            "campaign_receipt_invalid",
            "YALC did not return a campaign receipt",
            503,
            true,
          );
        }
        boundedText(campaignId, "campaignId", 200);
        progress = {
          ...progress,
          campaign: { id: campaignId, payloadHash },
        };
        await context.checkpoint("campaign_ready", {
          output: progress,
          eventType: "partnerships.discovery.setup.campaign_ready",
          eventData: { campaignId },
        });
      } else if (progress.campaign.payloadHash !== payloadHash) {
        throw new DiscoverySetupCommandError(
          "campaign_payload_conflict",
          "Stored campaign receipt does not match the frozen setup payload",
        );
      }
      const campaign = progress.campaign;
      if (!campaign) {
        throw new DiscoverySetupCommandError(
          "campaign_receipt_invalid",
          "Discovery setup campaign receipt is unavailable",
          503,
          true,
        );
      }

      if (!progress.workspace) {
        let workspace: DiscoverySetupProgressV1["workspace"];
        try {
          const created = await createWorkspace(
            command.slug,
            command,
            prepared,
            campaign.id,
          );
          await context.assertLease();
          workspace = {
            projectId: created.projectId,
            taskId: created.taskId,
            taskSetup:
              created.taskSetup ??
              (created.projectId && created.taskId ? "created" : "unavailable"),
          };
        } catch (error) {
          await context.assertLease();
          safeLog(
            dependencies,
            `[partnerships] durable setup task unavailable for ${command.slug}/${command.searchId} (${error instanceof Error ? error.name : "UnknownError"})`,
          );
          workspace = {
            projectId: null,
            taskId: null,
            taskSetup: "unavailable",
          };
        }
        progress = { ...progress, workspace };
        await context.checkpoint("workspace_ready", {
          output: progress,
          eventType: "partnerships.discovery.setup.workspace_ready",
          eventData: { taskSetup: workspace.taskSetup },
        });
      }

      const baseRecord = setupSearchRecord(
        context.run,
        command,
        prepared,
        progress,
      );
      await context.assertLease();
      const projected = saveSearchForSetup({
        setupRunId: context.run.id,
        preparedFingerprint: prepared.preparedFingerprint,
        record: baseRecord,
      });
      const projectionConflicts = [
        projected.search.executionControl?.setupRunId !== context.run.id
          ? "setup"
          : null,
        projected.search.executionControl?.preparedFingerprint !==
        prepared.preparedFingerprint
          ? "prepared"
          : null,
        projected.search.commandId !== command.commandId ? "command" : null,
        projected.search.commandFingerprint !== command.requestFingerprint
          ? "request"
          : null,
        projected.search.campaignId !== campaign.id ? "campaign" : null,
        canonicalJson(projected.search.plan) !== canonicalJson(prepared.plan)
          ? "plan"
          : null,
        canonicalJson(projected.search.executionModelConfig) !==
        canonicalJson(prepared.modelConfig)
          ? "config"
          : null,
      ].filter(Boolean);
      if (projectionConflicts.length > 0) {
        throw new DiscoverySetupCommandError(
          "search_projection_conflict",
          `Another setup owns this discovery search projection (${projectionConflicts.join(",")})`,
        );
      }
      await context.assertLease();
      if (!progress.searchProjectedAt) {
        progress = {
          ...progress,
          searchProjectedAt: context.now().toISOString(),
        };
        await context.checkpoint("search_ready", {
          output: progress,
          eventType: "partnerships.discovery.setup.search_ready",
          eventData: { searchId: command.searchId },
        });
      }

      try {
        await assignTemplates(command.slug, projected.search);
        await context.assertLease();
      } catch (error) {
        await context.assertLease();
        safeLog(
          dependencies,
          `[partnerships] durable setup templates unavailable for ${command.slug}/${command.searchId} (${error instanceof Error ? error.name : "UnknownError"})`,
        );
      }

      await context.assertLease();
      let childReceipt;
      try {
        // The child command is derived from the frozen setup projection, not
        // the live search receipt. A user may edit mutable runner state after
        // we persist the search but before a crashed child-create response is
        // recovered; those edits must neither be overwritten nor change the
        // immutable child command fingerprint.
        const frozenChild = childSnapshot(baseRecord, prepared, context.run.id);
        const originRepository = repository as ExecutionControlRepository &
          Partial<
            Pick<
              ExecutionOriginControlRepository,
              | "createRunWithTrustedOrigin"
              | "getRunTrustedExecutionOrigin"
            >
          >;
        const originRegistration =
          typeof originRepository.getRunTrustedExecutionOrigin === "function"
            ? await originRepository.getRunTrustedExecutionOrigin({
              tenantKey: context.run.tenantKey,
              runId: context.run.id,
            })
            : null;
        if (
          context.run.metadata.executionOrigin !== undefined &&
          !originRegistration
        ) {
          // A metadata mirror must never be allowed to silently lose the root
          // on recovery or grant authority by itself.
          throw new DiscoverySetupCommandError(
            "trusted_execution_origin_unavailable",
            "Durable child origin registration is unavailable",
            503,
            true,
          );
        }
        if (partnershipsDiscoveryEffectsV2Requested(dependencies.env)) {
          childReceipt = await admitPartnershipsDiscoveryV2(frozenChild, {
            repository,
            env: dependencies.env,
            ...(dependencies.resolveYalcForV2
              ? { resolveYalc: dependencies.resolveYalcForV2 }
              : {}),
            ...(dependencies.verifyYalcCapability
              ? { verifyYalcCapability: dependencies.verifyYalcCapability }
              : {}),
            ...(originRegistration
              ? {
                  trustedOrigin: durableExecutionMcChatOrigin(
                    originRegistration.origin.parentAgentRunId,
                  ),
                }
              : {}),
          });
        } else {
          const childCommand: CreateExecutionRunInput = {
            tenantKey: command.slug,
            aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
            aggregateId: discoveryExecutionAggregateId(
              command.slug,
              command.searchId,
            ),
            operation: "partnerships.discovery",
            idempotencyKey: discoveryCanaryExecutionIdempotencyKey(
              command.slug,
              command.searchId,
              1,
            ),
            mode: "canary",
            input: frozenChild,
            metadata: {
              executionHandlerVersion: DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
              schemaVersion: DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
              source: "partnerships.discovery.setup",
              authority: "execution_ledger",
            },
          };
          if (originRegistration) {
            if (
              typeof originRepository.createRunWithTrustedOrigin !== "function"
            ) {
              throw new DiscoverySetupCommandError(
                "trusted_execution_origin_unavailable",
                "Durable child origin admission is unavailable",
                503,
                true,
              );
            }
            childReceipt =
              await originRepository.createRunWithTrustedOrigin({
                command: childCommand,
                origin: originRegistration.origin,
              });
          } else {
            childReceipt = await repository.createRun(childCommand);
          }
        }
      } catch (error) {
        if (error instanceof ExecutionCommandConflictError) {
          throw new DiscoverySetupCommandError(
            "child_command_conflict",
            "Durable discovery child idempotency key belongs to another command",
            409,
            false,
          );
        }
        throw error;
      }
      await context.assertLease();
      validateChildReceipt(childReceipt.run, command, prepared, context.run.id);
      const bound = bindSearchExecutionRunForSetup(
        command.slug,
        command.searchId,
        {
          setupRunId: context.run.id,
          preparedFingerprint: prepared.preparedFingerprint,
          runId: childReceipt.run.id,
          commandFingerprint: childReceipt.run.commandFingerprint,
        },
      );
      if (bound.search.executionControl?.runId !== childReceipt.run.id) {
        throw new DiscoverySetupCommandError(
          "child_projection_conflict",
          "Durable discovery child could not be linked to its setup projection",
        );
      }
      await context.assertLease();
      progress = {
        ...progress,
        discoveryRunId: childReceipt.run.id,
      };
      await context.checkpoint("discovery_admitted", {
        output: progress,
        eventType: "partnerships.discovery.setup.discovery_admitted",
        eventData: {
          searchId: command.searchId,
          discoveryRunId: childReceipt.run.id,
        },
      });
      return {
        status: "completed",
        currentStep: "discovery_admitted",
        output: progress,
        eventType: "partnerships.discovery.setup.completed",
        eventData: {
          searchId: command.searchId,
          discoveryRunId: childReceipt.run.id,
        },
      };
    },
    classifyError: classifySetupError,
    projectTerminal: async (run, command) => {
      if (run.status !== "completed") return;
      const progress = decodeSetupProgress(run.output, command);
      if (!progress.prepared || !progress.discoveryRunId) {
        throw new Error("Completed setup is missing its discovery child");
      }
      const search = getSearch(command.slug, command.searchId);
      if (!search) throw new Error("Completed setup is missing its search");
      const child = await repository.getRunByIdForScope?.({
        tenantKey: command.slug,
        operation: "partnerships.discovery",
        mode: "canary",
        runId: progress.discoveryRunId,
      });
      if (!child) throw new Error("Completed setup child is unavailable");
      validateChildReceipt(child, command, progress.prepared, run.id);
      const linked = bindSearchExecutionRunForSetup(
        command.slug,
        command.searchId,
        {
          setupRunId: run.id,
          preparedFingerprint: progress.prepared.preparedFingerprint,
          runId: child.id,
          commandFingerprint: child.commandFingerprint,
        },
      );
      if (linked.search.executionControl?.runId !== child.id) {
        throw new Error("Completed setup child projection is superseded");
      }
      // Wake is a latency hint after the fenced terminal mutation. Polling is
      // still the recovery authority, and the dynamic import avoids a cycle.
      if (dependencies.wakeDiscovery) {
        await dependencies.wakeDiscovery(command.slug);
      } else if (!dependencies.repository) {
        const { wakeCanaryDiscoveryWorker } =
          await import("./discovery-durable-worker");
        wakeCanaryDiscoveryWorker(command.slug);
      }
    },
  };
}

function setupRegistry(
  repository: ExecutionControlRepository,
  dependencies: DiscoverySetupWorkerDependencies,
): DurableExecutionRegistry {
  return new DurableExecutionRegistry().register(
    createDiscoverySetupHandler(repository, dependencies),
  );
}

function inlineTimeoutMs(
  dependencies: DiscoverySetupWorkerDependencies,
): number {
  const raw =
    dependencies.inlineTimeoutMs ??
    Number(
      dependencies.env?.PARTNERSHIPS_DISCOVERY_SETUP_INLINE_TIMEOUT_MS ??
        process.env.PARTNERSHIPS_DISCOVERY_SETUP_INLINE_TIMEOUT_MS,
    );
  if (!Number.isFinite(raw)) return DEFAULT_SETUP_INLINE_TIMEOUT_MS;
  return Math.max(0, Math.min(Math.floor(raw), 15_000));
}

function modelConfigTimeoutMs(
  dependencies: DiscoverySetupWorkerDependencies,
): number {
  const raw = Number(
    dependencies.env?.PARTNERSHIPS_DISCOVERY_MODEL_CONFIG_TIMEOUT_MS ??
      process.env.PARTNERSHIPS_DISCOVERY_MODEL_CONFIG_TIMEOUT_MS,
  );
  if (!Number.isFinite(raw)) return DEFAULT_MODEL_CONFIG_TIMEOUT_MS;
  return Math.max(25, Math.min(Math.floor(raw), 10_000));
}

function yalcWriteTimeoutMs(
  dependencies: DiscoverySetupWorkerDependencies,
): number {
  const raw = Number(
    dependencies.env?.PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS ??
      process.env.PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS,
  );
  if (!Number.isFinite(raw)) return DEFAULT_YALC_WRITE_TIMEOUT_MS;
  return Math.max(25, Math.min(Math.floor(raw), 45_000));
}

async function createCampaignBounded(
  createCampaign: NonNullable<
    DiscoverySetupWorkerDependencies["createCampaign"]
  >,
  command: DiscoverySetupCommandV1,
  prepared: DiscoverySetupPreparedV1,
  dependencies: DiscoverySetupWorkerDependencies,
  parentSignal: AbortSignal,
): Promise<YalcCampaignCreated> {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, parentSignal]);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(
        new DiscoverySetupCommandError(
          "campaign_timeout",
          "YALC campaign creation exceeded its bounded deadline",
          503,
          true,
        ),
      );
    }, yalcWriteTimeoutMs(dependencies));
  });
  try {
    return await Promise.race([
      createCampaign(
        command.slug,
        prepared.campaignRequest,
        `partnerships.discovery:${command.commandHash}`,
        { signal },
      ),
      timeout,
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function prepareDiscoverySetup(
  command: DiscoverySetupCommandV1,
  dependencies: DiscoverySetupWorkerDependencies,
  parentSignal: AbortSignal,
): Promise<DiscoverySetupPreparedV1> {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, parentSignal]);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, modelConfigTimeoutMs(dependencies));
    timeoutHandle.unref?.();
  });
  const resolver = dependencies.getModelConfig ?? getEffectiveModelConfig;
  const resolved = resolver(command.slug, { signal }).then(
    (effective) => ({ kind: "resolved" as const, effective }),
    () => ({ kind: "unavailable" as const }),
  );
  const result = await Promise.race([resolved, timeout]);
  if (timeoutHandle) clearTimeout(timeoutHandle);

  const fallbackConfig = JSON.parse(
    JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
  ) as CreatorModelConfig;
  const effective =
    result.kind === "resolved"
      ? result.effective
      : {
          config: fallbackConfig,
          source: "defaults" as const,
          updatedAt: null,
          yalcError:
            result.kind === "timeout"
              ? "model config timed out"
              : "model config unavailable",
        };
  const frozenConfig = JSON.parse(
    JSON.stringify(effective.config),
  ) as CreatorModelConfig;
  const evidence = modelConfigEvidence({
    config: frozenConfig,
    source: effective.source,
    updatedAt: effective.updatedAt,
    ...(result.kind === "timeout"
      ? { fallbackReason: "model_config_timeout" as const }
      : effective.yalcError
        ? { fallbackReason: "model_config_unavailable" as const }
        : {}),
  });
  const plan = parseDiscoveryPlan(command.rawPlan, frozenConfig);
  validateBoundedPlan(plan);
  if (!supportsLiveDiscovery(plan) && command.executionIntent !== "fixtures") {
    throw new DiscoverySetupCommandError(
      "unsupported_setup_command",
      "The durable discovery canary currently supports Instagram-only searches",
      400,
    );
  }
  const campaignRequest = buildCampaignPayload(plan);
  const fingerprint = preparedFingerprint({
    plan,
    campaignRequest,
    modelConfig: frozenConfig,
    modelConfigEvidence: evidence,
    executionIntent: command.executionIntent,
  });
  return {
    preparedFingerprint: fingerprint,
    plan,
    campaignRequest,
    modelConfig: frozenConfig,
    modelConfigEvidence: evidence,
  };
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function exactSetupRun(
  repository: ExecutionControlRepository,
  slug: string,
  runId: string,
): Promise<ExecutionRun | null> {
  if (!repository.getRunByIdForScope) {
    throw new DiscoverySetupCommandError(
      "setup_scope_unavailable",
      "Exact-scope durable setup reads are unavailable",
      503,
    );
  }
  return repository.getRunByIdForScope({ ...setupScope(slug), runId });
}

async function setupByAggregate(
  repository: ExecutionControlRepository,
  slug: string,
  searchId: string,
): Promise<ExecutionRun | null> {
  if (!repository.getRunByAggregateForScope) {
    throw new DiscoverySetupCommandError(
      "setup_scope_unavailable",
      "Exact-scope durable setup reads are unavailable",
      503,
    );
  }
  return repository.getRunByAggregateForScope({
    ...setupScope(slug),
    aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
    aggregateId: setupAggregateId(slug, searchId),
  });
}

function assertRequestMatches(
  run: ExecutionRun,
  requestFingerprint: string,
): DiscoverySetupCommandV1 {
  const command = decodeDiscoverySetupCommand(run);
  if (command.requestFingerprint !== requestFingerprint) {
    throw new DiscoverySetupCommandError(
      "setup_command_conflict",
      "commandId was already used with a different discovery request",
      409,
    );
  }
  return command;
}

function readyFromRun(
  run: ExecutionRun,
  command: DiscoverySetupCommandV1,
  replayed: boolean,
): DiscoverySetupReadyResult {
  const progress = decodeSetupProgress(run.output, command);
  const search = getSearch(command.slug, command.searchId);
  if (
    run.status !== "completed" ||
    !progress.prepared ||
    !progress.campaign ||
    !progress.workspace ||
    !progress.discoveryRunId ||
    !search ||
    search.executionControl?.setupRunId !== run.id ||
    search.executionControl.runId !== progress.discoveryRunId
  ) {
    throw new DiscoverySetupCommandError(
      "setup_projection_unavailable",
      "Durable discovery setup completed without a readable product receipt",
      503,
    );
  }
  return {
    kind: "ready",
    search,
    campaignId: progress.campaign.id,
    taskId: progress.workspace.taskId,
    plan: progress.prepared.plan,
    replayed,
  };
}

function pendingFromRun(
  run: ExecutionRun,
  command: DiscoverySetupCommandV1,
  replayed: boolean,
): DiscoverySetupPendingResult {
  return {
    kind: "pending",
    accepted: true,
    ready: false,
    setupRunId: run.id,
    searchId: command.searchId,
    status: run.status === "running" ? "running" : "queued",
    statusUrl: setupStatusUrl(run.id, command.slug),
    replayed,
  };
}

function terminalSetupFailure(run: ExecutionRun): never {
  const code =
    isRecord(run.output) && typeof run.output.errorCode === "string"
      ? run.output.errorCode
      : run.status === "cancelled"
        ? "setup_cancelled"
        : "setup_failed";
  const status =
    code === "invalid_setup_command" || code === "unsupported_setup_command"
      ? 400
      : run.status === "cancelled"
        ? 409
        : 503;
  throw new DiscoverySetupCommandError(
    code,
    run.status === "cancelled"
      ? "Durable discovery setup was cancelled"
      : `Durable discovery setup failed${publicError(run) ? `: ${publicError(run)}` : "; inspect the admission status before retrying"}`,
    status,
  );
}

async function processSetupFastPath(
  run: ExecutionRun,
  command: DiscoverySetupCommandV1,
  replayed: boolean,
  repository: ExecutionControlRepository,
  dependencies: DiscoverySetupWorkerDependencies,
): Promise<DiscoverySetupAdmissionResult> {
  const env = dependencies.env ?? (process.env as DiscoverySetupEnvironment);
  if (!setupRuntimeMayExecute(dependencies)) {
    if (run.status === "completed") return readyFromRun(run, command, replayed);
    if (
      run.status === "failed" ||
      run.status === "partial" ||
      run.status === "cancelled"
    ) {
      terminalSetupFailure(run);
    }
    return pendingFromRun(run, command, replayed);
  }
  if (!isDiscoverySingleHostStoreAcknowledged(env)) {
    throw new DiscoverySetupCommandError(
      "setup_store_not_acknowledged",
      "Durable discovery setup requires an acknowledged persistent single-host artifact store",
      503,
    );
  }
  if (run.status === "completed") return readyFromRun(run, command, replayed);
  if (
    run.status === "failed" ||
    run.status === "partial" ||
    run.status === "cancelled"
  ) {
    terminalSetupFailure(run);
  }
  const engine = new DurableExecutionEngine({
    repository,
    registry: setupRegistry(repository, dependencies),
    scope: setupScope(command.slug),
    workerId:
      dependencies.workerId ??
      `sancho-partnerships-setup-inline-${process.pid}-${randomUUID().slice(0, 8)}`,
    leaseMs: DEFAULT_SETUP_LEASE_MS,
    maxAttempts: DEFAULT_SETUP_MAX_ATTEMPTS,
    now: dependencies.now,
  });
  const processing = engine.processRun(run.id);
  processing.catch((error) => {
    safeLog(
      dependencies,
      `[partnerships] inline durable setup failed for ${command.slug}/${command.searchId} (${error instanceof Error ? error.name : "UnknownError"})`,
    );
  });

  const timeout = inlineTimeoutMs(dependencies);
  const deadline = Date.now() + timeout;
  do {
    const current = await exactSetupRun(repository, command.slug, run.id);
    if (!current) {
      throw new DiscoverySetupCommandError(
        "setup_receipt_lost",
        "Durable discovery setup receipt is unavailable",
        503,
      );
    }
    if (current.status === "completed") {
      await processing.catch(() => undefined);
      return readyFromRun(current, command, replayed);
    }
    if (
      current.status === "failed" ||
      current.status === "partial" ||
      current.status === "cancelled"
    ) {
      await processing.catch(() => undefined);
      terminalSetupFailure(current);
    }
    if (Date.now() >= deadline)
      return pendingFromRun(current, command, replayed);
    // Polling remains bounded even after the inline processor settles idle or
    // requeued; racing an already-settled promise here would spin tightly.
    await sleep(Math.min(SETUP_POLL_MS, Math.max(1, deadline - Date.now())));
  } while (true);
}

export async function admitCanaryDiscoverySetup(
  input: {
    slug: string;
    rawPlan: unknown;
    threadId: string | null;
    commandId: string;
    commandHash: string;
    requestFingerprint: string;
    searchId: string;
    executionIntent: "auto" | "live" | "fixtures";
  },
  dependencies: DiscoverySetupWorkerDependencies = {},
): Promise<DiscoverySetupAdmissionResult> {
  const repository =
    dependencies.repository ?? new PostgresExecutionControlRepository();
  const slug = normalizeSlug(input.slug);
  boundedText(input.commandId, "commandId", 200);
  const rawPlan = assertDiscoverySetupRawPlanBounds(input.rawPlan);
  const frozenRawPlan = JSON.parse(rawPlan) as unknown;
  const threadId = normalizedThreadId(input.threadId);
  if (
    input.commandId !== input.commandId.trim() ||
    input.commandHash !== commandHashFor(slug, input.commandId) ||
    input.searchId !== `ds-${input.commandHash.slice(0, 20)}` ||
    !HASH_RE.test(input.requestFingerprint) ||
    input.requestFingerprint !==
      sha256(
        canonicalJson({
          plan: frozenRawPlan,
          executionIntent: input.executionIntent,
        }),
      )
  ) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      "Discovery setup command identity is invalid",
      400,
    );
  }

  let run = await setupByAggregate(repository, slug, input.searchId);
  if (run) {
    const command = assertRequestMatches(run, input.requestFingerprint);
    return processSetupFastPath(run, command, true, repository, dependencies);
  }

  const env = dependencies.env ?? (process.env as DiscoverySetupEnvironment);
  if (!setupRuntimeMayExecute(dependencies)) {
    throw new DiscoverySetupCommandError(
      "setup_worker_boot_disabled",
      "Durable discovery setup admission requires its worker boot flag",
      503,
      true,
    );
  }
  const policy = resolveDiscoveryExecutionPolicy(input.slug, env);
  if (!policy.enabled || policy.mode !== "canary") {
    throw new DiscoverySetupCommandError(
      "setup_policy_unavailable",
      "Durable discovery setup is not enabled for this tenant",
      503,
    );
  }
  let created = false;
  if (!run) {
    const command: DiscoverySetupCommandV1 = {
      schemaVersion: DISCOVERY_SETUP_HANDLER_VERSION,
      slug,
      searchId: input.searchId,
      commandId: input.commandId,
      commandHash: input.commandHash,
      requestFingerprint: input.requestFingerprint,
      rawPlan: frozenRawPlan,
      threadId,
      executionIntent: input.executionIntent,
      createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    };
    try {
      const receipt = await repository.createRun({
        tenantKey: slug,
        aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
        aggregateId: setupAggregateId(slug, input.searchId),
        operation: DISCOVERY_SETUP_OPERATION,
        idempotencyKey: discoverySetupIdempotencyKey(slug, input.commandHash),
        mode: "canary",
        input: command,
        metadata: {
          executionHandlerVersion: DISCOVERY_SETUP_HANDLER_VERSION,
          schemaVersion: DISCOVERY_SETUP_HANDLER_VERSION,
          source: "partnerships.searches",
          authority: "execution_ledger",
        },
      });
      run = receipt.run;
      created = receipt.created;
    } catch (error) {
      if (!(error instanceof ExecutionCommandConflictError)) throw error;
      run = await setupByAggregate(repository, slug, input.searchId);
      if (!run) {
        throw new DiscoverySetupCommandError(
          "setup_command_conflict",
          "A concurrent setup command won but its receipt is unavailable",
          409,
        );
      }
    }
  }

  const command = assertRequestMatches(run, input.requestFingerprint);
  const result = await processSetupFastPath(
    run,
    command,
    !created,
    repository,
    dependencies,
  );
  if (result.kind === "pending" && !dependencies.repository) {
    const { wakeCanaryDiscoverySetupWorker } =
      await import("./discovery-durable-worker");
    wakeCanaryDiscoverySetupWorker(slug);
  }
  return result;
}

/**
 * Sticky-authority lookup used before policy/legacy routing. Absence is a
 * normal "not previously admitted" result; a database/scope failure is not.
 */
export async function resumeExistingCanaryDiscoverySetup(
  input: {
    slug: string;
    commandId: string;
    commandHash: string;
    requestFingerprint: string;
    searchId: string;
  },
  dependencies: DiscoverySetupWorkerDependencies = {},
): Promise<DiscoverySetupAdmissionResult | null> {
  const repository =
    dependencies.repository ?? new PostgresExecutionControlRepository();
  const slug = normalizeSlug(input.slug);
  if (
    input.commandHash !== commandHashFor(slug, input.commandId) ||
    input.searchId !== `ds-${input.commandHash.slice(0, 20)}` ||
    !HASH_RE.test(input.requestFingerprint)
  ) {
    throw new DiscoverySetupCommandError(
      "invalid_setup_command",
      "Discovery setup command identity is invalid",
      400,
    );
  }
  const run = await setupByAggregate(repository, slug, input.searchId);
  if (!run) return null;
  const command = assertRequestMatches(run, input.requestFingerprint);
  return processSetupFastPath(run, command, true, repository, dependencies);
}

function publicError(run: ExecutionRun): string | undefined {
  if (!run.error) return undefined;
  const redacted = sanitizeSupportBundle(run.error, {
    destination: "internal",
  }).value;
  const value = typeof redacted === "string" ? redacted : "Setup failed";
  return value.slice(0, 240);
}

export async function getDiscoverySetupAdmissionStatus(
  input: { slug: string; runId: string },
  dependencies: Pick<DiscoverySetupWorkerDependencies, "repository"> = {},
): Promise<DiscoverySetupPublicStatus | null> {
  const repository =
    dependencies.repository ?? new PostgresExecutionControlRepository();
  const run = await exactSetupRun(repository, input.slug, input.runId);
  if (!run) return null;
  const command = decodeDiscoverySetupCommand(run);
  const progress = decodeSetupProgress(run.output, command);
  const response: DiscoverySetupPublicStatus = {
    ok: true,
    accepted: true,
    ready: run.status === "completed",
    setupRunId: run.id,
    searchId: command.searchId,
    status: run.status,
    step: run.currentStep ?? null,
    ...(progress.campaign ? { campaignId: progress.campaign.id } : {}),
    ...(progress.workspace ? { taskId: progress.workspace.taskId } : {}),
    ...(progress.discoveryRunId
      ? { discoveryRunId: progress.discoveryRunId }
      : {}),
    ...(publicError(run) ? { error: publicError(run) } : {}),
  };
  if (run.status === "completed") {
    response.result = readyFromRun(run, command, true);
  }
  return response;
}
