"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface AskQuestionData {
  id: string;
  prompt: string;
  mode: "single" | "multi";
  options: { id: string; label: string }[];
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

function isQuestionAnswered(question: AskQuestionData, state: QuestionState): boolean {
  if (state.selected.size === 0) return false;
  if (state.selected.has("other") && state.otherText.trim().length === 0) return false;
  return true;
}

function buildAnswerLabels(question: AskQuestionData, state: QuestionState): string[] {
  return question.options
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
  const isLocked = submittedLabels !== null;
  const otherSelected = state.selected.has("other");

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
              className="inline-flex items-center gap-1 text-[12px] text-white bg-rust/80 rounded px-2 py-0.5"
            >
              ✓ {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-2)] p-3">
      <div className="text-[14px] text-[var(--chat-text)] font-medium mb-2">{question.prompt}</div>
      <div className="flex flex-col gap-1.5 mb-2">
        {question.options.map((opt) => {
          const isSelected = state.selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={cn(
                "text-left text-[13px] rounded-md px-2.5 py-1.5 border transition-colors flex items-center gap-2 cursor-pointer",
                isSelected
                  ? "border-rust bg-rust/15 text-white"
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
              <span>{opt.label}</span>
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
      init[q.id] = { selected: new Set(), otherText: "" };
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
        next[q.id] = { selected: new Set(), otherText: "" };
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
      lines.push(`[ask:${q.id}] respuesta: ${labels.join(", ")}`);
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
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          renderText(seg.content, i)
        ) : (
          <AskQuestion
            key={i}
            question={seg.question}
            state={states[seg.question.id] ?? { selected: new Set(), otherText: "" }}
            submittedLabels={submittedLabelsByQ?.[seg.question.id] ?? null}
            onChange={(next) =>
              setStates((prev) => ({ ...prev, [seg.question.id]: next }))
            }
          />
        ),
      )}
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
  | { type: "ask"; question: AskQuestionData };

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
      if (
        json &&
        typeof json.id === "string" &&
        typeof json.prompt === "string" &&
        (json.mode === "single" || json.mode === "multi") &&
        Array.isArray(json.options) &&
        json.options.every(
          (o: unknown) =>
            typeof o === "object" &&
            o !== null &&
            typeof (o as { id?: unknown }).id === "string" &&
            typeof (o as { label?: unknown }).label === "string",
        )
      ) {
        parsed = json as AskQuestionData;
      }
    } catch {
      // fall through
    }

    if (!parsed) continue;

    if (start > cursor) {
      segments.push({ type: "text", content: text.slice(cursor, start) });
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
