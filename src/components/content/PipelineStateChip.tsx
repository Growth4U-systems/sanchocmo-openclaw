"use client";

import type { ContentTaskPipelineState, ContentTaskStatus } from "@/types";
import { PIPELINE_STATE_LABEL } from "@/lib/content-task-state";

/**
 * Sub-state chip for a ContentTask (SAN-153). The stepper shows APPROVED for
 * everything between approval and Draft — this chip says WHAT is happening
 * inside ("redactando · 2h"), which used to be invisible. Amber = the ball is
 * in the human's court (clarify); pulsing = an agent is supposed to be
 * working; the age makes a stalled writer visible at a glance.
 */

interface Props {
  status: ContentTaskStatus;
  pipelineState?: ContentTaskPipelineState | null;
  /** ISO of the last CT update — proxy for "in this state since". */
  since?: string | null;
}

function ageLabel(since?: string | null): string | null {
  if (!since) return null;
  const ms = Date.now() - Date.parse(since);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `~${hr}h`;
  return `~${Math.floor(hr / 24)}d`;
}

const WAITING_ON_HUMAN: ReadonlySet<ContentTaskPipelineState> = new Set([
  "clarify-needed",
  "media-review",
]);

export function PipelineStateChip({ status, pipelineState, since }: Props) {
  if (!pipelineState || !PIPELINE_STATE_LABEL[pipelineState]) return null;
  if (status !== "Approved" && status !== "Pending Media") return null;

  const humanTurn = WAITING_ON_HUMAN.has(pipelineState);
  const age = ageLabel(since);

  return (
    <span
      title={
        humanTurn
          ? "Esperando una acción tuya"
          : "El agente debería estar trabajando en esto"
      }
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold border-2 border-ink rounded px-2 py-0.5 align-middle ${
        humanTurn ? "bg-yellow-400/40" : "bg-card"
      }`}
    >
      {!humanTurn && (
        <span className="w-1.5 h-1.5 rounded-full bg-rust animate-pulse" />
      )}
      {PIPELINE_STATE_LABEL[pipelineState]}
      {age && <span className="font-normal text-muted-foreground">· {age}</span>}
    </span>
  );
}
