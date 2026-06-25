"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AuthStep {
  /** Instruction text for this step. */
  text: ReactNode;
  /** Optional shell command shown in a copyable <code> block. */
  command?: string;
}

interface AuthInstructionsProps {
  /** Short lead-in shown above the numbered steps. */
  intro?: ReactNode;
  steps: AuthStep[];
  /** Small print shown under the steps. */
  footnote?: ReactNode;
  className?: string;
}

/**
 * Guided, numbered instructions with copyable commands. Used by the engine auth
 * flows (Anthropic subscription token paste, Codex SSH login) where the login
 * itself runs in an external CLI — not in the app — so the screen's job is to
 * tell the user *exactly* what to run. Presentational only.
 */
export function AuthInstructions({ intro, steps, footnote, className }: AuthInstructionsProps) {
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (index: number, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(index);
      window.setTimeout(() => setCopied((current) => (current === index ? null : current)), 1600);
    } catch {
      // Clipboard can be unavailable in an insecure context — the command stays
      // visible for a manual copy, so this is a no-op rather than an error.
    }
  };

  return (
    <div className={cn("rounded-lg border-2 border-ink bg-sage/5 p-4 space-y-3", className)}>
      {intro && <p className="text-[12px] leading-relaxed text-foreground/80">{intro}</p>}
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink bg-card text-[11px] font-bold text-navy">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-[12.5px] leading-snug text-foreground/90">{step.text}</div>
              {step.command && (
                <div className="flex items-stretch gap-1.5">
                  <code
                    className="min-w-0 flex-1 truncate rounded border border-ink/40 bg-card px-2 py-1 font-mono text-[11.5px] text-navy"
                    title={step.command}
                  >
                    {step.command}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(i, step.command!)}
                    className="shrink-0 rounded border border-ink px-2 py-1 text-[11px] font-semibold text-navy transition-colors hover:bg-rust hover:text-white"
                  >
                    {copied === i ? "copiado ✓" : "Copiar"}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {footnote && <p className="text-[11px] leading-snug text-muted-foreground">{footnote}</p>}
    </div>
  );
}
