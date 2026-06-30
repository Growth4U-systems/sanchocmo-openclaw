/**
 * chat-tool-echo — detect & fold runtime tool-call narration in the chat.
 *
 * Context: the mc-chat plugin's `deliver` hook forwards every `part` of the
 * runtime reply as its own `role:"bot"` message. The runtime emits a terse
 * line per tool call ("✍️ Write: to <path> (1539 chars)", "🐍 run python3
 * inline script", "🪄 show <path> -> run python3 inline script"), so each tool
 * call lands as a separate Sancho bubble — noise the user shouldn't see inline.
 *
 * The chat already has a collapsible "▸ N pasos" timeline (ProgressTimeline)
 * for structured progress events. This module classifies those tool-echo bot
 * messages and folds consecutive runs into the same timeline UI, so the chat
 * shows real prose and tucks the mechanics behind one toggle.
 *
 * Heuristic, deliberately conservative — Sancho talks Spanish, the runtime
 * echoes English tool verbs, so an English tool verb at the start of a terse
 * line is a strong, low-false-positive signal. `\b` after each verb stops
 * Spanish words ("Listo") from matching ("List").
 */

import type { ProgressEvent, ProgressKind } from "@/hooks/useChat";

/** Leading glyphs the runtime / plugin prepend to tool lines. */
const TOOL_EMOJIS = [
  "✍️", "📝", "🐍", "🪄", "⚡", "🔍", "📄", "📖", "✏️", "🌐",
  "🤖", "🔧", "📦", "🛠️", "👁️", "🔎", "📂", "💻", "🗂️", "🔨", "📊",
  "🧮",
];

// English tool verbs emitted by the runtime (never start Spanish prose).
const TOOL_VERB_RE =
  /^(Write|Edit|MultiEdit|Read|Bash|Grep|Glob|Search|Fetch|WebFetch|WebSearch|Run|Show|Update|Create|Delete|Move|List|TodoWrite|Task|Agent|Notebook\w*|Code Execution|fetch|print|pwd|curl|cat|ls|node|python3?)\b(?::|\s|$)/i;

// Spanish progress labels the plugin can emit (onToolStart) if they ever land
// as bot messages instead of structured progress events.
const TOOL_LABEL_ES_RE =
  /^(Leyendo|Escribiendo|Editando|Ejecutando|Buscando|Delegando|Compactando|Pensando)\b/;

/** Strip a single leading emoji (+ optional VS16 / ZWJ) and surrounding space. */
function stripLeadingEmoji(text: string): string {
  let t = text.trimStart();
  for (const e of TOOL_EMOJIS) {
    if (t.startsWith(e)) {
      t = t.slice(e.length).trimStart();
      break;
    }
  }
  return t;
}

function startsWithToolEmoji(text: string): boolean {
  const t = text.trimStart();
  return TOOL_EMOJIS.some((e) => t.startsWith(e));
}

/**
 * True when a bot message is runtime tool-call narration rather than a real
 * reply. Terse, single-ish line, and either led by a tool verb/label or by a
 * tool emoji plus a structural tool-log signal ("-> ", "(123 chars)", "to ").
 */
export function isToolEcho(text: string | undefined | null): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (t.length > 200) return false; // real replies are longer; echoes are terse
  if ((t.match(/\n/g) || []).length > 2) return false; // not a paragraph

  const body = stripLeadingEmoji(t);
  if (TOOL_VERB_RE.test(body)) return true;
  if (TOOL_LABEL_ES_RE.test(body)) return true;

  // Emoji-led line with an unmistakable tool-log shape.
  if (
    startsWithToolEmoji(t) &&
    /(->|\(\s*\d+\s*chars?\s*\)|inline script|\bto \/|\bin \/|\$OPENCLAW_HOME|https?:\/\/|localhost:\d+|Code Execution|HTTP\s+(GET|POST|PUT|PATCH|DELETE)\s+request)/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Map a tool-echo line to the ProgressKind that picks its timeline icon. */
function guessKind(body: string): ProgressKind {
  if (/^(Write|Edit|MultiEdit|Escribiendo|Editando|Update|Create)\b/i.test(body)) return "file_write";
  if (/^(Read|Leyendo|Show|show)\b/i.test(body)) return "read";
  if (/^(Grep|Glob|Search|Fetch|WebFetch|WebSearch|Buscando)\b/i.test(body)) return "search";
  if (/^(Agent|Task|Delegando)\b/i.test(body)) return "agent_handoff";
  if (/^(Pensando|Compactando)\b/i.test(body)) return "thinking";
  return "tool_call";
}

/**
 * Convert a tool-echo bot message into a ProgressEvent so it can render inside
 * the existing collapsible timeline. The leading emoji is stripped because
 * ProgressTimeline supplies its own per-kind icon.
 */
export function toToolEvent(msg: { text?: string; ts?: number; agent?: string }): ProgressEvent {
  const raw = (msg.text || "").trim();
  const body = stripLeadingEmoji(raw);
  return {
    kind: guessKind(body),
    label: body || raw,
    agent: msg.agent,
    ts: typeof msg.ts === "number" ? msg.ts : 0,
  };
}

/**
 * Strip the `[ask:<id>] respuesta:` protocol prefix from a user message for
 * display. The prefix is required on the wire so the agent can correlate an
 * inline answer to its question, but it's machine plumbing — the user should
 * only see what they actually answered.
 */
export function stripAskProtocol(text: string | undefined | null): string {
  const t = text || "";
  if (!t.includes("[ask:")) return t;
  return t
    .split("\n")
    .map((line) => line.replace(/^\s*\[ask:[^\]]+\]\s*respuesta:\s*/i, ""))
    .join("\n")
    .trim();
}

export interface ChatMsgLike {
  role: string;
  text?: string;
  agent?: string;
  ts?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export type RenderItem =
  | { kind: "message"; msg: ChatMsgLike; key: string }
  | { kind: "tools"; events: ProgressEvent[]; key: string };

/**
 * Collapse runs of consecutive tool-echo bot messages into a single "tools"
 * render item, leaving every real message untouched and in order.
 */
export function groupChatMessages(messages: ChatMsgLike[]): RenderItem[] {
  const items: RenderItem[] = [];
  let batch: ProgressEvent[] = [];
  let batchStart = -1;

  const flush = () => {
    if (batch.length) {
      items.push({ kind: "tools", events: batch, key: `tools-${batchStart}` });
      batch = [];
      batchStart = -1;
    }
  };

  messages.forEach((msg, i) => {
    const isEchoableBot =
      (msg.role === "bot" || msg.role === undefined) && isToolEcho(msg.text);
    if (isEchoableBot) {
      if (batchStart === -1) batchStart = i;
      batch.push(toToolEvent(msg));
      return;
    }
    flush();
    items.push({ kind: "message", msg, key: `msg-${i}` });
  });
  flush();
  return items;
}
