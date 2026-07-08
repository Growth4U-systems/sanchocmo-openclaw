import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-openclaw-config-"));
const binDir = path.join(tmp, "bin");
const configFile = path.join(tmp, "openclaw.json");
const workspaceSancho = path.join(tmp, "workspace-sancho");
const workspaceRocinante = path.join(tmp, "workspace-rocinante");

process.env.MC_WORKSPACE = workspaceSancho;
process.env.TEST_OPENCLAW_CONFIG = configFile;
process.env.PATH = `${binDir}:${process.env.PATH || ""}`;

type OpenclawConfigMod = typeof import("../openclaw-config");
let mod: OpenclawConfigMod;
let curatedModels: readonly string[];

function seedConfig(config: unknown) {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), "utf8");
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configFile, "utf8")) as {
    agents?: {
      defaults?: { model?: { primary?: string; fallbacks?: string[] }; models?: Record<string, unknown> };
      list?: Array<{ id: string; workspace?: string; model?: string | { primary?: string; fallbacks?: string[] } }>;
    };
  };
}

function seedOpenclawCli() {
  fs.mkdirSync(binDir, { recursive: true });
  const cli = `#!/usr/bin/env node
const fs = require("fs");
const configFile = process.env.TEST_OPENCLAW_CONFIG;
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile, "utf8")); }
  catch { return { agents: { defaults: { models: {} }, list: [] } }; }
}
function writeConfig(cfg) {
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
}
function out(value) {
  process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));
}
function merge(target, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = merge(target[key] && typeof target[key] === "object" && !Array.isArray(target[key]) ? target[key] : {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}
const args = process.argv.slice(2);
if (args[0] === "config" && args[1] === "get" && args[2] === "agents.list") {
  out(readConfig().agents?.list || []);
  process.exit(0);
}
if (args[0] === "config" && args[1] === "get" && args[2] === "agents.defaults.model.primary") {
  out(JSON.stringify(readConfig().agents?.defaults?.model?.primary || null));
  process.exit(0);
}
if (args[0] === "config" && args[1] === "get" && args[2] === "agents.defaults.model") {
  out(readConfig().agents?.defaults?.model || null);
  process.exit(0);
}
if (args[0] === "config" && args[1] === "get") {
  out("");
  process.exit(0);
}
if (args[0] === "config" && args[1] === "patch") {
  const patch = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  const cfg = readConfig();
  const replaceIdx = args.indexOf("--replace-path");
  if (replaceIdx >= 0 && args[replaceIdx + 1] === "agents.list") {
    cfg.agents = cfg.agents || {};
    cfg.agents.list = patch.agents?.list || [];
  } else if (replaceIdx >= 0 && args[replaceIdx + 1] === "agents.defaults.model") {
    cfg.agents = cfg.agents || {};
    cfg.agents.defaults = cfg.agents.defaults || {};
    cfg.agents.defaults.model = patch.agents?.defaults?.model || null;
  } else {
    merge(cfg, patch);
  }
  writeConfig(cfg);
  process.exit(0);
}
if (args[0] === "agents" && args[1] === "list" && args[2] === "--json") {
  out([]);
  process.exit(0);
}
if (args[0] === "agents" && args[1] === "add") {
  const id = args[2];
  if (id === "rocinante") {
    console.error("agent already exists");
    process.exit(1);
  }
  const workspace = args[args.indexOf("--workspace") + 1];
  const modelIdx = args.indexOf("--model");
  const cfg = readConfig();
  cfg.agents = cfg.agents || {};
  cfg.agents.list = cfg.agents.list || [];
  cfg.agents.list.push({ id, workspace, ...(modelIdx >= 0 ? { model: args[modelIdx + 1] } : {}) });
  writeConfig(cfg);
  process.exit(0);
}
out("");
`;
  const file = path.join(binDir, "openclaw");
  fs.writeFileSync(file, cli);
  fs.chmodSync(file, 0o755);
}

before(async () => {
  fs.mkdirSync(workspaceSancho, { recursive: true });
  fs.mkdirSync(workspaceRocinante, { recursive: true });
  seedOpenclawCli();
  seedConfig({ agents: { defaults: { models: {} }, list: [] } });
  mod = await import("../openclaw-config");
  ({ CURATED_MODELS: curatedModels } = await import("../models-catalog"));
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("setAgentModel persists an override when agents add reports duplicate", () => {
  seedConfig({ agents: { defaults: { models: {} }, list: [] } });

  const model = "openrouter/z-ai/glm-4.6";
  const result = mod.setAgentModel("rocinante", model);

  assert.equal(result.updated, true);
  const config = readConfig();
  const entry = config.agents?.list?.find((agent) => agent.id === "rocinante");
  assert.ok(entry);
  assert.equal(entry.workspace, workspaceRocinante);
  assert.deepEqual(entry.model, { primary: model, fallbacks: [] });
  assert.equal(mod.getAgentEffectiveModel("rocinante"), model);
  assert.deepEqual(config.agents?.defaults?.models?.[model], {});
});

test("setAgentModel persists primary plus fallback", () => {
  seedConfig({ agents: { defaults: { models: {} }, list: [] } });

  const primary = "anthropic/claude-opus-4-7";
  const fallback = "fireworks/accounts/fireworks/models/glm-5p2";
  const result = mod.setAgentModel("sancho", { primary, fallbacks: [fallback] });

  assert.equal(result.updated, true);
  const entry = readConfig().agents?.list?.find((agent) => agent.id === "sancho");
  assert.deepEqual(entry?.model, { primary, fallbacks: [fallback] });
  assert.deepEqual(mod.getAgentModelAssignment("sancho"), { primary, fallbacks: [fallback] });
  assert.deepEqual(readConfig().agents?.defaults?.models?.[primary], {});
  assert.deepEqual(readConfig().agents?.defaults?.models?.[fallback], {});
});

test("setDefaultModelAssignment persists default primary plus fallback", () => {
  const primary = "anthropic/claude-opus-4-7";
  const fallback = "fireworks/accounts/fireworks/models/glm-5p2";
  seedConfig({ agents: { defaults: { models: {} }, list: [] } });

  mod.setDefaultModelAssignment({ primary, fallbacks: [fallback] });

  assert.deepEqual(readConfig().agents?.defaults?.model, { primary, fallbacks: [fallback] });
  assert.deepEqual(mod.getDefaultModelAssignment(), { primary, fallbacks: [fallback] });
  assert.deepEqual(readConfig().agents?.defaults?.models?.[primary], {});
  assert.deepEqual(readConfig().agents?.defaults?.models?.[fallback], {});
});

test("setDefaultPrimaryModel clears stale default fallbacks", () => {
  const model = "fireworks/accounts/fireworks/models/glm-5p2";
  seedConfig({
    agents: {
      defaults: {
        model: {
          primary: "anthropic/claude-opus-4-7",
          fallbacks: ["anthropic/claude-sonnet-4-6"],
        },
        models: {},
      },
      list: [],
    },
  });

  mod.setDefaultPrimaryModel(model);

  const config = readConfig();
  assert.deepEqual(config.agents?.defaults?.model, { primary: model });
  assert.deepEqual(config.agents?.defaults?.models?.[model], {});
  assert.equal(mod.getDefaultPrimaryModel(), model);
});

test("setAgentModel round-trips all curated selector model ids and full-catalog examples", () => {
  seedConfig({ agents: { defaults: { models: {} }, list: [] } });

  const selectorModelIds = new Set([
    ...curatedModels,
    // Extra examples can come from `openclaw models list --all` when the picker
    // is switched from curated models to the complete catalog.
    "codex/gpt-5.2",
    "openrouter/deepseek/deepseek-v3.3",
    "groq/openai/gpt-oss-120b",
  ]);

  for (const model of selectorModelIds) {
    const result = mod.setAgentModel("rocinante", model);
    assert.equal(result.updated, true, model);
    assert.equal(mod.getAgentEffectiveModel("rocinante"), model, model);
    assert.deepEqual(readConfig().agents?.defaults?.models?.[model], {}, model);
  }
});

test("listAgentsRich treats config-only agents as registered", () => {
  const model = "openrouter/z-ai/glm-4.6";
  seedConfig({
    agents: {
      defaults: { models: { [model]: {} } },
      list: [{ id: "rocinante", workspace: workspaceRocinante, model }],
    },
  });

  const agents = mod.listAgentsRich();
  const rocinante = agents.find((agent) => agent.id === "rocinante");

  assert.ok(rocinante);
  assert.equal(rocinante.registered, true);
  assert.equal(rocinante.workspace, workspaceRocinante);
  assert.equal(rocinante.overrideModel, model);
  assert.deepEqual(rocinante.overrideFallbacks, []);
  assert.equal(rocinante.resolvedModel, model);
  assert.deepEqual(rocinante.resolvedFallbacks, []);
});
