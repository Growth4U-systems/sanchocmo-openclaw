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

function storageKey(threadId: string, questionId: string) {
  return `ask:${threadId}:${questionId}`;
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
export function AskQuestionGroup({
  segments,
  threadId,
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
        const raw = localStorage.getItem(storageKey(threadId, q.id));
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
  }, [threadId, questions]);

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
          storageKey(threadId, q.id),
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

const ASK_REGEX = /^:::ask\s*\n([\s\S]*?)\n:::\s*$/gm;
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

/**
 * Split a message into text and `:::ask` segments.
 *
 * Streaming-safe: an `:::ask` block without a closing `:::` is left as text.
 * Code-fence-safe: `:::ask` blocks INSIDE triple-backtick code fences are
 * preserved as text so the protocol can be shown literally.
 */
export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text || !text.includes(":::ask")) {
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
  let cursor = 0;

  for (const match of text.matchAll(ASK_REGEX)) {
    const start = match.index;
    if (start === undefined) continue;
    const end = start + match[0].length;
    if (isInsideCode(start, end)) continue;

    let parsed: AskQuestionData | null = null;
    try {
      const json = JSON.parse(match[1]);
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
        parsed = json as AskQuestionData;
      } else if (
        baseValid &&
        (json.mode === "single" || json.mode === "multi") &&
        hasValidOptions
      ) {
        parsed = json as AskQuestionData;
      }
    } catch {
      // fall through
    }

    if (start > cursor) {
      segments.push({ type: "text", content: text.slice(cursor, start) });
    }

    if (!parsed) {
      // Malformed `:::ask` (bad JSON or failed validation — e.g. a label with
      // an unescaped `"`). Don't leak the raw block as plain text: emit a
      // placeholder, advance the cursor PAST the block so the JSON is not
      // re-emitted by the trailing `text.slice(cursor)`, and log for diagnosis.
      const raw = match[1];
      // eslint-disable-next-line no-console
      console.error(
        "[ask] malformed :::ask block, rendering placeholder:",
        raw.length > 300 ? `${raw.slice(0, 300)}…` : raw,
      );
      segments.push({ type: "ask-malformed", raw });
      cursor = end;
      continue;
    }

    segments.push({ type: "ask", question: parsed });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", content: text.slice(cursor) });
  }
  if (segments.length === 0) {
    return [{ type: "text", content: text }];
  }
  return segments;
}
