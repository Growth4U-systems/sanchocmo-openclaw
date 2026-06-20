/**
 * :::delegate marker parsing (SAN-220, UI side).
 *
 * Mirrors the :::ask protocol, but handled in the gateway instead of the client.
 * When Sancho-the-agent owns-deliverable work to a specialist, it emits a block:
 *
 *   :::delegate
 *   {"agent":"hamete","name":"...","brief":"..."}
 *   :::
 *
 * The plugin's deliver callback turns each well-formed block into a REAL turn
 * cession: the brief is dispatched to the specialist's own task thread
 * (agent:<slug>:<thread>) via /api/chat/send, so the specialist runs in
 * workspace-<slug> and speaks in its own voice. This module is PURE — it
 * extracts/validates the blocks and strips them from the user-facing text; the
 * caller performs the dispatch.
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

// Open fence `:::delegate` (optional trailing spaces) + newline, lazy body, then
// a closing `\n:::` that ends a line (newline or end-of-string).
const DELEGATE_BLOCK_RE = /:::delegate[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/g;

export function parseDelegateMarkers(text, allowedAgents = DELEGATE_AGENTS) {
  if (typeof text !== "string" || !text.includes(":::delegate")) {
    return { text: typeof text === "string" ? text : "", delegations: [], malformed: [] };
  }
  const delegations = [];
  const malformed = [];
  const cleaned = text.replace(DELEGATE_BLOCK_RE, (block, json) => {
    const parsed = parseOne(json, allowedAgents);
    if (parsed) delegations.push(parsed);
    else malformed.push(block);
    return ""; // strip the block either way — never leak raw delegate JSON to the user
  });
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
  return { agent, brief, name: name || undefined };
}

// Collapse the blank-line gaps left where a block was removed, preserving single
// paragraph breaks, and trim the ends.
function collapseGaps(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// Stable kebab slug for the specialist's idempotent task thread
// (`<slug>:delegate-<agent>-<slugForThread>`). Mirrors slugForThread in
// src/lib/mcp/server.ts so MCP- and UI-initiated delegations land on the same
// thread for the same task. Bounded to keep thread ids sane.
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
