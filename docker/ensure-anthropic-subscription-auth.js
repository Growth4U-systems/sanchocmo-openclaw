#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const OPENCLAW_ROOT = process.env.OPENCLAW_HOME || "/root/.openclaw";
const SUBSCRIPTION_PROFILE_ID = "anthropic:claude-cli";
const API_PROFILE_IDS = new Set(["anthropic:default"]);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function listAgentDirs() {
  const roots = [
    path.join(OPENCLAW_ROOT, ".openclaw", "agents"),
    path.join(OPENCLAW_ROOT, "agents"),
  ];
  const dirs = [];
  for (const root of roots) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        dirs.push(path.join(root, entry.name, "agent"));
      }
    } catch {
      // Missing agent roots are fine on fresh installs.
    }
  }
  return dirs;
}

function uniqueRealPaths(files) {
  const seen = new Set();
  const result = [];
  for (const file of files) {
    let key = file;
    try {
      key = fs.realpathSync(file);
    } catch {
      // Keep the original path for files that do not exist yet.
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(file);
  }
  return result;
}

function isAnthropicApiProfile(id, profile) {
  if (!profile || typeof profile !== "object") return false;
  if (API_PROFILE_IDS.has(id)) return true;
  const provider = profile.provider;
  const type = profile.type || profile.mode;
  return provider === "anthropic" && (type === "token" || type === "apiKey");
}

const configFile = path.join(OPENCLAW_ROOT, ".openclaw", "openclaw.json");
const config = readJson(configFile, {});
const auth = config.auth || {};
const profiles = auth.profiles || {};

for (const id of Object.keys(profiles)) {
  if (isAnthropicApiProfile(id, profiles[id])) delete profiles[id];
}

profiles[SUBSCRIPTION_PROFILE_ID] = {
  provider: "claude-cli",
  mode: "oauth",
};
auth.profiles = profiles;
auth.order = {
  ...(auth.order || {}),
  anthropic: [SUBSCRIPTION_PROFILE_ID],
};
config.auth = auth;
writeJson(configFile, config);

const agentDirs = listAgentDirs();
const authProfileFiles = uniqueRealPaths([
  path.join(OPENCLAW_ROOT, ".openclaw", "shared", "auth-profiles.json"),
  ...agentDirs.map((dir) => path.join(dir, "auth-profiles.json")),
]);

let stores = 0;
for (const file of authProfileFiles) {
  const store = readJson(file, { version: 1, profiles: {} });
  store.version = store.version || 1;
  store.profiles = store.profiles || {};
  for (const id of Object.keys(store.profiles)) {
    if (isAnthropicApiProfile(id, store.profiles[id])) delete store.profiles[id];
  }
  store.profiles[SUBSCRIPTION_PROFILE_ID] = {
    type: "oauth",
    provider: "claude-cli",
  };
  writeJson(file, store);
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
  stores += 1;
}

let states = 0;
for (const file of uniqueRealPaths(agentDirs.map((dir) => path.join(dir, "auth-state.json")))) {
  if (!fs.existsSync(file)) continue;
  const state = readJson(file, { version: 1 });
  state.version = state.version || 1;
  state.lastGood = { ...(state.lastGood || {}), anthropic: SUBSCRIPTION_PROFILE_ID };
  if (state.usageStats) {
    for (const key of Object.keys(state.usageStats)) {
      if (key.startsWith("anthropic:")) delete state.usageStats[key];
    }
  }
  writeJson(file, state);
  states += 1;
}

console.log(
  `[anthropic-subscription-auth] ensured ${stores} auth store(s), ${states} auth state file(s), order=${SUBSCRIPTION_PROFILE_ID}`
);
