/**
 * tool-echo — detect runtime tool-call narration arriving as reply parts.
 *
 * The runtime can hand `deliver` extra `parts` that are tool-call logs rather
 * than a reply ("✍️ Write: to <path> (1539 chars)", "🐍 run python3 inline
 * script", "🪄 show <path> -> …"). Forwarded blindly, each becomes its own
 * Sancho bubble. We drop them at the source. Mirrors the frontend classifier
 * in src/lib/chat-tool-echo.ts.
 *
 * Conservative by design: Sancho replies in Spanish, the runtime echoes
 * English tool verbs, so a verb-led terse line is a high-confidence signal and
 * a real prose reply never matches. `\b` after each verb stops Spanish words
 * ("Listo") from matching ("List").
 */

const TOOL_ECHO_EMOJIS = [
  "✍️", "📝", "🐍", "🪄", "⚡", "🔍", "📄", "📖", "✏️", "🌐",
  "🤖", "🔧", "📦", "🛠️", "👁️", "🔎", "📂", "💻", "🗂️", "🔨", "📊",
];

const VERB_RE =
  /^(Write|Edit|MultiEdit|Read|Bash|Grep|Glob|Search|Fetch|WebFetch|WebSearch|Run|Show|show|run|Update|Create|Delete|Move|List|TodoWrite|Task|Agent|Notebook\w*)\b[: ]/;
const LABEL_ES_RE =
  /^(Leyendo|Escribiendo|Editando|Ejecutando|Buscando|Delegando|Compactando|Pensando)\b/;

export function looksLikeToolEcho(text) {
  const t = (text || "").trim();
  if (!t || t.length > 200) return false;
  if ((t.match(/\n/g) || []).length > 2) return false;

  let body = t;
  for (const e of TOOL_ECHO_EMOJIS) {
    if (body.startsWith(e)) { body = body.slice(e.length).trimStart(); break; }
  }
  if (VERB_RE.test(body)) return true;
  if (LABEL_ES_RE.test(body)) return true;

  const startsEmoji = TOOL_ECHO_EMOJIS.some((e) => t.startsWith(e));
  if (startsEmoji && /(->|\(\s*\d+\s*chars?\s*\)|inline script|\bto \/|\bin \/|\$OPENCLAW_HOME)/i.test(t)) {
    return true;
  }
  return false;
}
