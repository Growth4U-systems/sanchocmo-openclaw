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
  "🧮",
];

const VERB_RE =
  /^(Write|Edit|MultiEdit|Read|Bash|Grep|Glob|Search|Fetch|WebFetch|WebSearch|Run|Show|Update|Create|Delete|Move|List|TodoWrite|Task|Agent|Notebook\w*|Code Execution|fetch|print|pwd|curl|cat|ls|node|python3?)\b(?::|\s|$)/i;
const LABEL_ES_RE =
  /^(Leyendo|Escribiendo|Editando|Ejecutando|Buscando|Delegando|Compactando|Pensando)\b/;
const STRUCTURAL_TOOL_LOG_RE =
  /(->|→|\(\s*\d+\s*chars?\s*\)|inline script|\bto \/|\bin \/|\$OPENCLAW_HOME|https?:\/\/|localhost:\d+|Code Execution|HTTP\s+(GET|POST|PUT|PATCH|DELETE)\s+request)/i;
const TOOL_FRAGMENT_RE =
  /\b(Write|Edit|MultiEdit|Read|Bash|Grep|Glob|Search|Fetch|WebFetch|WebSearch|Run|Show|Update|Create|Delete|Move|List|TodoWrite|Task|Agent|Notebook\w*|Code Execution|list files|find files|print text|fetch|print|pwd|curl|cat|ls|node|python3?)\b/i;

function isEmojiCodePoint(code) {
  return (
    (code >= 0x1f000 && code <= 0x1faff) ||
    (code >= 0x2600 && code <= 0x27bf) ||
    (code >= 0x2300 && code <= 0x23ff)
  );
}

function emojiLengthAtStart(text) {
  const first = text.codePointAt(0);
  if (!first || !isEmojiCodePoint(first)) return 0;

  let length = first > 0xffff ? 2 : 1;
  const readVariation = () => {
    const code = text.charCodeAt(length);
    if (code === 0xfe0e || code === 0xfe0f) length += 1;
  };
  readVariation();

  while (text.charCodeAt(length) === 0x200d) {
    const nextIndex = length + 1;
    const next = text.codePointAt(nextIndex);
    if (!next || !isEmojiCodePoint(next)) break;
    length = nextIndex + (next > 0xffff ? 2 : 1);
    readVariation();
  }

  return length;
}

function stripLeadingEmoji(text) {
  let body = text.trimStart();
  for (let i = 0; i < 4; i += 1) {
    const before = body;
    const known = TOOL_ECHO_EMOJIS.find((e) => body.startsWith(e));
    if (known) {
      body = body.slice(known.length).trimStart();
    } else {
      const length = emojiLengthAtStart(body);
      if (length === 0) break;
      body = body.slice(length).trimStart();
    }
    if (body === before) break;
  }
  return body;
}

function startsWithKnownToolEmoji(text) {
  const t = text.trimStart();
  return TOOL_ECHO_EMOJIS.some((e) => t.startsWith(e));
}

function startsWithAnyEmoji(text) {
  return emojiLengthAtStart(text.trimStart()) > 0;
}

export function looksLikeToolEcho(text) {
  const t = (text || "").trim();
  if (!t || t.length > 200) return false;
  if ((t.match(/\n/g) || []).length > 2) return false;

  const body = stripLeadingEmoji(t);
  if (VERB_RE.test(body)) return true;
  if (LABEL_ES_RE.test(body)) return true;

  if (startsWithKnownToolEmoji(t) && STRUCTURAL_TOOL_LOG_RE.test(t)) {
    return true;
  }
  if (
    startsWithAnyEmoji(t) &&
    body !== t &&
    STRUCTURAL_TOOL_LOG_RE.test(t) &&
    TOOL_FRAGMENT_RE.test(body)
  ) {
    return true;
  }
  return false;
}
