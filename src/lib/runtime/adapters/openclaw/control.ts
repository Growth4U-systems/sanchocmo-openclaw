import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { EXEC_PATH, BASE } from "@/lib/data/paths";
import { upsertEnvContent, parseEnvContent, removeKeysFromEnvContent } from "@/lib/env-file";
import {
  recommendModelForAgent,
  workspaceDirForAgentId as workspaceDirForId,
} from "@/lib/data/agent-recommendations";
import {
  applyAnthropicRouteToProfiles,
  ANTHROPIC_OAUTH_PROFILE,
  ANTHROPIC_API_PROFILE,
  type AnthropicAuthRoute,
} from "@/lib/data/anthropic-auth-route";

interface ExecOptions {
  timeoutMs?: number;
  stdin?: string;
  env?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export function runOpenclaw(args: string[], opts: ExecOptions = {}): string {
  const cmd = "openclaw";
  return execFileSync(cmd, args, {
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    encoding: "utf-8",
    env: { ...process.env, ...opts.env, PATH: EXEC_PATH },
    input: opts.stdin,
    stdio: opts.stdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
}

export function patchOpenclawConfig(patchObj: unknown): void {
  runOpenclaw(["config", "patch", "--stdin"], {
    stdin: JSON.stringify(patchObj),
  });
}

function patchOpenclawConfigReplacePath(path: string, patchObj: unknown): void {
  runOpenclaw(["config", "patch", "--stdin", "--replace-path", path], {
    stdin: JSON.stringify(patchObj),
  });
}

export function getOpenclawConfig(path: string): unknown {
  const raw = runOpenclaw(["config", "get", path]);
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function ensureModelInAllowlist(modelId: string): void {
  patchOpenclawConfig({
    agents: { defaults: { models: { [modelId]: {} } } },
  });
}

export function setDefaultPrimaryModel(modelId: string): void {
  // Keep the allowlist merge separate from the model write. The model itself
  // must replace the whole `agents.defaults.model` object, otherwise stale
  // `fallbacks` can remain hidden behind a new `primary` in the UI and still
  // route failed GLM/Fireworks turns into Claude.
  patchOpenclawConfig({
    agents: {
      defaults: {
        models: { [modelId]: {} },
      },
    },
  });
  patchOpenclawConfigReplacePath("agents.defaults.model", {
    agents: {
      defaults: {
        model: { primary: modelId },
      },
    },
  });
}

interface AgentEntry {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string | { primary?: string; fallbacks?: string[] } | null;
  [key: string]: unknown;
}

export function listAgents(): AgentEntry[] {
  const raw = getOpenclawConfig("agents.list");
  if (Array.isArray(raw)) return raw as AgentEntry[];
  return [];
}

function writeAgentsList(newList: AgentEntry[]): void {
  // `openclaw config patch --stdin` requires a JSON5 *object* patch even
  // when `--replace-path` targets an array path. Wrap the new list in the
  // surrounding object so openclaw accepts it.
  patchOpenclawConfigReplacePath("agents.list", { agents: { list: newList } });
}

function modelFromAgentEntry(entry: AgentEntry | undefined): string | null {
  if (!entry || entry.model === undefined || entry.model === null) return null;
  const m = entry.model;
  if (typeof m === "string") return m;
  if (m && typeof m === "object" && typeof (m as { primary?: unknown }).primary === "string") {
    return (m as { primary: string }).primary;
  }
  return null;
}

function setEntryModel(entry: AgentEntry, modelId: string | null): AgentEntry {
  const next = { ...entry };
  if (modelId === null) {
    delete next.model;
  } else {
    next.model = modelId;
  }
  return next;
}

function ensureAgentModelEntry(agentId: string, modelId: string): void {
  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx < 0) {
    writeAgentsList([
      ...agents,
      {
        id: agentId,
        workspace: workspaceDirForId(agentId),
        model: modelId,
      },
    ]);
    return;
  }

  if (modelFromAgentEntry(agents[idx]) === modelId) return;
  const next = agents.slice();
  next[idx] = setEntryModel(next[idx], modelId);
  writeAgentsList(next);
}

export function registerAgent(agentId: string, model?: string): void {
  const workspace = workspaceDirForId(agentId);
  const args = ["agents", "add", agentId, "--workspace", workspace, "--non-interactive"];
  if (model) {
    args.push("--model", model);
  }
  try {
    runOpenclaw(args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already\s+exists|duplicate|conflict/i.test(msg)) {
      throw e;
    }
  }
}

export function setAgentModel(agentId: string, modelId: string | null): { updated: boolean } {
  if (modelId !== null) {
    ensureModelInAllowlist(modelId);
  }

  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === agentId);

  if (idx < 0) {
    if (modelId === null) {
      // Nothing to clear if the agent isn't registered.
      return { updated: false };
    }
    // Use `openclaw agents add` rather than a raw patch so the CLI runs all
    // its schema/identity validation and seeds default agent state. If the CLI
    // reports a duplicate without reflecting it in agents.list, still persist
    // the model override below; otherwise the UI can show "saved" while the
    // runtime keeps inheriting its old/default model.
    registerAgent(agentId, modelId);
    ensureAgentModelEntry(agentId, modelId);
    return { updated: true };
  }

  const next = agents.slice();
  next[idx] = setEntryModel(next[idx], modelId);

  writeAgentsList(next);
  return { updated: true };
}

export function setCronModel(cronId: string, modelId: string): void {
  // Pass the model id as a plain arg. `runOpenclaw` uses execFileSync (no
  // shell), so arguments are passed verbatim — JSON.stringify here would wrap
  // the id in literal double quotes and openclaw would store `"id"` instead of
  // `id`. Matches how `agents add --model` is invoked above.
  runOpenclaw(["cron", "edit", cronId, "--model", modelId]);
}

export function getAgentEffectiveModel(agentId: string): string | null {
  const agents = listAgents();
  const agent = agents.find((a) => a.id === agentId);
  return modelFromAgentEntry(agent);
}

export interface AgentRichEntry {
  id: string;
  name: string;
  emoji: string | null;
  workspace: string | null;
  resolvedModel: string | null;
  overrideModel: string | null;
  recommendedModel: string | null;
  recommendedReason: string | null;
  recommendedSkills: string[];
  isDefault: boolean;
  registered: boolean;
}

interface AgentsListJsonEntry {
  id: string;
  identityName?: string;
  identityEmoji?: string;
  workspace?: string;
  model?: string;
  isDefault?: boolean;
}

function listWorkspaceIds(): string[] {
  try {
    const root = BASE.replace(/\/workspace-sancho$/, "");
    const entries = fs.readdirSync(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith("workspace-"))
      .map((e) => e.name.replace(/^workspace-/, ""))
      .filter((id) => id && !id.startsWith("yalc-prev") && !id.includes("_archived"));
  } catch {
    return [];
  }
}

function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function listAgentsRich(): AgentRichEntry[] {
  const overrides = listAgents();
  const overrideById = new Map(overrides.map((a) => [a.id, a]));

  let resolved: AgentsListJsonEntry[] = [];
  try {
    const raw = runOpenclaw(["agents", "list", "--json"]);
    const trimmed = raw.trim();
    const start = trimmed.search(/\[/);
    if (start >= 0) {
      resolved = JSON.parse(trimmed.slice(start)) as AgentsListJsonEntry[];
    }
  } catch {
    resolved = [];
  }

  const registeredIds = new Set(resolved.map((r) => r.id));

  const out: AgentRichEntry[] = resolved.map((entry) => {
    const ovEntry = overrideById.get(entry.id);
    const overrideModel = modelFromAgentEntry(ovEntry);
    const recommendation = recommendModelForAgent(entry.id, entry.workspace || null);
    return {
      id: entry.id,
      name: entry.identityName || entry.id,
      emoji: entry.identityEmoji || null,
      workspace: entry.workspace || null,
      resolvedModel: entry.model || null,
      overrideModel,
      recommendedModel: recommendation.model,
      recommendedReason: recommendation.reason,
      recommendedSkills: recommendation.skills,
      isDefault: !!entry.isDefault,
      registered: true,
    };
  });

  const emittedIds = new Set(out.map((agent) => agent.id));
  for (const entry of overrides) {
    if (emittedIds.has(entry.id)) continue;
    const workspace = entry.workspace || workspaceDirForId(entry.id);
    const overrideModel = modelFromAgentEntry(entry);
    const recommendation = recommendModelForAgent(entry.id, workspace);
    out.push({
      id: entry.id,
      name: entry.name || entry.id,
      emoji: null,
      workspace,
      resolvedModel: overrideModel,
      overrideModel,
      recommendedModel: recommendation.model,
      recommendedReason: recommendation.reason,
      recommendedSkills: recommendation.skills,
      isDefault: !!entry.default,
      registered: true,
    });
    registeredIds.add(entry.id);
    emittedIds.add(entry.id);
  }

  // Add filesystem-derived agents that aren't registered yet.
  const fsIds = listWorkspaceIds();
  for (const id of fsIds) {
    if (registeredIds.has(id)) continue;
    const workspace = workspaceDirForId(id);
    const recommendation = recommendModelForAgent(id, workspace);
    out.push({
      id,
      name: id,
      emoji: null,
      workspace,
      resolvedModel: null,
      overrideModel: null,
      recommendedModel: recommendation.model,
      recommendedReason: recommendation.reason,
      recommendedSkills: recommendation.skills,
      isDefault: false,
      registered: false,
    });
  }

  out.sort((a, b) => {
    if (a.registered !== b.registered) return a.registered ? -1 : 1;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return out;
}

export function getDefaultPrimaryModel(): string | null {
  const raw = getOpenclawConfig("agents.defaults.model.primary");
  if (typeof raw === "string") return raw;
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Anthropic auth route (subscription/OAuth ↔ API key) — global, runtime switch.
//
// The gateway and this Next.js server are sibling processes launched at
// container boot; `openclaw gateway restart` does NOT re-read .env. So the
// effective runtime selector is the on-disk auth profile: openclaw.json
// (`auth.order`/`auth.profiles`) + each agent's auth-profiles.json — the gateway
// re-reads these on restart. This mirrors docker/ensure-anthropic-subscription-auth.js
// (boot-time, subscription only); here we cover BOTH directions at runtime.
// ──────────────────────────────────────────────────────────────────────────

export type { AnthropicAuthRoute };

const OPENCLAW_ROOT = process.env.OPENCLAW_HOME || path.join(BASE, "..");
const SYSTEM_ENV_FILE = path.join(BASE, "..", ".env");

function readJsonOr<T>(file: string, fallback: T): T {
  const parsed = readJsonFile<T>(file);
  return parsed === null ? fallback : parsed;
}

function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function listAgentAuthDirs(): string[] {
  const roots = [path.join(OPENCLAW_ROOT, ".openclaw", "agents"), path.join(OPENCLAW_ROOT, "agents")];
  const dirs: string[] = [];
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

function uniqueRealPaths(files: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const file of files) {
    let key = file;
    try { key = fs.realpathSync(file); } catch { /* not present yet */ }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

/** Rewrite every agent's auth store + state for the target Anthropic route. */
function writeAgentAnthropicAuth(route: AnthropicAuthRoute): void {
  const sub = route === "subscription";
  const targetId = sub ? ANTHROPIC_OAUTH_PROFILE : ANTHROPIC_API_PROFILE;
  const agentDirs = listAgentAuthDirs();

  const profileFiles = uniqueRealPaths([
    path.join(OPENCLAW_ROOT, ".openclaw", "shared", "auth-profiles.json"),
    ...agentDirs.map((d) => path.join(d, "auth-profiles.json")),
  ]);
  for (const file of profileFiles) {
    const store = readJsonOr<{ version?: number; profiles?: Record<string, unknown> }>(file, {
      version: 1,
      profiles: {},
    });
    store.version = store.version || 1;
    store.profiles = applyAnthropicRouteToProfiles(store.profiles || {}, route, "type");
    writeJsonFile(file, store);
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  }

  for (const file of uniqueRealPaths(agentDirs.map((d) => path.join(d, "auth-state.json")))) {
    if (!fs.existsSync(file)) continue;
    const state = readJsonOr<{ version?: number; lastGood?: Record<string, unknown>; usageStats?: Record<string, unknown> }>(
      file,
      { version: 1 },
    );
    state.version = state.version || 1;
    state.lastGood = { ...(state.lastGood || {}), anthropic: targetId };
    if (state.usageStats && typeof state.usageStats === "object") {
      for (const key of Object.keys(state.usageStats)) {
        if (key.startsWith("anthropic:")) delete state.usageStats[key];
      }
    }
    writeJsonFile(file, state);
  }
}

function readSystemEnv(): Record<string, string> {
  try { return parseEnvContent(fs.readFileSync(SYSTEM_ENV_FILE, "utf-8")); } catch { return {}; }
}

function writeSystemEnv(updates: Record<string, string>): void {
  let content = "";
  try { content = fs.readFileSync(SYSTEM_ENV_FILE, "utf-8"); } catch { /* new file */ }
  fs.writeFileSync(SYSTEM_ENV_FILE, upsertEnvContent(content, updates), "utf-8");
  for (const [k, v] of Object.entries(updates)) process.env[k] = v;
}

function removeSystemEnv(keys: string[]): void {
  let content = "";
  try { content = fs.readFileSync(SYSTEM_ENV_FILE, "utf-8"); } catch { return; }
  fs.writeFileSync(SYSTEM_ENV_FILE, removeKeysFromEnvContent(content, keys), "utf-8");
  for (const k of keys) delete process.env[k];
}

/** Whether a Claude subscription (OAuth) token is resolvable by the gateway. */
export function hasAnthropicSubscriptionToken(): boolean {
  if (process.env.ANTHROPIC_OAUTH_TOKEN || process.env.CLAUDE_CODE_OAUTH_TOKEN) return true;
  const env = readSystemEnv();
  return !!(env.ANTHROPIC_OAUTH_TOKEN || env.CLAUDE_CODE_OAUTH_TOKEN);
}

/** Whether an Anthropic API key is present (process env or system .env). */
export function hasAnthropicApiKey(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  return !!readSystemEnv().ANTHROPIC_API_KEY;
}

/**
 * Switch the global Anthropic auth route. Rewrites openclaw.json + every agent
 * auth store on disk (the runtime selector) and persists ANTHROPIC_AUTH_MODE to
 * .env. Does NOT restart the gateway — the caller does, then checks the result.
 */
export function setAnthropicAuthRoute(route: AnthropicAuthRoute): void {
  const sub = route === "subscription";

  // 1. openclaw.json auth.profiles + auth.order (replace-path: a merge patch
  //    cannot delete the opposite-route profile key).
  const currentProfiles = getOpenclawConfig("auth.profiles");
  const profiles = applyAnthropicRouteToProfiles(
    currentProfiles && typeof currentProfiles === "object" ? (currentProfiles as Record<string, unknown>) : {},
    route,
    "mode",
  );
  patchOpenclawConfigReplacePath("auth.profiles", { auth: { profiles } });

  const currentOrder = getOpenclawConfig("auth.order");
  const order: Record<string, unknown> =
    currentOrder && typeof currentOrder === "object" ? { ...(currentOrder as Record<string, unknown>) } : {};
  order.anthropic = [sub ? ANTHROPIC_OAUTH_PROFILE : ANTHROPIC_API_PROFILE];
  patchOpenclawConfigReplacePath("auth.order", { auth: { order } });

  // 2. per-agent auth stores (openclaw.json alone is not enough for agent inference).
  writeAgentAnthropicAuth(route);

  // 3. env: persist the mode + align the credential the provider resolves (it
  //    prefers ANTHROPIC_OAUTH_TOKEN over ANTHROPIC_API_KEY in env order, see
  //    docker/entrypoint.sh). For subscription, ensure the OAuth token is present;
  //    for api_key, drop it so the provider falls to ANTHROPIC_API_KEY — it's
  //    re-derivable from CLAUDE_CODE_OAUTH_TOKEN on the next subscription switch.
  if (sub) {
    const env = readSystemEnv();
    const updates: Record<string, string> = { ANTHROPIC_AUTH_MODE: "subscription" };
    const token =
      process.env.ANTHROPIC_OAUTH_TOKEN ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN ||
      env.ANTHROPIC_OAUTH_TOKEN ||
      env.CLAUDE_CODE_OAUTH_TOKEN;
    if (token) updates.ANTHROPIC_OAUTH_TOKEN = token;
    writeSystemEnv(updates);
  } else {
    writeSystemEnv({ ANTHROPIC_AUTH_MODE: "api_key" });
    removeSystemEnv(["ANTHROPIC_OAUTH_TOKEN"]);
  }
}

interface GatewayRestartResult {
  ok: boolean;
  method?: "supervisor" | "openclaw-cli";
  error?: string;
}

function execErrorMessage(e: unknown): string {
  const err = e as { message?: string; stdout?: Buffer | string; stderr?: Buffer | string };
  const parts = [err?.stderr, err?.stdout, err?.message]
    .map((value) => Buffer.isBuffer(value) ? value.toString("utf-8") : value)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return (parts.join("\n").trim() || String(e)).slice(0, 500);
}

function restartSupervisedGateway(): GatewayRestartResult {
  const pidFile = process.env.OPENCLAW_GATEWAY_PID_FILE || "/tmp/openclaw-gateway.pid";
  const restartFlag = process.env.OPENCLAW_GATEWAY_RESTART_FLAG || "/tmp/openclaw-gateway-restart.request";
  if (!fs.existsSync(pidFile)) {
    return { ok: false, method: "supervisor", error: `Gateway PID file not found: ${pidFile}` };
  }

  const script = `
set -e
pid="$(cat "$PID_FILE" 2>/dev/null || true)"
if [ -z "$pid" ]; then
  echo "gateway pid file is empty: $PID_FILE" >&2
  exit 11
fi
if ! kill -0 "$pid" 2>/dev/null; then
  echo "gateway pid $pid is not running" >&2
  exit 12
fi

touch "$RESTART_FLAG"
kill "$pid" 2>/dev/null || true

for _ in $(seq 1 50); do
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

if kill -0 "$pid" 2>/dev/null; then
  rm -f "$RESTART_FLAG"
  echo "gateway pid $pid did not stop" >&2
  exit 13
fi

for _ in $(seq 1 90); do
  new_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$new_pid" ] && [ "$new_pid" != "$pid" ] && kill -0 "$new_pid" 2>/dev/null && curl -sf http://127.0.0.1:18789/healthz >/dev/null 2>&1; then
    echo "gateway restarted: $pid -> $new_pid"
    exit 0
  fi
  sleep 1
done

echo "gateway did not become healthy after restart" >&2
exit 14
`;

  try {
    execFileSync("bash", ["-lc", script], {
      timeout: 120_000,
      encoding: "utf-8",
      cwd: OPENCLAW_ROOT,
      env: {
        ...process.env,
        PATH: EXEC_PATH,
        PID_FILE: pidFile,
        RESTART_FLAG: restartFlag,
      },
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, method: "supervisor" };
  } catch (e) {
    return { ok: false, method: "supervisor", error: execErrorMessage(e) };
  }
}

/** Restart the OpenClaw gateway so it re-reads on-disk config/auth profiles. */
export function restartGateway(): GatewayRestartResult {
  const supervised = restartSupervisedGateway();
  if (supervised.ok) return supervised;

  try {
    const output = runOpenclaw(["gateway", "restart"], { timeoutMs: 30_000 });
    if (/Gateway service disabled|systemd .* unavailable/i.test(output)) {
      return {
        ok: false,
        method: "openclaw-cli",
        error: output.trim().slice(0, 500) || supervised.error,
      };
    }
    return { ok: true, method: "openclaw-cli" };
  } catch (e) {
    const cliError = execErrorMessage(e);
    return {
      ok: false,
      method: supervised.method,
      error: `${supervised.error || "supervisor restart unavailable"}; CLI fallback failed: ${cliError}`.slice(0, 500),
    };
  }
}
