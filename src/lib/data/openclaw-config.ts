import { execSync } from "child_process";
import { EXEC_PATH } from "@/lib/data/paths";

interface ExecOptions {
  timeoutMs?: number;
  stdin?: string;
}

export function runOpenclaw(args: string[], opts: ExecOptions = {}): string {
  const cmd = "openclaw";
  return execSync([cmd, ...args].join(" "), {
    timeout: opts.timeoutMs ?? 20_000,
    encoding: "utf-8",
    env: { ...process.env, PATH: EXEC_PATH },
    input: opts.stdin,
    stdio: opts.stdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  }).toString();
}

export function patchOpenclawConfig(patchObj: unknown): void {
  runOpenclaw(["config", "patch", "--stdin"], {
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
  patchOpenclawConfig({
    agents: { defaults: { model: { primary: modelId } } },
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

export function setAgentModel(agentId: string, modelId: string | null): { updated: boolean } {
  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx < 0) {
    throw new Error(`Agent "${agentId}" not in agents.list`);
  }
  const next = agents.slice();
  const entry = { ...next[idx] };
  if (modelId === null) {
    delete entry.model;
  } else {
    entry.model = modelId;
  }
  next[idx] = entry;
  runOpenclaw(["config", "patch", "--stdin", "--replace-path", "agents.list"], {
    stdin: JSON.stringify(next),
  });
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

export function getDefaultPrimaryModel(): string | null {
  const raw = getOpenclawConfig("agents.defaults.model.primary");
  if (typeof raw === "string") return raw;
  return null;
}
