"use client";

import { useState } from "react";

export function SelfQAPanel({
  verdict,
  notes,
}: {
  verdict: "PASS" | "FAIL";
  notes?: string[];
}) {
  const [open, setOpen] = useState(false);
  const isPass = verdict === "PASS";
  const hasNotes = !!notes && notes.length > 0;

  const palette = isPass
    ? { bg: "bg-[#E6F4E8]", border: "border-[#A6E3A1]", text: "text-[#065F46]", dot: "bg-[#2F7D3B]" }
    : { bg: "bg-[#FEE2E2]", border: "border-[#FCA5A5]", text: "text-[#991B1B]", dot: "bg-[#B91C1C]" };

  return (
    <section className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden">
      <button
        type="button"
        onClick={() => hasNotes && setOpen((v) => !v)}
        disabled={!hasNotes}
        className={`w-full flex items-center gap-2 px-4 py-2.5 border-b border-[#E8E2D9] ${hasNotes ? "cursor-pointer hover:bg-[#FAFAF8]" : "cursor-default"}`}
      >
        <span className="text-base">🔍</span>
        <span className="font-semibold text-sm text-[#2C3E50]">Self-QA</span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${palette.bg} ${palette.border} ${palette.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
          {verdict}
        </span>
        {hasNotes && (
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {notes!.length}
          </span>
        )}
        <span className="ml-auto text-xs text-[#5C6470]">
          {hasNotes ? (open ? "Ocultar" : "Ver checklist") : "Sin checklist"}
        </span>
      </button>
      {open && hasNotes && (
        <ul className="p-3 space-y-1.5">
          {notes!.map((note, i) => (
            <li
              key={i}
              className="text-sm text-[#2C3E50] border border-[#E8E2D9] rounded-lg px-3 py-2 leading-relaxed"
            >
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
