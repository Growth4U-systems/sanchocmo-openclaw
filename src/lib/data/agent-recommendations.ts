import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";

export const AGENT_MODEL_RECOMMENDATIONS = {
  opus: "anthropic/claude-opus-4-7",
  sonnet: "anthropic/claude-sonnet-4-6",
  codex: "codex/gpt-5.4",
} as const;

export type RecommendedModelTier = keyof typeof AGENT_MODEL_RECOMMENDATIONS;

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

export function workspaceDirForAgentId(agentId: string): string {
  return path.join(BASE.replace(/\/workspace-sancho$/, ""), `workspace-${agentId}`);
}

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
  return workspaceDirForAgentId(agentId);
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

export function scoreTier(agentId: string, skills: string[], domain: string): {
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

export function recommendModelForAgent(agentId: string, workspace: string | null | undefined): {
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
