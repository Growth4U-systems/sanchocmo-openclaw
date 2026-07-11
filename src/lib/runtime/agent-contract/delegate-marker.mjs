/**
 * Runtime-neutral :::delegate marker parsing (SAN-220).
 *
 * Mirrors the :::ask protocol, but runtimes handle it by ceding a real turn to
 * a specialist. This module is pure: it extracts/validates blocks and strips
 * them from the user-facing text. The adapter performs dispatch.
 */

// Canonical delegate targets. Keep in sync with DELEGATE_AGENT_SLUGS in
// src/lib/mcp/server.ts (the sancho_delegate tool). sancho is the orchestrator,
// never a delegate target.
export const DELEGATE_AGENTS = new Set([
  "cervantes",
  "hamete",
  "dulcinea",
  "rocinante",
  "mambrino",
  "merlin",
  "sanson",
  "maese-pedro",
]);

const DELEGATE_BLOCK_RE = /:::delegate[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/g;

export function parseDelegateMarkers(text, allowedAgents = DELEGATE_AGENTS) {
  if (typeof text !== "string" || !text.includes(":::delegate")) {
    return { text: typeof text === "string" ? text : "", delegations: [], malformed: [] };
  }
  const delegations = [];
  const malformed = [];
  let cleaned = text.replace(DELEGATE_BLOCK_RE, (block, json) => {
    const parsed = parseOne(json, allowedAgents);
    if (parsed) delegations.push(parsed);
    else malformed.push(block);
    return "";
  });
  const danglingAt = cleaned.indexOf(":::delegate");
  if (danglingAt >= 0) {
    malformed.push(cleaned.slice(danglingAt));
    cleaned = cleaned.slice(0, danglingAt);
  }
  return { text: collapseGaps(cleaned), delegations, malformed };
}

function parseOne(json, allowedAgents) {
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const agent = typeof obj.agent === "string" ? obj.agent.trim().toLowerCase() : "";
  const brief = typeof obj.brief === "string" ? obj.brief.trim() : "";
  if (!agent || !allowedAgents.has(agent)) return null;
  if (!brief) return null;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const skill = cleanToken(obj.skill);
  const taskId = cleanIdentifier(obj.taskId);
  const groupId = cleanIdentifier(obj.groupId);
  const proposalId = cleanIdentifier(obj.proposalId);
  return {
    agent,
    brief,
    name: name || undefined,
    ...(skill ? { skill } : {}),
    ...(taskId ? { taskId } : {}),
    ...(groupId ? { groupId } : {}),
    ...(proposalId ? { proposalId } : {}),
    ...(obj.confirmCreate === true ? { confirmCreate: true } : {}),
  };
}

function cleanToken(value) {
  if (typeof value !== "string") return "";
  const token = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(token) ? token : "";
}

function cleanIdentifier(value) {
  if (typeof value !== "string") return "";
  const identifier = value.trim();
  return identifier && identifier.length <= 160 && !/[\r\n]/.test(identifier)
    ? identifier
    : "";
}

function collapseGaps(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// Stable kebab slug for specialist task threads. Mirrors slugForThread in
// src/lib/mcp/server.ts so MCP- and UI-initiated delegations land together.
export function slugForThread(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "task";
}
