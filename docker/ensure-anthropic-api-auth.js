#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const OPENCLAW_ROOT = process.env.OPENCLAW_HOME || "/root/.openclaw";
const PROFILE_ID = "anthropic:default";
const TOKEN_REF = { source: "env", provider: "default", id: "ANTHROPIC_API_KEY" };

if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.trim()) {
  console.log("[anthropic-api-auth] ANTHROPIC_API_KEY missing; skipping");
  process.exit(0);
}

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

const configFile = path.join(OPENCLAW_ROOT, ".openclaw", "openclaw.json");
const config = readJson(configFile, {});
const auth = config.auth || {};
auth.profiles = {
  ...(auth.profiles || {}),
  [PROFILE_ID]: { provider: "anthropic", mode: "token" },
};
auth.order = {
  ...(auth.order || {}),
  anthropic: [PROFILE_ID],
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
  store.profiles[PROFILE_ID] = {
    type: "token",
    provider: "anthropic",
    tokenRef: TOKEN_REF,
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
  state.lastGood = { ...(state.lastGood || {}), anthropic: PROFILE_ID };
  if (state.usageStats) {
    for (const key of Object.keys(state.usageStats)) {
      if (key.startsWith("anthropic:")) delete state.usageStats[key];
    }
  }
  writeJson(file, state);
  states += 1;
}

console.log(`[anthropic-api-auth] ensured ${stores} auth store(s), ${states} auth state file(s), order=${PROFILE_ID}`);
