"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface AskQuestionData {
  id: string;
  prompt: string;
  mode: "single" | "multi";
  options: { id: string; label: string }[];
}

interface AskQuestionProps {
  question: AskQuestionData;
  threadId: string;
  onSubmit: (canonicalText: string) => void;
}

function storageKey(threadId: string, questionId: string) {
  return `ask:${threadId}:${questionId}`;
}

export function AskQuestion({ question, threadId, onSubmit }: AskQuestionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(threadId, question.id));
      if (raw) {
        const parsed = JSON.parse(raw) as { labels: string[] };
        if (Array.isArray(parsed.labels)) setSubmitted(parsed.labels);
      }
    } catch {
      // ignore
    }
  }, [threadId, question.id]);

  const isMulti = question.mode === "multi";

  const toggle = (id: string) => {
    if (submitted) return;
    const next = new Set(isMulti ? selected : []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleSend = () => {
    if (submitted || selected.size === 0) return;
    const chosen = question.options.filter((o) => selected.has(o.id));
    const labels = chosen.map((o) => o.label);
    const canonical = `[ask:${question.id}] respuesta: ${labels.join(", ")}`;
    try {
      localStorage.setItem(storageKey(threadId, question.id), JSON.stringify({ labels }));
    } catch {
      // ignore
    }
    setSubmitted(labels);
    onSubmit(canonical);
  };

  if (submitted) {
    return (
      <div className="my-2 rounded-lg border border-[#45475a] bg-[#1e1e2e]/70 p-3">
        <div className="text-[13px] text-[#a6adc8] mb-1.5">{question.prompt}</div>
        <div className="flex flex-wrap gap-1.5">
          {submitted.map((label, i) => (
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
    <div className="my-2 rounded-lg border border-[#45475a] bg-[#1e1e2e]/70 p-3">
      <div className="text-[14px] text-[#cdd6f4] font-medium mb-2">{question.prompt}</div>
      <div className="flex flex-col gap-1.5 mb-3">
        {question.options.map((opt) => {
          const isSelected = selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={cn(
                "text-left text-[13px] rounded-md px-2.5 py-1.5 border transition-colors flex items-center gap-2 cursor-pointer",
                isSelected
                  ? "border-rust bg-rust/15 text-white"
                  : "border-[#45475a] bg-[#313244] text-[#cdd6f4] hover:border-rust/40 hover:bg-[#45475a]"
              )}
            >
              <span
                className={cn(
                  "shrink-0 inline-flex items-center justify-center text-[10px] w-4 h-4 border",
                  isMulti ? "rounded-sm" : "rounded-full",
                  isSelected ? "border-rust bg-rust text-white" : "border-[#6c7086] bg-transparent"
                )}
              >
                {isSelected ? "✓" : ""}
              </span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSend}
          disabled={selected.size === 0}
          className="bg-rust hover:opacity-90 text-white text-[12px] px-3 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-none"
        >
          Enviar{isMulti && selected.size > 1 ? ` (${selected.size})` : ""}
        </button>
      </div>
    </div>
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

  // Mark code fence ranges as off-limits.
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
      // fall through — leave raw text
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
