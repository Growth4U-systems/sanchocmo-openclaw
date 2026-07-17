import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

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
  assert.equal(
    packageJson.scripts?.["execution:origin-cutover:check"],
    "tsx scripts/verify-execution-origin-cutover.mts",
  );
});

test("managed deploys persist caps, default safe-off, and purge stale rollout scope", () => {
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
    assert.match(workflow, /default: safe-off/);
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
