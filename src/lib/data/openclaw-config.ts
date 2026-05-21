import { execSync } from "child_process";
import { EXEC_PATH } from "@/lib/data/paths";

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

export function setAgentModel(agentId: string, modelId: string | null): { updated: boolean } {
  const agents = listAgents();
  let next = agents.slice();
  const idx = next.findIndex((a) => a.id === agentId);
  if (idx < 0) {
    // Agent isn't registered in agents.list yet — create a minimal entry so
    // openclaw resolves the override. We require the workspace to exist on
    // disk to avoid creating ghost entries; the workspace path follows the
    // canonical `workspace-<id>` convention next to the others.
    if (modelId === null) {
      // Nothing to clear if the agent has no entry yet.
      return { updated: false };
    }
    const referenceAgent = next.find((a) => typeof a.workspace === "string");
    const workspaceDir = referenceAgent && typeof referenceAgent.workspace === "string"
      ? referenceAgent.workspace.replace(/workspace-[^/]+$/, `workspace-${agentId}`)
      : `/root/.openclaw/workspace-${agentId}`;
    next.push({ id: agentId, workspace: workspaceDir, model: modelId });
  } else {
    const entry = { ...next[idx] };
    if (modelId === null) {
      delete entry.model;
    } else {
      entry.model = modelId;
    }
    next = next.slice();
    next[idx] = entry;
  }
  if (modelId !== null) {
    // Same single-patch trick as setDefaultPrimaryModel: include the allowlist
    // entry in the same write so we don't need a separate patch call.
    runOpenclaw(["config", "patch", "--stdin", "--replace-path", "agents.list"], {
      stdin: JSON.stringify(next),
    });
    patchOpenclawConfig({ agents: { defaults: { models: { [modelId]: {} } } } });
  } else {
    runOpenclaw(["config", "patch", "--stdin", "--replace-path", "agents.list"], {
      stdin: JSON.stringify(next),
    });
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
}

interface AgentsListJsonEntry {
  id: string;
  identityName?: string;
  identityEmoji?: string;
  workspace?: string;
  model?: string;
  isDefault?: boolean;
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

  if (resolved.length === 0) {
    return overrides.map((a) => ({
      id: a.id,
      name: (a.name as string) || a.id,
      emoji: null,
      workspace: (a.workspace as string) || null,
      resolvedModel: getAgentEffectiveModel(a.id),
      overrideModel: getAgentEffectiveModel(a.id),
      isDefault: false,
    }));
  }

  return resolved.map((entry) => {
    const ovEntry = overrideById.get(entry.id);
    let overrideModel: string | null = null;
    if (ovEntry && ovEntry.model !== undefined) {
      const m = ovEntry.model;
      if (typeof m === "string") overrideModel = m;
      else if (m && typeof m === "object" && typeof (m as { primary?: unknown }).primary === "string") {
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
    };
  });
}

export function getDefaultPrimaryModel(): string | null {
  const raw = getOpenclawConfig("agents.defaults.model.primary");
  if (typeof raw === "string") return raw;
  return null;
}
