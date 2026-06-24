import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { EXEC_PATH, BASE } from "@/lib/data/paths";
import { upsertEnvContent, parseEnvContent, removeKeysFromEnvContent } from "@/lib/env-file";
import {
  applyAnthropicRouteToProfiles,
  ANTHROPIC_OAUTH_PROFILE,
  ANTHROPIC_API_PROFILE,
  type AnthropicAuthRoute,
} from "@/lib/data/anthropic-auth-route";

interface ExecOptions {
  timeoutMs?: number;
  stdin?: string;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export function runOpenclaw(args: string[], opts: ExecOptions = {}): string {
  const cmd = "openclaw";
  return execFileSync(cmd, args, {
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    encoding: "utf-8",
    env: { ...process.env, PATH: EXEC_PATH },
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
  // Combine allowlist + primary in one patch — halves the openclaw startup
  // overhead (each CLI invocation costs ~1.5–3s) and reduces the chance of
  // partial-save windows.
  patchOpenclawConfig({
    agents: {
      defaults: {
        model: { primary: modelId },
        models: { [modelId]: {} },
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

function workspaceDirForId(agentId: string): string {
  return path.join(BASE.replace(/\/workspace-sancho$/, ""), `workspace-${agentId}`);
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

const AGENT_MODEL_RECOMMENDATIONS = {
  opus: "anthropic/claude-opus-4-7",
  sonnet: "anthropic/claude-sonnet-4-6",
  codex: "codex/gpt-5.4",
} as const;

type RecommendedModelTier = keyof typeof AGENT_MODEL_RECOMMENDATIONS;

const AGENT_ID_TIER: Record<string, RecommendedModelTier> = {
  admin: "opus",
  main: "opus",
  sancho: "opus",
  oracle: "opus",
  hamete: "opus",
  merlin: "opus",
  sanson: "opus",
  cervantes: "codex",
  automator: "codex",
  dulcinea: "sonnet",
  rocinante: "sonnet",
  alarife: "sonnet",
  mambrino: "sonnet",
  "maese-pedro": "sonnet",
};

const TIER_LABELS: Record<RecommendedModelTier, string> = {
  opus: "Opus para análisis profundo, estrategia, QA o research",
  sonnet: "Sonnet para writing, contenido, outreach, ads o trabajo creativo",
  codex: "Codex para código, automatización, integraciones e infra",
};

function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function collectStrings(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "skill" || key === "skills" || key === "defaultSkill") {
        collectStrings(item, out);
      } else if (typeof item === "object") {
        collectStrings(item, out);
      }
    }
  }
  return out;
}

function workspacePathForAgent(agentId: string, workspace: string | null | undefined): string {
  if (workspace) return workspace.replace(/^~(?=\/)/, process.env.HOME || "");
  return workspaceDirForId(agentId);
}

function collectAgentModelSignals(agentId: string, workspace: string | null | undefined) {
  const skills = new Set<string>();
  const sources: string[] = [];
  const workspacePath = workspacePathForAgent(agentId, workspace);
  const chatConfig = readJsonFile<Record<string, unknown>>(path.join(workspacePath, "chat-config.json"));
  if (chatConfig) {
    collectStrings(chatConfig, skills);
    sources.push("chat-config");
  }

  const dispatch = readJsonFile<{
    specialists?: Record<string, {
      domain?: string;
      skills_owned?: string[];
      skills_invokable?: string[];
    }>;
  }>(path.join(BASE, "dispatch-map.json"));
  const specialist = dispatch?.specialists?.[agentId];
  const domain = specialist?.domain || "";
  for (const skill of specialist?.skills_owned || []) skills.add(skill);
  for (const skill of specialist?.skills_invokable || []) skills.add(skill);
  if (specialist) sources.push("dispatch-map");

  return { skills: Array.from(skills).sort(), domain, sources };
}

function scoreTier(agentId: string, skills: string[], domain: string): {
  tier: RecommendedModelTier;
  matched: string[];
} {
  const text = [agentId, domain, ...skills].join(" ").toLowerCase();
  const matchedByTier: Record<RecommendedModelTier, string[]> = {
    opus: [],
    sonnet: [],
    codex: [],
  };
  const score = {
    opus: 0,
    sonnet: 0,
    codex: 0,
  };

  const add = (tier: RecommendedModelTier, weight: number, pattern: RegExp, label: string) => {
    if (pattern.test(text)) {
      score[tier] += weight;
      matchedByTier[tier].push(label);
    }
  };

  add("codex", 4, /\b(code|coding|infra|bug|bugs|mcp|api|railway|payload|cms|frontend|webapp|automation|automator|yalc|alarife|integration|integrations?)\b/, "tareas técnicas/infra");
  add("opus", 4, /\b(strategy|strategic|foundation|research|intelligence|competitor|market|trust|analysis|analytics|forecast|cohort|attribution|retention|crm|qa|quality|brand-check|devil)\b/, "análisis/research/QA");
  add("sonnet", 3, /\b(content|seo|newsletter|copy|voice|lead-magnet|outreach|email|ads?|creative|visual|design|social|community|landing|nurture)\b/, "contenido/go-to-market");

  const idFallback = AGENT_ID_TIER[agentId];
  if (idFallback) {
    score[idFallback] += 2;
    matchedByTier[idFallback].push(`perfil ${agentId}`);
  }

  const entries = Object.entries(score) as Array<[RecommendedModelTier, number]>;
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const priority: Record<RecommendedModelTier, number> = { codex: 3, opus: 2, sonnet: 1 };
    return priority[b[0]] - priority[a[0]];
  });

  const tier = entries[0][1] > 0 ? entries[0][0] : "sonnet";
  const matched = matchedByTier[tier].length > 0 ? matchedByTier[tier] : [`perfil ${agentId}`];
  return { tier, matched: Array.from(new Set(matched)).slice(0, 3) };
}

function recommendModelForAgent(agentId: string, workspace: string | null | undefined): {
  model: string;
  reason: string;
  skills: string[];
} {
  const { skills, domain, sources } = collectAgentModelSignals(agentId, workspace);
  const { tier, matched } = scoreTier(agentId, skills, domain);
  const reasonParts = [
    TIER_LABELS[tier],
    matched.length ? `Señales: ${matched.join(", ")}` : null,
    sources.length ? `Fuente: ${sources.join(" + ")}` : "Fuente: heurística por agente",
  ].filter(Boolean);
  return {
    model: AGENT_MODEL_RECOMMENDATIONS[tier],
    reason: reasonParts.join(". "),
    skills: skills.slice(0, 8),
  };
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

/** Restart the OpenClaw gateway so it re-reads the on-disk auth profiles. */
export function restartGateway(): { ok: boolean; error?: string } {
  try {
    runOpenclaw(["gateway", "restart"], { timeoutMs: 30_000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}
