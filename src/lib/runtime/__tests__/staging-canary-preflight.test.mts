import assert from "node:assert/strict";
import test from "node:test";

import {
  PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
  PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
} from "@/lib/partnerships/discovery-admission-v2";
import { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import {
  createPartnershipsPrepareAssignmentEffectV2,
  createPartnershipsYalcAssignEffectV2,
} from "@/lib/partnerships/discovery-effects-v2";
import { DISCOVERY_LOCAL_ARTIFACT_STORE_ACK } from "@/lib/partnerships/discovery-execution-policy";
import {
  createPartnershipsDiscoveryHandlerV2,
  createPartnershipsDiscoveryHandlerV2LegacyV3,
  partnershipsDiscoveryYalcAssignEffectPolicyV5,
} from "@/lib/partnerships/discovery-handler-v2";
import { createPartnershipsDiscoveryHandlerV5 } from "@/lib/partnerships/discovery-handler-v5";
import {
  fetchLiveCanaryReadiness,
  validateLiveCanaryReadiness,
} from "@/lib/runtime/staging-canary-readiness-client";
import { STAGING_CANARY_READINESS_SCHEMA } from "@/lib/runtime/staging-canary-readiness-contract";
import {
  STAGING_CANARY_OPENCLAW_MINIMUM,
  STAGING_CANARY_ORIGIN,
  StagingCanaryPreflightError,
  fetchStagingDeploymentIdentity,
  inspectOpenClawVersion,
  inspectPartnershipsYalcCapability,
  inspectStagingCanaryModel,
  inspectStagingCanaryCredentials,
  resolveStagingCanaryPartnershipsLimits,
  stagingCanaryLimitEvidence,
  validateCanonicalStagingOrigin,
  validateOpenClawVersion,
  validateStagingDeploymentIdentity,
  validateStagingCanaryConfiguration,
  type StagingCanaryPreflightCode,
} from "@/lib/runtime/staging-canary-preflight";

type Environment = NodeJS.ProcessEnv;

const EXPECTED_STAGING_COMMIT = "a".repeat(40);
const EXPECTED_STAGING_IMAGE_DIGEST = `sha256:${"b".repeat(64)}`;
const HEALTH_NO_STORE_HEADERS = { "cache-control": "no-store" } as const;
const READINESS_PRIVATE_NO_STORE_HEADERS = {
  "cache-control": "private, no-store",
} as const;

function expectCode(
  callback: () => unknown,
  code: StagingCanaryPreflightCode,
): void {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof StagingCanaryPreflightError);
    assert.equal(error.code, code);
    assert.equal(error.message, `Staging canary preflight failed (${code})`);
    return true;
  });
}

async function expectCodeAsync(
  callback: () => Promise<unknown>,
  code: StagingCanaryPreflightCode,
): Promise<void> {
  await assert.rejects(callback, (error: unknown) => {
    assert.ok(error instanceof StagingCanaryPreflightError);
    assert.equal(error.code, code);
    assert.equal(error.message, `Staging canary preflight failed (${code})`);
    return true;
  });
}

function leadsEnvironment(tenant = "growth4u"): Environment {
  return {
    MC_CHAT_COST_GUARD_ENABLED: "1",
    MC_CHAT_MAX_PROMPT_TOKENS_AT_START: "40000",
    MC_CHAT_MAX_INPUT_TOKENS_PER_RUN: "160000",
    MC_CHAT_MAX_MODEL_CALLS_PER_RUN: "6",
    MC_CHAT_MAX_TOOL_CALLS_PER_RUN: "8",
    MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN: "2",
    MC_CHAT_MAX_REPEATED_TOOL_CALLS_PER_RUN: "2",
    MC_CHAT_MAX_SESSION_HISTORY_CALLS_PER_RUN: "1",
    MC_CHAT_MAX_TURN_MS: "300000",
    CHAT_AGENT_TURN_EXECUTION_V1: "canary",
    CHAT_AGENT_TURN_V1_SLUGS: tenant,
    CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED: "1",
    PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "0",
    LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED: "0",
    LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "1",
    LEADS_DISCOVERY_EXECUTION_V2: "off",
    LEADS_SEARCH_EXECUTION_V2: "canary",
    LEADS_SEARCH_V2_SLUGS: tenant,
  };
}

function partnershipsEnvironment(tenant = "growth4u"): Environment {
  return {
    ...leadsEnvironment(tenant),
    YALC_IMAGE: `ghcr.io/growth4u-systems/yalc@sha256:${"a".repeat(64)}`,
    PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "1",
    LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "0",
    LEADS_SEARCH_EXECUTION_V2: "off",
    LEADS_SEARCH_V2_SLUGS: "",
    PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
    PARTNERSHIPS_DISCOVERY_EFFECTS_V2: "canary",
    PARTNERSHIPS_DISCOVERY_V2_SLUGS: tenant,
    PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: DISCOVERY_LOCAL_ARTIFACT_STORE_ACK,
    PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS: "270000",
    PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS: "1800000",
    PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES: "50",
    PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY: "1",
    PARTNERSHIPS_DISCOVERY_WORKER_MAX_ATTEMPTS: "1",
  };
}

function partnershipsPolicyRegistry(
  input: {
    prepareDefinitionVersion?: number;
    assignMaxAttempts?: number;
    assignTimeoutMs?: number;
  } = {},
): DurableExecutionRegistry {
  const basePrepare = createPartnershipsPrepareAssignmentEffectV2();
  const baseAssign = createPartnershipsYalcAssignEffectV2();
  const prepare = {
    ...basePrepare,
    definitionVersion:
      input.prepareDefinitionVersion ?? basePrepare.definitionVersion,
  };
  const assign = {
    ...baseAssign,
    retry: {
      ...baseAssign.retry,
      maxAttempts: input.assignMaxAttempts ?? baseAssign.retry.maxAttempts,
    },
    timeoutMs: input.assignTimeoutMs ?? baseAssign.timeoutMs,
  };
  return new DurableExecutionRegistry().register(
    createPartnershipsDiscoveryHandlerV2({ prepare, assign }),
  );
}

function partnershipsV5PolicyRegistry(
  input: {
    assignMaxAttempts?: number;
    assignTimeoutMs?: number;
  } = {},
): DurableExecutionRegistry {
  const baseAssign = partnershipsDiscoveryYalcAssignEffectPolicyV5;
  const assign = {
    ...baseAssign,
    retry: {
      ...baseAssign.retry,
      maxAttempts: input.assignMaxAttempts ?? baseAssign.retry.maxAttempts,
    },
    timeoutMs: input.assignTimeoutMs ?? baseAssign.timeoutMs,
  };
  return new DurableExecutionRegistry().register(
    createPartnershipsDiscoveryHandlerV5({
      resolveScrapeClient: () => {
        throw new Error("unbound test policy");
      },
      assignEffect: assign,
    }),
  );
}

function commonCredentials(): Environment {
  return {
    DATABASE_URL: "postgres://private-database",
    SANCHO_INTERNAL_API_TOKEN: "private-internal-token",
    MC_CHAT_SECRET: "private-chat-secret",
  };
}

function readinessPayload(surface: "leads" | "partnerships", ready: boolean) {
  return {
    schemaVersion: STAGING_CANARY_READINESS_SCHEMA,
    surface,
    ready,
  };
}

function deploymentIdentityPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    version: "1.7.5",
    commit: EXPECTED_STAGING_COMMIT,
    imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
    imageRef: "private-registry.example/sancho:private-tag",
    env: "Staging",
    timestamp: "2026-07-16T12:00:00.000Z",
    uptimeSeconds: 42,
    ...overrides,
  };
}

function yalcCapabilityPayload(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    capability: "campaign-leads-assign-v1",
    contractVersion: PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
    endpoints: {
      assign: "/api/campaigns/:campaignId/leads/assign-v1",
      receipt: "/api/campaigns/:campaignId/leads/assign-v1/receipt",
    },
    authentication: { required: true, scheme: "bearer" },
    idempotency: {
      required: true,
      header: "Idempotency-Key",
      requestFingerprintHeader: "Idempotency-Request-Fingerprint",
      requestFingerprint: "sha256_canonical_json_leads_body",
      maxCharacters: 256,
      scope: ["tenant", "campaign", "operation"],
      sameKeySamePayload: "frozen_response",
      sameKeyDifferentPayload: "409_idempotency_conflict",
    },
    execution: {
      atomic: true,
      maxBatchSize: 500,
      replayHeader: "Idempotency-Replayed",
      contractFingerprintHeader: "Yalc-Contract-Fingerprint",
      receiptLookup: "read_only",
    },
    contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
    ready: true,
    checks: {
      bearerAuthentication: true,
      receiptTable: true,
      receiptColumns: true,
      uniqueCommandIndex: true,
      uniqueCommandIndexColumns: true,
    },
  };
}

async function withProcessEnvironment<T>(
  values: Record<string, string | undefined>,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("canonical staging origin accepts only the exact credential-free HTTPS origin", () => {
  assert.equal(
    validateCanonicalStagingOrigin(STAGING_CANARY_ORIGIN),
    STAGING_CANARY_ORIGIN,
  );

  for (const value of [
    undefined,
    "",
    "http://staging.sanchocmo.ai",
    "https://staging.sanchocmo.ai/",
    "https://staging.sanchocmo.ai/dashboard",
    "https://staging.sanchocmo.ai?canary=1",
    "https://staging.sanchocmo.ai#canary",
    "https://operator:secret@staging.sanchocmo.ai",
    "https://staging.sanchocmo.ai:443",
    "https://STAGING.sanchocmo.ai",
    "https://staging.sanchocmo.ai.evil.example",
  ]) {
    expectCode(
      () => validateCanonicalStagingOrigin(value),
      "sancho_origin_invalid",
    );
  }
});

test("leads canary accepts one exact tenant and keeps every other worker off", () => {
  assert.deepEqual(
    validateStagingCanaryConfiguration({
      surface: "leads",
      tenant: "growth4u",
      runtimeId: "openclaw",
      singleHostAttested: true,
      env: leadsEnvironment(),
    }),
    {
      surface: "leads",
      tenant: "growth4u",
      singleton: {
        operatorAttested: true,
        artifactStoreAcknowledged: false,
      },
    },
  );
});

test("leads canary fails closed for every absent, relaxed, or conflicting flag", () => {
  const mutations: Array<readonly [string, string | undefined]> = [
    ["MC_CHAT_COST_GUARD_ENABLED", undefined],
    ["MC_CHAT_COST_GUARD_ENABLED", "true"],
    ["MC_CHAT_MAX_PROMPT_TOKENS_AT_START", "40001"],
    ["MC_CHAT_MAX_INPUT_TOKENS_PER_RUN", "160001"],
    ["MC_CHAT_MAX_MODEL_CALLS_PER_RUN", "7"],
    ["MC_CHAT_MAX_TOOL_CALLS_PER_RUN", "9"],
    ["MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN", "3"],
    ["MC_CHAT_MAX_REPEATED_TOOL_CALLS_PER_RUN", "3"],
    ["MC_CHAT_MAX_SESSION_HISTORY_CALLS_PER_RUN", "2"],
    ["MC_CHAT_MAX_TURN_MS", "300001"],
    ["CHAT_AGENT_TURN_EXECUTION_V1", undefined],
    ["CHAT_AGENT_TURN_EXECUTION_V1", "CANARY"],
    ["CHAT_AGENT_TURN_EXECUTION_V1", " canary "],
    ["CHAT_AGENT_TURN_V1_SLUGS", undefined],
    ["CHAT_AGENT_TURN_V1_SLUGS", "GROWTH4U"],
    ["CHAT_AGENT_TURN_V1_SLUGS", "growth4u,other"],
    ["CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED", undefined],
    ["CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED", "true"],
    ["PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED", undefined],
    ["PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED", "1"],
    ["LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED", undefined],
    ["LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED", "1"],
    ["LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED", undefined],
    ["LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED", "true"],
    ["LEADS_DISCOVERY_EXECUTION_V2", undefined],
    ["LEADS_DISCOVERY_EXECUTION_V2", "OFF"],
    ["LEADS_SEARCH_EXECUTION_V2", undefined],
    ["LEADS_SEARCH_EXECUTION_V2", "CANARY"],
    ["LEADS_SEARCH_EXECUTION_V2", " canary "],
    ["LEADS_SEARCH_V2_SLUGS", undefined],
    ["LEADS_SEARCH_V2_SLUGS", "GROWTH4U"],
    ["LEADS_SEARCH_V2_SLUGS", "growth4u,other"],
    ["LEADS_SEARCH_V2_SLUGS", "growth4u "],
  ];

  for (const [key, value] of mutations) {
    const env = leadsEnvironment();
    if (value === undefined) delete env[key];
    else env[key] = value;
    expectCode(
      () =>
        validateStagingCanaryConfiguration({
          surface: "leads",
          tenant: "growth4u",
          runtimeId: "openclaw",
          singleHostAttested: true,
          env,
        }),
      "flags_not_exact",
    );
  }
});

test("partnerships canary accepts exact flags plus the single-host artifact acknowledgement", () => {
  assert.deepEqual(
    validateStagingCanaryConfiguration({
      surface: "partnerships",
      tenant: "growth4u",
      runtimeId: "openclaw",
      singleHostAttested: true,
      env: partnershipsEnvironment(),
    }),
    {
      surface: "partnerships",
      tenant: "growth4u",
      singleton: {
        operatorAttested: true,
        artifactStoreAcknowledged: true,
      },
    },
  );
});

test("partnerships canary evidence is derived from the exact v5 registry policy", () => {
  const limits = resolveStagingCanaryPartnershipsLimits();
  assert.deepEqual(limits, {
    maxCandidates: 50,
    concurrency: 1,
    maxWorkerAttempts: 1,
    liveDiscoveryTimeoutMs: 270_000,
    handlerTimeoutMs: 1_800_000,
    handlerVersion: 5,
    effectDefinitionVersions: {
      "yalc.assign_leads": 3,
    },
    maxEffectInvocations: 1,
    effectTimeoutBudgetMs: 30_000,
  });
  assert.deepEqual(
    stagingCanaryLimitEvidence("partnerships").partnerships,
    limits,
  );
});

test("partnerships canary fails closed on handler or effect policy drift", () => {
  const driftedRegistries = [
    new DurableExecutionRegistry().register(
      createPartnershipsDiscoveryHandlerV2LegacyV3(),
    ),
    // Superseded v4 policy shapes now fail closed on the version check.
    partnershipsPolicyRegistry({ prepareDefinitionVersion: 1 }),
    partnershipsPolicyRegistry({ assignMaxAttempts: 2 }),
    partnershipsPolicyRegistry({ assignTimeoutMs: 29_000 }),
    // Drifted v5 policy shapes fail closed on the effect policy checks.
    partnershipsV5PolicyRegistry({ assignMaxAttempts: 2 }),
    partnershipsV5PolicyRegistry({ assignTimeoutMs: 29_000 }),
  ];

  for (const partnershipsRegistry of driftedRegistries) {
    expectCode(
      () =>
        validateStagingCanaryConfiguration({
          surface: "partnerships",
          tenant: "growth4u",
          runtimeId: "openclaw",
          singleHostAttested: true,
          env: partnershipsEnvironment(),
          partnershipsRegistry,
        }),
      "flags_not_exact",
    );
  }
});

test("partnerships canary accepts only immutable Yalc digest or commit-tag references", () => {
  const immutableImages = [
    `ghcr.io/growth4u-systems/yalc@sha256:${"0".repeat(64)}`,
    "ghcr.io/growth4u-systems/yalc:sha-0123456",
    `ghcr.io/growth4u-systems/yalc:sha-${"abcdef0123456789".repeat(4)}`,
  ];

  for (const YALC_IMAGE of immutableImages) {
    const receipt = validateStagingCanaryConfiguration({
      surface: "partnerships",
      tenant: "growth4u",
      runtimeId: "openclaw",
      singleHostAttested: true,
      env: { ...partnershipsEnvironment(), YALC_IMAGE },
    });
    assert.equal(receipt.surface, "partnerships");
  }
});

test("partnerships canary fails closed for absent, mutable, padded, or malformed Yalc images", () => {
  const invalidImages = [
    undefined,
    "",
    " ",
    "ghcr.io/growth4u-systems/yalc",
    "ghcr.io/growth4u-systems/yalc:latest",
    "ghcr.io/growth4u-systems/yalc:staging",
    "ghcr.io/growth4u-systems/yalc:sha-012345",
    `ghcr.io/growth4u-systems/yalc:sha-${"a".repeat(65)}`,
    "ghcr.io/growth4u-systems/yalc:sha-012345G",
    `ghcr.io/growth4u-systems/yalc@sha256:${"a".repeat(63)}`,
    `ghcr.io/growth4u-systems/yalc@sha256:${"a".repeat(65)}`,
    `ghcr.io/growth4u-systems/yalc@sha256:${"A".repeat(64)}`,
    `ghcr.io/growth4u-systems/yalc@sha512:${"a".repeat(64)}`,
    `ghcr.io/growth4u-systems/yalc@sha256:${"a".repeat(64)}?mutable=1`,
    ` ghcr.io/growth4u-systems/yalc@sha256:${"a".repeat(64)}`,
    `ghcr.io/growth4u-systems/yalc@sha256:${"a".repeat(64)} `,
  ];

  for (const YALC_IMAGE of invalidImages) {
    const env = partnershipsEnvironment();
    if (YALC_IMAGE === undefined) delete env.YALC_IMAGE;
    else env.YALC_IMAGE = YALC_IMAGE;
    expectCode(
      () =>
        validateStagingCanaryConfiguration({
          surface: "partnerships",
          tenant: "growth4u",
          runtimeId: "openclaw",
          singleHostAttested: true,
          env,
        }),
      "yalc_image_not_immutable",
    );
  }
});

test("partnerships canary fails closed for every absent, relaxed, or conflicting flag", () => {
  const mutations: Array<readonly [string, string | undefined]> = [
    ["PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS", undefined],
    ["PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS", "300000"],
    ["PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS", undefined],
    ["PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS", "330000"],
    ["PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES", undefined],
    ["PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES", "4"],
    ["PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY", undefined],
    ["PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY", "2"],
    ["PARTNERSHIPS_DISCOVERY_WORKER_MAX_ATTEMPTS", undefined],
    ["PARTNERSHIPS_DISCOVERY_WORKER_MAX_ATTEMPTS", "2"],
    ["CHAT_AGENT_TURN_EXECUTION_V1", undefined],
    ["CHAT_AGENT_TURN_EXECUTION_V1", "CANARY"],
    ["CHAT_AGENT_TURN_EXECUTION_V1", " canary "],
    ["CHAT_AGENT_TURN_V1_SLUGS", undefined],
    ["CHAT_AGENT_TURN_V1_SLUGS", "GROWTH4U"],
    ["CHAT_AGENT_TURN_V1_SLUGS", "growth4u,other"],
    ["CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED", undefined],
    ["CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED", "true"],
    ["PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED", undefined],
    ["PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED", "true"],
    ["LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED", undefined],
    ["LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED", "1"],
    ["LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED", undefined],
    ["LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED", "1"],
    ["LEADS_DISCOVERY_EXECUTION_V2", undefined],
    ["LEADS_DISCOVERY_EXECUTION_V2", "OFF"],
    ["LEADS_SEARCH_EXECUTION_V2", undefined],
    ["LEADS_SEARCH_EXECUTION_V2", "OFF"],
    ["PARTNERSHIPS_DISCOVERY_EXECUTION_V2", undefined],
    ["PARTNERSHIPS_DISCOVERY_EXECUTION_V2", "CANARY"],
    ["PARTNERSHIPS_DISCOVERY_EFFECTS_V2", undefined],
    ["PARTNERSHIPS_DISCOVERY_EFFECTS_V2", "CANARY"],
    ["PARTNERSHIPS_DISCOVERY_V2_SLUGS", undefined],
    ["PARTNERSHIPS_DISCOVERY_V2_SLUGS", "growth4u,other"],
    ["PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE", undefined],
    [
      "PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE",
      DISCOVERY_LOCAL_ARTIFACT_STORE_ACK.toUpperCase(),
    ],
    [
      "PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE",
      ` ${DISCOVERY_LOCAL_ARTIFACT_STORE_ACK}`,
    ],
  ];

  for (const [key, value] of mutations) {
    const env = partnershipsEnvironment();
    if (value === undefined) delete env[key];
    else env[key] = value;
    expectCode(
      () =>
        validateStagingCanaryConfiguration({
          surface: "partnerships",
          tenant: "growth4u",
          runtimeId: "openclaw",
          singleHostAttested: true,
          env,
        }),
      "flags_not_exact",
    );
  }
});

test("configuration validates tenant syntax before evaluating rollout flags", () => {
  for (const tenant of [
    "",
    " Growth4u",
    "Growth4u",
    "growth_4u",
    "-growth4u",
    "growth4u/other",
    "a".repeat(121),
  ]) {
    expectCode(
      () =>
        validateStagingCanaryConfiguration({
          surface: "leads",
          tenant,
          runtimeId: "openclaw",
          singleHostAttested: true,
          env: leadsEnvironment(tenant),
        }),
      "invalid_arguments",
    );
  }
});

test("both canary surfaces require an explicit singleton operator attestation", () => {
  expectCode(
    () =>
      validateStagingCanaryConfiguration({
        surface: "leads",
        tenant: "growth4u",
        runtimeId: "openclaw",
        singleHostAttested: false,
        env: leadsEnvironment(),
      }),
    "single_host_unverified",
  );
  expectCode(
    () =>
      validateStagingCanaryConfiguration({
        surface: "partnerships",
        tenant: "growth4u",
        runtimeId: "openclaw",
        singleHostAttested: false,
        env: partnershipsEnvironment(),
      }),
    "single_host_unverified",
  );
});

test("configuration fails closed unless the effective runtime selection is exactly OpenClaw", () => {
  for (const runtimeId of [
    "",
    "OpenClaw",
    " openclaw ",
    "hermes",
    "external-http",
  ]) {
    expectCode(
      () =>
        validateStagingCanaryConfiguration({
          surface: "leads",
          tenant: "growth4u",
          runtimeId,
          singleHostAttested: true,
          env: leadsEnvironment(),
        }),
      "runtime_not_openclaw",
    );
  }
});

test("leads credential inspection returns booleans only and never resolves Yalc", () => {
  let yalcResolutions = 0;
  const credentials = inspectStagingCanaryCredentials({
    surface: "leads",
    tenant: "growth4u",
    env: { ...commonCredentials(), APOLLO_API_KEY: "private-apollo-key" },
    resolveYalc: () => {
      yalcResolutions += 1;
      throw new Error("must not run");
    },
  });

  assert.deepEqual(credentials, {
    DATABASE_URL: true,
    SANCHO_INTERNAL_API_TOKEN: true,
    CHAT_SHARED_SECRET: true,
    APOLLO_API_KEY: true,
  });
  assert.equal(yalcResolutions, 0);
  assert.doesNotMatch(JSON.stringify(credentials), /private/i);
});

test("leads credential inspection requires database, internal API, and Apollo credentials", () => {
  const keys = [
    "DATABASE_URL",
    "SANCHO_INTERNAL_API_TOKEN",
    "APOLLO_API_KEY",
  ] as const;
  for (const key of keys) {
    for (const missing of [undefined, "", " \n\t "]) {
      const env = {
        ...commonCredentials(),
        APOLLO_API_KEY: "private-apollo-key",
      };
      if (missing === undefined) delete env[key];
      else env[key] = missing;
      expectCode(
        () =>
          inspectStagingCanaryCredentials({
            surface: "leads",
            tenant: "growth4u",
            env,
          }),
        "credentials_missing",
      );
    }
  }
});

test("chat credential inspection accepts either shared-secret source and fails only when both are absent", () => {
  for (const shared of [
    { MC_CHAT_SECRET: "private-chat-secret" },
    { OPENCLAW_GATEWAY_TOKEN: "private-gateway-token" },
    {
      MC_CHAT_SECRET: "private-chat-secret",
      OPENCLAW_GATEWAY_TOKEN: "private-gateway-token",
    },
  ]) {
    const credentials = inspectStagingCanaryCredentials({
      surface: "leads",
      tenant: "growth4u",
      env: {
        DATABASE_URL: "postgres://private-database",
        SANCHO_INTERNAL_API_TOKEN: "private-internal-token",
        APOLLO_API_KEY: "private-apollo-key",
        ...shared,
      },
    });
    assert.equal(credentials.CHAT_SHARED_SECRET, true);
  }

  for (const shared of [
    {},
    { MC_CHAT_SECRET: "" },
    { OPENCLAW_GATEWAY_TOKEN: " \n\t " },
    { MC_CHAT_SECRET: " ", OPENCLAW_GATEWAY_TOKEN: "\n" },
  ]) {
    expectCode(
      () =>
        inspectStagingCanaryCredentials({
          surface: "leads",
          tenant: "growth4u",
          env: {
            DATABASE_URL: "postgres://private-database",
            SANCHO_INTERNAL_API_TOKEN: "private-internal-token",
            APOLLO_API_KEY: "private-apollo-key",
            ...shared,
          },
        }),
      "credentials_missing",
    );
  }
});

test("partnerships credential inspection resolves the tenant binding and returns booleans only", () => {
  const requestedTenants: string[] = [];
  const credentials = inspectStagingCanaryCredentials({
    surface: "partnerships",
    tenant: "growth4u",
    env: {
      ...commonCredentials(),
      SCRAPECREATORS_API_KEY: "private-scrape-key",
    },
    resolveYalc: (tenant) => {
      requestedTenants.push(tenant ?? "");
      return {
        baseUrl: "https://yalc.example",
        token: "private-yalc-token",
        slug: tenant,
      };
    },
  });

  assert.deepEqual(requestedTenants, ["growth4u"]);
  assert.deepEqual(credentials, {
    DATABASE_URL: true,
    SANCHO_INTERNAL_API_TOKEN: true,
    CHAT_SHARED_SECRET: true,
    SCRAPECREATORS_API_KEY: true,
    YALC_BASE_URL: true,
    YALC_API_TOKEN: true,
  });
  assert.doesNotMatch(JSON.stringify(credentials), /private/i);
});

test("partnerships credential inspection rejects every missing provider or Yalc credential", () => {
  for (const key of [
    "DATABASE_URL",
    "SANCHO_INTERNAL_API_TOKEN",
    "SCRAPECREATORS_API_KEY",
  ]) {
    const env: Environment = {
      ...commonCredentials(),
      SCRAPECREATORS_API_KEY: "private-scrape-key",
    };
    delete env[key];
    expectCode(
      () =>
        inspectStagingCanaryCredentials({
          surface: "partnerships",
          tenant: "growth4u",
          env,
          resolveYalc: () => ({
            baseUrl: "https://yalc.example",
            token: "private-yalc-token",
          }),
        }),
      "credentials_missing",
    );
  }

  for (const field of ["baseUrl", "token"] as const) {
    for (const missing of [undefined, "", " \n\t "]) {
      expectCode(
        () =>
          inspectStagingCanaryCredentials({
            surface: "partnerships",
            tenant: "growth4u",
            env: {
              ...commonCredentials(),
              SCRAPECREATORS_API_KEY: "private-scrape-key",
            },
            resolveYalc: () => ({
              baseUrl:
                field === "baseUrl"
                  ? (missing as string)
                  : "https://yalc.example",
              token: field === "token" ? missing : "private-yalc-token",
            }),
          }),
        "credentials_missing",
      );
    }
  }
});

test("OpenClaw version validation accepts the floor, a newer calendar version, and CLI prefix", () => {
  for (const [raw, expected] of [
    [STAGING_CANARY_OPENCLAW_MINIMUM, STAGING_CANARY_OPENCLAW_MINIMUM],
    ["openclaw 2026.5.18\n", "2026.5.18"],
    ["OpenClaw 2026.5.18 (32b0e8f)", "2026.5.18"],
    [
      "OpenClaw 2026.5.19 (32b0e8fece1f837cb96d26320b8317963ea5b5a5)",
      "2026.5.19",
    ],
    ["OpenClaw 2026.5.19", "2026.5.19"],
    ["2026.6.1", "2026.6.1"],
    ["2027.1.1", "2027.1.1"],
  ]) {
    assert.equal(validateOpenClawVersion(raw), expected);
  }
});

test("OpenClaw version validation distinguishes unsupported from unavailable", () => {
  for (const raw of [
    "2025.12.31",
    "2026.4.99",
    "2026.5.17",
    "OpenClaw 2026.5.17 (32b0e8f)",
  ]) {
    expectCode(
      () => validateOpenClawVersion(raw),
      "openclaw_version_unsupported",
    );
  }
  for (const raw of [
    "",
    "v2026.5.18",
    "openclaw version 2026.5.18",
    "2026.5",
    "2026.5.18-beta.1",
    "OpenClaw 2026.5.18 (not-a-commit)",
    "OpenClaw 2026.5.18 (abcdef)",
    "OpenClaw\n2026.5.18 (32b0e8f)",
    "2026.5.18 (32b0e8f)",
    "2026.05.018",
    "secret diagnostic instead of a version",
  ]) {
    expectCode(
      () => validateOpenClawVersion(raw),
      "openclaw_version_unavailable",
    );
  }
  expectCode(
    () => validateOpenClawVersion("2026.5.18", "not-a-version"),
    "openclaw_version_unavailable",
  );
});

test("OpenClaw CLI inspection preserves classified failures and redacts execution errors", async () => {
  assert.equal(
    await inspectOpenClawVersion(async () => "OpenClaw 2026.5.19 (32b0e8f)\n"),
    "2026.5.19",
  );
  await expectCodeAsync(
    () => inspectOpenClawVersion(async () => "2026.5.17"),
    "openclaw_version_unsupported",
  );
  await expectCodeAsync(
    () =>
      inspectOpenClawVersion(async () => {
        throw new Error("spawn failed with private-gateway-token");
      }),
    "openclaw_version_unavailable",
  );
});

test("model inspection reports the effective runtime model and enforced cap", async () => {
  const configPaths: string[] = [];
  const result = await inspectStagingCanaryModel({
    env: { FIREWORKS_API_KEY: "private-fireworks-key" },
    control: {
      getAgentEffectiveModel: async (agentId) => {
        assert.equal(agentId, "sancho");
        return "fireworks/accounts/fireworks/models/glm-5p2";
      },
      getDefaultModel: async () => {
        assert.fail("agent override must win");
      },
      getConfig: async (path) => {
        configPaths.push(path);
        return [
          {
            id: "accounts/fireworks/models/glm-5p2",
            maxTokens: 8192,
          },
        ];
      },
    },
  });

  assert.deepEqual(result, {
    effectiveModel: "fireworks/accounts/fireworks/models/glm-5p2",
    provider: "fireworks",
    maxOutputTokens: 8192,
  });
  assert.deepEqual(configPaths, ["models.providers.fireworks.models"]);
});

test("model inspection falls back to the runtime default but fails closed on cap/key drift", async () => {
  const control = (maxTokens: unknown) => ({
    getAgentEffectiveModel: async () => null,
    getDefaultModel: async () => "fireworks/accounts/fireworks/models/glm-5p2",
    getConfig: async () => [
      { id: "accounts/fireworks/models/glm-5p2", maxTokens },
    ],
  });

  await expectCodeAsync(
    () =>
      inspectStagingCanaryModel({
        control: control(undefined),
        env: { FIREWORKS_API_KEY: "private" },
      }),
    "model_cap_unavailable",
  );
  await expectCodeAsync(
    () =>
      inspectStagingCanaryModel({
        control: control(8193),
        env: { FIREWORKS_API_KEY: "private" },
      }),
    "model_cap_unsafe",
  );
  await expectCodeAsync(
    () => inspectStagingCanaryModel({ control: control(8192), env: {} }),
    "model_credential_missing",
  );
});

test("deployment identity accepts an exact Staging payload and returns a redacted receipt", () => {
  const receipt = validateStagingDeploymentIdentity(
    {
      ...deploymentIdentityPayload(),
      privateDiagnostic: "postgres://private-database",
    },
    {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
    },
  );

  assert.deepEqual(receipt, {
    commit: EXPECTED_STAGING_COMMIT,
    imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
    environment: "Staging",
  });
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /private|registry|diagnostic|timestamp|uptime/i,
  );
});

test("deployment identity requires exact lowercase 40-hex commit and sha256 64-hex digest expectations", () => {
  const invalidExpected = [
    { commit: "a".repeat(39), imageDigest: EXPECTED_STAGING_IMAGE_DIGEST },
    { commit: "a".repeat(41), imageDigest: EXPECTED_STAGING_IMAGE_DIGEST },
    { commit: "A".repeat(40), imageDigest: EXPECTED_STAGING_IMAGE_DIGEST },
    {
      commit: `${"a".repeat(39)}g`,
      imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
    },
    {
      commit: ` ${EXPECTED_STAGING_COMMIT}`,
      imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
    },
    {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: `sha256:${"b".repeat(63)}`,
    },
    {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: `sha256:${"b".repeat(65)}`,
    },
    {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: `sha256:${"B".repeat(64)}`,
    },
    {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: `sha512:${"b".repeat(64)}`,
    },
    {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: ` ${EXPECTED_STAGING_IMAGE_DIGEST}`,
    },
    {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: `${EXPECTED_STAGING_IMAGE_DIGEST} `,
    },
  ];

  for (const expected of invalidExpected) {
    expectCode(
      () =>
        validateStagingDeploymentIdentity(
          deploymentIdentityPayload(),
          expected,
        ),
      "invalid_arguments",
    );
  }
});

test("deployment identity fails closed on commit, digest, or environment mismatch", () => {
  for (const payload of [
    deploymentIdentityPayload({ commit: "c".repeat(40) }),
    deploymentIdentityPayload({ imageDigest: `sha256:${"d".repeat(64)}` }),
    deploymentIdentityPayload({ env: "staging" }),
    deploymentIdentityPayload({ env: "Production" }),
    deploymentIdentityPayload({ env: "Staging " }),
  ]) {
    expectCode(
      () =>
        validateStagingDeploymentIdentity(payload, {
          commit: EXPECTED_STAGING_COMMIT,
          imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
        }),
      "deployment_identity_mismatch",
    );
  }
});

test("deployment identity rejects absent or malformed health schemas as unavailable", () => {
  const complete = deploymentIdentityPayload();
  const malformedPayloads: unknown[] = [
    null,
    [],
    {},
    { ...complete, ok: false },
    { ...complete, ok: "true" },
    { ...complete, commit: null },
    { ...complete, imageDigest: null },
    { ...complete, env: null },
  ];
  for (const field of ["ok", "commit", "imageDigest", "env"]) {
    const missing = { ...complete };
    delete missing[field];
    malformedPayloads.push(missing);
  }

  for (const payload of malformedPayloads) {
    expectCode(
      () =>
        validateStagingDeploymentIdentity(payload, {
          commit: EXPECTED_STAGING_COMMIT,
          imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
        }),
      "deployment_identity_unavailable",
    );
  }
});

test("deployment identity GET uses the exact health URL, blocks redirects, times out, and redacts the response", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalTimeout = AbortSignal.timeout;
  const timeoutController = new AbortController();
  let timeoutMilliseconds: number | undefined;
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    writable: true,
    value: (milliseconds: number) => {
      timeoutMilliseconds = milliseconds;
      return timeoutController.signal;
    },
  });

  try {
    const receipt = await fetchStagingDeploymentIdentity({
      origin: STAGING_CANARY_ORIGIN,
      expectedCommit: EXPECTED_STAGING_COMMIT,
      expectedImageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), init });
        return new Response(
          JSON.stringify({
            ...deploymentIdentityPayload(),
            privateDiagnostic: "private deployment details",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              ...HEALTH_NO_STORE_HEADERS,
            },
          },
        );
      }) as typeof fetch,
    });

    assert.deepEqual(receipt, {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
      environment: "Staging",
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, `${STAGING_CANARY_ORIGIN}/api/health`);
    assert.equal(requests[0]?.init?.method, "GET");
    assert.equal(requests[0]?.init?.redirect, "error");
    assert.equal(requests[0]?.init?.signal, timeoutController.signal);
    assert.equal(timeoutMilliseconds, 5_000);
    assert.doesNotMatch(JSON.stringify(receipt), /private|details/i);
  } finally {
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      writable: true,
      value: originalTimeout,
    });
  }
});

test("deployment identity GET accepts exactly 32 KiB and rejects a larger body", async () => {
  const json = JSON.stringify(deploymentIdentityPayload());
  const exact = `${json}${" ".repeat(32 * 1024 - Buffer.byteLength(json))}`;
  assert.equal(Buffer.byteLength(exact), 32 * 1024);

  assert.deepEqual(
    await fetchStagingDeploymentIdentity({
      origin: STAGING_CANARY_ORIGIN,
      expectedCommit: EXPECTED_STAGING_COMMIT,
      expectedImageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
      fetchImpl: (async () =>
        new Response(exact, {
          status: 200,
          headers: HEALTH_NO_STORE_HEADERS,
        })) as typeof fetch,
    }),
    {
      commit: EXPECTED_STAGING_COMMIT,
      imageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
      environment: "Staging",
    },
  );

  await expectCodeAsync(
    () =>
      fetchStagingDeploymentIdentity({
        origin: STAGING_CANARY_ORIGIN,
        expectedCommit: EXPECTED_STAGING_COMMIT,
        expectedImageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
        fetchImpl: (async () =>
          new Response(`${exact} `, {
            status: 200,
            headers: HEALTH_NO_STORE_HEADERS,
          })) as typeof fetch,
      }),
    "deployment_identity_unavailable",
  );
});

test("deployment identity GET requires an explicit no-store response directive", async () => {
  for (const cacheControl of [
    undefined,
    "",
    "max-age=60",
    "no-cache",
    "private",
    "public, max-age=0",
  ]) {
    await expectCodeAsync(
      () =>
        fetchStagingDeploymentIdentity({
          origin: STAGING_CANARY_ORIGIN,
          expectedCommit: EXPECTED_STAGING_COMMIT,
          expectedImageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
          fetchImpl: (async () =>
            new Response(JSON.stringify(deploymentIdentityPayload()), {
              status: 200,
              ...(cacheControl === undefined
                ? {}
                : { headers: { "cache-control": cacheControl } }),
            })) as typeof fetch,
        }),
      "deployment_identity_unavailable",
    );
  }
});

test("deployment identity GET maps HTTP, transport, parse, and schema diagnostics to a redacted error", async () => {
  const cases: Array<() => Promise<Response>> = [
    async () =>
      new Response("private upstream deployment diagnostic", {
        status: 503,
        statusText: "private failure",
        headers: HEALTH_NO_STORE_HEADERS,
      }),
    async () =>
      new Response("private malformed health json", {
        status: 200,
        headers: HEALTH_NO_STORE_HEADERS,
      }),
    async () =>
      new Response(
        JSON.stringify({
          ok: true,
          privateDiagnostic: "private missing identity fields",
        }),
        { status: 200, headers: HEALTH_NO_STORE_HEADERS },
      ),
    async () => {
      throw new Error("network error containing private-registry-token");
    },
  ];

  for (const response of cases) {
    await expectCodeAsync(
      () =>
        fetchStagingDeploymentIdentity({
          origin: STAGING_CANARY_ORIGIN,
          expectedCommit: EXPECTED_STAGING_COMMIT,
          expectedImageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
          fetchImpl: (async () => response()) as typeof fetch,
        }),
      "deployment_identity_unavailable",
    );
  }

  await expectCodeAsync(
    () =>
      fetchStagingDeploymentIdentity({
        origin: STAGING_CANARY_ORIGIN,
        expectedCommit: EXPECTED_STAGING_COMMIT,
        expectedImageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
        fetchImpl: (async () =>
          new Response(
            JSON.stringify(
              deploymentIdentityPayload({ commit: "c".repeat(40) }),
            ),
            { status: 200, headers: HEALTH_NO_STORE_HEADERS },
          )) as typeof fetch,
      }),
    "deployment_identity_mismatch",
  );
});

test("deployment identity GET performs zero I/O for invalid origin or expected identity", async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    return new Response(JSON.stringify(deploymentIdentityPayload()), {
      status: 200,
    });
  }) as typeof fetch;

  await expectCodeAsync(
    () =>
      fetchStagingDeploymentIdentity({
        origin: "https://attacker.example" as typeof STAGING_CANARY_ORIGIN,
        expectedCommit: EXPECTED_STAGING_COMMIT,
        expectedImageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
        fetchImpl,
      }),
    "sancho_origin_invalid",
  );
  await expectCodeAsync(
    () =>
      fetchStagingDeploymentIdentity({
        origin: STAGING_CANARY_ORIGIN,
        expectedCommit: "a".repeat(39),
        expectedImageDigest: EXPECTED_STAGING_IMAGE_DIGEST,
        fetchImpl,
      }),
    "invalid_arguments",
  );
  await expectCodeAsync(
    () =>
      fetchStagingDeploymentIdentity({
        origin: STAGING_CANARY_ORIGIN,
        expectedCommit: EXPECTED_STAGING_COMMIT,
        expectedImageDigest: `sha256:${"b".repeat(63)}`,
        fetchImpl,
      }),
    "invalid_arguments",
  );
  assert.equal(requests, 0);
});

test("readiness validation requires the exact selected surface and emits a fixed receipt", () => {
  const leads = validateLiveCanaryReadiness(
    {
      ...readinessPayload("leads", true),
      privateDiagnostic: "postgres://private-database",
    },
    "leads",
  );
  const partnerships = validateLiveCanaryReadiness(
    readinessPayload("partnerships", true),
    "partnerships",
  );

  assert.deepEqual(leads, { surface: "leads", ready: true });
  assert.deepEqual(partnerships, { surface: "partnerships", ready: true });
  assert.doesNotMatch(JSON.stringify(leads), /private|postgres/i);
});

test("readiness validation rejects malformed or incomplete schemas as unavailable", () => {
  for (const payload of [
    null,
    [],
    {},
    { ...readinessPayload("leads", true), schemaVersion: "v2" },
    { ...readinessPayload("leads", true), surface: undefined },
    { ...readinessPayload("leads", true), surface: "partnerships" },
    { ...readinessPayload("leads", true), ready: undefined },
    { ...readinessPayload("leads", true), ready: "true" },
  ]) {
    expectCode(
      () => validateLiveCanaryReadiness(payload, "leads"),
      "readiness_unavailable",
    );
  }
});

test("readiness validation fails closed when the selected surface is not ready", () => {
  for (const surface of ["leads", "partnerships"] as const) {
    expectCode(
      () =>
        validateLiveCanaryReadiness(readinessPayload(surface, false), surface),
      "readiness_not_ready",
    );
  }
});

test("readiness GET is bounded, non-redirecting, authenticated, and redacted", async () => {
  const token = "private-readiness-token";
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const body = JSON.stringify({
    ...readinessPayload("leads", true),
    privateDiagnostic: "postgres://private-database",
  });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        ...READINESS_PRIVATE_NO_STORE_HEADERS,
      },
    });
  }) as typeof fetch;

  const receipt = await fetchLiveCanaryReadiness({
    origin: STAGING_CANARY_ORIGIN,
    token,
    surface: "leads",
    fetchImpl,
  });

  assert.deepEqual(receipt, { surface: "leads", ready: true });
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    `${STAGING_CANARY_ORIGIN}/api/internal/staging-canary-readiness/leads`,
  );
  assert.equal(requests[0]?.init?.method, "GET");
  assert.equal(requests[0]?.init?.redirect, "error");
  assert.ok(requests[0]?.init?.signal instanceof AbortSignal);
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("authorization"),
    `Bearer ${token}`,
  );
  assert.doesNotMatch(JSON.stringify(receipt), /private|postgres/i);
});

test("readiness GET routes Partnerships to its isolated endpoint", async () => {
  const requests: string[] = [];
  const receipt = await fetchLiveCanaryReadiness({
    origin: STAGING_CANARY_ORIGIN,
    token: "private-readiness-token",
    surface: "partnerships",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify(readinessPayload("partnerships", true)),
        { status: 200, headers: READINESS_PRIVATE_NO_STORE_HEADERS },
      );
    }) as typeof fetch,
  });

  assert.deepEqual(receipt, { surface: "partnerships", ready: true });
  assert.deepEqual(requests, [
    `${STAGING_CANARY_ORIGIN}/api/internal/staging-canary-readiness/partnerships`,
  ]);
});

test("readiness GET revalidates the canonical origin before any network I/O", async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    return new Response(JSON.stringify(readinessPayload("leads", true)), {
      status: 200,
    });
  }) as typeof fetch;

  await expectCodeAsync(
    () =>
      fetchLiveCanaryReadiness({
        origin: "https://attacker.example" as typeof STAGING_CANARY_ORIGIN,
        token: "private-readiness-token",
        surface: "leads",
        fetchImpl,
      }),
    "sancho_origin_invalid",
  );
  assert.equal(requests, 0);
});

test("readiness GET rejects an invalid surface or empty bearer token before any network I/O", async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    return new Response(JSON.stringify(readinessPayload("leads", true)), {
      status: 200,
    });
  }) as typeof fetch;

  await expectCodeAsync(
    () =>
      fetchLiveCanaryReadiness({
        origin: STAGING_CANARY_ORIGIN,
        token: "private-readiness-token",
        surface: "unknown" as "leads",
        fetchImpl,
      }),
    "invalid_arguments",
  );

  for (const token of ["", " ", "\n\t"]) {
    await expectCodeAsync(
      () =>
        fetchLiveCanaryReadiness({
          origin: STAGING_CANARY_ORIGIN,
          token,
          surface: "leads",
          fetchImpl,
        }),
      "invalid_arguments",
    );
  }
  assert.equal(requests, 0);
});

test("readiness GET accepts exactly 64 KiB and rejects larger responses", async () => {
  const json = JSON.stringify(readinessPayload("leads", true));
  const exact = `${json}${" ".repeat(64 * 1024 - Buffer.byteLength(json))}`;
  assert.equal(Buffer.byteLength(exact), 64 * 1024);

  assert.deepEqual(
    await fetchLiveCanaryReadiness({
      origin: STAGING_CANARY_ORIGIN,
      token: "token",
      surface: "leads",
      fetchImpl: (async () =>
        new Response(exact, {
          status: 200,
          headers: READINESS_PRIVATE_NO_STORE_HEADERS,
        })) as typeof fetch,
    }),
    { surface: "leads", ready: true },
  );

  await expectCodeAsync(
    () =>
      fetchLiveCanaryReadiness({
        origin: STAGING_CANARY_ORIGIN,
        token: "token",
        surface: "leads",
        fetchImpl: (async () =>
          new Response(`${exact} `, {
            status: 200,
            headers: READINESS_PRIVATE_NO_STORE_HEADERS,
          })) as typeof fetch,
      }),
    "readiness_unavailable",
  );
});

test("readiness GET requires both private and no-store response directives", async () => {
  for (const cacheControl of [
    undefined,
    "",
    "private",
    "no-store",
    "public, no-store",
    "private, no-cache",
    "private, max-age=0",
  ]) {
    await expectCodeAsync(
      () =>
        fetchLiveCanaryReadiness({
          origin: STAGING_CANARY_ORIGIN,
          token: "private-readiness-token",
          surface: "leads",
          fetchImpl: (async () =>
            new Response(JSON.stringify(readinessPayload("leads", true)), {
              status: 200,
              ...(cacheControl === undefined
                ? {}
                : { headers: { "cache-control": cacheControl } }),
            })) as typeof fetch,
        }),
      "readiness_unavailable",
    );
  }
});

test("readiness GET maps HTTP, transport, parse, and schema diagnostics to one redacted error", async () => {
  const cases: Array<() => Promise<Response>> = [
    async () =>
      new Response("private upstream diagnostic", {
        status: 503,
        statusText: "private failure",
        headers: READINESS_PRIVATE_NO_STORE_HEADERS,
      }),
    async () =>
      new Response("private malformed json", {
        status: 200,
        headers: READINESS_PRIVATE_NO_STORE_HEADERS,
      }),
    async () =>
      new Response(
        JSON.stringify({
          ...readinessPayload("leads", false),
          privateDiagnostic: "private readiness details",
        }),
        { status: 200, headers: READINESS_PRIVATE_NO_STORE_HEADERS },
      ),
    async () => {
      throw new Error("network error containing private-readiness-token");
    },
  ];

  for (const response of cases) {
    await expectCodeAsync(
      () =>
        fetchLiveCanaryReadiness({
          origin: STAGING_CANARY_ORIGIN,
          token: "private-readiness-token",
          surface: "leads",
          fetchImpl: (async () => response()) as typeof fetch,
        }),
      response === cases[2] ? "readiness_not_ready" : "readiness_unavailable",
    );
  }
});

test("Yalc capability inspection verifies the exact endpoint, tenant, bearer token, and fingerprint", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const token = "private-yalc-token";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify(yalcCapabilityPayload()), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "Yalc-Contract-Fingerprint":
          PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
      },
    });
  }) as typeof fetch;

  try {
    const receipt = await withProcessEnvironment(
      {
        GROWTH4U_YALC_BASE_URL: "https://yalc.example",
        GROWTH4U_YALC_API_TOKEN: token,
      },
      () =>
        inspectPartnershipsYalcCapability({
          tenant: "growth4u",
          env: partnershipsEnvironment(),
        }),
    );

    assert.deepEqual(receipt, {
      capability: "campaign-leads-assign-v1",
      contractVersion: PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
      contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
    });
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0]?.url,
      "https://yalc.example/api/capabilities/campaign-leads-assign-v1?tenant=growth4u",
    );
    assert.equal(requests[0]?.init?.method, "GET");
    assert.equal(requests[0]?.init?.redirect, "error");
    assert.equal(
      new Headers(requests[0]?.init?.headers).get("authorization"),
      `Bearer ${token}`,
    );
    assert.doesNotMatch(JSON.stringify(receipt), /private/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Yalc capability inspection fails closed for a mismatched header or body fingerprint", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const variant of ["header", "body"] as const) {
      globalThis.fetch = (async () => {
        const payload = yalcCapabilityPayload();
        if (variant === "body") {
          payload.contractFingerprint = "sha256:wrong-private-fingerprint";
        }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Yalc-Contract-Fingerprint":
              variant === "header"
                ? "sha256:wrong-private-fingerprint"
                : PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
          },
        });
      }) as typeof fetch;

      await withProcessEnvironment(
        {
          GROWTH4U_YALC_BASE_URL: "https://yalc.example",
          GROWTH4U_YALC_API_TOKEN: "private-yalc-token",
        },
        () =>
          expectCodeAsync(
            () =>
              inspectPartnershipsYalcCapability({
                tenant: "growth4u",
                env: partnershipsEnvironment(),
              }),
            "yalc_capability_unavailable",
          ),
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Yalc capability inspection redacts HTTP, transport, malformed-contract, and static-gate failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const cases: Array<() => Promise<Response>> = [
      async () =>
        new Response(
          JSON.stringify({ error: "private Yalc database diagnostic" }),
          {
            status: 503,
            headers: {
              "content-type": "application/json",
              "Yalc-Contract-Fingerprint":
                PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
            },
          },
        ),
      async () =>
        new Response(
          JSON.stringify({ ...yalcCapabilityPayload(), ready: false }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "Yalc-Contract-Fingerprint":
                PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
            },
          },
        ),
      async () => {
        throw new Error("connection failed with private-yalc-token");
      },
    ];

    for (const response of cases) {
      globalThis.fetch = (async () => response()) as typeof fetch;
      await withProcessEnvironment(
        {
          GROWTH4U_YALC_BASE_URL: "https://yalc.example",
          GROWTH4U_YALC_API_TOKEN: "private-yalc-token",
        },
        () =>
          expectCodeAsync(
            () =>
              inspectPartnershipsYalcCapability({
                tenant: "growth4u",
                env: partnershipsEnvironment(),
              }),
            "yalc_capability_unavailable",
          ),
      );
    }

    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      throw new Error("must not request");
    }) as typeof fetch;
    const closedEnv = partnershipsEnvironment();
    delete closedEnv.PARTNERSHIPS_DISCOVERY_EFFECTS_V2;
    await expectCodeAsync(
      () =>
        inspectPartnershipsYalcCapability({
          tenant: "growth4u",
          env: closedEnv,
        }),
      "yalc_capability_unavailable",
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
