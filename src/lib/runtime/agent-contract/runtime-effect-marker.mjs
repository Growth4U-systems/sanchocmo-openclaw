/**
 * Runtime-neutral durable-effect envelope.
 *
 * Native runtimes may expose real model tools, but every adapter can return a
 * final text response. This closed marker lets the authenticated Sancho control
 * plane admit the same bounded effects without giving a runtime a broad API or
 * teaching every CLI a different MCP configuration.
 */

export const RUNTIME_EFFECT_NAMES = Object.freeze([
  "leads_search_start",
  "partnerships_discovery_start",
]);

const EFFECT_NAMES = new Set(RUNTIME_EFFECT_NAMES);
const EFFECT_BLOCK_RE = /:::sancho-effect[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/g;
const MAX_ENVELOPE_BYTES = 9 * 1024;
const MAX_ARGUMENT_BYTES = 8 * 1024;

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseOne(json) {
  if (byteLength(json) > MAX_ENVELOPE_BYTES) return null;
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "name") ||
    !Object.hasOwn(value, "arguments") ||
    typeof value.name !== "string" ||
    !EFFECT_NAMES.has(value.name) ||
    !isPlainRecord(value.arguments)
  ) {
    return null;
  }
  const serializedArguments = JSON.stringify(value.arguments);
  if (byteLength(serializedArguments) > MAX_ARGUMENT_BYTES) return null;
  return { name: value.name, arguments: value.arguments };
}

function collapseGaps(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function parseRuntimeEffectMarkers(text) {
  if (typeof text !== "string" || !text.includes(":::sancho-effect")) {
    return {
      text: typeof text === "string" ? text : "",
      effects: [],
      malformed: [],
    };
  }

  const normalized = text.replace(/\r\n?/g, "\n");
  const effects = [];
  const malformed = [];
  let cleaned = normalized.replace(EFFECT_BLOCK_RE, (block, json) => {
    const parsed = parseOne(json);
    if (parsed) effects.push(parsed);
    else malformed.push(block);
    return "";
  });

  const danglingAt = cleaned.indexOf(":::sancho-effect");
  if (danglingAt >= 0) {
    malformed.push(cleaned.slice(danglingAt));
    cleaned = cleaned.slice(0, danglingAt);
  }

  return { text: collapseGaps(cleaned), effects, malformed };
}
