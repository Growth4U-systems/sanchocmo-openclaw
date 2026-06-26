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
 *
 * SAN-342: weak/fallback models (e.g. GLM 5.2) that don't tool-call natively
 * narrate the steps as TEXT instead — an arrow-joined chain ("list files in …
 * → print text → … failed"), often lowercase and prefixed by a non-tool emoji
 * (the agent's own avatar). The matchers below also catch that: ANY leading
 * emoji is stripped, verbs match case-insensitively (the `\b` guard still
 * blocks Spanish words), and an arrow-chain of tool phrases is flagged on its
 * own.
 */

// Leading glyphs the runtime / plugin prepend to tool lines (documented for
// reference; the strip below removes ANY leading emoji, not just these).
const TOOL_ECHO_EMOJIS = [
  "✍️", "📝", "🐍", "🪄", "⚡", "🔍", "📄", "📖", "✏️", "🌐",
  "🤖", "🔧", "📦", "🛠️", "👁️", "🔎", "📂", "💻", "🗂️", "🔨", "📊",
];

// A leading run of emoji / variation-selector (U+FE0F) / ZWJ (U+200D) / space.
// Stripping it normalizes echoes prefixed by ANY emoji (incl. the agent's own
// avatar, e.g. 🐎, which is NOT in the list above).
const LEADING_EMOJI_RE = /^(?:[\p{Extended_Pictographic}\s]|️|‍)+/u;

const VERB_RE =
  /^(Write|Edit|MultiEdit|Read|Bash|Grep|Glob|Search|Fetch|WebFetch|WebSearch|Run|Show|Update|Create|Delete|Move|List|TodoWrite|Task|Agent|Notebook\w*)\b[: ]/i;
const LABEL_ES_RE =
  /^(Leyendo|Escribiendo|Editando|Ejecutando|Buscando|Delegando|Compactando|Pensando)\b/;

// Tool-step phrases a model narrates when it can't call tools natively. Used
// only together with an arrow-chain, so a stray match in prose can't fire.
const TOOL_PHRASE_RE =
  /\b(list files?|print text|read file|write file|edit file|run (?:python|bash|node)|inline script|grep|glob)\b/i;

export function looksLikeToolEcho(text) {
  const t = (text || "").trim();
  if (!t) return false;
  if ((t.match(/\n/g) || []).length > 2) return false; // a paragraph is a real reply

  // Arrow-chained tool narration ("… → print text → … failed"): tool phrases
  // joined by ≥2 arrows (Unicode → or ASCII ->). High-signal — requires an
  // actual tool phrase, so Spanish prose with arrows ("discovery → plantilla →
  // secuencia") never matches. Allowed longer than a terse single echo.
  const arrowCount = (t.match(/\s(?:→|->)\s/g) || []).length;
  if (arrowCount >= 2 && t.length <= 500 && TOOL_PHRASE_RE.test(t)) return true;

  if (t.length > 200) return false; // real replies are longer; echoes are terse

  const body = t.replace(LEADING_EMOJI_RE, "");
  if (VERB_RE.test(body)) return true;
  if (LABEL_ES_RE.test(body)) return true;

  const startsEmoji = LEADING_EMOJI_RE.test(t);
  if (
    startsEmoji &&
    /(->|→|\(\s*\d+\s*chars?\s*\)|inline script|\bto \/|\bin \/|\$OPENCLAW_HOME)/i.test(t)
  ) {
    return true;
  }
  return false;
}
