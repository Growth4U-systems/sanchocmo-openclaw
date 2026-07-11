/**
 * Runtime-neutral :::task-route marker parsing.
 *
 * A task route is different from a skill change: the current agent may select
 * another skill inside the same task without emitting a marker. This marker is
 * only for work that belongs to another task. The adapter resolves that task
 * inside the current project and never creates one without confirmation.
 */

const TASK_ROUTE_BLOCK_RE = /:::task-route[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/g;
const ROUTE_TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export function parseTaskRouteMarkers(text) {
  if (typeof text !== "string" || !text.includes(":::task-route")) {
    return { text: typeof text === "string" ? text : "", routes: [], malformed: [] };
  }

  const routes = [];
  const malformed = [];
  const cleaned = text.replace(TASK_ROUTE_BLOCK_RE, (block, json) => {
    const parsed = parseOne(json);
    if (parsed) routes.push(parsed);
    else malformed.push(block);
    return "";
  });

  return { text: collapseGaps(cleaned), routes, malformed };
}

function parseOne(json) {
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const name = cleanText(obj.name, 180);
  const brief = cleanText(obj.brief, 8_000);
  if (!name || !brief) return null;

  const agent = cleanToken(obj.agent);
  const skill = cleanToken(obj.skill);
  const taskId = cleanIdentifier(obj.taskId);
  const groupId = cleanIdentifier(obj.groupId);

  return {
    name,
    brief,
    ...(agent ? { agent } : {}),
    ...(skill ? { skill } : {}),
    ...(taskId ? { taskId } : {}),
    ...(groupId ? { groupId } : {}),
    ...(obj.confirmCreate === true ? { confirmCreate: true } : {}),
  };
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanToken(value) {
  if (typeof value !== "string") return "";
  const token = value.trim().toLowerCase();
  return ROUTE_TOKEN_RE.test(token) ? token : "";
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
