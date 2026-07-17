import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
  PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
  partnershipsDiscoveryRegistryV2,
  preflightPartnershipsDiscoveryV2,
  type PartnershipsDiscoveryV2Environment,
} from "@/lib/partnerships/discovery-admission-v2";
import {
  DISCOVERY_EXECUTION_OPERATION,
  DISCOVERY_LOCAL_ARTIFACT_STORE_ACK,
  resolveDiscoveryExecutionPolicy,
} from "@/lib/partnerships/discovery-execution-policy";
import {
  PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2,
  PARTNERSHIPS_PREPARE_EFFECT_STEP,
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
} from "@/lib/partnerships/discovery-handler-v2";
import {
  PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_DEFAULT,
  PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS_DEFAULT,
  PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS,
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS,
  resolvePartnershipsDiscoveryRuntimeContract,
} from "@/lib/partnerships/discovery-runtime-contract";
import { DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 } from "@/lib/durable-execution/contract";
import type { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import { declaredEffectTimeoutBudgetMs } from "@/lib/durable-execution/runtime";
import {
  resolveLeadsSearchPolicy,
  type LeadsSearchEnvironment,
} from "@/lib/leads/search-durable-worker";
import {
  resolveChatAgentTurnPolicy,
  type ChatAgentTurnEnvironment,
} from "@/lib/chat/agent-turn-durable";
import { type StagingCanaryReadinessSurface } from "./staging-canary-readiness-contract";
import {
  STAGING_CANARY_ORIGIN,
  StagingCanaryPreflightError,
  validateCanonicalStagingOrigin,
  type StagingCanaryPreflightCode,
} from "./staging-canary-preflight-contract";
import { resolveDurableWorkerBootPlan } from "./durable-worker-boot-plan";
import { resolveYalcConfig } from "@/lib/yalc/client";
import { getRuntime } from "@/lib/runtime";
import type { RuntimeControl } from "@/lib/runtime/types";

export {
  STAGING_CANARY_ORIGIN,
  StagingCanaryPreflightError,
  validateCanonicalStagingOrigin,
};
export type { StagingCanaryPreflightCode };
export const STAGING_CANARY_OPENCLAW_MINIMUM = "2026.5.18" as const;
export const STAGING_CANARY_MODEL_MAX_OUTPUT_TOKENS = 8_192 as const;
export const STAGING_CANARY_MC_CHAT_LIMITS = Object.freeze({
  maxPromptTokensAtStart: 40_000,
  maxInputTokensPerRun: 160_000,
  maxModelCallsPerRun: 6,
  maxToolCallsPerRun: 8,
  maxRiskyToolCallsPerRun: 2,
  maxRepeatedToolCallsPerRun: 2,
  maxSessionHistoryCallsPerRun: 1,
  maxTurnMs: 300_000,
});
const STAGING_CANARY_PARTNERSHIPS_ENV_LIMITS = Object.freeze({
  maxCandidates: 3,
  concurrency: 1,
  maxWorkerAttempts: 1,
  liveDiscoveryTimeoutMs: PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS_DEFAULT,
  handlerTimeoutMs: PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_DEFAULT,
});

function partnershipsPolicyNotExact(): never {
  throw new StagingCanaryPreflightError("flags_not_exact");
}

/** Runtime evidence derived from the same immutable registry used to admit v4. */
export function resolveStagingCanaryPartnershipsLimits(
  registry: DurableExecutionRegistry = partnershipsDiscoveryRegistryV2(),
) {
  try {
    const handlers = registry.registeredHandlersForOperation(
      DISCOVERY_EXECUTION_OPERATION,
    );
    if (handlers.length !== 1) partnershipsPolicyNotExact();
    const handler = handlers[0];
    if (
      handler.contractVersion !==
        DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 ||
      handler.version !== PARTNERSHIPS_DISCOVERY_HANDLER_VERSION_V2
    ) {
      partnershipsPolicyNotExact();
    }
    const expectedSteps = [
      PARTNERSHIPS_PREPARE_EFFECT_STEP,
      PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP,
    ].sort();
    if (
      JSON.stringify(Object.keys(handler.effects).sort()) !==
      JSON.stringify(expectedSteps)
    ) {
      partnershipsPolicyNotExact();
    }
    const prepare = handler.effects[PARTNERSHIPS_PREPARE_EFFECT_STEP];
    const assign = handler.effects[PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP];
    if (
      !prepare ||
      !assign ||
      prepare.definitionVersion !== 2 ||
      assign.definitionVersion !== 2 ||
      prepare.retry.maxAttempts !== 1 ||
      assign.retry.maxAttempts !== 1 ||
      prepare.timeoutMs !== PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS ||
      assign.timeoutMs !== PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS
    ) {
      partnershipsPolicyNotExact();
    }
    const effectTimeoutBudgetMs = declaredEffectTimeoutBudgetMs(
      registry,
      DISCOVERY_EXECUTION_OPERATION,
    );
    if (
      effectTimeoutBudgetMs !==
      PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS +
        PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS
    ) {
      partnershipsPolicyNotExact();
    }
    return Object.freeze({
      ...STAGING_CANARY_PARTNERSHIPS_ENV_LIMITS,
      handlerVersion: handler.version,
      effectDefinitionVersions: Object.freeze({
        [PARTNERSHIPS_PREPARE_EFFECT_STEP]: prepare.definitionVersion,
        [PARTNERSHIPS_YALC_ASSIGN_EFFECT_STEP]: assign.definitionVersion,
      }),
      maxEffectInvocations: Math.max(
        prepare.retry.maxAttempts,
        assign.retry.maxAttempts,
      ),
      effectTimeoutBudgetMs,
    });
  } catch (error) {
    if (error instanceof StagingCanaryPreflightError) throw error;
    return partnershipsPolicyNotExact();
  }
}

export const STAGING_CANARY_PARTNERSHIPS_LIMITS =
  resolveStagingCanaryPartnershipsLimits();
export type StagingCanarySurface = StagingCanaryReadinessSurface;

const STAGING_CANARY_MC_CHAT_ENV = Object.freeze({
  MC_CHAT_COST_GUARD_ENABLED: "1",
  MC_CHAT_MAX_PROMPT_TOKENS_AT_START: "40000",
  MC_CHAT_MAX_INPUT_TOKENS_PER_RUN: "160000",
  MC_CHAT_MAX_MODEL_CALLS_PER_RUN: "6",
  MC_CHAT_MAX_TOOL_CALLS_PER_RUN: "8",
  MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN: "2",
  MC_CHAT_MAX_REPEATED_TOOL_CALLS_PER_RUN: "2",
  MC_CHAT_MAX_SESSION_HISTORY_CALLS_PER_RUN: "1",
  MC_CHAT_MAX_TURN_MS: "300000",
});

const STAGING_CANARY_PARTNERSHIPS_ENV = Object.freeze({
  PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS: "270000",
  PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS: "360000",
  PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES: "3",
  PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY: "1",
  PARTNERSHIPS_DISCOVERY_WORKER_MAX_ATTEMPTS: "1",
});

type Environment = NodeJS.ProcessEnv &
  ChatAgentTurnEnvironment &
  LeadsSearchEnvironment &
  PartnershipsDiscoveryV2Environment;

function runtimeEnvironment(env: Environment | undefined): Environment {
  return env ?? (process.env as Environment);
}

function canonicalTenant(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(value)) {
    throw new StagingCanaryPreflightError("invalid_arguments");
  }
  return value;
}

function exact(value: string | undefined, expected: string): boolean {
  return value === expected;
}

function exactEnvironment(
  env: Environment,
  expected: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(expected).every(([key, value]) => env[key] === value);
}

export function stagingCanaryLimitEvidence(surface: StagingCanarySurface) {
  return {
    modelMaxOutputTokens: STAGING_CANARY_MODEL_MAX_OUTPUT_TOKENS,
    chat: STAGING_CANARY_MC_CHAT_LIMITS,
    ...(surface === "partnerships"
      ? { partnerships: resolveStagingCanaryPartnershipsLimits() }
      : {}),
  } as const;
}

const IMMUTABLE_YALC_IMAGE_RE = /(?:@sha256:[0-9a-f]{64}|:sha-[0-9a-f]{7,64})$/;

export function validateImmutableYalcImage(value: string | undefined): true {
  if (
    !value ||
    value.length > 512 ||
    value.trim() !== value ||
    /\s/.test(value) ||
    !IMMUTABLE_YALC_IMAGE_RE.test(value)
  ) {
    throw new StagingCanaryPreflightError("yalc_image_not_immutable");
  }
  return true;
}

export function validateStagingCanaryConfiguration(input: {
  surface: StagingCanarySurface;
  tenant: string;
  runtimeId: string;
  singleHostAttested: boolean;
  env?: Environment;
  /** Test seam; production always resolves the canonical admission registry. */
  partnershipsRegistry?: DurableExecutionRegistry;
}) {
  const env = runtimeEnvironment(input.env);
  const tenant = canonicalTenant(input.tenant);
  if (!input.singleHostAttested) {
    throw new StagingCanaryPreflightError("single_host_unverified");
  }
  if (input.runtimeId !== "openclaw") {
    throw new StagingCanaryPreflightError("runtime_not_openclaw");
  }
  const boot = resolveDurableWorkerBootPlan(env);
  const chat = resolveChatAgentTurnPolicy(tenant, env);
  const commonExact =
    exact(env.CHAT_AGENT_TURN_EXECUTION_V1, "canary") &&
    exact(env.CHAT_AGENT_TURN_V1_SLUGS, tenant) &&
    exact(env.CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED, "1") &&
    chat.mode === "canary" &&
    chat.enabled &&
    exactEnvironment(env, STAGING_CANARY_MC_CHAT_ENV) &&
    exact(env.LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED, "0") &&
    exact(env.LEADS_DISCOVERY_EXECUTION_V2, "off");

  if (input.surface === "leads") {
    const policy = resolveLeadsSearchPolicy(tenant, env);
    if (
      !commonExact ||
      boot.partnershipsDiscovery ||
      boot.leadsDiscovery ||
      !boot.leadsSearch ||
      !exact(env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED, "0") ||
      !exact(env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED, "1") ||
      !exact(env.LEADS_SEARCH_EXECUTION_V2, "canary") ||
      !exact(env.LEADS_SEARCH_V2_SLUGS, tenant) ||
      policy.mode !== "canary" ||
      !policy.enabled
    ) {
      throw new StagingCanaryPreflightError("flags_not_exact");
    }
    return {
      surface: input.surface,
      tenant,
      singleton: { operatorAttested: true, artifactStoreAcknowledged: false },
    } as const;
  }

  validateImmutableYalcImage(env.YALC_IMAGE);
  try {
    resolvePartnershipsDiscoveryRuntimeContract(env);
    resolveStagingCanaryPartnershipsLimits(input.partnershipsRegistry);
  } catch {
    throw new StagingCanaryPreflightError("flags_not_exact");
  }
  const policy = resolveDiscoveryExecutionPolicy(tenant, env);
  if (
    !commonExact ||
    !boot.partnershipsDiscovery ||
    boot.leadsDiscovery ||
    boot.leadsSearch ||
    !exact(env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED, "1") ||
    !exact(env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED, "0") ||
    !exact(env.LEADS_SEARCH_EXECUTION_V2, "off") ||
    !exact(env.PARTNERSHIPS_DISCOVERY_EXECUTION_V2, "canary") ||
    !exact(env.PARTNERSHIPS_DISCOVERY_EFFECTS_V2, "canary") ||
    !exact(env.PARTNERSHIPS_DISCOVERY_V2_SLUGS, tenant) ||
    !exactEnvironment(env, STAGING_CANARY_PARTNERSHIPS_ENV) ||
    !exact(
      env.PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE,
      DISCOVERY_LOCAL_ARTIFACT_STORE_ACK,
    ) ||
    policy.mode !== "canary" ||
    !policy.enabled
  ) {
    throw new StagingCanaryPreflightError("flags_not_exact");
  }
  return {
    surface: input.surface,
    tenant,
    singleton: { operatorAttested: true, artifactStoreAcknowledged: true },
  } as const;
}

type StagingCanaryModelControl = Pick<
  RuntimeControl,
  "getAgentEffectiveModel" | "getDefaultModel" | "getConfig"
>;

function modelProviderAndId(
  effectiveModel: string,
): { provider: string; modelId: string } | null {
  if (!/^[a-z0-9][a-z0-9._/-]{2,159}$/i.test(effectiveModel)) return null;
  const separator = effectiveModel.indexOf("/");
  if (separator <= 0 || separator === effectiveModel.length - 1) return null;
  return {
    provider: effectiveModel.slice(0, separator),
    modelId: effectiveModel.slice(separator + 1),
  };
}

function configuredModelMaxTokens(
  models: unknown,
  effectiveModel: string,
  modelId: string,
): number | null {
  if (!Array.isArray(models)) return null;
  const entry = models.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const id = (candidate as { id?: unknown }).id;
    return id === modelId || id === effectiveModel;
  }) as { maxTokens?: unknown; max_tokens?: unknown } | undefined;
  const value = entry?.maxTokens ?? entry?.max_tokens;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function modelCredentialPresent(
  provider: string,
  env: NodeJS.ProcessEnv,
): boolean {
  if (provider === "fireworks") return present(env.FIREWORKS_API_KEY);
  if (provider === "anthropic") {
    return (
      present(env.ANTHROPIC_API_KEY) ||
      present(env.CLAUDE_CODE_OAUTH_TOKEN) ||
      present(env.ANTHROPIC_OAUTH_TOKEN)
    );
  }
  if (provider === "openai" || provider === "openai-codex") {
    return present(env.OPENAI_API_KEY);
  }
  return false;
}

/**
 * Reads the model actually selected for Sancho and the provider-enforced
 * output ceiling. This is deliberately runtime evidence, not an env claim.
 */
export async function inspectStagingCanaryModel(
  input: {
    control?: StagingCanaryModelControl;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  try {
    const control = input.control ?? getRuntime().control;
    const effectiveModel =
      (await control.getAgentEffectiveModel("sancho")) ??
      (await control.getDefaultModel());
    if (!effectiveModel) {
      throw new StagingCanaryPreflightError("model_cap_unavailable");
    }
    const parsed = modelProviderAndId(effectiveModel);
    if (!parsed) {
      throw new StagingCanaryPreflightError("model_cap_unavailable");
    }
    const models = await control.getConfig(
      `models.providers.${parsed.provider}.models`,
    );
    const maxOutputTokens = configuredModelMaxTokens(
      models,
      effectiveModel,
      parsed.modelId,
    );
    if (maxOutputTokens === null) {
      throw new StagingCanaryPreflightError("model_cap_unavailable");
    }
    if (maxOutputTokens > STAGING_CANARY_MODEL_MAX_OUTPUT_TOKENS) {
      throw new StagingCanaryPreflightError("model_cap_unsafe");
    }
    if (!modelCredentialPresent(parsed.provider, input.env ?? process.env)) {
      throw new StagingCanaryPreflightError("model_credential_missing");
    }
    return {
      effectiveModel,
      provider: parsed.provider,
      maxOutputTokens,
    } as const;
  } catch (error) {
    if (error instanceof StagingCanaryPreflightError) throw error;
    throw new StagingCanaryPreflightError("model_cap_unavailable");
  }
}

function present(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function inspectStagingCanaryCredentials(input: {
  surface: StagingCanarySurface;
  tenant: string;
  env?: Environment;
  resolveYalc?: typeof resolveYalcConfig;
}) {
  const env = runtimeEnvironment(input.env);
  const common = {
    DATABASE_URL: present(env.DATABASE_URL),
    SANCHO_INTERNAL_API_TOKEN: present(env.SANCHO_INTERNAL_API_TOKEN),
    CHAT_SHARED_SECRET:
      present(env.MC_CHAT_SECRET) || present(env.OPENCLAW_GATEWAY_TOKEN),
  };
  const yalc =
    input.surface === "partnerships"
      ? (input.resolveYalc ?? resolveYalcConfig)(input.tenant)
      : undefined;
  const required =
    input.surface === "leads"
      ? { ...common, APOLLO_API_KEY: present(env.APOLLO_API_KEY) }
      : {
          ...common,
          SCRAPECREATORS_API_KEY: present(env.SCRAPECREATORS_API_KEY),
          YALC_BASE_URL: present(yalc?.baseUrl),
          YALC_API_TOKEN: present(yalc?.token),
        };
  if (Object.values(required).some((value) => !value)) {
    throw new StagingCanaryPreflightError("credentials_missing");
  }
  return required;
}

function versionTuple(value: string): readonly [number, number, number] | null {
  const match = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function validateOpenClawVersion(
  raw: string,
  minimum = STAGING_CANARY_OPENCLAW_MINIMUM,
): string {
  const trimmed = raw.trim();
  const cli =
    /^openclaw[ \t]+(\d{4}\.\d{1,2}\.\d{1,2})(?:[ \t]+\([0-9a-f]{7,40}\))?$/i.exec(
      trimmed,
    );
  const normalized = cli?.[1] ?? trimmed;
  const actual = versionTuple(normalized);
  const floor = versionTuple(minimum);
  if (!actual || !floor) {
    throw new StagingCanaryPreflightError("openclaw_version_unavailable");
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] > floor[index]) return normalized;
    if (actual[index] < floor[index]) {
      throw new StagingCanaryPreflightError("openclaw_version_unsupported");
    }
  }
  return normalized;
}

const execFileAsync = promisify(execFile);

export async function inspectOpenClawVersion(
  run: () => Promise<string> = async () => {
    const result = await execFileAsync("openclaw", ["--version"], {
      timeout: 5_000,
      maxBuffer: 8 * 1024,
    });
    return result.stdout;
  },
): Promise<string> {
  try {
    return validateOpenClawVersion(await run());
  } catch (error) {
    if (error instanceof StagingCanaryPreflightError) throw error;
    throw new StagingCanaryPreflightError("openclaw_version_unavailable");
  }
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function cacheDirectives(response: Response): Set<string> {
  return new Set(
    (response.headers.get("cache-control") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

const GIT_COMMIT_RE = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

function validateExpectedDeploymentIdentity(expected: {
  commit: string;
  imageDigest: string;
}): void {
  if (
    !GIT_COMMIT_RE.test(expected.commit) ||
    !IMAGE_DIGEST_RE.test(expected.imageDigest)
  ) {
    throw new StagingCanaryPreflightError("invalid_arguments");
  }
}

export function validateStagingDeploymentIdentity(
  payload: unknown,
  expected: { commit: string; imageDigest: string },
) {
  validateExpectedDeploymentIdentity(expected);
  const root = record(payload);
  if (
    root?.ok !== true ||
    typeof root.commit !== "string" ||
    typeof root.imageDigest !== "string" ||
    typeof root.env !== "string"
  ) {
    throw new StagingCanaryPreflightError("deployment_identity_unavailable");
  }
  if (
    root.commit !== expected.commit ||
    root.imageDigest !== expected.imageDigest ||
    root.env !== "Staging"
  ) {
    throw new StagingCanaryPreflightError("deployment_identity_mismatch");
  }
  return {
    commit: expected.commit,
    imageDigest: expected.imageDigest,
    environment: "Staging",
  } as const;
}

export async function fetchStagingDeploymentIdentity(input: {
  origin: typeof STAGING_CANARY_ORIGIN;
  expectedCommit: string;
  expectedImageDigest: string;
  fetchImpl?: typeof fetch;
}) {
  const origin = validateCanonicalStagingOrigin(input.origin);
  const expected = {
    commit: input.expectedCommit,
    imageDigest: input.expectedImageDigest,
  };
  validateExpectedDeploymentIdentity(expected);
  try {
    const response = await (input.fetchImpl ?? fetch)(`${origin}/api/health`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok || !cacheDirectives(response).has("no-store")) {
      await response.body?.cancel().catch(() => undefined);
      throw new StagingCanaryPreflightError("deployment_identity_unavailable");
    }
    const body = await readBoundedResponseBody(
      response,
      32 * 1024,
      "deployment_identity_unavailable",
    );
    return validateStagingDeploymentIdentity(JSON.parse(body), expected);
  } catch (error) {
    if (error instanceof StagingCanaryPreflightError) throw error;
    throw new StagingCanaryPreflightError("deployment_identity_unavailable");
  }
}

async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
  errorCode: StagingCanaryPreflightCode,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new StagingCanaryPreflightError(errorCode);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      throw new StagingCanaryPreflightError(errorCode);
    }
    return body;
  }
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new StagingCanaryPreflightError(errorCode);
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return body + decoder.decode();
}

export async function inspectPartnershipsYalcCapability(input: {
  tenant: string;
  env?: Environment;
}) {
  try {
    const receipt = await preflightPartnershipsDiscoveryV2(input.tenant, {
      env: input.env,
    });
    return {
      capability: receipt.capability.capability,
      contractVersion: PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
      contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
    };
  } catch {
    throw new StagingCanaryPreflightError("yalc_capability_unavailable");
  }
}
