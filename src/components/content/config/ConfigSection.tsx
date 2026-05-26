"use client";

import type { ReactNode } from "react";

export type SectionStatus = "done" | "run" | "rust" | "ok" | "warn";

interface Props {
  num: string;
  status: SectionStatus;
  title: string;
  description?: ReactNode;
  meta?: string;
  children?: ReactNode;
}

const STATUS_BG: Record<SectionStatus, string> = {
  done: "var(--sc-sage-100)",
  run: "var(--sc-sun-100)",
  rust: "var(--sc-rust-500)",
  ok: "var(--sc-sun-300)",
  warn: "var(--sc-rust-100)",
};

export function ConfigSection({ num, status, title, description, meta, children }: Props) {
  const fg = status === "rust" ? "var(--sc-paper-3)" : "var(--sc-ink)";
  return (
    <section className="mt-10 mb-4 first:mt-0">
      <header className="flex items-center gap-3 mb-2">
        <span
          className="grid place-items-center w-10 h-10 rounded-sc-pill border-[2.5px] font-heading font-bold text-xl"
          style={{
            background: STATUS_BG[status],
            color: fg,
            borderColor: "var(--sc-ink)",
            boxShadow: "var(--pop-sm)",
          }}
        >
          {status === "done" ? "✓" : num}
        </span>
        <h2
          className="m-0 font-heading font-bold text-2xl leading-tight"
          style={{ color: "var(--sc-ink)" }}
        >
          {title}
        </h2>
        {meta && (
          <span className="ml-auto font-mono text-xs" style={{ color: "var(--sc-fg-muted)" }}>
            {meta}
          </span>
        )}
      </header>
      {description && (
        <p className="text-sm mb-4 max-w-3xl" style={{ color: "var(--sc-fg-soft)" }}>
          {description}
        </p>
      )}
      {children}
    </section>
  );
}
