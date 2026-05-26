import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { EXEC_PATH, BASE } from "@/lib/data/paths";

interface ExecOptions {
  timeoutMs?: number;
  stdin?: string;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export function runOpenclaw(args: string[], opts: ExecOptions = {}): string {
  const cmd = "openclaw";
  return execSync([cmd, ...args].join(" "), {
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
  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === agentId);

  if (idx < 0) {
    if (modelId === null) {
      // Nothing to clear if the agent isn't registered.
      return { updated: false };
    }
    // Use `openclaw agents add` rather than a raw patch so the CLI runs all
    // its schema/identity validation and seeds default agent state.
    registerAgent(agentId, modelId);
    if (modelId !== null) {
      ensureModelInAllowlist(modelId);
    }
    return { updated: true };
  }

  const next = agents.slice();
  const entry = { ...next[idx] };
  if (modelId === null) {
    delete entry.model;
  } else {
    entry.model = modelId;
  }
  next[idx] = entry;

  writeAgentsList(next);
  if (modelId !== null) {
    ensureModelInAllowlist(modelId);
  }
  return { updated: true };
}

export function setCronModel(cronId: string, modelId: string): void {
  runOpenclaw(["cron", "edit", cronId, "--model", JSON.stringify(modelId)]);
}

export function getAgentEffectiveModel(agentId: string): string | null {
  const agents = listAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const m = agent.model;
  if (typeof m === "string") return m;
  if (m && typeof m === "object" && typeof (m as { primary?: unknown }).primary === "string") {
    return (m as { primary: string }).primary;
  }
  return null;
}

export interface AgentRichEntry {
  id: string;
  name: string;
  emoji: string | null;
  workspace: string | null;
  resolvedModel: string | null;
  overrideModel: string | null;
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
    let overrideModel: string | null = null;
    if (ovEntry && ovEntry.model !== undefined) {
      const m = ovEntry.model;
      if (typeof m === "string") overrideModel = m;
      else if (
        m &&
        typeof m === "object" &&
        typeof (m as { primary?: unknown }).primary === "string"
      ) {
        overrideModel = (m as { primary: string }).primary;
      }
    }
    return {
      id: entry.id,
      name: entry.identityName || entry.id,
      emoji: entry.identityEmoji || null,
      workspace: entry.workspace || null,
      resolvedModel: entry.model || null,
      overrideModel,
      isDefault: !!entry.isDefault,
      registered: true,
    };
  });

  // Add filesystem-derived agents that aren't registered yet.
  const fsIds = listWorkspaceIds();
  for (const id of fsIds) {
    if (registeredIds.has(id)) continue;
    out.push({
      id,
      name: id,
      emoji: null,
      workspace: workspaceDirForId(id),
      resolvedModel: null,
      overrideModel: null,
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
