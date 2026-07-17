import assert from "node:assert/strict";
import test from "node:test";

import {
  STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
  parseStagingCanaryPreflightArguments,
  runStagingCanaryPreflight,
  runStagingCanaryPreflightCli,
  type StagingCanaryPreflightDependencies,
} from "../../../scripts/lib/staging-canary-preflight-runner.mts";
import {
  STAGING_CANARY_ORIGIN,
  StagingCanaryPreflightError,
} from "@/lib/runtime/staging-canary-preflight";
import {
  PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
  PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
} from "@/lib/partnerships/discovery-admission-v2";

const TENANT = "growth4u";
const INTERNAL_TOKEN = "private-internal-token";
const DATABASE_URL = "postgres://private-primary-database";
const MIGRATIONS_DATABASE_URL = "postgres://private-migrations-database";
const GIT_COMMIT = "a".repeat(40);
const IMAGE_DIGEST = `sha256:${"b".repeat(64)}`;

function canaryArguments(
  surface: "leads" | "partnerships" = "leads",
): string[] {
  return [
    `--surface=${surface}`,
    "--tenant=growth4u",
    "--single-host-attested",
    `--expected-commit=${GIT_COMMIT}`,
    `--expected-image-digest=${IMAGE_DIGEST}`,
  ];
}

function dependencies(
  overrides: Partial<StagingCanaryPreflightDependencies> = {},
): StagingCanaryPreflightDependencies {
  return {
    readRuntimeSelection: () => ({ runtime: "openclaw" }),
    validateOrigin: (value) => {
      assert.equal(value, STAGING_CANARY_ORIGIN);
      return STAGING_CANARY_ORIGIN;
    },
    validateConfiguration: () => ({}),
    inspectCredentials: () => ({}),
    inspectOpenClawVersion: async () => "2026.5.18",
    inspectModel: async () => ({
      effectiveModel: "fireworks/accounts/fireworks/models/glm-5p2",
      provider: "fireworks",
      maxOutputTokens: 8192,
    }),
    fetchDeploymentIdentity: async () => ({
      commit: GIT_COMMIT,
      imageDigest: IMAGE_DIGEST,
      environment: "Staging",
      imageRef: "https://private-image.example/never-print",
    }),
    fetchReadiness: async () => ({}),
    inspectMigrations: async () => ({
      firstMigration: "0019",
      lastMigration: "0033",
      migrationCount: 15,
      cutoverGapCount: "0",
      databaseUrl: DATABASE_URL,
    }),
    inspectYalcCapability: async () => ({
      contractVersion: PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
      contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
      token: "private-yalc-token",
    }),
    ...overrides,
  };
}

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    SANCHO_BASE_URL: STAGING_CANARY_ORIGIN,
    BASE_URL: "https://must-not-win.example",
    SANCHO_INTERNAL_API_TOKEN: INTERNAL_TOKEN,
    DATABASE_URL,
    EXECUTION_MIGRATIONS_DATABASE_URL: MIGRATIONS_DATABASE_URL,
    GIT_COMMIT,
    SANCHOCMO_IMAGE_DIGEST: IMAGE_DIGEST,
    ...overrides,
  };
}

function assertOnlySafeOutputValues(value: unknown): void {
  if (typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    assert.ok(Number.isSafeInteger(value) && value >= 0);
    return;
  }
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  for (const nested of Object.values(value as Record<string, unknown>)) {
    assertOnlySafeOutputValues(nested);
  }
}

test("parses the five exact required arguments in any order", () => {
  assert.deepEqual(
    parseStagingCanaryPreflightArguments([
      `--expected-image-digest=${IMAGE_DIGEST}`,
      "--single-host-attested",
      "--tenant=growth4u",
      "--surface=partnerships",
      `--expected-commit=${GIT_COMMIT}`,
    ]),
    {
      surface: "partnerships",
      tenant: TENANT,
      singleHostAttested: true,
      expectedCommit: GIT_COMMIT,
      expectedImageDigest: IMAGE_DIGEST,
    },
  );
});

test("rejects absent, unknown, duplicated, and malformed arguments", () => {
  const valid = canaryArguments();
  const invalidArgumentSets: string[][] = [
    [],
    valid.slice(0, -1),
    [...valid, "--unknown"],
    [valid[0], valid[0], ...valid.slice(1)],
    [valid[0], valid[1], valid[1], ...valid.slice(2)],
    [...valid.slice(0, 3), valid[2], ...valid.slice(3)],
    [...valid.slice(0, 4), valid[3], valid[4]],
    [...valid, valid[4]],
    ["--surface=other", ...valid.slice(1)],
    ["--surface", ...valid.slice(1)],
    [valid[0], "--tenant=", ...valid.slice(2)],
    [valid[0], "--tenant=Growth4u", ...valid.slice(2)],
    [valid[0], "--tenant=-growth4u", ...valid.slice(2)],
    [valid[0], `--tenant=${"a".repeat(121)}`, ...valid.slice(2)],
    [valid[0], valid[1], "--single-host-attested=true", ...valid.slice(3)],
    [...valid.slice(0, 3), "--expected-commit=abc", valid[4]],
    [...valid.slice(0, 3), `--expected-commit=${"A".repeat(40)}`, valid[4]],
    [...valid.slice(0, 4), "--expected-image-digest=sha256:abc"],
    [...valid.slice(0, 4), `--expected-image-digest=sha256:${"A".repeat(64)}`],
  ];

  for (const argv of invalidArgumentSets) {
    assert.throws(
      () => parseStagingCanaryPreflightArguments(argv),
      (error: unknown) => {
        assert.ok(error instanceof StagingCanaryPreflightError);
        assert.equal(error.code, "invalid_arguments");
        return true;
      },
    );
  }
});

test("leads uses effective runtime and exact origin/database precedence without calling Yalc", async () => {
  const calls: string[] = [];
  const result = await runStagingCanaryPreflight({
    argv: canaryArguments(),
    env: environment(),
    dependencies: dependencies({
      readRuntimeSelection: () => {
        calls.push("runtime");
        return { runtime: "openclaw" };
      },
      validateOrigin: (value) => {
        calls.push("origin");
        assert.equal(value, STAGING_CANARY_ORIGIN);
        return STAGING_CANARY_ORIGIN;
      },
      validateConfiguration: (input) => {
        calls.push("configuration");
        assert.equal(input.surface, "leads");
        assert.equal(input.tenant, TENANT);
        assert.equal(input.runtimeId, "openclaw");
        assert.equal(input.singleHostAttested, true);
      },
      inspectCredentials: (input) => {
        calls.push("credentials");
        assert.equal(input.surface, "leads");
      },
      inspectOpenClawVersion: async () => {
        calls.push("openclaw");
        return "2026.5.18";
      },
      inspectModel: async (input) => {
        calls.push("model");
        assert.equal(input.env.SANCHO_INTERNAL_API_TOKEN, INTERNAL_TOKEN);
        return {
          effectiveModel: "fireworks/accounts/fireworks/models/glm-5p2",
          provider: "fireworks",
          maxOutputTokens: 8192,
        };
      },
      fetchDeploymentIdentity: async (input) => {
        calls.push("deployment");
        assert.equal(input.origin, STAGING_CANARY_ORIGIN);
        assert.equal(input.expectedCommit, GIT_COMMIT);
        assert.equal(input.expectedImageDigest, IMAGE_DIGEST);
        return {
          commit: GIT_COMMIT,
          imageDigest: IMAGE_DIGEST,
          environment: "Staging",
        };
      },
      fetchReadiness: async (input) => {
        calls.push("readiness");
        assert.equal(input.origin, STAGING_CANARY_ORIGIN);
        assert.equal(input.token, INTERNAL_TOKEN);
        assert.equal(input.surface, "leads");
      },
      inspectMigrations: async (databaseUrl) => {
        calls.push("migrations");
        assert.equal(databaseUrl, MIGRATIONS_DATABASE_URL);
        return {
          firstMigration: "0019",
          lastMigration: "0033",
          migrationCount: 15,
          cutoverGapCount: "0",
        };
      },
      inspectYalcCapability: async () => {
        assert.fail("Yalc capability must not be inspected for leads");
      },
    }),
  });

  assert.deepEqual(calls, [
    "runtime",
    "origin",
    "configuration",
    "credentials",
    "openclaw",
    "model",
    "deployment",
    "readiness",
    "migrations",
  ]);
  assert.deepEqual(result, {
    schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
    ok: true,
    code: "ready",
    surface: "leads",
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
        required: false,
        checked: false,
        ready: true,
      },
    },
    versions: {
      openclaw: "2026.5.18",
      migrations: {
        first: "0019",
        last: "0033",
        count: 15,
        cutoverGapCount: "0",
      },
    },
    model: {
      effective: "fireworks/accounts/fireworks/models/glm-5p2",
      provider: "fireworks",
      maxOutputTokens: 8192,
    },
    limits: {
      modelMaxOutputTokens: 8192,
      chat: {
        maxPromptTokensAtStart: 40000,
        maxInputTokensPerRun: 160000,
        maxModelCallsPerRun: 6,
        maxToolCallsPerRun: 8,
        maxRiskyToolCallsPerRun: 2,
        maxRepeatedToolCallsPerRun: 2,
        maxSessionHistoryCallsPerRun: 1,
        maxTurnMs: 300000,
      },
    },
    deployment: {
      commit: GIT_COMMIT,
      imageDigest: IMAGE_DIGEST,
      environment: "Staging",
    },
  });
  assertOnlySafeOutputValues(result);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /growth4u|private|postgres:|https?:|TOKEN|URL|DATABASE/,
  );
});

test("partnerships falls back to BASE_URL and DATABASE_URL and requires the Yalc capability", async () => {
  let yalcCalls = 0;
  const env = environment({
    SANCHO_BASE_URL: "",
    BASE_URL: STAGING_CANARY_ORIGIN,
    EXECUTION_MIGRATIONS_DATABASE_URL: "",
    DATABASE_URL,
  });
  const result = await runStagingCanaryPreflight({
    argv: canaryArguments("partnerships"),
    env,
    dependencies: dependencies({
      validateOrigin: (value) => {
        assert.equal(value, STAGING_CANARY_ORIGIN);
        return STAGING_CANARY_ORIGIN;
      },
      inspectMigrations: async (databaseUrl) => {
        assert.equal(databaseUrl, DATABASE_URL);
        return {
          firstMigration: "0019",
          lastMigration: "0033",
          migrationCount: 15,
          cutoverGapCount: "0",
        };
      },
      inspectYalcCapability: async (input) => {
        yalcCalls += 1;
        assert.equal(input.tenant, TENANT);
        assert.equal(input.env, env);
        return {
          contractVersion: PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
          contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
        };
      },
    }),
  });

  assert.equal(yalcCalls, 1);
  assert.deepEqual(result.checks.yalcCapability, {
    required: true,
    checked: true,
    ready: true,
  });
  assert.deepEqual(result.versions.yalc, {
    contractVersion: String(PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION),
    contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
  });
  assertOnlySafeOutputValues(result);
});

test("approved identity arguments remain authoritative when local identity env is absent", async () => {
  const result = await runStagingCanaryPreflight({
    argv: canaryArguments(),
    env: environment({
      GIT_COMMIT: undefined,
      SANCHOCMO_IMAGE_DIGEST: undefined,
    }),
    dependencies: dependencies({
      fetchDeploymentIdentity: async (input) => {
        assert.equal(input.expectedCommit, GIT_COMMIT);
        assert.equal(input.expectedImageDigest, IMAGE_DIGEST);
        return {
          commit: GIT_COMMIT,
          imageDigest: IMAGE_DIGEST,
          environment: "Staging",
        };
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.deployment, {
    commit: GIT_COMMIT,
    imageDigest: IMAGE_DIGEST,
    environment: "Staging",
  });
});

test("CLI emits one redacted JSON success document and no stderr", async () => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runStagingCanaryPreflightCli({
    argv: canaryArguments(),
    env: environment(),
    dependencies: dependencies(),
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: (value) => {
      stderr += value;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(stdout.split("\n").length, 2);
  const payload = JSON.parse(stdout) as Record<string, unknown>;
  assert.equal(payload.ok, true);
  assertOnlySafeOutputValues(payload);
  assert.doesNotMatch(
    stdout,
    /growth4u|private|postgres:|https?:|TOKEN|URL|DATABASE/,
  );
});

test("CLI preserves known fail-closed codes without exposing error messages", async () => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runStagingCanaryPreflightCli({
    argv: canaryArguments(),
    env: environment(),
    dependencies: dependencies({
      inspectOpenClawVersion: async () => {
        throw new StagingCanaryPreflightError("openclaw_version_unsupported");
      },
    }),
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: (value) => {
      stderr += value;
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
    ok: false,
    code: "openclaw_version_unsupported",
  });
  assert.doesNotMatch(
    stderr,
    /failed|unsupported\)|private|postgres:|https?:/i,
  );
});

test("CLI maps unexpected failures and runtime-selection failures to stable redacted codes", async () => {
  for (const scenario of [
    {
      dependencies: dependencies({
        readRuntimeSelection: () => {
          throw new Error("private runtime configuration leaked");
        },
      }),
      expectedCode: "runtime_selection_unavailable",
    },
    {
      dependencies: dependencies({
        fetchReadiness: async () => {
          throw new Error("private upstream response leaked");
        },
      }),
      expectedCode: "preflight_unavailable",
    },
    {
      dependencies: dependencies({
        inspectMigrations: async () => {
          throw new Error("private database response leaked");
        },
      }),
      expectedCode: "migrations_or_cutover_unready",
    },
  ]) {
    let stderr = "";
    const exitCode = await runStagingCanaryPreflightCli({
      argv: canaryArguments(),
      env: environment(),
      dependencies: scenario.dependencies,
      writeStdout: () => assert.fail("failure must not write stdout"),
      writeStderr: (value) => {
        stderr += value;
      },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stderr), {
      schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
      ok: false,
      code: scenario.expectedCode,
    });
    assert.doesNotMatch(
      stderr,
      /private|response|configuration|postgres:|https?:/i,
    );
  }
});

test("CLI fails closed when required arguments or database credentials are absent", async () => {
  const scenarios: Array<{
    argv: string[];
    env: NodeJS.ProcessEnv;
    expectedCode: string;
  }> = [
    {
      argv: ["--surface=leads", "--tenant=growth4u"],
      env: environment(),
      expectedCode: "invalid_arguments",
    },
    {
      argv: canaryArguments(),
      env: environment({
        DATABASE_URL: "",
        EXECUTION_MIGRATIONS_DATABASE_URL: "",
      }),
      expectedCode: "credentials_missing",
    },
  ];

  for (const scenario of scenarios) {
    let stderr = "";
    const exitCode = await runStagingCanaryPreflightCli({
      argv: scenario.argv,
      env: scenario.env,
      dependencies: dependencies(),
      writeStdout: () => assert.fail("failure must not write stdout"),
      writeStderr: (value) => {
        stderr += value;
      },
    });
    assert.equal(exitCode, 1);
    assert.equal(
      (JSON.parse(stderr) as { code: string }).code,
      scenario.expectedCode,
    );
  }
});

test("approved identity mismatches fail before runtime, network, or database I/O", async () => {
  for (const env of [
    environment({ GIT_COMMIT: "c".repeat(40) }),
    environment({
      SANCHOCMO_IMAGE_DIGEST: `sha256:${"d".repeat(64)}`,
    }),
  ]) {
    let stderr = "";
    const exitCode = await runStagingCanaryPreflightCli({
      argv: canaryArguments(),
      env,
      dependencies: dependencies({
        readRuntimeSelection: () => {
          assert.fail("identity mismatch must fail before runtime selection");
        },
      }),
      writeStdout: () => assert.fail("failure must not write stdout"),
      writeStderr: (value) => {
        stderr += value;
      },
    });
    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stderr), {
      schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
      ok: false,
      code: "deployment_identity_mismatch",
    });
  }
});

test("malformed approved identity arguments fail before runtime selection", async () => {
  let stderr = "";
  const argv = canaryArguments();
  argv[3] = "--expected-commit=not-a-commit";
  const exitCode = await runStagingCanaryPreflightCli({
    argv,
    env: environment(),
    dependencies: dependencies({
      readRuntimeSelection: () => {
        assert.fail("argument validation must precede runtime selection");
      },
    }),
    writeStdout: () => assert.fail("failure must not write stdout"),
    writeStderr: (value) => {
      stderr += value;
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
    ok: false,
    code: "invalid_arguments",
  });
});

test("a mismatched health identity fails before readiness and migrations", async () => {
  let stderr = "";
  const exitCode = await runStagingCanaryPreflightCli({
    argv: canaryArguments(),
    env: environment(),
    dependencies: dependencies({
      fetchDeploymentIdentity: async () => ({
        commit: "c".repeat(40),
        imageDigest: IMAGE_DIGEST,
        environment: "Staging",
      }),
      fetchReadiness: async () => {
        assert.fail("identity mismatch must precede readiness");
      },
      inspectMigrations: async () => {
        assert.fail("identity mismatch must precede migrations");
      },
    }),
    writeStdout: () => assert.fail("failure must not write stdout"),
    writeStderr: (value) => {
      stderr += value;
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
    ok: false,
    code: "deployment_identity_mismatch",
  });
});

test("runner rejects incomplete or inconsistent migration evidence", async () => {
  const receipts = [
    {
      firstMigration: "0020",
      lastMigration: "0033",
      migrationCount: 15,
      cutoverGapCount: "0",
    },
    {
      firstMigration: "0019",
      lastMigration: "0032",
      migrationCount: 15,
      cutoverGapCount: "0",
    },
    {
      firstMigration: "0019",
      lastMigration: "0033",
      migrationCount: 14,
      cutoverGapCount: "0",
    },
    {
      firstMigration: "0019",
      lastMigration: "0033",
      migrationCount: 15,
      cutoverGapCount: "1",
    },
  ];

  for (const receipt of receipts) {
    let stderr = "";
    const exitCode = await runStagingCanaryPreflightCli({
      argv: canaryArguments(),
      env: environment(),
      dependencies: dependencies({
        inspectMigrations: async () => receipt,
      }),
      writeStdout: () => assert.fail("failure must not write stdout"),
      writeStderr: (value) => {
        stderr += value;
      },
    });
    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stderr), {
      schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
      ok: false,
      code: "migrations_or_cutover_unready",
    });
  }
});

test("runner requires the exact Yalc contract version and fingerprint", async () => {
  for (const capability of [
    {
      contractVersion: 2,
      contractFingerprint: PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
    },
    {
      contractVersion: PARTNERSHIPS_YALC_ASSIGN_CAPABILITY_VERSION,
      contractFingerprint: `sha256:${"0".repeat(64)}`,
    },
  ]) {
    let stderr = "";
    const exitCode = await runStagingCanaryPreflightCli({
      argv: canaryArguments("partnerships"),
      env: environment(),
      dependencies: dependencies({
        inspectYalcCapability: async () => capability,
      }),
      writeStdout: () => assert.fail("failure must not write stdout"),
      writeStderr: (value) => {
        stderr += value;
      },
    });
    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stderr), {
      schemaVersion: STAGING_CANARY_PREFLIGHT_SCHEMA_VERSION,
      ok: false,
      code: "yalc_capability_unavailable",
    });
  }
});
