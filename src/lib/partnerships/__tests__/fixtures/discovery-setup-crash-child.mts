import { createHash } from "node:crypto";

import { DEFAULT_CREATOR_MODEL_CONFIG } from "../../../calc-creator-core";
import { DurableExecutionEngine } from "../../../durable-execution/runtime.ts";
import { DurableExecutionRegistry } from "../../../durable-execution/registry.ts";
import { PostgresExecutionControlRepository } from "../../../execution-control/postgres.ts";
import type {
  CreateExecutionRunInput,
  ExecutionControlRepository,
} from "../../../execution-control/types.ts";
import { DISCOVERY_SETUP_OPERATION } from "../../discovery-execution-policy";
import {
  admitCanaryDiscoverySetup,
  createDiscoverySetupHandler,
  ensureDiscoverySetupWorkspace,
  type DiscoverySetupWorkerDependencies,
} from "../../discovery-setup-worker";

type ChildMode = "seed" | "run";
type CrashPoint =
  | "none"
  | "after_campaign_response"
  | "after_workspace_insert"
  | "after_child_create"
  | "hang_campaign";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite command value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("invalid command value");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function commandInput(commandId: string, slug: string) {
  const commandHash = sha256(`${slug}\u0000${commandId}`);
  const rawPlan = {
    title: `Crash matrix ${commandId}`,
    sectors: ["salud capilar"],
    networks: ["instagram"],
    targetVolume: 3,
  };
  const executionIntent = "fixtures" as const;
  return {
    slug,
    rawPlan,
    threadId: null,
    commandId,
    commandHash,
    requestFingerprint: sha256(canonical({ plan: rawPlan, executionIntent })),
    searchId: `ds-${commandHash.slice(0, 20)}`,
    executionIntent,
  };
}

async function emitAndExit(payload: unknown, status = 0): Promise<never> {
  await new Promise<void>((resolve) => {
    process.stdout.write(`${JSON.stringify(payload)}\n`, resolve);
  });
  process.exit(status);
  return new Promise<never>(() => undefined);
}

async function emitAndKill(marker: string): Promise<never> {
  await new Promise<void>((resolve) => {
    process.stdout.write(`${JSON.stringify({ marker })}\n`, resolve);
  });
  process.kill(process.pid, "SIGKILL");
  return new Promise<never>(() => undefined);
}

function proxyRepository(
  base: PostgresExecutionControlRepository,
  options: { denyClaims?: boolean; crashPoint: CrashPoint },
): ExecutionControlRepository {
  return new Proxy(base as unknown as ExecutionControlRepository, {
    get(target, property, receiver) {
      if (
        options.denyClaims &&
        (property === "claimRun" || property === "claimNextRun")
      ) {
        return async () => null;
      }
      const value = Reflect.get(target, property, receiver);
      if (property === "createRun" && typeof value === "function") {
        return async (input: CreateExecutionRunInput) => {
          const receipt = await value.call(target, input);
          if (
            options.crashPoint === "after_child_create" &&
            input.operation === "partnerships.discovery"
          ) {
            await emitAndKill("after_child_create");
          }
          return receipt;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function campaignEffect(
  slug: string,
  body: unknown,
  idempotencyKey: string,
  crashPoint: CrashPoint,
  signal?: AbortSignal,
) {
  if (crashPoint === "hang_campaign") {
    process.stdout.write(`${JSON.stringify({ marker: "campaign_hanging" })}\n`);
    // A referenced handle deliberately keeps this crashed-owner fixture alive
    // while another process proves stale-lease reclamation.
    setInterval(() => undefined, 60_000);
    return new Promise<never>(() => undefined);
  }
  const baseUrl = requiredEnv("CRASH_MATRIX_YALC_URL");
  const response = await fetch(
    `${baseUrl}/api/campaigns?tenant=${encodeURIComponent(slug)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal,
    },
  );
  const payload = (await response.json()) as {
    campaignId?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? `mock Yalc returned ${response.status}`);
  }
  if (crashPoint === "after_campaign_response") {
    await emitAndKill("after_campaign_response");
  }
  return payload;
}

async function main(): Promise<void> {
  requiredEnv("DATABASE_URL");
  requiredEnv("MC_WORKSPACE");
  if (process.env.MC_TASKS_BACKEND !== "json") {
    throw new Error("Crash matrix child requires MC_TASKS_BACKEND=json");
  }
  const mode = requiredEnv("CRASH_MATRIX_MODE") as ChildMode;
  const crashPoint = (process.env.CRASH_MATRIX_POINT ?? "none") as CrashPoint;
  const slug = requiredEnv("CRASH_MATRIX_SLUG");
  const commandId = requiredEnv("CRASH_MATRIX_COMMAND_ID");
  const command = commandInput(commandId, slug);
  const baseRepository = new PostgresExecutionControlRepository();
  const repository = proxyRepository(baseRepository, {
    denyClaims: mode === "seed",
    crashPoint,
  });
  const env = {
    PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
    PARTNERSHIPS_DISCOVERY_V2_SLUGS: slug,
    PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
    PARTNERSHIPS_DISCOVERY_MODEL_CONFIG_TIMEOUT_MS: "250",
    PARTNERSHIPS_DISCOVERY_YALC_WRITE_TIMEOUT_MS: "5000",
  };
  const dependencies: DiscoverySetupWorkerDependencies = {
    repository,
    env,
    getModelConfig: async () => ({
      config: JSON.parse(
        JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
      ) as typeof DEFAULT_CREATOR_MODEL_CONFIG,
      overrides: {},
      source: "defaults" as const,
      updatedAt: null,
    }),
    createCampaign: (tenant, body, key, options) =>
      campaignEffect(tenant, body, key, crashPoint, options?.signal),
    createWorkspace: async (tenant, setupCommand, prepared, campaignId) => {
      const result = await ensureDiscoverySetupWorkspace(
        tenant,
        setupCommand,
        prepared,
        campaignId,
      );
      if (crashPoint === "after_workspace_insert") {
        await emitAndKill("after_workspace_insert");
      }
      return result;
    },
    assignTemplates: async () => undefined,
    wakeDiscovery: async () => undefined,
    logError: (message) => process.stderr.write(`${message}\n`),
  };

  if (mode === "seed") {
    const result = await admitCanaryDiscoverySetup(command, {
      ...dependencies,
      inlineTimeoutMs: 0,
    });
    if (result.kind !== "pending") {
      throw new Error(`seed unexpectedly became ${result.kind}`);
    }
    await emitAndExit({
      mode,
      runId: result.setupRunId,
      searchId: command.searchId,
      commandHash: command.commandHash,
    });
  }

  const runId = requiredEnv("CRASH_MATRIX_RUN_ID");
  const leaseMs = Number(process.env.CRASH_MATRIX_LEASE_MS ?? "1200");
  const registry = new DurableExecutionRegistry().register(
    createDiscoverySetupHandler(repository, dependencies),
  );
  const engine = new DurableExecutionEngine({
    repository,
    registry,
    scope: {
      tenantKey: slug,
      operation: DISCOVERY_SETUP_OPERATION,
      mode: "canary",
    },
    workerId: requiredEnv("CRASH_MATRIX_WORKER_ID"),
    leaseMs,
    maxAttempts: 3,
    retryBaseMs: 100,
    retryMaximumMs: 250,
    // The stale-owner case models a worker whose heartbeat mechanism stopped
    // while the process itself remained alive. Every other case uses the real
    // scheduler and dies via SIGKILL.
    ...(crashPoint === "hang_campaign"
      ? {
          heartbeatScheduler: {
            setInterval: () => ({ disabledForCrashFixture: true }),
            clearInterval: () => undefined,
          },
        }
      : {}),
  });
  const outcome = await engine.processRun(runId);
  const run = await repository.getRunByIdForScope?.({
    tenantKey: slug,
    operation: DISCOVERY_SETUP_OPERATION,
    mode: "canary",
    runId,
  });
  await emitAndExit({ mode, outcome, run });
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    () => process.exit(1),
  );
});
