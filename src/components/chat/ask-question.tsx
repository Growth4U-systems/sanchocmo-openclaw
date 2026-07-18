"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface AskQuestionData {
  id: string;
  prompt: string;
  mode: "single" | "multi" | "text";
  options?: {
    id: string;
    label: string;
    description?: string;
    recommended?: boolean;
    /** Hidden deterministic action resolved by the server after selection. */
    workflowIntent?: Record<string, unknown>;
  }[];
  /** text mode: placeholder for the input/textarea. */
  placeholder?: string;
  /** text mode: when true the field can be left empty. */
  optional?: boolean;
}

interface QuestionState {
  selected: Set<string>;
  otherText: string;
}

interface AskQuestionProps {
  question: AskQuestionData;
  state: QuestionState;
  submittedLabels: string[] | null;
  onChange: (next: QuestionState) => void;
}

function compactCacheHash(serialized: string): string {
  // FNV-1a keeps localStorage and React keys compact while remaining
  // deterministic. These identities are caches, not security boundaries.
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function questionRevision(question: AskQuestionData): string {
  return compactCacheHash(JSON.stringify({
    id: question.id,
    prompt: question.prompt,
    mode: question.mode,
    placeholder: question.placeholder ?? null,
    optional: question.optional === true,
    options: (question.options ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description ?? null,
      recommended: option.recommended === true,
      workflowIntent: option.workflowIntent ?? null,
    })),
  }));
}

export function questionStorageKey(
  threadId: string,
  messageKey: string,
  question: AskQuestionData,
) {
  return `ask:v2:${threadId}:${messageKey}:${question.id}:${questionRevision(question)}`;
}

interface AskMessageIdentityInput {
  deliveryKey?: unknown;
  ts?: unknown;
  role?: unknown;
  agent?: unknown;
  text?: unknown;
}

/**
 * Prefer the persisted transport identity. Legacy messages predate that field,
 * so their fallback uses persisted content instead of the current array index;
 * trimming the 200-message history therefore cannot re-key every old answer.
 */
export function askMessageIdentity(message: AskMessageIdentityInput): string {
  if (typeof message.deliveryKey === "string" && message.deliveryKey.trim()) {
    return `delivery:${message.deliveryKey.trim()}`;
  }
  const timestamp = typeof message.ts === "number" && Number.isFinite(message.ts)
    ? String(message.ts)
    : "undated";
  const fingerprint = compactCacheHash(JSON.stringify({
    role: typeof message.role === "string" ? message.role : null,
    agent: typeof message.agent === "string" ? message.agent : null,
    text: typeof message.text === "string" ? message.text : "",
  }));
  return `legacy:${timestamp}:${fingerprint}`;
}

export function questionGroupRenderKey(
  threadId: string,
  messageKey: string,
  segments: MessageSegment[],
): string {
  const revisions = segments.flatMap((segment) =>
    segment.type === "ask" ? [questionRevision(segment.question)] : []
  );
  return `ask-group:${threadId}:${messageKey}:${revisions.join(".")}`;
}

/**
 * Initial state for a question. Options flagged `recommended` are pre-selected:
 * single → only the (first) recommended option; multi → every recommended one.
 * Text mode starts empty.
 */
export function initialQuestionState(question: AskQuestionData): QuestionState {
  const selected = new Set<string>();
  if (question.mode !== "text") {
    const recommended = (question.options ?? []).filter((o) => o.recommended);
    if (question.mode === "single") {
      if (recommended[0]) selected.add(recommended[0].id);
    } else {
      for (const o of recommended) selected.add(o.id);
    }
  }
  return { selected, otherText: "" };
}

function isQuestionAnswered(question: AskQuestionData, state: QuestionState): boolean {
  if (question.mode === "text") {
    return question.optional === true || state.otherText.trim() !== "";
  }
  if (state.selected.size === 0) return false;
  if (state.selected.has("other") && state.otherText.trim().length === 0) return false;
  return true;
}

function buildAnswerLabels(question: AskQuestionData, state: QuestionState): string[] {
  if (question.mode === "text") {
    return [state.otherText.trim()];
  }
  return (question.options ?? [])
    .filter((o) => state.selected.has(o.id))
    .map((o) => (o.id === "other" ? state.otherText.trim() : o.label));
}

/**
 * Single question UI (controlled). Rendering only — no submission logic.
 * Submission is owned by `<AskQuestionGroup>` so multi-question messages
 * can send all answers together in a single chat message.
 */
function AskQuestion({ question, state, submittedLabels, onChange }: AskQuestionProps) {
  const isMulti = question.mode === "multi";
  const isText = question.mode === "text";
  const isLocked = submittedLabels !== null;
  const otherSelected = state.selected.has("other");
  const options = question.options ?? [];

  const toggle = (id: string) => {
    if (isLocked) return;
    const next = new Set(isMulti ? state.selected : []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...state, selected: next });
  };

  if (isLocked) {
    return (
      <div className="my-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-2)] p-3">
        <div className="text-[13px] text-[var(--chat-text-muted)] mb-1.5">{question.prompt}</div>
        <div className="flex flex-wrap gap-1.5">
          {submittedLabels.map((label, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--chat-text)] bg-rust/15 border border-rust/40 rounded px-2 py-0.5"
            >
              ✓ {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (isText) {
    return (
      <div className="my-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-2)] p-3">
        <label className="block text-[14px] text-[var(--chat-text)] font-medium mb-2">
          {question.prompt}
          {question.optional && (
            <span className="ml-1.5 text-[11px] text-[var(--chat-text-faint)] font-normal">(opcional)</span>
          )}
        </label>
        <textarea
          value={state.otherText}
          onChange={(e) => onChange({ ...state, otherText: e.target.value })}
          placeholder={question.placeholder ?? "Escribe tu respuesta…"}
          rows={2}
          className="w-full bg-[var(--chat-surface)] text-[var(--chat-text)] placeholder-[var(--chat-text-faint)] text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--chat-border)] focus:outline-none focus:border-rust resize-none"
        />
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-2)] p-3">
      <div className="text-[14px] text-[var(--chat-text)] font-medium mb-2">{question.prompt}</div>
      <div className="flex flex-col gap-1.5 mb-2">
        {options.map((opt) => {
          const isSelected = state.selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={cn(
                "text-left text-[13px] rounded-md px-2.5 py-1.5 border transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust",
                isSelected
                  ? "border-rust bg-rust/15 text-[var(--chat-text)]"
                  : "border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text)] hover:border-rust/40 hover:bg-[var(--chat-surface-2)]"
              )}
            >
              <span
                className={cn(
                  "shrink-0 inline-flex items-center justify-center text-[10px] w-4 h-4 border",
                  isMulti ? "rounded-sm" : "rounded-full",
                  isSelected ? "border-rust bg-rust text-white" : "border-[var(--chat-border-strong)] bg-transparent"
                )}
              >
                {isSelected ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{opt.label}</span>
                {opt.description && (
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--chat-text-muted)]">
                    {opt.description}
                  </span>
                )}
              </span>
              {opt.recommended && (
                <span className="shrink-0 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-rust border border-rust/45 bg-rust/10 rounded-full px-1.5 py-px">
                  recomendado
                </span>
              )}
            </button>
          );
        })}
      </div>
      {otherSelected && (
        <textarea
          value={state.otherText}
          onChange={(e) => onChange({ ...state, otherText: e.target.value })}
          placeholder="Escribe tu respuesta…"
          rows={2}
          className="w-full bg-[var(--chat-surface)] text-[var(--chat-text)] placeholder-[var(--chat-text-faint)] text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--chat-border)] focus:outline-none focus:border-rust resize-none"
          autoFocus
        />
      )}
    </div>
  );
}

interface AskQuestionGroupProps {
  segments: MessageSegment[];
  threadId: string;
  /** Stable identity of the bot message that owns these questions. */
  messageKey: string;
  /** Renders inline text segments — the parent passes a `ChatMarkdown` renderer. */
  renderText: (text: string, key: number) => React.ReactNode;
  onSubmit: (canonicalText: string) => void;
}

/**
 * Renders an entire bot message that contains one or more `:::ask` blocks.
 * Holds local state for every question and submits ALL answers in a single
 * chat message when the user clicks the group's "Enviar respuestas" button.
 *
 * This mirrors how Claude Code's AskUserQuestion works: when the assistant
 * asks N questions in a single turn, the user answers all N before the
 * assistant proceeds.
 */
function StatefulAskQuestionGroup({
  segments,
  threadId,
  messageKey,
  renderText,
  onSubmit,
}: AskQuestionGroupProps) {
  const questions = useMemo(
    () =>
      segments
        .filter((s): s is Extract<MessageSegment, { type: "ask" }> => s.type === "ask")
        .map((s) => s.question),
    [segments],
  );

  const [states, setStates] = useState<Record<string, QuestionState>>(() => {
    const init: Record<string, QuestionState> = {};
    for (const q of questions) {
      init[q.id] = initialQuestionState(q);
    }
    return init;
  });

  // Streaming: new questions can appear after the first render. Add empty
  // state for any id we don't have yet so AskQuestion never receives undefined.
  useEffect(() => {
    setStates((prev) => {
      const missing = questions.filter((q) => !prev[q.id]);
      if (missing.length === 0) return prev;
      const next = { ...prev };
      for (const q of missing) {
        next[q.id] = initialQuestionState(q);
      }
      return next;
    });
  }, [questions]);

  const [submittedLabelsByQ, setSubmittedLabelsByQ] = useState<Record<string, string[]> | null>(
    null,
  );

  // Restore from localStorage: only if EVERY question has a stored answer.
  // The group is atomic — partial restores would create inconsistent state.
  useEffect(() => {
    try {
      const restored: Record<string, string[]> = {};
      for (const q of questions) {
        const raw = localStorage.getItem(questionStorageKey(threadId, messageKey, q));
        if (!raw) return;
        const parsed = JSON.parse(raw) as { labels?: string[] };
        if (!Array.isArray(parsed?.labels)) return;
        restored[q.id] = parsed.labels;
      }
      if (Object.keys(restored).length === questions.length && questions.length > 0) {
        setSubmittedLabelsByQ(restored);
      }
    } catch {
      // ignore
    }
  }, [threadId, messageKey, questions]);

  const allAnswered =
    questions.length > 0 &&
    questions.every((q) => states[q.id] && isQuestionAnswered(q, states[q.id]));

  const isLocked = submittedLabelsByQ !== null;

  const handleSubmit = () => {
    if (!allAnswered || isLocked) return;
    const labelsByQ: Record<string, string[]> = {};
    const lines: string[] = [];
    for (const q of questions) {
      const labels = buildAnswerLabels(q, states[q.id]);
      labelsByQ[q.id] = labels;
      const selectedWorkflowOptions = (q.options ?? [])
        .filter((option) => states[q.id].selected.has(option.id) && option.workflowIntent)
        .map((option) => option.id);
      const workflowMarker = selectedWorkflowOptions.length === 1
        ? ` <!--workflow-option:${selectedWorkflowOptions[0]}-->`
        : "";
      lines.push(`[ask:${q.id}] respuesta: ${labels.join(", ")}${workflowMarker}`);
    }
    try {
      for (const q of questions) {
        localStorage.setItem(
          questionStorageKey(threadId, messageKey, q),
          JSON.stringify({ labels: labelsByQ[q.id] }),
        );
      }
    } catch {
      // ignore
    }
    setSubmittedLabelsByQ(labelsByQ);
    onSubmit(lines.join("\n"));
  };

  const totalQuestions = questions.length;
  const answeredCount = questions.filter(
    (q) => states[q.id] && isQuestionAnswered(q, states[q.id]),
  ).length;

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text") return renderText(seg.content, i);
        if (seg.type === "ask-malformed") {
          return (
            <div
              key={i}
              className="my-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-2)] px-3 py-2 text-[13px] text-[var(--chat-text-muted)]"
            >
              ⚠️ pregunta mal formada (reintentar)
            </div>
          );
        }
        return (
          <AskQuestion
            key={i}
            question={seg.question}
            state={states[seg.question.id] ?? { selected: new Set(), otherText: "" }}
            submittedLabels={submittedLabelsByQ?.[seg.question.id] ?? null}
            onChange={(next) =>
              setStates((prev) => ({ ...prev, [seg.question.id]: next }))
            }
          />
        );
      })}
      {!isLocked && totalQuestions > 0 && (
        <div className="flex items-center justify-end gap-2 mt-1">
          {totalQuestions > 1 && (
            <span className="text-[11px] text-[var(--chat-text-muted)]">
              {answeredCount}/{totalQuestions} respondidas
            </span>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="bg-rust hover:opacity-90 text-white text-[12px] px-3 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-none"
          >
            {totalQuestions > 1 ? "Enviar respuestas" : "Enviar"}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The keyed state owner guarantees that switching thread/message, or replacing
 * a streamed question with a revised definition, cannot carry selected or
 * submitted state into the next interaction.
 */
export function AskQuestionGroup(props: AskQuestionGroupProps) {
  return (
    <StatefulAskQuestionGroup
      key={questionGroupRenderKey(props.threadId, props.messageKey, props.segments)}
      {...props}
    />
  );
}

const ASK_OPEN = ":::ask";
const ASK_CLOSE = ":::";
const CODE_FENCE_REGEX = /```[\s\S]*?```/g;

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "ask"; question: AskQuestionData }
  /**
   * A `:::ask` block that matched the protocol but failed to JSON-parse or
   * validate. We render a discreet warning instead of letting the raw JSON
   * leak into the page as plain text (SAN-238). `raw` is kept (truncated)
   * only for diagnostics — it is NOT shown to the user.
   */
  | { type: "ask-malformed"; raw: string };

/** Validate a decoded `:::ask` JSON payload into AskQuestionData (or null). */
function tryParseAskJson(raw: string): AskQuestionData | null {
  try {
    const json = JSON.parse(raw);
    const hasValidOptions =
      Array.isArray(json?.options) &&
      json.options.every(
        (o: unknown) =>
          typeof o === "object" &&
          o !== null &&
          typeof (o as { id?: unknown }).id === "string" &&
          typeof (o as { label?: unknown }).label === "string",
      );
    const baseValid =
      json && typeof json.id === "string" && typeof json.prompt === "string";
    // text mode: open input, no options required.
    // single/multi: options are mandatory (and must be well-formed).
    // Extra fields (placeholder, optional, recommended) are tolerated.
    if (baseValid && json.mode === "text") {
      return json as AskQuestionData;
    }
    if (
      baseValid &&
      (json.mode === "single" || json.mode === "multi") &&
      hasValidOptions
    ) {
      return json as AskQuestionData;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Split a message into text and `:::ask` segments.
 *
 * Tolerant by design (SAN-479): the protocol asks agents to put each block on
 * its own lines (`:::ask\n{json}\n:::`), but models routinely emit the second+
 * block INLINE (`:::ask {json} :::` mid-paragraph). The old regex demanded
 * newlines around the payload and a line-final close, so those inline blocks
 * leaked into the chat as raw JSON. This scanner accepts a block wherever it
 * appears — the only requirements are the `:::ask` marker, a `{` payload and
 * a closing `:::`.
 *
 * Streaming-safe: an `:::ask` block without a closing `:::` is left as text.
 * Code-fence-safe: `:::ask` blocks INSIDE triple-backtick code fences are
 * preserved as text so the protocol can be shown literally.
 */
export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text || !text.includes(ASK_OPEN)) {
    return [{ type: "text", content: text }];
  }

  const codeRanges: Array<[number, number]> = [];
  for (const m of text.matchAll(CODE_FENCE_REGEX)) {
    if (m.index === undefined) continue;
    codeRanges.push([m.index, m.index + m[0].length]);
  }
  const isInsideCode = (start: number, end: number) =>
    codeRanges.some(([cs, ce]) => start >= cs && end <= ce);

  const segments: MessageSegment[] = [];
  let cursor = 0; // start of text not yet emitted as a segment
  let searchFrom = 0;

  /** Absorb spaces plus one trailing newline so removed blocks leave no gap. */
  const consumeLineBreakAfter = (end: number) => {
    const tail = /^[ \t]*\r?\n/.exec(text.slice(end));
    return tail ? end + tail[0].length : end;
  };

  while (searchFrom < text.length) {
    const open = text.indexOf(ASK_OPEN, searchFrom);
    if (open === -1) break;
    const bodyStart = open + ASK_OPEN.length;

    // ":::askXYZ" is some other token, not our marker.
    const boundary = text[bodyStart];
    if (boundary !== undefined && /[A-Za-z0-9_-]/.test(boundary)) {
      searchFrom = bodyStart;
      continue;
    }

    // The payload is always a JSON object. If the next non-whitespace char
    // isn't `{`, this occurrence is prose mentioning ":::ask" (or a payload
    // still streaming in) — leave it as text.
    if (!/^\s*\{/.test(text.slice(bodyStart))) {
      searchFrom = bodyStart;
      continue;
    }

    // Find the closing ":::". The JSON may itself contain ":::" inside a
    // string, so keep extending to the next candidate until the body parses.
    const firstClose = text.indexOf(ASK_CLOSE, bodyStart);
    let close = -1;
    let parsed: AskQuestionData | null = null;
    for (
      let candidate = firstClose;
      candidate !== -1;
      candidate = text.indexOf(ASK_CLOSE, candidate + 1)
    ) {
      const attempt = tryParseAskJson(text.slice(bodyStart, candidate));
      if (attempt) {
        parsed = attempt;
        close = candidate;
        break;
      }
      // A ":::" that begins the NEXT ask block can never close this one.
      if (text.startsWith(ASK_OPEN, candidate)) break;
    }

    if (parsed && close !== -1) {
      const end = consumeLineBreakAfter(close + ASK_CLOSE.length);
      if (isInsideCode(open, close + ASK_CLOSE.length)) {
        // Shown literally inside a code fence — keep as text.
        searchFrom = close + ASK_CLOSE.length;
        continue;
      }
      if (open > cursor) {
        segments.push({ type: "text", content: text.slice(cursor, open) });
      }
      segments.push({ type: "ask", question: parsed });
      cursor = end;
      searchFrom = end;
      continue;
    }

    if (firstClose === -1) {
      // No close anywhere after the payload: still streaming — leave as text.
      break;
    }

    if (text.startsWith(ASK_OPEN, firstClose)) {
      // The first ":::" after this payload opens ANOTHER block, so this one
      // never closed (streaming/truncation). Leave it as text and scan the
      // next block normally.
      searchFrom = firstClose;
      continue;
    }

    // A real close exists but the payload failed JSON.parse/validation — e.g.
    // a label with an unescaped `"`. Don't leak the raw block as plain text:
    // emit a placeholder, advance the cursor PAST the block so the JSON is not
    // re-emitted by the trailing `text.slice(cursor)`, and log for diagnosis.
    const end = consumeLineBreakAfter(firstClose + ASK_CLOSE.length);
    if (isInsideCode(open, firstClose + ASK_CLOSE.length)) {
      searchFrom = firstClose + ASK_CLOSE.length;
      continue;
    }
    const raw = text.slice(bodyStart, firstClose).trim();
    // eslint-disable-next-line no-console
    console.error(
      "[ask] malformed :::ask block, rendering placeholder:",
      raw.length > 300 ? `${raw.slice(0, 300)}…` : raw,
    );
    if (open > cursor) {
      segments.push({ type: "text", content: text.slice(cursor, open) });
    }
    segments.push({ type: "ask-malformed", raw });
    cursor = end;
    searchFrom = end;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", content: text.slice(cursor) });
  }
  if (segments.length === 0) {
    return [{ type: "text", content: text }];
  }
  return segments;
}
