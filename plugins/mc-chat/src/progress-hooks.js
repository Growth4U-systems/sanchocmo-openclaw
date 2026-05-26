/**
 * Pure helpers for the mc-chat progress hooks.
 *
 * These translate openclaw's typed plugin-hook payloads (model_call_started,
 * before_tool_call, …) into the data the MC `role:"progress"` webhook expects.
 * Kept pure (no I/O) so they're unit-testable with `node --test`.
 *
 * Why this exists: the legacy `onReplyStart`/`onToolStart` reply-runtime
 * callbacks only fire for the embedded (Claude) harness — codex/ACP agents
 * like Sancho produce zero progress events through them. The native typed
 * hooks fire from openclaw's core, so wiring them here gives codex turns a
 * live timeline too.
 */

const CHANNEL_MARKER = "channel:mc-chat:";

/**
 * Recover the MC thread id from an openclaw session key.
 *
 * mc-chat builds the session key as
 *   `agent:<agentId>:channel:mc-chat:<slug>:<shortId>`
 * (see index.js inbound handler — `sessionKey = agent:${agent}:${chatId}`,
 * `chatId = channel:mc-chat:${slug}:${threadId}`). Everything after the
 * `channel:mc-chat:` marker is the canonical MC thread id (`<slug>:<rest>`).
 *
 * @param {unknown} sessionKey
 * @returns {{ slug: string, threadId: string } | null} null when the key is
 *   not an mc-chat session or carries no `<slug>:<thread>` pair.
 */
export function parseThreadIdFromSessionKey(sessionKey) {
  if (typeof sessionKey !== "string" || sessionKey.length === 0) return null;
  const idx = sessionKey.indexOf(CHANNEL_MARKER);
  if (idx < 0) return null;
  const threadId = sessionKey.slice(idx + CHANNEL_MARKER.length);
  // Need at least `<slug>:<something>`.
  const colon = threadId.indexOf(":");
  if (colon <= 0 || colon === threadId.length - 1) return null;
  const slug = threadId.slice(0, colon);
  return { slug, threadId };
}

const MAX_TARGET_LEN = 80;

function clampTarget(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.length > MAX_TARGET_LEN ? value.slice(0, MAX_TARGET_LEN) : value;
}

function normalizeCommand(command) {
  if (Array.isArray(command)) return clampTarget(command.filter((c) => typeof c === "string").join(" "));
  return clampTarget(command);
}

/**
 * Map a tool invocation to a progress event shape.
 *
 * Handles both the Claude SDK tool vocabulary (Read/Write/Edit/Bash/Grep/Glob/
 * WebFetch/WebSearch/Agent) and codex's ACP tool names (exec_command/shell/
 * apply_patch). Mirrors the label/kind mapping the legacy onToolStart used so
 * the timeline reads consistently regardless of which path emitted the event.
 *
 * @param {string} toolName
 * @param {Record<string, unknown>} [params]
 * @param {readonly string[]} [derivedPaths] host-derived path hints (apply_patch)
 * @returns {{ kind: string, label: string, target?: string } | null}
 */
export function toolToProgressEvent(toolName, params = {}, derivedPaths) {
  if (typeof toolName !== "string" || toolName.length === 0) return null;
  const p = params && typeof params === "object" ? params : {};

  let kind = "tool_call";
  let label;
  let target;

  switch (toolName) {
    case "Read":
      kind = "read";
      label = "📄 Leyendo";
      target = clampTarget(p.file_path || p.path);
      break;
    case "Write":
      kind = "file_write";
      label = "✍️ Escribiendo";
      target = clampTarget(p.file_path || p.path);
      break;
    case "Edit":
      kind = "file_write";
      label = "✏️ Editando";
      target = clampTarget(p.file_path || p.path);
      break;
    case "apply_patch":
      kind = "file_write";
      label = "📝 Escribiendo";
      target = clampTarget((derivedPaths && derivedPaths[0]) || p.path || p.file_path);
      break;
    case "Bash":
    case "exec_command":
    case "shell":
      kind = "tool_call";
      label = "⚡ Ejecutando";
      target = normalizeCommand(p.command);
      break;
    case "Grep":
    case "Glob":
      kind = "search";
      label = "🔍 Buscando";
      target = clampTarget(p.pattern || p.query);
      break;
    case "WebFetch":
    case "WebSearch":
      kind = "search";
      label = "🌐 Buscando en web";
      target = clampTarget(p.url || p.query);
      break;
    case "Agent":
      kind = "agent_handoff";
      label = "🤖 Delegando a subagente";
      target = clampTarget(p.subagent_type);
      break;
    default:
      kind = "tool_call";
      label = `🔧 ${toolName}`;
      target = clampTarget(p.file_path || p.path || p.url || p.pattern || p.query || normalizeCommand(p.command));
      break;
  }

  return target === undefined ? { kind, label } : { kind, label, target };
}
