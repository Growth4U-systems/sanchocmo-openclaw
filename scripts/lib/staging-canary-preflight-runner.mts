import { readRuntimeSelection } from "../../src/lib/runtime/config";
import {
  PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
  PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
} from "../../src/lib/partnerships/discovery-admission-v2";
import { fetchLiveCanaryReadiness } from "../../src/lib/runtime/staging-canary-readiness-client";
import {
  STAGING_CANARY_ORIGIN,
  StagingCanaryPreflightError,
  fetchStagingDeploymentIdentity,
  inspectStagingCanaryModel,
  inspectOpenClawVersion,
  inspectPartnershipsYalcCapability,
  inspectStagingCanaryCredentials,
  validateCanonicalStagingOrigin,
  validateStagingCanaryConfiguration,
  stagingCanaryLimitEvidence,
  type StagingCanaryPreflightCode,
  type StagingCanarySurface,
} from "../../src/lib/runtime/staging-canary-preflight";
import {
  STAGING_CANARY_MIGRATION_IDS,
  StagingCanaryMigrationPreflightError,
  inspectStagingCanaryMigrationsReadOnly,
} from "./staging-canary-migration-preflight.mts";

export const STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION =
  "staging-canary-preflight.v1" as const;

export type StagingCanaryPreflightRunnerCode =
  | StagingCanaryPreflightCode
  | "runtime_selection_unavailable"
  | "migrations_or_cutover_unready"
  | "preflight_unavailable";

export interface StagingCanaryPreflightArguments {
  surface: StagingCanarySurface;
  tenant: string;
  singleHostAttested: true;
  expectedCommit: string;
  expectedImageDigest: string;
}

export interface StagingCanaryPreflightSuccess {
  schemaVersion: typeof STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION;
  ok: true;
  code: "ready";
  surface: StagingCanarySurface;
  singletonAttested: true;
  checks: {
    runtime: true;
    origin: true;
    configuration: true;
    credentials: true;
    openclaw: true;
    modelCostCap: true;
    modelCredential: true;
    deploymentIdentity: true;
    readiness: true;
    migrations: true;
    yalcCapability: {
      required: boolean;
      checked: boolean;
      ready: true;
    };
  };
  versions: {
    openclaw: string;
    migrations: {
      first: string;
      last: string;
      count: number;
      cutoverGapCount: "0";
    };
    yalc?: {
      contractVersion: string;
      contractFingerprint: string;
    };
  };
  model: {
    effective: string;
    provider: string;
    maxOutputTokens: number;
  };
  limits: ReturnType<typeof stagingCanaryLimitEvidence>;
  deployment: {
    commit: string;
    imageDigest: string;
    environment: "Staging";
  };
}

export interface StagingCanaryPreflightFailure {
  schemaVersion: typeof STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION;
  ok: false;
  code: StagingCanaryPreflightRunnerCode;
}

export interface StagingCanaryPreflightDependencies {
  readRuntimeSelection: () => { runtime: string };
  validateOrigin: (value: string | undefined) => typeof STAGING_CANARY_ORIGIN;
  validateConfiguration: (input: {
    surface: StagingCanarySurface;
    tenant: string;
    runtimeId: string;
    singleHostAttested: boolean;
    env?: NodeJS.ProcessEnv;
  }) => unknown;
  inspectCredentials: (input: {
    surface: StagingCanarySurface;
    tenant: string;
    env?: NodeJS.ProcessEnv;
  }) => unknown;
  inspectOpenClawVersion: () => Promise<string>;
  inspectModel: (input: { env: NodeJS.ProcessEnv }) => Promise<{
    effectiveModel: string;
    provider: string;
    maxOutputTokens: number;
  }>;
  fetchDeploymentIdentity: (input: {
    origin: typeof STAGING_CANARY_ORIGIN;
    expectedCommit: string;
    expectedImageDigest: string;
  }) => Promise<{
    commit: string;
    imageDigest: string;
    environment: string;
  }>;
  fetchReadiness: (input: {
    origin: typeof STAGING_CANARY_ORIGIN;
    token: string;
    surface: StagingCanarySurface;
  }) => Promise<unknown>;
  inspectMigrations: (databaseUrl: string) => Promise<{
    firstMigration: string;
    lastMigration: string;
    migrationCount: number;
    cutoverGapCount: string;
  }>;
  inspectYalcCapability: (input: {
    tenant: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<{
    contractVersion: string | number;
    contractFingerprint: string;
  }>;
}

const productionDependencies: StagingCanaryPreflightDependencies = {
  readRuntimeSelection,
  validateOrigin: validateCanonicalStagingOrigin,
  validateConfiguration: validateStagingCanaryConfiguration,
  inspectCredentials: inspectStagingCanaryCredentials,
  inspectOpenClawVersion,
  inspectModel: inspectStagingCanaryModel,
  fetchDeploymentIdentity: fetchStagingDeploymentIdentity,
  fetchReadiness: fetchLiveCanaryReadiness,
  inspectMigrations: inspectStagingCanaryMigrationsReadOnly,
  inspectYalcCapability: inspectPartnershipsYalcCapability,
};

function invalidArguments(): never {
  throw new StagingCanaryPreflightError("invalid_arguments");
}

export function parseStagingCanaryPreflightArguments(
  argv: readonly string[],
): StagingCanaryPreflightArguments {
  let surface: StagingCanarySurface | undefined;
  let tenant: string | undefined;
  let singleHostAttested = false;
  let expectedCommit: string | undefined;
  let expectedImageDigest: string | undefined;

  for (const argument of argv) {
    if (argument.startsWith("--surface=")) {
      if (surface !== undefined) invalidArguments();
      const value = argument.slice("--surface=".length);
      if (value !== "leads" && value !== "partnerships") invalidArguments();
      surface = value;
      continue;
    }
    if (argument.startsWith("--tenant=")) {
      if (tenant !== undefined) invalidArguments();
      const value = argument.slice("--tenant=".length);
      if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(value)) invalidArguments();
      tenant = value;
      continue;
    }
    if (argument === "--single-host-attested") {
      if (singleHostAttested) invalidArguments();
      singleHostAttested = true;
      continue;
    }
    if (argument.startsWith("--expected-commit=")) {
      if (expectedCommit !== undefined) invalidArguments();
      const value = argument.slice("--expected-commit=".length);
      if (!/^[0-9a-f]{40}$/.test(value)) invalidArguments();
      expectedCommit = value;
      continue;
    }
    if (argument.startsWith("--expected-image-digest=")) {
      if (expectedImageDigest !== undefined) invalidArguments();
      const value = argument.slice("--expected-image-digest=".length);
      if (!/^sha256:[0-9a-f]{64}$/.test(value)) invalidArguments();
      expectedImageDigest = value;
      continue;
    }
    invalidArguments();
  }

  if (
    argv.length !== 5 ||
    surface === undefined ||
    tenant === undefined ||
    !singleHostAttested ||
    expectedCommit === undefined ||
    expectedImageDigest === undefined
  ) {
    invalidArguments();
  }

  return {
    surface,
    tenant,
    singleHostAttested: true,
    expectedCommit,
    expectedImageDigest,
  };
}

export async function runStagingCanaryPreflight(input: {
  argv: readonly string[];
  env?: NodeJS.ProcessEnv;
  dependencies?: Partial<StagingCanaryPreflightDependencies>;
}): Promise<StagingCanaryPreflightSuccess> {
  const args = parseStagingCanaryPreflightArguments(input.argv);
  const env = input.env ?? process.env;
  if (
    (env.GIT_COMMIT && env.GIT_COMMIT !== args.expectedCommit) ||
    (env.SANCHOCMO_IMAGE_DIGEST &&
      env.SANCHOCMO_IMAGE_DIGEST !== args.expectedImageDigest)
  ) {
    throw new StagingCanaryPreflightError("deployment_identity_mismatch");
  }
  const dependencies = {
    ...productionDependencies,
    ...input.dependencies,
  };

  let runtimeId: string;
  try {
    runtimeId = dependencies.readRuntimeSelection().runtime;
  } catch {
    throw new StagingCanaryPreflightRunnerError(
      "runtime_selection_unavailable",
    );
  }

  const origin = dependencies.validateOrigin(
    env.SANCHO_BASE_URL || env.BASE_URL,
  );
  dependencies.validateConfiguration({
    surface: args.surface,
    tenant: args.tenant,
    runtimeId,
    singleHostAttested: args.singleHostAttested,
    env,
  });
  dependencies.inspectCredentials({
    surface: args.surface,
    tenant: args.tenant,
    env,
  });

  const databaseUrl = env.EXECUTION_MIGRATIONS_DATABASE_URL || env.DATABASE_URL;
  if (!databaseUrl) {
    throw new StagingCanaryPreflightError("credentials_missing");
  }
  const internalToken = env.SANCHO_INTERNAL_API_TOKEN;
  if (!internalToken) {
    throw new StagingCanaryPreflightError("credentials_missing");
  }

  const openclawVersion = await dependencies.inspectOpenClawVersion();
  const model = await dependencies.inspectModel({ env });
  const deployment = await dependencies.fetchDeploymentIdentity({
    origin,
    expectedCommit: args.expectedCommit,
    expectedImageDigest: args.expectedImageDigest,
  });
  if (
    deployment.commit !== args.expectedCommit ||
    deployment.imageDigest !== args.expectedImageDigest ||
    deployment.environment !== "Staging"
  ) {
    throw new StagingCanaryPreflightError("deployment_identity_mismatch");
  }
  await dependencies.fetchReadiness({
    origin,
    token: internalToken,
    surface: args.surface,
  });

  let migrations: Awaited<
    ReturnType<StagingCanaryPreflightDependencies["inspectMigrations"]>
  >;
  try {
    migrations = await dependencies.inspectMigrations(databaseUrl);
  } catch (error) {
    if (error instanceof StagingCanaryMigrationPreflightError) throw error;
    throw new StagingCanaryMigrationPreflightError();
  }
  if (
    migrations.migrationCount !== STAGING_CANARY_MIGRATION_IDS.length ||
    migrations.firstMigration !== STAGING_CANARY_MIGRATION_IDS[0] ||
    migrations.lastMigration !==
      STAGING_CANARY_MIGRATION_IDS[STAGING_CANARY_MIGRATION_IDS.length - 1] ||
    migrations.cutoverGapCount !== "0"
  ) {
    throw new StagingCanaryMigrationPreflightError();
  }

  const yalcCapability =
    args.surface === "partnerships"
      ? await dependencies.inspectYalcCapability({
          tenant: args.tenant,
          env,
        })
      : undefined;
  if (
    yalcCapability &&
    (yalcCapability.contractVersion !==
      PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION ||
      yalcCapability.contractFingerprint !==
        PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT)
  ) {
    throw new StagingCanaryPreflightError("yalc_capability_unavailable");
  }

  return {
    schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
    ok: true,
    code: "ready",
    surface: args.surface,
    singletonAttested: true,
    checks: {
      runtime: true,
      origin: true,
      configuration: true,
      credentials: true,
      openclaw: true,
      modelCostCap: true,
      modelCredential: true,
      deploymentIdentity: true,
      readiness: true,
      migrations: true,
      yalcCapability: {
        required: args.surface === "partnerships",
        checked: yalcCapability !== undefined,
        ready: true,
      },
    },
    versions: {
      openclaw: openclawVersion,
      migrations: {
        first: migrations.firstMigration,
        last: migrations.lastMigration,
        count: migrations.migrationCount,
        cutoverGapCount: "0",
      },
      ...(yalcCapability
        ? {
            yalc: {
              contractVersion: String(yalcCapability.contractVersion),
              contractFingerprint: yalcCapability.contractFingerprint,
            },
          }
        : {}),
    },
    model: {
      effective: model.effectiveModel,
      provider: model.provider,
      maxOutputTokens: model.maxOutputTokens,
    },
    limits: stagingCanaryLimitEvidence(args.surface),
    deployment: {
      commit: deployment.commit,
      imageDigest: deployment.imageDigest,
      environment: "Staging",
    },
  };
}

export class StagingCanaryPreflightRunnerError extends Error {
  constructor(readonly code: StagingCanaryPreflightRunnerCode) {
    super(code);
    this.name = "StagingCanaryPreflightRunnerError";
  }
}

export function stagingCanaryPreflightFailure(
  error: unknown,
): StagingCanaryPreflightFailure {
  let code: StagingCanaryPreflightRunnerCode = "preflight_unavailable";
  if (error instanceof StagingCanaryPreflightError) code = error.code;
  else if (error instanceof StagingCanaryMigrationPreflightError) {
    code = error.code;
  } else if (error instanceof StagingCanaryPreflightRunnerError) {
    code = error.code;
  }
  return {
    schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
    ok: false,
    code,
  };
}

export async function runStagingCanaryPreflightCli(input: {
  argv: readonly string[];
  env?: NodeJS.ProcessEnv;
  dependencies?: Partial<StagingCanaryPreflightDependencies>;
  writeStdout?: (value: string) => void;
  writeStderr?: (value: string) => void;
}): Promise<0 | 1> {
  const writeStdout =
    input.writeStdout ?? ((value) => process.stdout.write(value));
  const writeStderr =
    input.writeStderr ?? ((value) => process.stderr.write(value));
  try {
    const result = await runStagingCanaryPreflight(input);
    writeStdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    writeStderr(`${JSON.stringify(stagingCanaryPreflightFailure(error))}\n`);
    return 1;
  }
}
