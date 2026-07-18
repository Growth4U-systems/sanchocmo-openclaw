import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import * as yaml from "js-yaml";

const root = process.cwd();

type DeployWorkflow = {
  jobs?: Record<
    string,
    {
      steps?: Array<{
        name?: string;
        run?: string;
      }>;
    }
  >;
};

test("managed deploy heredoc terminators are valid after YAML dedent", () => {
  for (const workflowName of ["deploy-staging.yml", "deploy-prod.yml"]) {
    const workflow = yaml.load(
      fs.readFileSync(
        path.join(root, ".github/workflows", workflowName),
        "utf8",
      ),
    ) as DeployWorkflow;

    for (const job of Object.values(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (!step.run) continue;
        const lines = step.run.split("\n");
        for (const [lineIndex, line] of lines.entries()) {
          const openers = line.matchAll(
            /<<(-?)\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/g,
          );
          for (const opener of openers) {
            const stripsTabs = opener[1] === "-";
            const delimiter = opener[2];
            const terminatorIndex = lines.findIndex(
              (candidate, candidateIndex) =>
                candidateIndex > lineIndex && candidate.trim() === delimiter,
            );
            assert.notEqual(
              terminatorIndex,
              -1,
              `${workflowName}/${step.name ?? "unnamed"}: heredoc ${delimiter} opened at line ${lineIndex + 1} has no terminator`,
            );
            const terminator = lines[terminatorIndex];
            if (stripsTabs) {
              assert.match(
                terminator,
                new RegExp(`^\\t*${delimiter}$`),
                `${workflowName}/${step.name ?? "unnamed"}: <<- heredoc ${delimiter} has a space-indented terminator at line ${terminatorIndex + 1}`,
              );
            } else {
              assert.equal(
                terminator,
                delimiter,
                `${workflowName}/${step.name ?? "unnamed"}: heredoc ${delimiter} has an indented terminator at line ${terminatorIndex + 1}`,
              );
            }
          }
        }
      }
    }
  }
});

test("managed deploys reject legacy images before durable boot", () => {
  for (const workflowName of ["deploy-staging.yml", "deploy-prod.yml"]) {
    const workflow = fs.readFileSync(
      path.join(root, ".github/workflows", workflowName),
      "utf8",
    );
    const legacyRefusal = workflow.indexOf(
      'if [ "$TRACKED_MIGRATIONS_AVAILABLE" != "1" ] && [ "$DURABLE_WORKER_BOOT_REQUESTED" = "1" ]',
    );
    const cutoverCheck = workflow.indexOf(
      "npm run execution:origin-cutover:check",
    );
    const replacement = workflow.indexOf("docker compose $COMPOSE_ARGS up -d");

    assert.ok(legacyRefusal >= 0, `${workflowName}: missing legacy refusal`);
    assert.ok(cutoverCheck > legacyRefusal, `${workflowName}: gate ordering`);
    assert.ok(
      replacement > cutoverCheck,
      `${workflowName}: replacement ordering`,
    );
    for (const flag of [
      "PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED",
      "LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED",
      "LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED",
      "CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED",
    ]) {
      assert.ok(workflow.includes(flag), `${workflowName}: missing ${flag}`);
    }
  }
});

test("release image contains the same checked CLI used by deploy", () => {
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  assert.match(
    dockerfile,
    /COPY scripts\/verify-execution-origin-cutover\.mts \.\/scripts\/verify-execution-origin-cutover\.mts/,
  );
  assert.match(
    dockerfile,
    /COPY scripts\/preflight-staging-canary\.mts \.\/scripts\/preflight-staging-canary\.mts/,
  );
  assert.equal(
    packageJson.scripts?.["execution:origin-cutover:check"],
    "tsx scripts/verify-execution-origin-cutover.mts",
  );
  assert.equal(
    packageJson.scripts?.["staging:canary:preflight"],
    "tsx scripts/preflight-staging-canary.mts",
  );
});

test("managed deploys persist caps, honor rollout defaults, and purge stale rollout scope", () => {
  // Staging follows the Environment rollout vars by default (nightly merges
  // must not silently switch the canary off — SAN-480); prod stays safe-off.
  const expectedDefault: Record<string, RegExp> = {
    "deploy-staging.yml": /default: environment/,
    "deploy-prod.yml": /default: safe-off/,
  };
  for (const workflowName of ["deploy-staging.yml", "deploy-prod.yml"]) {
    const workflow = fs.readFileSync(
      path.join(root, ".github/workflows", workflowName),
      "utf8",
    );
    for (const key of [
      "FIREWORKS_GLM52_MAX_TOKENS",
      "MC_CHAT_COST_GUARD_ENABLED",
      "MC_CHAT_MAX_PROMPT_TOKENS_AT_START",
      "MC_CHAT_MAX_INPUT_TOKENS_PER_RUN",
      "MC_CHAT_MAX_MODEL_CALLS_PER_RUN",
      "MC_CHAT_MAX_TOOL_CALLS_PER_RUN",
      "MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN",
      "MC_CHAT_MAX_REPEATED_TOOL_CALLS_PER_RUN",
      "MC_CHAT_MAX_SESSION_HISTORY_CALLS_PER_RUN",
      "MC_CHAT_MAX_TURN_MS",
    ]) {
      assert.ok(workflow.includes(key), `${workflowName}: missing ${key}`);
    }
    assert.match(workflow, /execution_rollout_configuration:/);
    assert.match(workflow, expectedDefault[workflowName]);
    assert.match(workflow, /export PARTNERSHIPS_DISCOVERY_EXECUTION_V2=off/);
    assert.match(workflow, /export CHAT_AGENT_TURN_EXECUTION_V1=off/);
    for (const staleScopeKey of [
      "PARTNERSHIPS_DISCOVERY_V2_SLUGS",
      "PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE",
      "LEADS_SEARCH_V2_SLUGS",
      "CHAT_AGENT_TURN_V1_SLUGS",
    ]) {
      assert.match(
        workflow,
        new RegExp(`blocked\\.update\\([\\s\\S]*${staleScopeKey}`),
        `${workflowName}: safe-off must purge ${staleScopeKey}`,
      );
    }
  }
});
