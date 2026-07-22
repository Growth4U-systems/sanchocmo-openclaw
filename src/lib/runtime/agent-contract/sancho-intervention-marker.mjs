/**
 * Parse one-turn Sancho intervention requests.
 *
 * The owning task, agent and skill harness remain unchanged. The adapter sends
 * the brief to Sancho in the same thread with a non-persistent route override;
 * the following user turn returns to the original owner automatically.
 */

const BLOCK_RE = /:::sancho-intervene[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/g;

export function parseSanchoInterventionMarkers(text) {
  if (typeof text !== "string" || !text.includes(":::sancho-intervene")) {
    return { text: typeof text === "string" ? text : "", interventions: [], malformed: [] };
  }

  const interventions = [];
  const malformed = [];
  const normalized = text.replace(/\r\n?/g, "\n");
  let cleaned = normalized.replace(BLOCK_RE, (block, json) => {
    const parsed = parseOne(json);
    if (parsed) interventions.push(parsed);
    else malformed.push(block);
    return "";
  });
  const danglingAt = cleaned.indexOf(":::sancho-intervene");
  if (danglingAt >= 0) {
    malformed.push(cleaned.slice(danglingAt));
    cleaned = cleaned.slice(0, danglingAt);
  }
  return { text: collapseGaps(cleaned), interventions, malformed };
}

function parseOne(json) {
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const brief = cleanText(obj.brief, 8_000);
  if (!brief) return null;
  const reason = cleanText(obj.reason, 500);
  return { brief, ...(reason ? { reason } : {}) };
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function collapseGaps(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
